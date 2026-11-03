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
} from "@notionhq/custom-blocks"

import {
	isStage,
	STAGES,
	type Customer,
	type Ingredient,
	type Line,
	type Order,
	type PriceEntry,
	type Site,
} from "./rules.ts"
import type { LineDraft, OrderDraft } from "./store.ts"

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

/** `start_date` is already a plain calendar day; don't slice a UTC timestamp instead. */
function asDate(value: NotionDataSourceValue | undefined): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null
	return "start_date" in value ? value.start_date : null
}

function asDateTime(value: NotionDataSourceValue | undefined): string | null {
	if (typeof value === "string") return value
	if (value !== null && typeof value === "object" && !Array.isArray(value) && "start_date" in value) {
		return value.start_date
	}
	return null
}

/** Relation values arrive as `{ id, table }` pointers. */
function asFirstId(value: NotionDataSourceValue | undefined): string | null {
	if (!Array.isArray(value)) return null
	for (const item of value) {
		if (typeof item === "string") return item
		if (item !== null && typeof item === "object" && typeof item.id === "string") return item.id
	}
	return null
}

/** Returns null for a stage the rules don't know — an ungoverned order shouldn't look governed. */
export function toOrder(row: NotionDataSourcePage): Order | null {
	const p = row.propertiesByKey
	const stage = asText(p.stage)
	if (!isStage(stage)) return null
	return {
		id: row.id,
		title: asText(p.title) ?? "Untitled",
		stage,
		customerId: asFirstId(p.customer),
		siteId: asFirstId(p.site),
		deliveryDate: asDate(p.deliveryDate),
		customerRef: asText(p.customerRef),
		paymentReceived: p.paymentReceived === true,
		sealChecked: p.sealChecked === true,
		courier: asText(p.courier),
		trackingRef: asText(p.trackingRef),
		deliveredOn: asDate(p.deliveredOn),
		cancellationReason: asText(p.cancellationReason),
		notes: asText(p.notes),
		createdTime: asDateTime(row.propertiesById.created_time),
	}
}

export function toLine(row: NotionDataSourcePage): Line {
	const p = row.propertiesByKey
	return {
		id: row.id,
		orderId: asFirstId(p.order),
		ingredientId: asFirstId(p.ingredient),
		quantity: asNumber(p.quantity),
		unitPrice: asNumber(p.unitPrice),
		priceEntryId: asFirstId(p.priceEntry),
	}
}

export function toCustomer(row: NotionDataSourcePage): Customer {
	const p = row.propertiesByKey
	return { id: row.id, name: asText(p.name) ?? "Untitled", licence: asText(p.licence), terms: asText(p.terms) }
}

export function toSite(row: NotionDataSourcePage): Site {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: asText(p.name) ?? "Untitled",
		customerId: asFirstId(p.customer),
		address: asText(p.address),
		warded: p.warded === true,
	}
}

export function toIngredient(row: NotionDataSourcePage): Ingredient {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: asText(p.name) ?? "Untitled",
		sku: asText(p.sku),
		unit: asText(p.unit),
		hazard: asText(p.hazard),
		restricted: p.restricted === true,
		discontinued: asText(p.status) === "Discontinued",
	}
}

export function toPriceEntry(row: NotionDataSourcePage): PriceEntry {
	const p = row.propertiesByKey
	return {
		id: row.id,
		customerId: asFirstId(p.customer),
		ingredientId: asFirstId(p.ingredient),
		price: asNumber(p.price),
	}
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const relation = (id: string | null) => ({ type: "relation" as const, relation: id === null ? [] : [{ id }] })
const date = (day: string | null) => ({ type: "date" as const, date: day === null ? null : { start: day } })
const select = (name: string | null) => ({ type: "select" as const, select: name === null ? null : { name } })
const title = (text: string) => ({ type: "title" as const, title: [{ type: "text" as const, text: { content: text } }] })
const richText = (text: string | null) => ({
	type: "rich_text" as const,
	rich_text: text === null ? [] : [{ type: "text" as const, text: { content: text } }],
})

/** The fields the sheet owns. Stage is written only on create (as Draft) and by moves. */
export function orderProperties(draft: OrderDraft, isNew: boolean): NotionPagePropertyInputMap {
	return {
		title: title(draft.title),
		customer: relation(draft.customerId),
		site: relation(draft.siteId),
		deliveryDate: date(draft.deliveryDate),
		customerRef: richText(draft.customerRef),
		notes: richText(draft.notes),
		...(isNew ? { stage: { type: "status" as const, status: { name: STAGES[0] } } } : {}),
	}
}

/** A stage move: the stage plus every gate field, so a cleared one is cleared in Notion too. */
export function moveProperties(next: Order): NotionPagePropertyInputMap {
	return {
		stage: { type: "status", status: { name: next.stage } },
		paymentReceived: { type: "checkbox", checkbox: next.paymentReceived },
		sealChecked: { type: "checkbox", checkbox: next.sealChecked },
		courier: select(next.courier),
		trackingRef: richText(next.trackingRef),
		deliveredOn: date(next.deliveredOn),
		cancellationReason: select(next.cancellationReason),
	}
}

export function lineProperties(line: LineDraft, orderId: string, lineTitle: string): NotionPagePropertyInputMap {
	return {
		title: title(lineTitle),
		order: relation(orderId),
		ingredient: relation(line.ingredientId),
		quantity: { type: "number", number: line.quantity },
		unitPrice: { type: "number", number: line.unitPrice },
		priceEntry: relation(line.priceEntryId),
	}
}

export function sameLine(a: Line, b: LineDraft): boolean {
	return (
		a.ingredientId === b.ingredientId &&
		a.quantity === b.quantity &&
		a.unitPrice === b.unitPrice &&
		a.priceEntryId === b.priceEntryId
	)
}

/** Drop keys the instance hasn't mapped: writing an unbound key fails the whole save. */
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
// Binding health
// ---------------------------------------------------------------------------

/** A select or status property's option names, read off its schema rather than assumed. */
export function optionNames(schema: unknown): string[] {
	if (schema === null || typeof schema !== "object" || !("options" in schema) || !Array.isArray(schema.options)) return []
	return schema.options.flatMap((o: unknown) =>
		o !== null && typeof o === "object" && "name" in o && typeof o.name === "string" ? [o.name] : [],
	)
}

/**
 * What's missing from the binding, in words. A declared key whose type
 * disagrees with the bound property resolves to unbound without an error, so
 * this is the only place that mistake shows.
 */
export function bindingProblems(sources: {
	[key: string]: { propertyIdsByKey: { [key: string]: string | undefined }; error?: { message: string } }
}, stageSchema: unknown): string[] {
	const problems: string[] = []
	for (const [name, source] of Object.entries(sources)) {
		if (source.error) {
			problems.push(`${name}: ${source.error.message}`)
			continue
		}
		const unbound = Object.entries(source.propertyIdsByKey)
			.filter(([, id]) => id === undefined)
			.map(([key]) => key)
		if (unbound.length > 0) problems.push(`${name}: map ${unbound.map((k) => `“${k}”`).join(", ")}.`)
	}
	if (stageSchema !== undefined) {
		const names = new Set(optionNames(stageSchema))
		const missing = STAGES.filter((s) => !names.has(s))
		if (missing.length > 0) problems.push(`Orders Stage is missing options: ${missing.join(", ")}.`)
	}
	return problems
}
