/**
 * Linked Meeting Notes and Emails, as the record detail panels render them.
 *
 * Pure: no React, no SDK. The Notion-facing shapes are described structurally
 * (`PageLike`, `RowLike`) so `test/linked.test.ts` can feed fixtures in and the
 * loader can feed either a `pages.get` result or a `useDataSource` row in.
 *
 * Why two input shapes: the two source databases are past the 999-row query
 * cap and relations cannot be filtered server-side, so a record's linked pages
 * are fetched one by one through `pages.get` — which returns the *public API*
 * page shape (properties keyed by name, dates as `{ start }`). When the
 * optional cache bindings are mapped, the newest rows also arrive through
 * `useDataSource`, in the *data source* shape (keyed by manifest key, dates as
 * `{ start_date }`). Both funnel into one `LinkedRecord`.
 */

export type LinkedKind = "meetingNote" | "email"

export type LinkedRecord = {
	id: string
	kind: LinkedKind
	title: string
	/** ISO date or datetime as Notion gave it, or null. Sort key. */
	date: string | null
	/** Meeting type, or the sender address. */
	subtitle: string | null
	summary: string | null
}

export type LinkedFailure = {
	id: string
	kind: LinkedKind
	error: string
}

// ---------------------------------------------------------------------------
// Public-API page shape (pages.get)
// ---------------------------------------------------------------------------

/** The subset of `NotionPage` this module reads. */
export type PageLike = {
	id: string
	properties: Record<string, PagePropertyLike>
}

export type PagePropertyLike = { type: string; [key: string]: unknown }

const NAMES: Record<
	LinkedKind,
	{ title: string; date: string; subtitle: string; summary: string }
> = {
	meetingNote: {
		title: "Title",
		date: "Date",
		subtitle: "Type",
		summary: "Summary",
	},
	email: {
		title: "Subject",
		date: "Date Received",
		subtitle: "From",
		summary: "Thread Summary",
	},
}

/**
 * Map a fetched page onto a `LinkedRecord`.
 *
 * Looks each field up by the live CRM's property name first, then falls back
 * to "the only property of that type" — so a client CRM that calls the column
 * `Meeting date` still renders, and a renamed column degrades to a blank field
 * rather than a crash.
 */
export function toLinkedRecord(page: PageLike, kind: LinkedKind): LinkedRecord {
	const names = NAMES[kind]
	const props = page.properties

	const title =
		richTextOf(props[names.title]) ?? richTextOf(soleOfType(props, "title")) ?? "Untitled"

	const date =
		dateStartOf(props[names.date]) ?? dateStartOf(firstOfType(props, "date"))

	const subtitle =
		kind === "meetingNote"
			? (selectOf(props[names.subtitle]) ?? selectOf(firstOfType(props, "select")))
			: (emailOf(props[names.subtitle]) ?? emailOf(firstOfType(props, "email")))

	const summary =
		richTextOf(props[names.summary]) ?? richTextOf(firstNonEmptyRichText(props, names.title))

	return { id: page.id, kind, title, date, subtitle, summary }
}

function soleOfType(
	props: Record<string, PagePropertyLike>,
	type: string,
): PagePropertyLike | undefined {
	const matches = Object.values(props).filter((p) => p.type === type)
	return matches.length === 1 ? matches[0] : undefined
}

function firstOfType(
	props: Record<string, PagePropertyLike>,
	type: string,
): PagePropertyLike | undefined {
	return Object.values(props).find((p) => p.type === type)
}

function firstNonEmptyRichText(
	props: Record<string, PagePropertyLike>,
	skipName: string,
): PagePropertyLike | undefined {
	return Object.entries(props).find(
		([name, p]) => name !== skipName && p.type === "rich_text" && richTextOf(p) !== null,
	)?.[1]
}

/** Joins `plain_text` across rich-text items; null when empty. */
export function richTextOf(prop: PagePropertyLike | undefined): string | null {
	if (prop === undefined) return null
	const items = prop.type === "title" ? prop.title : prop.type === "rich_text" ? prop.rich_text : undefined
	if (!Array.isArray(items)) return null
	const text = items
		.map((item) => {
			if (item !== null && typeof item === "object" && "plain_text" in item) {
				const value = (item as { plain_text: unknown }).plain_text
				return typeof value === "string" ? value : ""
			}
			return ""
		})
		.join("")
		.trim()
	return text.length > 0 ? text : null
}

function dateStartOf(prop: PagePropertyLike | undefined): string | null {
	if (prop === undefined || prop.type !== "date") return null
	const date = prop.date
	if (date === null || typeof date !== "object") return null
	const start = (date as { start?: unknown }).start
	return typeof start === "string" && start.length > 0 ? start : null
}

function selectOf(prop: PagePropertyLike | undefined): string | null {
	if (prop === undefined || (prop.type !== "select" && prop.type !== "status")) return null
	const value = prop[prop.type]
	if (value === null || typeof value !== "object") return null
	const name = (value as { name?: unknown }).name
	return typeof name === "string" && name.length > 0 ? name : null
}

function emailOf(prop: PagePropertyLike | undefined): string | null {
	if (prop === undefined || prop.type !== "email") return null
	return typeof prop.email === "string" && prop.email.length > 0 ? prop.email : null
}

// ---------------------------------------------------------------------------
// Data-source row shape (useDataSource, optional cache bindings)
// ---------------------------------------------------------------------------

/** The subset of `NotionDataSourcePage` this module reads. */
export type RowLike = {
	id: string
	propertiesByKey: Record<string, unknown>
}

export function toLinkedRecordFromRow(row: RowLike, kind: LinkedKind): LinkedRecord {
	const p = row.propertiesByKey
	return {
		id: row.id,
		kind,
		title: asString(p.title) ?? "Untitled",
		date: rowDateStart(p.date),
		subtitle: asString(kind === "meetingNote" ? p.type : p.from),
		summary: asString(p.summary),
	}
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : null
}

/** Data-source dates carry `start_date` (and `start_time` for datetimes). */
function rowDateStart(value: unknown): string | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null
	const v = value as { start_date?: unknown; start_time?: unknown }
	if (typeof v.start_date !== "string") return null
	return typeof v.start_time === "string" ? `${v.start_date}T${v.start_time}` : v.start_date
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** The `YYYY-MM-DD` part of an ISO date or datetime. */
export function dateDay(date: string | null): string | null {
	if (date === null) return null
	return date.slice(0, 10)
}

/** Newest first; undated records last, ties broken by title for stability. */
export function sortNewestFirst<T extends { date: string | null; title: string }>(
	records: readonly T[],
): T[] {
	return [...records].sort((a, b) => {
		if (a.date === null && b.date === null) return a.title.localeCompare(b.title)
		if (a.date === null) return 1
		if (b.date === null) return -1
		if (a.date === b.date) return a.title.localeCompare(b.title)
		return a.date < b.date ? 1 : -1
	})
}

export function excerpt(text: string | null, max = 160): string | null {
	if (text === null) return null
	const oneLine = text.replace(/\s+/g, " ").trim()
	if (oneLine.length <= max) return oneLine
	const cut = oneLine.slice(0, max)
	const lastSpace = cut.lastIndexOf(" ")
	return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export const LINKED_BATCH_SIZE = 30

/**
 * The next `size` ids to fetch, taken from the **end** of the relation array.
 *
 * Notion appends to a relation as pages are linked, so the tail is usually the
 * newest — fetching from there means the first batch is the one people want,
 * and the sort is only ever wrong *within* the not-yet-loaded remainder, which
 * the UI labels as such.
 */
export function pickBatch(
	ids: readonly string[],
	alreadyLoaded: number,
	size = LINKED_BATCH_SIZE,
): string[] {
	const end = ids.length - alreadyLoaded
	if (end <= 0) return []
	const start = Math.max(0, end - size)
	return ids.slice(start, end).reverse()
}
