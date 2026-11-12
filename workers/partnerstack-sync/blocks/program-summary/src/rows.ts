import type { NotionDataSourcePage } from "@notionhq/custom-blocks"

import type { PayoutRow, ProgramRow, RewardRow } from "./aggregate.ts"

/**
 * Bound rows → the shapes aggregate.ts works with. Values arrive loosely typed
 * and any property may be left unmapped, so everything is checked, not cast.
 */

export function toProgramRow(row: NotionDataSourcePage): ProgramRow {
	return { id: row.id, name: text(row.propertiesByKey.name) || "Untitled program" }
}

export function toRewardRow(row: NotionDataSourcePage): RewardRow {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: text(p.name) || "Untitled reward",
		programIds: ids(p.program),
		payoutIds: ids(p.payout),
		amount: num(p.amount),
		status: text(p.status).toLowerCase(),
		paymentDate: day(p.paymentDate),
		created: day(p.created),
	}
}

export function toPayoutRow(row: NotionDataSourcePage): PayoutRow {
	const p = row.propertiesByKey
	return {
		id: row.id,
		name: text(p.name) || "Payout",
		amount: num(p.amount),
		status: text(p.status).toLowerCase(),
		fee: num(p.fee),
		date: day(p.withdrawn) ?? day(p.sent) ?? day(p.created),
	}
}

function text(v: unknown): string {
	if (typeof v === "string") return v.trim()
	if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim()
	return ""
}

function num(v: unknown): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Record pointers: `[{ id, table }]`. */
function ids(v: unknown): string[] {
	if (!Array.isArray(v)) return []
	return v
		.map((x) => (x && typeof x === "object" && "id" in x ? String((x as { id: unknown }).id) : ""))
		.filter(Boolean)
}

/** Date values expose `start_date` as YYYY-MM-DD; use it as-is (no UTC slicing). */
function day(v: unknown): string | null {
	if (v && typeof v === "object" && "start_date" in v) {
		const s = (v as { start_date?: unknown }).start_date
		if (typeof s === "string" && s) return s.slice(0, 10)
	}
	return null
}
