/**
 * The only module that knows Notion's value shapes, both directions.
 *
 * Writers write every field the block owns on every save, nulls included — an
 * omitted key leaves the old value in place, so clearing a field depends on it.
 */

import type {
	NotionDataSourcePage,
	NotionDataSourceValue,
	NotionPagePropertyInputMap,
	NotionPropertySchema,
} from "@notionhq/custom-blocks"

import type { Booking, Client, Job, Person, PlannedRound, Template } from "./model.ts"
import type { BookingDraft, PersonProfile } from "./store.ts"

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function asText(value: NotionDataSourceValue | undefined): string | null {
	if (typeof value !== "string") return null
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: NotionDataSourceValue | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** `start_date` / `end_date` are plain calendar days; don't slice a UTC timestamp instead. */
function asRange(value: NotionDataSourceValue | undefined): { start: string | null; end: string | null } {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return { start: null, end: null }
	const start = "start_date" in value ? value.start_date : null
	const end = "end_date" in value ? value.end_date : start
	return { start, end: end && start && end < start ? start : end }
}

/** Relation and people values arrive as `{ id, table }` pointers (or plain ids). */
function asIds(value: NotionDataSourceValue | undefined): string[] {
	if (!Array.isArray(value)) return []
	const out: string[] = []
	for (const item of value) {
		if (typeof item === "string") out.push(item)
		else if (item !== null && typeof item === "object" && typeof item.id === "string") out.push(item.id)
	}
	return out
}

/** Multi-select values arrive as option names. */
function asNames(value: NotionDataSourceValue | undefined): string[] {
	if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean)
	if (!Array.isArray(value)) return []
	return value.filter((v): v is string => typeof v === "string")
}

export function toBooking(row: NotionDataSourcePage): Booking {
	const p = row.propertiesByKey
	const { start, end } = asRange(p.dates)
	return {
		id: row.id,
		title: asText(p.title) ?? "Untitled",
		jobId: asIds(p.job)[0] ?? null,
		personId: asIds(p.person)[0] ?? null,
		placeholder: asText(p.placeholder),
		start,
		end,
		hoursPerDay: asNumber(p.hoursPerDay) ?? 0,
		round: asNumber(p.round),
		roles: asNames(p.role),
		team: asText(p.team),
		capacity: asNumber(p.capacity),
		notes: asText(p.notes),
	}
}

export function toJob(row: NotionDataSourcePage): Job {
	const p = row.propertiesByKey
	return {
		id: row.id,
		title: asText(p.title) ?? "Untitled",
		number: asText(p.number),
		clientId: asIds(p.client)[0] ?? null,
		templateId: asIds(p.template)[0] ?? null,
		label: asText(p.label),
	}
}

export function toClient(row: NotionDataSourcePage): Client {
	const p = row.propertiesByKey
	return { id: row.id, name: asText(p.name) ?? "Untitled", dedicatedIds: asIds(p.dedicated) }
}

export function toTemplate(row: NotionDataSourcePage): Template {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: asText(p.name) ?? "Untitled",
		rounds: [p.round1, p.round2, p.round3].map((v) => asNumber(v) ?? 0).filter((h) => h > 0),
		gap: asNumber(p.gap) ?? 1,
		role: asText(p.role),
	}
}

export function optionNames(schema: NotionPropertySchema | undefined): string[] {
	if (schema === undefined || !("options" in schema) || !Array.isArray(schema.options)) return []
	return schema.options.map((o: { name: string }) => o.name)
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function text(content: string | null) {
	return { type: "rich_text" as const, rich_text: content ? [{ type: "text" as const, text: { content } }] : [] }
}

function dates(start: string | null, end: string | null) {
	if (start === null) return { type: "date" as const, date: null }
	return { type: "date" as const, date: end && end !== start ? { start, end } : { start } }
}

/**
 * Assigning a person clears the placeholder and vice versa; a booking sits on
 * exactly one row. Role, Team and Weekly capacity are written from the
 * person's roster entry (itself read off their other bookings), so filtering
 * and capacity keep working without an automation or access to the People
 * database. Moving back to a placeholder clears them.
 */
export function bookingProperties(d: BookingDraft, person: Person | undefined): NotionPagePropertyInputMap {
	const who = d.personId ? person : undefined
	return {
		person: { type: "people", people: d.personId ? [{ id: d.personId }] : [] },
		placeholder: { type: "select", select: d.personId ? null : { name: d.placeholder ?? "Overflow" } },
		role: { type: "multi_select", multi_select: (who?.roles ?? []).map((name) => ({ name })) },
		team: { type: "select", select: who?.team ? { name: who.team } : null },
		capacity: { type: "number", number: who ? who.weeklyCapacity : null },
		dates: dates(d.start, d.end),
		hoursPerDay: { type: "number", number: d.hoursPerDay },
		notes: text(d.notes),
	} as NotionPagePropertyInputMap
}

/** The roster fields alone, for re-stamping a person's existing bookings. */
export function personProperties(p: PersonProfile): NotionPagePropertyInputMap {
	return {
		role: { type: "multi_select", multi_select: p.roles.map((name) => ({ name })) },
		team: { type: "select", select: p.team ? { name: p.team } : null },
		capacity: { type: "number", number: p.weeklyCapacity },
	} as NotionPagePropertyInputMap
}

export function newBookingProperties(jobId: string, title: string, r: PlannedRound): NotionPagePropertyInputMap {
	return {
		title: { type: "title", title: [{ type: "text", text: { content: title } }] },
		job: { type: "relation", relation: [{ id: jobId }] },
		placeholder: { type: "select", select: { name: "Overflow" } },
		dates: dates(r.start, r.end),
		hoursPerDay: { type: "number", number: r.hoursPerDay },
		round: { type: "number", number: r.round },
	} as NotionPagePropertyInputMap
}

export function newJobProperties(j: {
	title: string
	number: string
	clientId: string | null
	templateId: string
	label: string | null
}): NotionPagePropertyInputMap {
	return {
		title: { type: "title", title: [{ type: "text", text: { content: j.title } }] },
		number: text(j.number || null),
		client: { type: "relation", relation: j.clientId ? [{ id: j.clientId }] : [] },
		template: { type: "relation", relation: [{ id: j.templateId }] },
		label: { type: "select", select: j.label ? { name: j.label } : null },
	} as NotionPagePropertyInputMap
}

/** Drops keys the config panel left unbound, so a write never names a property that isn't there. */
export function onlyBound(
	props: NotionPagePropertyInputMap,
	ids: Readonly<Record<string, string | undefined>>,
): NotionPagePropertyInputMap {
	return Object.fromEntries(Object.entries(props).filter(([k]) => ids[k] !== undefined)) as NotionPagePropertyInputMap
}

// ---------------------------------------------------------------------------
// Binding health
// ---------------------------------------------------------------------------

type Bindable = { propertyIdsByKey: Readonly<Record<string, string | undefined>> }

const REQUIRED: Record<string, string[]> = {
	Bookings: ["title", "job", "person", "placeholder", "dates", "hoursPerDay"],
	Jobs: ["title", "client"],
	Clients: ["name"],
	"Job templates": ["name", "round1"],
}

export function bindingProblems(sources: Record<string, Bindable>): string[] {
	const out: string[] = []
	for (const [name, s] of Object.entries(sources)) {
		const missing = (REQUIRED[name] ?? []).filter((k) => s.propertyIdsByKey[k] === undefined)
		if (missing.length > 0) out.push(`${name}: map ${missing.join(", ")} in the block's settings.`)
	}
	return out
}
