import type { NotionDataSourcePage, NotionDateValue } from "@notionhq/custom-blocks"

import type { Send } from "./aggregate.ts"

/**
 * Turn a bound row into a `Send`. Values arrive loosely typed from the host, so
 * everything is checked rather than cast — a half-filled row should degrade to
 * zeroes, not crash the block.
 */
export function toSend(row: NotionDataSourcePage): Send {
	const props = row.propertiesByKey
	return {
		id: row.id,
		subject: text(props.subject) || "Untitled",
		sentOn: day(props.sentAt),
		deliveries: count(props.deliveries),
		opens: count(props.opens),
		clicks: count(props.clicks),
		unsubscribes: count(props.unsubscribes),
	}
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : ""
}

/** Non-finite, negative and missing numbers all collapse to 0. */
function count(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0
	return value < 0 ? 0 : value
}

/**
 * `start_date` is already a plain `YYYY-MM-DD` calendar date — the time, when
 * there is one, lives in a separate field. Slicing a UTC timestamp instead
 * would shift late-evening sends into the next day.
 */
function day(value: unknown): string | null {
	if (value == null || typeof value !== "object") return null
	const date = value as NotionDateValue
	const start = (date as { start_date?: unknown }).start_date
	if (typeof start === "string" && start.length >= 10) return start.slice(0, 10)
	return null
}
