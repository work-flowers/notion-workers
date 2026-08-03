import type { NotionDataSourcePage, NotionDateValue } from "@notionhq/custom-blocks"

import type { ChannelRow, DailyRow, PageRow } from "./aggregate.ts"

/**
 * Turn bound rows into the shapes `aggregate.ts` works with.
 *
 * Values arrive loosely typed from the host and any property can be left
 * unmapped in the block's config panel, so everything is checked rather than
 * cast: a half-bound data source should degrade to zeroes and a visible setup
 * hint, not throw inside a chart.
 */

export function toDailyRow(row: NotionDataSourcePage): DailyRow {
	const props = row.propertiesByKey
	return {
		id: row.id,
		day: day(props.day),
		sessions: count(props.sessions),
		engagedSessions: count(props.engagedSessions),
		avgSessionDuration: count(props.avgSessionDuration),
		views: count(props.views),
		totalUsers: count(props.totalUsers),
		newUsers: count(props.newUsers),
		keyEvents: count(props.keyEvents),
		createdAt: createdAt(row),
	}
}

export function toChannelRow(row: NotionDataSourcePage): ChannelRow {
	const props = row.propertiesByKey
	return {
		id: row.id,
		day: day(props.day),
		channel: text(props.channel) || "Unassigned",
		source: text(props.source) || "(not set)",
		medium: text(props.medium) || "(not set)",
		sessions: count(props.sessions),
		engagedSessions: count(props.engagedSessions),
		newUsers: count(props.newUsers),
		engagementSeconds: count(props.engagementSeconds),
	}
}

export function toPageRow(row: NotionDataSourcePage): PageRow {
	const props = row.propertiesByKey
	return {
		id: row.id,
		path: text(props.path) || "(untitled)",
		pageType: text(props.pageType) || "Other",
		views: count(props.views),
		users: count(props.users),
		engagementSeconds: count(props.engagementSeconds),
		views28: count(props.views28),
		users28: count(props.users28),
		engagementSeconds28: count(props.engagementSeconds28),
		matched: flag(props.matched),
		sourceTitle: text(props.sourceTitle),
	}
}

/** Title, rich text and select all arrive as plain strings. */
function text(value: unknown): string {
	if (typeof value === "string") return value.trim()
	// A multi-select-shaped value would arrive as an array; take the first.
	if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim()
	return ""
}

/** Non-finite, negative and missing numbers all collapse to 0. */
function count(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0
	return value < 0 ? 0 : value
}

function flag(value: unknown): boolean {
	return value === true
}

/**
 * `start_date` is already a plain `YYYY-MM-DD` calendar date — the time, when
 * there is one, lives in a separate field. Slicing a UTC timestamp instead
 * would shift late-evening rows into the next day.
 */
function day(value: unknown): string | null {
	if (value == null || typeof value !== "object") return null
	const start = (value as NotionDateValue & { start_date?: unknown }).start_date
	if (typeof start === "string" && start.length >= 10) return start.slice(0, 10)
	return null
}

/**
 * The built-in creation timestamp, as a sortable string. It is only ever
 * compared to another one of these, so the exact format doesn't matter as long
 * as it orders correctly — hence date-then-time concatenation rather than a
 * real parse. Built-ins live on `propertiesById` only; they have no manifest
 * key, so this is the one place `propertiesByKey` can't be used.
 */
function createdAt(row: NotionDataSourcePage): string | null {
	const value = row.propertiesById?.created_time
	if (value == null || typeof value !== "object") return null
	const date = value as { start_date?: unknown; start_time?: unknown }
	if (typeof date.start_date !== "string") return null
	const time = typeof date.start_time === "string" ? date.start_time : ""
	return `${date.start_date}T${time}`
}
