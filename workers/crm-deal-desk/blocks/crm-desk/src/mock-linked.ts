/**
 * Fictional Meeting Notes and Emails for `?mock`, shaped exactly like the
 * public-API pages `pages.get` returns — so the same `toLinkedRecord` mapper
 * runs in the demo as in production.
 *
 * Generated rather than hand-written: every deal gets a couple of notes and a
 * few emails, linked to the deal, its company and its contact, the way the
 * Zapier automations link them in the live CRM. Two cases are deliberate:
 *
 * - **Marina Freight has ~60 emails**, so the "Load more" path is reachable.
 * - **One id in every Marina list points nowhere** (`mn-missing`), so the
 *   "couldn't be read" path is reachable too.
 *
 * Everything is fictional; the test guards against live client names.
 */

import type { PageLike } from "./linked.ts"

export type Links = { meetingNoteIds: string[]; emailIds: string[] }

const MEETING_TYPES = ["Discovery", "Client", "Prospect", "Product Demo", "Project"]
const SUBJECTS = [
	"Re: scope for the automation build",
	"Proposal v2 attached",
	"Quick question on the Notion setup",
	"Next steps after today's call",
	"Kick-off timing",
	"Invoice and SOW",
	"Following up",
	"Data export for the workshop",
]
const SUMMARIES = [
	"Agreed to move the pilot to the ops team first; finance follows once the intake form is settled.",
	"Client asked for a fixed-fee option alongside the retainer. Dennis to send both by Friday.",
	"Walked through the pipeline board. Two of their stages don't map cleanly — parked for now.",
	"Confirmed the Zapier connection works against their sandbox. Production keys next week.",
	"They want the meeting-note sync to also file emails against the company. Scoped as a small addendum.",
	"Budget approved internally. Waiting on procurement to raise the PO.",
	"Short call: pushed the start date two weeks to land after their audit.",
]

// [dealId, dealName, companySlug, contactSlug] — mirrors DEAL_ROWS in mock.ts
// by index. Kept as a parallel table so mock.ts can import this module
// without a cycle.
const DEAL_LINK_ROWS: [string, string | null, string | null][] = [
	["Crispy coco - AI Ops Retainer", null, null],
	["Cleaning Company Automation Project", "co-tan-cleaning", "ct-bobby-john"],
	["Orchid Labs — CRM setup", "co-orchid-labs", "ct-aisha-tan"],
	["Juniper Health — Notion CRM pilot", "co-juniper", "ct-mei-lin"],
	["River & Co — Automation retainer", "co-river", "ct-ravi-menon"],
	["Kopi Culture — Order Ops Automation", "co-kopi", "ct-evelyn-soh"],
	["Marina Freight — Notion Logistics Hub", "co-marina", "ct-weisheng-lim"],
	["Harbourline Capital — Deal Flow CRM", "co-harbourline", "ct-vikram-desai"],
	["Verdant Facilities — Work Order Automation", "co-verdant", "ct-jonathan-wee"],
	["Nimbus Cloudworks — AI Ops Retainer", "co-nimbus", "ct-jasmine-lee"],
	["Cobalt Pathology — Lab Intake Workflow", "co-cobalt", "ct-alvin-yong"],
	["Northwind Legal — Matter Management Build", "co-northwind", "ct-grace-lim"],
	["Meridian Dental — Patient Recall Automation", "co-meridian", "ct-clement-boey"],
	["Sunda Straits — Trade Docs Digitisation", "co-sunda", "ct-grace-abernathy"],
	["Aster Recruitment — Candidate Pipeline CRM", "co-aster", "ct-fiona-delacroix"],
	["Copperleaf Studios — Production Tracker", "co-copperleaf", "ct-lydia-fong"],
	["Trellis Property — Tenant Portal Pilot", "co-trellis", "ct-theo-karlsson"],
	["Foxglove Apparel — Inventory Sync", "co-foxglove", "ct-camille-ashworth"],
	["Saffron & Salt — Event Ops Automation", "co-saffron", "ct-zoe-mendoza"],
	["Ridgeway Engineering — Site Reporting App", "co-ridgeway", "ct-kahmeng-wong"],
	["Little Lantern — Enrolment Workflow", "co-lantern", "ct-charmaine-lee"],
	["Pandan Bakehouse — Wholesale Order Forms", "co-pandan", "ct-melvin-kwa"],
	["Sable & Stone — Project Handover Docs", "co-sable", "ct-estelle-moreau"],
	["Marina Freight — Driver App Discovery", "co-marina", "ct-priya-raman"],
	["Nimbus Cloudworks — Support Deflection Bot", "co-nimbus", "ct-sunita-kapoor"],
	["Bluefin Analytics — Data Warehouse Review", "co-bluefin", null],
	["Pelican Bay Resorts — Guest CRM Scoping", "co-pelican", null],
	["Verdant Facilities — Compliance Register", "co-verdant", "ct-lena-ho"],
	["Kopi Culture — POS Integration", "co-kopi", "ct-priscilla-yeo"],
	["Cobalt Pathology — Courier Tracking", "co-cobalt", "ct-justin-neo"],
	["Harbourline Capital — LP Reporting Pack", "co-harbourline", "ct-olivia-bennett"],
	["Northwind Legal — Intake Triage", "co-northwind", "ct-colin-baxter"],
	["Sunda Straits — Vendor Portal", "co-sunda", "ct-grace-abernathy"],
	["Trellis Property — Maintenance SLA Dashboard", null, "ct-theo-karlsson"],
	["Aster Recruitment — Client Portal", "co-aster", "ct-hugo-almeida"],
	["Copperleaf Studios — Brand Asset Library", "co-copperleaf", "ct-lydia-fong"],
	["Meridian Dental — Multi-clinic Rollout", "co-meridian", "ct-ravi-menon"],
	["Nimbus Cloudworks — Onboarding Revamp", "co-nimbus", "ct-mei-lin"],
]

/** Deterministic, so the fixture is stable between runs and in the tests. */
function seeded(n: number): number {
	const x = Math.sin(n * 9301 + 49297) * 233280
	return x - Math.floor(x)
}

function isoDate(daysAgo: number, withTime = false): string {
	const d = new Date(Date.UTC(2026, 8, 15) - daysAgo * 86_400_000)
	const day = d.toISOString().slice(0, 10)
	return withTime ? `${day}T${String(9 + (daysAgo % 8)).padStart(2, "0")}:30:00.000+08:00` : day
}

function text(content: string) {
	return [{ type: "text", plain_text: content, text: { content } }]
}

export function meetingNotePage(
	id: string,
	title: string,
	date: string,
	type: string,
	summary: string | null,
): PageLike {
	return {
		id,
		properties: {
			Title: { id: "title", type: "title", title: text(title) },
			Date: { id: "d", type: "date", date: { start: date, end: null, time_zone: null } },
			Type: { id: "t", type: "select", select: { id: "s", name: type, color: "blue" } },
			Summary: { id: "sm", type: "rich_text", rich_text: summary === null ? [] : text(summary) },
			Attendees: { id: "a", type: "multi_select", multi_select: [] },
		},
	}
}

export function emailPage(
	id: string,
	subject: string,
	dateReceived: string,
	from: string,
	summary: string | null,
): PageLike {
	return {
		id,
		properties: {
			Subject: { id: "title", type: "title", title: text(subject) },
			"Date Received": {
				id: "dr",
				type: "date",
				date: { start: dateReceived, end: null, time_zone: null },
			},
			From: { id: "f", type: "email", email: from },
			"Thread Summary": {
				id: "ts",
				type: "rich_text",
				rich_text: summary === null ? [] : text(summary),
			},
		},
	}
}

const pages = new Map<string, PageLike>()
const links: Record<string, Links> = {}

function link(entityId: string | null, kind: keyof Links, pageId: string) {
	if (entityId === null) return
	const entry = (links[entityId] ??= { meetingNoteIds: [], emailIds: [] })
	entry[kind].push(pageId)
}

DEAL_LINK_ROWS.forEach(([dealName, companyId, contactId], index) => {
	const dealId = `deal-${String(index + 1).padStart(2, "0")}`
	const senderDomain = companyId === null ? "unknown.example" : `${companyId.replace(/^co-/, "")}.example`
	const short = dealName.split(" — ")[0] ?? dealName

	// Two meeting notes per deal (three for the first Marina deal).
	const noteCount = dealId === "deal-07" ? 3 : 2
	for (let n = 0; n < noteCount; n++) {
		const id = `mn-${dealId}-${n}`
		const daysAgo = Math.floor(seeded(index * 10 + n) * 200) + n * 7
		pages.set(
			id,
			meetingNotePage(
				id,
				`${short} — ${n === 0 ? "discovery call" : n === 1 ? "proposal walkthrough" : "kick-off"}`,
				isoDate(daysAgo, true),
				MEETING_TYPES[(index + n) % MEETING_TYPES.length] as string,
				n === 1 && index % 5 === 0 ? null : (SUMMARIES[(index + n) % SUMMARIES.length] as string),
			),
		)
		link(dealId, "meetingNoteIds", id)
		link(companyId, "meetingNoteIds", id)
		link(contactId, "meetingNoteIds", id)
	}

	// Three emails per deal; Marina's first deal gets fifty so the company crosses a batch.
	const emailCount = dealId === "deal-07" ? 50 : 3
	for (let n = 0; n < emailCount; n++) {
		const id = `em-${dealId}-${n}`
		const daysAgo = Math.floor(seeded(index * 100 + n) * 180) + n
		pages.set(
			id,
			emailPage(
				id,
				`${SUBJECTS[(index + n) % SUBJECTS.length]} (${short})`,
				isoDate(daysAgo, true),
				n % 2 === 0 ? `contact@${senderDomain}` : "dennis@crm-desk.example",
				n % 3 === 2 ? null : (SUMMARIES[(index * 3 + n) % SUMMARIES.length] as string),
			),
		)
		link(dealId, "emailIds", id)
		link(companyId, "emailIds", id)
		link(contactId, "emailIds", id)
	}
})

// One dangling reference on Marina Freight: a page that cannot be fetched.
link("co-marina", "meetingNoteIds", "mn-missing")

export const MOCK_LINKS: Readonly<Record<string, Links>> = links
export const MOCK_LINKED_PAGES: ReadonlyMap<string, PageLike> = pages
