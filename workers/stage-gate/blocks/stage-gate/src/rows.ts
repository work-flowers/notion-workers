/**
 * Translation between Notion row values and the block's domain types, both
 * directions. Writers write every field the block owns, nulls included, and
 * nothing else.
 */

import type {
	NotionDataSourcePage,
	NotionDataSourceValue,
	NotionPagePropertyInputMap,
} from "@notionhq/custom-blocks"

import { CHECKLIST, FINAL_PHASE, PHASES, STATUS, type ChecklistItem } from "./checklist.ts"
import type { Deliverable, Project } from "./gate.ts"

function asText(value: NotionDataSourceValue | undefined): string | null {
	if (typeof value !== "string") return null
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: NotionDataSourceValue | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asDate(value: NotionDataSourceValue | undefined): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null
	return "start_date" in value ? value.start_date : null
}

function asIds(value: NotionDataSourceValue | undefined): string[] {
	if (!Array.isArray(value)) return []
	const ids: string[] = []
	for (const item of value) {
		if (typeof item === "string") ids.push(item)
		else if (item !== null && typeof item === "object" && typeof item.id === "string") ids.push(item.id)
	}
	return ids
}

export function toProject(row: NotionDataSourcePage): Project {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: asText(p.name) ?? "Untitled",
		phase: asText(p.phase),
		deliverableIds: asIds(p.deliverables),
	}
}

export function toDeliverable(row: NotionDataSourcePage): Deliverable {
	const p = row.propertiesByKey
	return {
		id: row.id,
		key: asText(p.itemKey),
		item: asText(p.item) ?? "Untitled",
		projectIds: asIds(p.project),
		phase: asText(p.phase),
		category: asText(p.category),
		description: asText(p.description),
		format: asText(p.format),
		mandatory: p.mandatory === true,
		status: asText(p.status),
		completedDate: asDate(p.completedDate),
		fileLink: asText(p.fileLink),
		order: asNumber(p.order),
	}
}

const richText = (text: string) => ({
	type: "rich_text" as const,
	rich_text: [{ type: "text" as const, text: { content: text } }],
})

/** The fields an item edit owns, all written every time (see `applyChange`). */
export function itemProperties(next: Deliverable): NotionPagePropertyInputMap {
	return {
		status: { type: "status", status: { name: next.status ?? STATUS.pending } },
		completedDate: { type: "date", date: next.completedDate === null ? null : { start: next.completedDate } },
		fileLink: { type: "url", url: next.fileLink },
	}
}

export function newProjectProperties(
	name: string,
	details: { make: string; model: string; variant: string },
): NotionPagePropertyInputMap {
	const properties: NotionPagePropertyInputMap = {
		name: { type: "title", title: [{ type: "text", text: { content: name } }] },
		phase: { type: "status", status: { name: PHASES[0].name } },
	}
	for (const key of ["make", "model", "variant"] as const) {
		const value = details[key].trim()
		if (value) properties[key] = richText(value)
	}
	return properties
}

export function phaseProperties(phase: string): NotionPagePropertyInputMap {
	return { phase: { type: "status", status: { name: phase } } }
}

export function newItemProperties(projectId: string, c: ChecklistItem): NotionPagePropertyInputMap {
	return {
		item: { type: "title", title: [{ type: "text", text: { content: c.item } }] },
		project: { type: "relation", relation: [{ id: projectId }] },
		phase: { type: "select", select: { name: c.phase } },
		category: { type: "select", select: { name: c.category } },
		description: richText(c.description),
		format: { type: "select", select: { name: c.format } },
		mandatory: { type: "checkbox", checkbox: c.mandatory },
		status: { type: "status", status: { name: STATUS.pending } },
		order: { type: "number", number: c.order },
		itemKey: richText(c.key),
	}
}

/** Drop keys the block instance hasn't mapped, so a write never names an unbound key. */
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

type Schema = { type: string; options?: { name: string }[] } | undefined

/**
 * What's wrong with the binding, in words a person configuring the block can
 * act on. Checks the keys the gate cannot work without and the option names it
 * writes — a missing option would only surface as a failed save.
 */
export function bindingProblems(args: {
	projectIds: { [key: string]: string | undefined }
	deliverableIds: { [key: string]: string | undefined }
	projectPhase: Schema
	deliverableStatus: Schema
}): string[] {
	const problems: string[] = []
	for (const key of ["name", "phase"]) {
		if (!args.projectIds[key]) problems.push(`Projects: map the “${key}” property.`)
	}
	for (const key of ["item", "project", "status", "phase", "itemKey", "fileLink"]) {
		if (!args.deliverableIds[key]) problems.push(`Deliverables: map the “${key}” property.`)
	}
	const phaseOptions = new Set(args.projectPhase?.options?.map((o) => o.name) ?? [])
	if (args.projectPhase) {
		const missing = [...PHASES.map((p) => p.name), FINAL_PHASE].filter((n) => !phaseOptions.has(n))
		if (missing.length > 0) problems.push(`Projects Phase is missing options: ${missing.join(", ")}.`)
	}
	const statusOptions = new Set(args.deliverableStatus?.options?.map((o) => o.name) ?? [])
	if (args.deliverableStatus) {
		const missing = Object.values(STATUS).filter((n) => !statusOptions.has(n))
		if (missing.length > 0) problems.push(`Deliverables Status is missing options: ${missing.join(", ")}.`)
	}
	return problems
}

// Referenced so a checklist edit that breaks a key's uniqueness fails loudly in dev.
if (new Set(CHECKLIST.map((c) => c.key)).size !== CHECKLIST.length) {
	throw new Error("checklist.ts: duplicate item keys")
}
