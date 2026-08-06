/**
 * Translation between Notion's row values and this block's domain types.
 *
 * Kept separate from `rules.ts` so the rules never learn Notion's value union,
 * and separate from the components so the components never do either. Both
 * directions live here: reading rows in, and building the property map that
 * goes back out.
 */

import type {
	NotionDataSourcePage,
	NotionDataSourceValue,
	NotionPagePropertyInputMap,
} from "@notionhq/custom-blocks"

import {
	isStage,
	STAGES,
	type Company,
	type Contact,
	type Deal,
	type DealDraft,
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

/** Relation values arrive as `{ id, table }` pointers. We only ever want the first. */
function asSingleRelationId(
	value: NotionDataSourceValue | undefined,
): string | null {
	if (!Array.isArray(value)) return null
	const first = value[0]
	if (first === undefined || typeof first === "string") return null
	return first.id
}

export function toCompany(row: NotionDataSourcePage): Company {
	return {
		id: row.id,
		name: asText(row.propertiesByKey.name) ?? "Untitled",
	}
}

export function toContact(row: NotionDataSourcePage): Contact {
	return {
		id: row.id,
		name: asText(row.propertiesByKey.name) ?? "Untitled",
		jobTitle: asText(row.propertiesByKey.jobTitle),
		email: asText(row.propertiesByKey.email),
		companyId: asSingleRelationId(row.propertiesByKey.company),
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
	const stage = asText(row.propertiesByKey.stage)
	if (!isStage(stage)) return null

	return {
		id: row.id,
		name: asText(row.propertiesByKey.name) ?? "Untitled",
		stage,
		dealType: asText(row.propertiesByKey.dealType),
		value: asNumber(row.propertiesByKey.value),
		probability: asNumber(row.propertiesByKey.probability),
		expectedClose: asDate(row.propertiesByKey.expectedClose),
		actualClose: asDate(row.propertiesByKey.actualClose),
		companyId: asSingleRelationId(row.propertiesByKey.company),
		contactId: asSingleRelationId(row.propertiesByKey.contact),
		lostReason: asText(row.propertiesByKey.lostReason),
		description: asText(row.propertiesByKey.description),
	}
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

/**
 * The property map for a create or update, keyed by the manifest's semantic
 * keys — the SDK resolves them to raw property ids.
 *
 * Every field is written on every save, including the nulls. Clearing matters:
 * moving a deal back out of Closed Lost has to actually remove the lost reason,
 * and an omitted key would silently leave the old value in place.
 */
export function toProperties(draft: DealDraft): NotionPagePropertyInputMap {
	return {
		name: {
			type: "title",
			title: [{ type: "text", text: { content: draft.name } }],
		},
		stage: { type: "status", status: { name: draft.stage } },
		dealType: select(draft.dealType),
		value: { type: "number", number: draft.value },
		probability: { type: "number", number: draft.probability },
		expectedClose: date(draft.expectedClose),
		actualClose: date(draft.actualClose),
		company: relation(draft.companyId),
		contact: relation(draft.contactId),
		lostReason: select(draft.lostReason),
		description: {
			type: "rich_text",
			rich_text:
				draft.description === null
					? []
					: [{ type: "text", text: { content: draft.description } }],
		},
	}
}

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
