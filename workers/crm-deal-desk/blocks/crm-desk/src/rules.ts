/**
 * Every rule the Deal Desk enforces, as pure functions.
 *
 * No React, no SDK imports — this module is the product, and `test/rules.test.ts`
 * exercises it directly against a snapshot of the real CRM. The UI is a
 * rendering of what's in here.
 *
 * The rules fall into two families, and they are the two things Notion's own
 * database UI cannot do:
 *
 * - **Eligibility** (`contactChoicesFor`) — narrow a relation picker to the rows
 *   that are legal given another field's value.
 * - **Gating** (`requirementsFor`) — refuse a state transition until its
 *   preconditions hold, and be able to say which ones don't.
 *
 * `auditDeals` is the same gating logic pointed backwards at existing rows. It
 * is what a Notion automation can only ever do: report the violation after the
 * fact. Here it's a migration aid, not the enforcement mechanism.
 */

export type Stage =
	| "Lead"
	| "Proposal"
	| "Negotiation"
	| "In signing"
	| "Closed Won"
	| "Closed Lost"
	| "Declined"

/** Pipeline order. Closed stages sit at the end and are not "later" so much as terminal. */
export const STAGES: readonly Stage[] = [
	"Lead",
	"Proposal",
	"Negotiation",
	"In signing",
	"Closed Won",
	"Closed Lost",
	"Declined",
]

/** The stages a deal is still being worked in — the ones the board shows as columns. */
export const OPEN_STAGES: readonly Stage[] = [
	"Lead",
	"Proposal",
	"Negotiation",
	"In signing",
]

export const CLOSED_STAGES: readonly Stage[] = [
	"Closed Won",
	"Closed Lost",
	"Declined",
]

export function isStage(value: string | null): value is Stage {
	return value !== null && (STAGES as readonly string[]).includes(value)
}

export function isClosed(stage: Stage): boolean {
	return (CLOSED_STAGES as readonly string[]).includes(stage)
}

/** The stages a Lost Reason belongs to — and is cleared from everywhere else. */
export const LOST_STAGES: readonly Stage[] = ["Closed Lost", "Declined"]

export function isLost(stage: Stage): boolean {
	return (LOST_STAGES as readonly string[]).includes(stage)
}

// Contact and Company live in records.ts with their own rules; re-exported so
// the deal rules and their tests keep one import.
export type { Company, Contact } from "./records.ts"
import type { Company, Contact } from "./records.ts"

/**
 * The editable shape of a deal. `Deal` is this plus an id; a deal being created
 * has no id yet, which is why the rules take the draft and not the row.
 */
export type DealDraft = {
	name: string
	stage: Stage
	dealType: string | null
	value: number | null
	probability: number | null
	/** `YYYY-MM-DD`. */
	expectedClose: string | null
	/**
	 * `YYYY-MM-DD`. Read-only: a database automation stamps it when a deal
	 * closes, so no stage requires it and the editor never asks for it. It is
	 * kept on the draft so a save writes the existing value back unchanged.
	 */
	actualClose: string | null
	companyId: string | null
	contactId: string | null
	/** Optional referrer — any contact, not constrained to the company. */
	referredById: string | null
	/** An FX Rates row; null means the CRM has no currency on the deal. */
	currencyId: string | null
	lostReason: string | null
	description: string | null
}

export type Deal = DealDraft & {
	id: string
	/** Read-only. A Notion user id, resolved to a name by the UI. */
	ownerId: string | null
	/** Read-only relation ids, rendered as linked activity. */
	meetingNoteIds: string[]
	emailIds: string[]
}

export function emptyDraft(): DealDraft {
	return {
		name: "",
		stage: "Lead",
		dealType: null,
		value: null,
		probability: null,
		expectedClose: null,
		actualClose: null,
		companyId: null,
		contactId: null,
		referredById: null,
		currencyId: null,
		lostReason: null,
		description: null,
	}
}

/**
 * What actually gets written. A Lost Reason only means something on a lost
 * stage; carrying one into Proposal would make the "why did we lose this?"
 * report count a live deal. Called once, at save.
 */
export function normalizeDraft(draft: DealDraft): DealDraft {
	return {
		...draft,
		name: draft.name.trim(),
		lostReason: isLost(draft.stage) ? draft.lostReason : null,
	}
}

// ---------------------------------------------------------------------------
// Eligibility: the pre-filtered relation picker
// ---------------------------------------------------------------------------

/**
 * What the Contact picker should offer, given the company chosen on the deal.
 *
 * Modelled as a union rather than a plain array because the *empty* cases carry
 * the whole argument for this block. "Pick a company first" and "this company
 * has nobody on record" are different problems with different fixes, and a bare
 * `[]` collapses them into a dropdown that looks broken.
 *
 * `unfiltered` is the honest degraded mode: if the Contacts binding has no
 * company relation mapped, there is nothing to filter on, and silently offering
 * an unnarrowed list while implying it was narrowed would be worse than saying so.
 */
export type ContactChoices =
	| { state: "needs-company" }
	| { state: "none-at-company"; companyName: string }
	| { state: "ready"; contacts: Contact[]; companyName: string }
	| { state: "unfiltered"; contacts: Contact[] }

export function contactChoicesFor(
	companyId: string | null,
	contacts: readonly Contact[],
	companiesById: ReadonlyMap<string, Company>,
	options: { companyRelationBound: boolean } = { companyRelationBound: true },
): ContactChoices {
	if (!options.companyRelationBound) {
		return { state: "unfiltered", contacts: sortByName(contacts) }
	}
	if (companyId === null) return { state: "needs-company" }

	const companyName = companiesById.get(companyId)?.name ?? "this company"
	const matching = contacts.filter((c) => c.companyId === companyId)

	if (matching.length === 0) return { state: "none-at-company", companyName }
	return { state: "ready", contacts: sortByName(matching), companyName }
}

function sortByName(contacts: readonly Contact[]): Contact[] {
	return [...contacts].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The deal's contact when they don't belong to the deal's company, plus where
 * they actually work.
 *
 * Needed because a mismatched contact is *absent from the picker* — the picker
 * only lists eligible people, so the offending value silently renders as "no
 * selection". The requirement then says "use a contact who works at the linked
 * company" while the screen shows an empty field, which reads as a bug. Naming
 * the person and their real employer is what makes the complaint actionable.
 */
export function orphanedContact(
	draft: Pick<DealDraft, "companyId" | "contactId">,
	contactsById: ReadonlyMap<string, Contact>,
	companiesById: ReadonlyMap<string, Company>,
): { contact: Contact; companyName: string } | null {
	if (!contactMismatch(draft, contactsById)) return null

	const contact = contactsById.get(draft.contactId as string)
	if (contact === undefined) return null

	// `contactMismatch` already established the contact has a company, but it
	// may sit outside the loaded window, hence the fallback wording.
	const employer =
		contact.companyId === null
			? undefined
			: companiesById.get(contact.companyId)

	return { contact, companyName: employer?.name ?? "another company" }
}

/**
 * True when the deal's contact is not one of the selected company's people.
 *
 * Distinct from the requirement checks because it is the one rule that can be
 * violated by a *previously saved* row rather than by the edit in front of you
 * — changing a deal's company silently orphans its contact.
 */
export function contactMismatch(
	draft: Pick<DealDraft, "companyId" | "contactId">,
	contactsById: ReadonlyMap<string, Contact>,
): boolean {
	if (draft.contactId === null || draft.companyId === null) return false
	const contact = contactsById.get(draft.contactId)
	// An unknown contact id means the row points outside the loaded window, not
	// that it's wrong. Don't accuse it.
	if (contact === undefined) return false
	if (contact.companyId === null) return false
	return contact.companyId !== draft.companyId
}

// ---------------------------------------------------------------------------
// Gating: stage entry requirements
// ---------------------------------------------------------------------------

export type Requirement = {
	/** Stable key, used to focus the offending field. */
	key: keyof DealDraft | "contactMatch"
	/** Shown in the blocked-reason list. Phrased as the thing to do. */
	label: string
	met: boolean
}

type Check = {
	key: Requirement["key"]
	label: string
	test: (d: DealDraft, ctx: RuleContext) => boolean
}

export type RuleContext = {
	contactsById: ReadonlyMap<string, Contact>
}

const hasName: Check = {
	key: "name",
	label: "Give the deal a name",
	test: (d) => d.name.trim().length > 0,
}
const hasCompany: Check = {
	key: "companyId",
	label: "Link a company",
	test: (d) => d.companyId !== null,
}
const hasContact: Check = {
	key: "contactId",
	label: "Link a primary contact",
	test: (d) => d.contactId !== null,
}
const hasType: Check = {
	key: "dealType",
	label: "Set the engagement type",
	test: (d) => d.dealType !== null,
}
const hasValue: Check = {
	key: "value",
	label: "Set a deal value above zero",
	test: (d) => d.value !== null && d.value > 0,
}
const hasExpectedClose: Check = {
	key: "expectedClose",
	label: "Set an expected close date",
	test: (d) => d.expectedClose !== null,
}
const hasLostReason: Check = {
	key: "lostReason",
	label: "Record why the deal was lost or declined",
	test: (d) => d.lostReason !== null,
}
const contactBelongsToCompany: Check = {
	key: "contactMatch",
	label: "Use a contact who works at the linked company",
	test: (d, ctx) => !contactMismatch(d, ctx.contactsById),
}

/**
 * Entry requirements per stage, cumulative by intent rather than by inheritance
 * — spelled out per stage because the closed stages genuinely diverge (a lost
 * deal needs no value; a won one does) and a chain of `...previous` would hide
 * that.
 *
 * No stage asks for the actual close date: a database automation stamps
 * `Actual Close` when a deal enters a closed stage, and asking a person to
 * type a date the system is about to overwrite is how you get two dates.
 *
 * `contactBelongsToCompany` applies everywhere, so it is appended below rather
 * than repeated seven times.
 */
const STAGE_CHECKS: Record<Stage, Check[]> = {
	Lead: [hasName],
	Proposal: [hasName, hasCompany, hasContact, hasType, hasValue],
	Negotiation: [
		hasName,
		hasCompany,
		hasContact,
		hasType,
		hasValue,
		hasExpectedClose,
	],
	"In signing": [
		hasName,
		hasCompany,
		hasContact,
		hasType,
		hasValue,
		hasExpectedClose,
	],
	"Closed Won": [hasName, hasCompany, hasContact, hasType, hasValue],
	"Closed Lost": [hasName, hasCompany, hasLostReason],
	Declined: [hasName, hasCompany, hasLostReason],
}

export function requirementsFor(
	stage: Stage,
	draft: DealDraft,
	ctx: RuleContext,
): Requirement[] {
	const checks = [...STAGE_CHECKS[stage], contactBelongsToCompany]
	return checks.map(({ key, label, test }) => ({
		key,
		label,
		met: test(draft, ctx),
	}))
}

export function unmetRequirements(
	stage: Stage,
	draft: DealDraft,
	ctx: RuleContext,
): Requirement[] {
	return requirementsFor(stage, draft, ctx).filter((r) => !r.met)
}

/** Whether the deal may be saved *into* `stage`. */
export function canEnterStage(
	stage: Stage,
	draft: DealDraft,
	ctx: RuleContext,
): boolean {
	return unmetRequirements(stage, draft, ctx).length === 0
}

/**
 * Reopening a closed deal is deliberately its own concept rather than just
 * another transition. Closed Won in particular is the number the business
 * reports on, so moving out of it should read as an exceptional act in the UI,
 * not an ordinary dropdown change.
 */
export function isReopen(from: Stage, to: Stage): boolean {
	return isClosed(from) && !isClosed(to)
}

// ---------------------------------------------------------------------------
// Audit: the same rules pointed at rows that already exist
// ---------------------------------------------------------------------------

export type Violation = {
	dealId: string
	dealName: string
	stage: Stage
	/** The requirement key that failed. */
	key: Requirement["key"]
	label: string
}

/**
 * Every requirement that existing deals fail for the stage they are already in.
 *
 * These rows were all created through Notion's own UI, so this is a direct
 * measure of what an unconstrained interface lets through. Used by the block's
 * "Needs attention" view, and asserted in the tests against a real snapshot.
 */
export function auditDeals(
	deals: readonly Deal[],
	contacts: readonly Contact[],
): Violation[] {
	const ctx: RuleContext = { contactsById: byId(contacts) }
	const violations: Violation[] = []

	for (const deal of deals) {
		for (const requirement of unmetRequirements(deal.stage, deal, ctx)) {
			violations.push({
				dealId: deal.id,
				dealName: deal.name,
				stage: deal.stage,
				key: requirement.key,
				label: requirement.label,
			})
		}
	}
	return violations
}

export function byId<T extends { id: string }>(
	items: readonly T[],
): Map<string, T> {
	return new Map(items.map((item) => [item.id, item]))
}

// ---------------------------------------------------------------------------
// Derived pipeline figures
// ---------------------------------------------------------------------------

export type FxRate = {
	id: string
	/** ISO code, e.g. "SGD". */
	code: string
	rateToSgd: number | null
	rateDate: string | null
}

export const REPORTING_CURRENCY = "SGD"

/** A deal's value in the reporting currency, or null when it can't be known. */
export type SgdConverter = (deal: Pick<Deal, "value" | "currencyId">) => number | null

/**
 * Build the converter from the bound FX Rates rows.
 *
 * A deal with no currency is taken to be SGD — that is how the CRM was used
 * before the Deal Currency relation existed, and refusing to total those deals
 * would blank the headline figure. A deal whose currency row has no rate yet
 * is genuinely unknown and returns null, so it is counted rather than guessed.
 */
export function sgdConverter(fxRates: readonly FxRate[]): SgdConverter {
	const byId = new Map(fxRates.map((fx) => [fx.id, fx]))
	return (deal) => {
		if (deal.value === null) return null
		if (deal.currencyId === null) return deal.value
		const fx = byId.get(deal.currencyId)
		if (fx === undefined) return null
		if (fx.code === REPORTING_CURRENCY) return deal.value
		if (fx.rateToSgd === null || fx.rateToSgd <= 0) return null
		return deal.value * fx.rateToSgd
	}
}

/** The identity converter: values are already in the reporting currency. */
export const sameCurrency: SgdConverter = (deal) => deal.value

/**
 * Open-pipeline value, weighted by probability where one is set.
 *
 * Deals with no probability contribute their full value rather than zero — an
 * unset probability is unknown, not "no chance". Deals with no value — or no
 * known conversion to the reporting currency — contribute nothing and are
 * counted separately so the figure can be shown as incomplete.
 */
export function weightedPipeline(
	deals: readonly Deal[],
	toSgd: SgdConverter = sameCurrency,
): {
	total: number
	weighted: number
	missingValue: number
} {
	let total = 0
	let weighted = 0
	let missingValue = 0

	for (const deal of deals) {
		if (isClosed(deal.stage)) continue
		const value = toSgd(deal)
		if (value === null) {
			missingValue += 1
			continue
		}
		total += value
		weighted += value * (deal.probability ?? 1)
	}
	return { total, weighted, missingValue }
}
