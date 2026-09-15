/**
 * Translation between Notion's row values and this block's domain types.
 *
 * Kept separate from `rules.ts` / `records.ts` so the rules never learn
 * Notion's value union, and separate from the components so the components
 * never do either. Both directions live here: reading rows in, and building
 * the property maps that go back out.
 *
 * Writers write **every field the block owns on every save, nulls included** —
 * an omitted key leaves the old value in place, so clearing a Lost Reason or a
 * phone number depends on it. They **omit every field the block does not own**
 * (owners, the relation lists that Notion maintains from the other side) so
 * those are never clobbered.
 */

import type {
	NotionDataSourcePage,
	NotionDataSourceValue,
	NotionPagePropertyInputMap,
} from "@notionhq/custom-blocks"

import type { LinkedKind, LinkedRecord } from "./linked.ts"
import { toLinkedRecordFromRow } from "./linked.ts"
import type { Company, CompanyDraft, Contact, ContactDraft } from "./records.ts"
import {
	isStage,
	STAGES,
	type Deal,
	type DealDraft,
	type FxRate,
	type Stage,
} from "./rules.ts"

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

/**
 * The `YYYY-MM-DD` calendar day.
 *
 * `start_date` is already a plain local calendar day; slicing a UTC timestamp
 * instead would shift late-evening rows into the next day.
 */
function asDate(value: NotionDataSourceValue | undefined): string | null {
	if (value === null || typeof value !== "object") return null
	if (Array.isArray(value)) return null
	if (!("start_date" in value)) return null
	return value.start_date
}

/**
 * Relation and people values arrive as `{ id, table }` pointers. People have
 * also been seen as bare id strings; accept both so the Owner chip survives a
 * host change.
 */
export function asRelationIds(value: NotionDataSourceValue | undefined): string[] {
	if (!Array.isArray(value)) return []
	const ids: string[] = []
	for (const item of value) {
		if (typeof item === "string") ids.push(item)
		else if (item !== null && typeof item === "object" && typeof item.id === "string") ids.push(item.id)
	}
	return ids
}

/** We only ever want the first of a limit-1 relation. */
function asSingleRelationId(value: NotionDataSourceValue | undefined): string | null {
	return asRelationIds(value)[0] ?? null
}

export function toCompany(row: NotionDataSourcePage): Company {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: asText(p.name) ?? "Untitled",
		website: asText(p.website),
		description: asText(p.description),
		industry: asText(p.industry),
		size: asText(p.size),
		country: asText(p.country),
		contactIds: asRelationIds(p.contacts),
		dealIds: asRelationIds(p.deals),
		meetingNoteIds: asRelationIds(p.meetingNotes),
		emailIds: asRelationIds(p.emails),
	}
}

export function toContact(row: NotionDataSourcePage): Contact {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: asText(p.name) ?? "Untitled",
		firstName: asText(p.firstName),
		lastName: asText(p.lastName),
		jobTitle: asText(p.jobTitle),
		email: asText(p.email),
		phone: asText(p.phone),
		linkedin: asText(p.linkedin),
		note: asText(p.note),
		leadSource: asText(p.leadSource),
		country: asText(p.country),
		companyId: asSingleRelationId(p.company),
		ownerId: asSingleRelationId(p.owner),
		dealIds: asRelationIds(p.deals),
		meetingNoteIds: asRelationIds(p.meetingNotes),
		emailIds: asRelationIds(p.emails),
	}
}

/**
 * Returns `null` for a row whose stage isn't one the rules know.
 *
 * A deal in an unrecognised stage cannot be gated — there are no requirements
 * defined for it — so showing it as if it were governed would be a lie. The
 * caller surfaces the count instead, which is also the fastest way to notice
 * that the Stage binding points at the wrong property.
 */
export function toDeal(row: NotionDataSourcePage): Deal | null {
	const p = row.propertiesByKey
	const stage = asText(p.stage)
	if (!isStage(stage)) return null

	return {
		id: row.id,
		name: asText(p.name) ?? "Untitled",
		stage,
		dealType: asText(p.dealType),
		value: asNumber(p.value),
		probability: asNumber(p.probability),
		expectedClose: asDate(p.expectedClose),
		actualClose: asDate(p.actualClose),
		companyId: asSingleRelationId(p.company),
		contactId: asSingleRelationId(p.contact),
		referredById: asSingleRelationId(p.referredBy),
		currencyId: asSingleRelationId(p.currency),
		lostReason: asText(p.lostReason),
		description: asText(p.description),
		ownerId: asSingleRelationId(p.owner),
		meetingNoteIds: asRelationIds(p.meetingNotes),
		emailIds: asRelationIds(p.emails),
	}
}

export function toFxRate(row: NotionDataSourcePage): FxRate {
	const p = row.propertiesByKey
	return {
		id: row.id,
		code: (asText(p.currency) ?? "?").toUpperCase(),
		rateToSgd: asNumber(p.rateToSgd),
		rateDate: asDate(p.rateDate),
	}
}

/** The optional cache bindings, as a lookup the linked-activity loader consults first. */
export function toLinkedCache(
	rows: readonly NotionDataSourcePage[],
	kind: LinkedKind,
): Map<string, LinkedRecord> {
	return new Map(rows.map((row) => [row.id, toLinkedRecordFromRow(row, kind)]))
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function relation(id: string | null) {
	return { type: "relation" as const, relation: id === null ? [] : [{ id }] }
}

function date(day: string | null) {
	return { type: "date" as const, date: day === null ? null : { start: day } }
}

function select(name: string | null) {
	return { type: "select" as const, select: name === null ? null : { name } }
}

function title(text: string) {
	return { type: "title" as const, title: [{ type: "text", text: { content: text } }] }
}

function richText(text: string | null) {
	return {
		type: "rich_text" as const,
		rich_text: text === null ? [] : [{ type: "text", text: { content: text } }],
	}
}

/**
 * The property map for a deal create or update, keyed by the manifest's
 * semantic keys — the SDK resolves them to raw property ids.
 *
 * `owner`, `meetingNotes` and `emails` are deliberately absent: the block reads
 * them and never writes them. `actualClose` is written back unchanged so the
 * automation-stamped date survives a save from here.
 */
export function toProperties(draft: DealDraft): NotionPagePropertyInputMap {
	return {
		name: title(draft.name),
		stage: { type: "status", status: { name: draft.stage } },
		dealType: select(draft.dealType),
		value: { type: "number", number: draft.value },
		probability: { type: "number", number: draft.probability },
		expectedClose: date(draft.expectedClose),
		actualClose: date(draft.actualClose),
		company: relation(draft.companyId),
		contact: relation(draft.contactId),
		referredBy: relation(draft.referredById),
		currency: relation(draft.currencyId),
		lostReason: select(draft.lostReason),
		description: richText(draft.description),
	}
}

/** Owner and the Deals / Meeting Notes / Emails relations are not the block's to write. */
export function toContactProperties(draft: ContactDraft): NotionPagePropertyInputMap {
	return {
		name: title(draft.name),
		firstName: richText(draft.firstName),
		lastName: richText(draft.lastName),
		jobTitle: richText(draft.jobTitle),
		email: { type: "email", email: draft.email },
		phone: { type: "phone_number", phone_number: draft.phone },
		linkedin: { type: "url", url: draft.linkedin },
		note: richText(draft.note),
		leadSource: select(draft.leadSource),
		country: select(draft.country),
		company: relation(draft.companyId),
	}
}

/** The Contacts / Deals / Meeting Notes / Emails relations are maintained from the other side. */
export function toCompanyProperties(draft: CompanyDraft): NotionPagePropertyInputMap {
	return {
		name: title(draft.name),
		website: { type: "url", url: draft.website },
		description: richText(draft.description),
		industry: select(draft.industry),
		size: select(draft.size),
		country: select(draft.country),
	}
}

/**
 * Only the keys that are actually bound. Writing a key the config panel left
 * unmapped fails the whole save, and an optional field (say, a client CRM with
 * no Lead Source) should degrade to "not editable here", not "nothing saves".
 */
export function onlyBound(
	properties: NotionPagePropertyInputMap,
	propertyIdsByKey: { [key: string]: string | undefined },
): NotionPagePropertyInputMap {
	const bound: NotionPagePropertyInputMap = {}
	for (const [key, value] of Object.entries(properties)) {
		if (propertyIdsByKey[key] !== undefined) bound[key] = value
	}
	return bound
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Option names offered by a select, read off the bound property's own schema.
 *
 * Read rather than hardcoded so the block works against a client CRM whose
 * pipeline uses different words — the only names this block hardcodes are the
 * stages, because the gating rules are defined per stage and cannot be inferred.
 */
export function optionNames(
	schema: { type: string; options?: { name: string }[] } | undefined,
): string[] {
	return schema?.options?.map((o) => o.name) ?? []
}

/**
 * The stages the bound Stage property offers, in this block's pipeline order.
 *
 * A `status` property also carries `groups` (To do / In progress / Complete),
 * but those only partition the options by id — every option name is already in
 * `options`, so reading that alone is sufficient and reading both would just
 * risk disagreeing with itself.
 *
 * Anything the rules don't know is dropped: the block can only govern a stage it
 * has requirements for, and silently offering an ungoverned one is worse than
 * not offering it. Returning `[]` is meaningful — the caller decides whether an
 * unbound property should fall back to the full list.
 */
export function stageOptionNames(
	schema: { type: string; options?: { name: string }[] } | undefined,
): Stage[] {
	if (schema === undefined) return []
	const names = new Set(optionNames(schema))
	return STAGES.filter((stage) => names.has(stage))
}
