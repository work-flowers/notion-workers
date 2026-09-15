import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
	MOCK_COMPANIES,
	MOCK_CONTACTS,
	MOCK_DEALS,
} from "../blocks/crm-desk/src/mock.ts"
import { stageOptionNames } from "../blocks/crm-desk/src/rows.ts"
import { bareContact } from "../blocks/crm-desk/src/records.ts"
import {
	auditDeals,
	byId,
	canEnterStage,
	contactChoicesFor,
	contactMismatch,
	emptyDraft,
	isClosed,
	isReopen,
	dealDraft,
	normalizeDraft,
	OPEN_STAGES,
	orphanedContact,
	stageMoveOutcome,
	sgdConverter,
	unmetRequirements,
	weightedPipeline,
	type Company,
	type Contact,
	type Deal,
	type DealDraft,
	type RuleContext,
} from "../blocks/crm-desk/src/rules.ts"

const COMPANIES_BY_ID = byId(MOCK_COMPANIES)
const CTX: RuleContext = { contactsById: byId(MOCK_CONTACTS) }

/** The widest roster in the fixture — 18 people, out of 125 contacts. */
const MARINA = "co-marina"
const TRELLIS = "co-trellis"
/** A company with nobody on record — the "none-at-company" case. */
const BLUEFIN = "co-bluefin"

/** Somebody who actually works at Marina Freight. */
const MARINA_CONTACT = "ct-priya-raman"

function draft(overrides: Partial<DealDraft> = {}): DealDraft {
	return { ...emptyDraft(), name: "Test deal", ...overrides }
}

describe("contactChoicesFor — the pre-filtered relation picker", () => {
	it("asks for a company before offering anyone", () => {
		const choices = contactChoicesFor(null, MOCK_CONTACTS, COMPANIES_BY_ID)
		assert.equal(choices.state, "needs-company")
	})

	it("offers only the selected company's people", () => {
		const choices = contactChoicesFor(MARINA, MOCK_CONTACTS, COMPANIES_BY_ID)
		assert(choices.state === "ready")

		assert.equal(choices.contacts.length, 18)
		assert(choices.contacts.every((c) => c.companyId === MARINA))
		// The point of the exercise: Notion's own relation cell would offer all 125.
		assert.equal(MOCK_CONTACTS.length, 125)
	})

	it("distinguishes 'nobody here' from 'pick a company first'", () => {
		const choices = contactChoicesFor(BLUEFIN, MOCK_CONTACTS, COMPANIES_BY_ID)
		assert(choices.state === "none-at-company")
		assert.equal(choices.companyName, "Bluefin Analytics")
	})

	it("sorts by name so the list is scannable", () => {
		const choices = contactChoicesFor(TRELLIS, MOCK_CONTACTS, COMPANIES_BY_ID)
		assert(choices.state === "ready")
		assert.deepEqual(
			choices.contacts.map((c) => c.name),
			[
				"Anita Suparman",
				"Bryan Cheong",
				"Gerald Ping",
				"Sylvia Mak",
				"Theo Karlsson",
			],
		)
	})

	it("says so rather than pretending, when there is no relation to filter on", () => {
		const choices = contactChoicesFor(MARINA, MOCK_CONTACTS, COMPANIES_BY_ID, {
			companyRelationBound: false,
		})
		assert(choices.state === "unfiltered")
		assert.equal(choices.contacts.length, MOCK_CONTACTS.length)
	})
})

describe("contactMismatch", () => {
	const contacts: Contact[] = [
		bareContact("c1", "At A", { companyId: "a" }),
		bareContact("c2", "No company", { companyId: null }),
	]
	const ctx: RuleContext = { contactsById: byId(contacts) }

	it("flags a contact who works somewhere else", () => {
		assert.equal(contactMismatch({ companyId: "b", contactId: "c1" }, ctx.contactsById), true)
	})

	it("accepts a contact at the linked company", () => {
		assert.equal(contactMismatch({ companyId: "a", contactId: "c1" }, ctx.contactsById), false)
	})

	it("treats a contact with no company as unknown, not wrong", () => {
		assert.equal(contactMismatch({ companyId: "a", contactId: "c2" }, ctx.contactsById), false)
	})

	it("does not accuse a contact outside the loaded window", () => {
		// The read cap is 999 rows; an id we didn't load is missing data, not a
		// violation. Accusing it would make the audit lie as the CRM grows.
		assert.equal(contactMismatch({ companyId: "a", contactId: "unknown" }, ctx.contactsById), false)
	})
})

describe("orphanedContact", () => {
	it("names the contact and where they actually work", () => {
		// Mei Lin is at Juniper Health; this deal claims Nimbus Cloudworks.
		const orphan = orphanedContact(
			{ companyId: "co-nimbus", contactId: "ct-mei-lin" },
			CTX.contactsById,
			COMPANIES_BY_ID,
		)
		assert(orphan !== null)
		assert.equal(orphan.contact.name, "Mei Lin")
		assert.equal(orphan.companyName, "Juniper Health")
	})

	it("returns null when the pairing is fine", () => {
		assert.equal(
			orphanedContact(
				{ companyId: "co-marina", contactId: "ct-weisheng-lim" },
				CTX.contactsById,
				COMPANIES_BY_ID,
			),
			null,
		)
	})

	it("returns null when there is no contact to complain about", () => {
		assert.equal(
			orphanedContact(
				{ companyId: "co-marina", contactId: null },
				CTX.contactsById,
				COMPANIES_BY_ID,
			),
			null,
		)
	})
})

describe("stage gating", () => {
	const marinaContact = "ct-weisheng-lim"

	it("lets a bare draft sit in Lead but not advance", () => {
		const d = draft()
		assert.equal(canEnterStage("Lead", d, CTX), true)
		assert.equal(canEnterStage("Proposal", d, CTX), false)
	})

	it("names every missing precondition, not just the first", () => {
		const unmet = unmetRequirements("Proposal", draft(), CTX)
		assert.deepEqual(unmet.map((r) => r.key).sort(), [
			"companyId",
			"contactId",
			"dealType",
			"value",
		])
	})

	it("requires a positive value, so a zero-value deal cannot be proposed", () => {
		const d = draft({
			companyId: MARINA,
			contactId: marinaContact,
			dealType: "Project",
			value: 0,
		})
		assert.equal(canEnterStage("Proposal", d, CTX), false)
		assert.equal(canEnterStage("Proposal", { ...d, value: 1 }, CTX), true)
	})

	it("adds an expected close date at Negotiation", () => {
		const d = draft({
			companyId: MARINA,
			contactId: marinaContact,
			dealType: "Project",
			value: 42000,
		})
		assert.equal(canEnterStage("Proposal", d, CTX), true)
		assert.equal(canEnterStage("Negotiation", d, CTX), false)
		assert.equal(
			canEnterStage("Negotiation", { ...d, expectedClose: "2026-09-30" }, CTX),
			true,
		)
	})

	it("will not close a deal won without a value", () => {
		const base = draft({
			companyId: MARINA,
			contactId: marinaContact,
			dealType: "Project",
		})
		assert.deepEqual(
			unmetRequirements("Closed Won", base, CTX).map((r) => r.key),
			["value"],
		)
	})

	it("never asks for the actual close date — the automation stamps it", () => {
		const won = draft({
			companyId: MARINA,
			contactId: marinaContact,
			dealType: "Project",
			value: 1000,
			actualClose: null,
		})
		assert.equal(canEnterStage("Closed Won", won, CTX), true)
		const lost = draft({ companyId: MARINA, lostReason: "No budget", actualClose: null })
		assert.equal(canEnterStage("Closed Lost", lost, CTX), true)
		assert.equal(canEnterStage("Declined", lost, CTX), true)
	})

	it("will not close a deal lost without a reason", () => {
		const base = draft({ companyId: MARINA })
		assert.deepEqual(
			unmetRequirements("Closed Lost", base, CTX).map((r) => r.key),
			["lostReason"],
		)
		assert.equal(
			canEnterStage("Closed Lost", { ...base, lostReason: "No budget" }, CTX),
			true,
		)
	})

	it("requires the same reason to decline a deal", () => {
		// The live CRM's Lost Reason is described as covering both outcomes.
		const base = draft({ companyId: MARINA })
		assert.deepEqual(
			unmetRequirements("Declined", base, CTX).map((r) => r.key),
			["lostReason"],
		)
		assert.equal(
			canEnterStage("Declined", { ...base, lostReason: "Not a fit" }, CTX),
			true,
		)
	})

	it("does not demand a value from a lost deal", () => {
		// A deal that died before it was priced is a normal outcome; forcing a
		// number here would just get a fake one typed in.
		const lost = draft({
			companyId: MARINA,
			lostReason: "Timing / Not now",
		})
		assert.equal(canEnterStage("Closed Lost", lost, CTX), true)
	})

	it("blocks a cross-company contact in every stage", () => {
		// Ravi Menon is at River & Co; the deal claims Marina Freight.
		const d = draft({
			companyId: MARINA,
			contactId: "ct-ravi-menon",
			dealType: "Project",
			value: 1000,
		})
		assert.equal(canEnterStage("Proposal", d, CTX), false)
		assert(
			unmetRequirements("Proposal", d, CTX).some((r) => r.key === "contactMatch"),
		)
	})
})

describe("normalizeDraft", () => {
	it("clears the lost reason when a deal is not on a lost stage", () => {
		const d = draft({ stage: "Proposal", lostReason: "No budget", name: "  Spaced  " })
		const clean = normalizeDraft(d)
		assert.equal(clean.lostReason, null)
		assert.equal(clean.name, "Spaced")
	})

	it("keeps the lost reason on Closed Lost and Declined", () => {
		assert.equal(
			normalizeDraft(draft({ stage: "Closed Lost", lostReason: "No budget" })).lostReason,
			"No budget",
		)
		assert.equal(
			normalizeDraft(draft({ stage: "Declined", lostReason: "Not a fit" })).lostReason,
			"Not a fit",
		)
	})
})

describe("isReopen", () => {
	it("treats leaving a closed stage as its own act", () => {
		assert.equal(isReopen("Closed Won", "Negotiation"), true)
		assert.equal(isReopen("Closed Lost", "Lead"), true)
		assert.equal(isReopen("Negotiation", "Closed Won"), false)
		assert.equal(isReopen("Closed Won", "Closed Lost"), false)
	})
})

describe("stageOptionNames", () => {
	it("reads the template's stages, which omit Declined", () => {
		const stages = stageOptionNames({
			type: "status",
			// Schema order, deliberately not pipeline order.
			options: [
				{ name: "Closed Won" },
				{ name: "Closed Lost" },
				{ name: "In signing" },
				{ name: "Proposal" },
				{ name: "Negotiation" },
				{ name: "Lead" },
			],
		})
		assert.deepEqual(stages, [
			"Lead",
			"Proposal",
			"Negotiation",
			"In signing",
			"Closed Won",
			"Closed Lost",
		])
	})

	it("drops stages the rules have no requirements for", () => {
		const stages = stageOptionNames({
			type: "select",
			options: [{ name: "Lead" }, { name: "Qualified" }, { name: "Closed Won" }],
		})
		assert.deepEqual(stages, ["Lead", "Closed Won"])
	})

	it("returns nothing for an unbound property", () => {
		assert.deepEqual(stageOptionNames(undefined), [])
	})
})

describe("weightedPipeline", () => {
	const base: Omit<Deal, "id" | "stage"> = {
		...draft({ companyId: "a" }),
		ownerId: null,
		meetingNoteIds: [],
		emailIds: [],
	}

	it("ignores closed deals", () => {
		const deals = [
			{ ...base, id: "1", stage: "Closed Won" as const, value: 100 },
			{ ...base, id: "2", stage: "Proposal" as const, value: 50 },
		]
		assert.equal(weightedPipeline(deals).total, 50)
	})

	it("weights by probability, and treats an unset one as full value", () => {
		const deals = [
			{ ...base, id: "1", stage: "Proposal" as const, value: 100, probability: 0.5 },
			{ ...base, id: "2", stage: "Lead" as const, value: 100, probability: null },
		]
		const { total, weighted } = weightedPipeline(deals)
		assert.equal(total, 200)
		assert.equal(weighted, 150)
	})

	it("counts valueless deals separately instead of scoring them zero", () => {
		const deals = [
			{ ...base, id: "1", stage: "Lead" as const, value: null },
			{ ...base, id: "2", stage: "Proposal" as const, value: 40 },
		]
		const { total, missingValue } = weightedPipeline(deals)
		assert.equal(total, 40)
		assert.equal(missingValue, 1)
	})

	it("converts to SGD through the FX rows, and counts an unknown rate as missing", () => {
		const toSgd = sgdConverter([
			{ id: "fx-sgd", code: "SGD", rateToSgd: 1, rateDate: null },
			{ id: "fx-usd", code: "USD", rateToSgd: 1.35, rateDate: null },
			{ id: "fx-gbp", code: "GBP", rateToSgd: null, rateDate: null },
		])
		const deals = [
			{ ...base, id: "1", stage: "Lead" as const, value: 100, currencyId: "fx-usd" },
			{ ...base, id: "2", stage: "Lead" as const, value: 100, currencyId: "fx-sgd" },
			// No currency on the row: taken as SGD, the pre-relation convention.
			{ ...base, id: "3", stage: "Lead" as const, value: 100, currencyId: null },
			{ ...base, id: "4", stage: "Lead" as const, value: 100, currencyId: "fx-gbp" },
		]
		const { total, missingValue } = weightedPipeline(deals, toSgd)
		assert.equal(total, 335)
		assert.equal(missingValue, 1)
	})
})

/**
 * The demo's whole argument, as numbers.
 *
 * Every one of these rows is reachable through Notion's own database UI, which
 * enforces none of the rules above. The figures are measured against the
 * fixture in `mock.ts`; if you change the fixture they will move — re-measure
 * rather than loosening the assertions.
 */
describe("auditDeals against the template CRM fixture", () => {
	const violations = auditDeals(MOCK_DEALS, MOCK_CONTACTS)
	const offenders = new Set(violations.map((v) => v.dealId))

	it("finds 20 violations across 16 of the 38 deals", () => {
		// Was 24 across 17 when the closed stages still required an actual
		// close date; dropping that (the automation stamps it) freed four rows'
		// worth of complaints and cleared "Aster Recruitment — Client Portal".
		assert.equal(MOCK_DEALS.length, 38)
		assert.equal(violations.length, 20)
		assert.equal(offenders.size, 16)
	})

	it("breaks down by requirement", () => {
		const byKey = new Map<string, number>()
		for (const v of violations) byKey.set(v.key, (byKey.get(v.key) ?? 0) + 1)

		assert.equal(byKey.get("dealType"), 6)
		assert.equal(byKey.get("value"), 4)
		assert.equal(byKey.get("actualClose"), undefined)
		assert.equal(byKey.get("lostReason"), 3)
		assert.equal(byKey.get("expectedClose"), 2)
		assert.equal(byKey.get("contactId"), 2)
		assert.equal(byKey.get("contactMatch"), 2)
		assert.equal(byKey.get("companyId"), 1)
	})

	it("catches the two deals whose contact works somewhere else", () => {
		const names = violations
			.filter((v) => v.key === "contactMatch")
			.map((v) => v.dealName)
			.sort()

		assert.deepEqual(names, [
			"Meridian Dental — Multi-clinic Rollout",
			"Nimbus Cloudworks — Onboarding Revamp",
		])
	})

	it("reports the open pipeline as incomplete rather than guessing", () => {
		const open = MOCK_DEALS.filter((d) => !isClosed(d.stage))
		assert.equal(open.length, 19)

		// Same-currency figures, as the pipeline reported them before FX rates.
		const { total, weighted, missingValue } = weightedPipeline(MOCK_DEALS)
		assert.equal(total, 369_000)
		assert.equal(weighted, 239_150)
		// Three open deals carry no value at all, and are excluded from both
		// figures rather than counted as zero.
		assert.equal(missingValue, 3)
	})
})

describe("fixtures", () => {
	it("keeps company ids unique", () => {
		const ids = new Set(MOCK_COMPANIES.map((c: Company) => c.id))
		assert.equal(ids.size, MOCK_COMPANIES.length)
	})

	it("keeps contact ids unique", () => {
		const ids = new Set(MOCK_CONTACTS.map((c) => c.id))
		assert.equal(ids.size, MOCK_CONTACTS.length)
	})

	it("keeps deal ids unique", () => {
		// Duplicate keys make React reuse DOM and stack rows on top of each
		// other, which reads as a layout bug rather than a data one.
		const ids = new Set(MOCK_DEALS.map((d) => d.id))
		assert.equal(ids.size, MOCK_DEALS.length)
	})

	it("points every relation at a row that exists", () => {
		const companies = new Set(MOCK_COMPANIES.map((c) => c.id))
		const contacts = new Set(MOCK_CONTACTS.map((c) => c.id))

		for (const contact of MOCK_CONTACTS) {
			if (contact.companyId !== null) assert(companies.has(contact.companyId), contact.name)
		}
		for (const deal of MOCK_DEALS) {
			if (deal.companyId !== null) assert(companies.has(deal.companyId), deal.name)
			if (deal.contactId !== null) assert(contacts.has(deal.contactId), deal.name)
		}
	})

	it("contains no live-CRM data", () => {
		// The fixture is screen-recorded and shown outside the company. A real
		// client name creeping back in is the failure this guards against.
		const haystack = [
			...MOCK_COMPANIES.map((c) => `${c.name} ${c.website ?? ""} ${c.description ?? ""}`),
			...MOCK_CONTACTS.map((c) => `${c.name} ${c.email ?? ""}`),
			...MOCK_DEALS.map((d) => d.name),
		]
			.join(" ")
			.toLowerCase()

		for (const banned of ["knoxx", "terrascope", "sakana", "notion labs", "zapier"]) {
			assert(!haystack.includes(banned), `fixture mentions ${banned}`)
		}
	})
})

describe("stageMoveOutcome — dragging a card between columns", () => {
	// A deal complete enough for any open stage: company, contact at that
	// company, type, value and an expected close date.
	const complete: Deal = {
		id: "deal-drag",
		...draft({
			stage: "Proposal",
			companyId: MARINA,
			contactId: MARINA_CONTACT,
			dealType: "Project",
			value: 12000,
			expectedClose: "2026-11-30",
		}),
	}

	it("writes nothing when the card lands where it started", () => {
		assert.equal(stageMoveOutcome(complete, "Proposal", CTX).kind, "same")
	})

	it("allows a move whose target stage is satisfied, and carries the new draft", () => {
		const move = stageMoveOutcome(complete, "Negotiation", CTX)
		assert.equal(move.kind, "allowed")
		assert.equal(move.kind === "allowed" && move.draft.stage, "Negotiation")
		// The draft is what the writer gets, so it must not carry the id.
		assert.equal(move.kind === "allowed" && "id" in move.draft, false)
	})

	it("blocks a move into a stage the deal doesn't satisfy, and says which", () => {
		// Negotiation is the first open stage to require an expected close date.
		const undated: Deal = { ...complete, expectedClose: null }
		const move = stageMoveOutcome(undated, "Negotiation", CTX)
		assert.equal(move.kind, "blocked")
		assert.deepEqual(
			move.kind === "blocked" ? move.unmet.map((r) => r.key) : [],
			["expectedClose"],
		)
	})

	it("blocks a drag back to Lead only when something is wrong, since Lead asks for a name alone", () => {
		assert.equal(stageMoveOutcome(complete, "Lead", CTX).kind, "allowed")
		const nameless: Deal = { ...complete, name: "  " }
		assert.equal(stageMoveOutcome(nameless, "Lead", CTX).kind, "blocked")
	})

	it("still catches a contact who works somewhere else", () => {
		const mismatched: Deal = { ...complete, companyId: BLUEFIN }
		const move = stageMoveOutcome(mismatched, "Negotiation", CTX)
		assert.equal(move.kind, "blocked")
		assert.equal(
			move.kind === "blocked" && move.unmet.some((r) => r.key === "contactMatch"),
			true,
		)
	})

	it("agrees with canEnterStage on every open stage, for every deal in the fixture", () => {
		for (const deal of MOCK_DEALS) {
			for (const stage of OPEN_STAGES) {
				const move = stageMoveOutcome(deal, stage, CTX)
				if (deal.stage === stage) {
					assert.equal(move.kind, "same")
					continue
				}
				const allowed = canEnterStage(stage, { ...dealDraft(deal), stage }, CTX)
				assert.equal(move.kind, allowed ? "allowed" : "blocked")
			}
		}
	})
})
