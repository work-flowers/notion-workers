/**
 * Pure aggregation logic. No React, no Notion SDK — so it can be unit-tested
 * with `npm run test --workspace=notion-worker-ga4-sync`.
 *
 * Every rate here is a ratio of summed counts, never an average of per-row
 * ratios. That distinction is the reason this block exists instead of a native
 * Notion chart, which can only sum or average the row-level `Engagement Rate`
 * and `Avg Session Duration` columns. Both are per-day means: averaging them
 * weights a 3-session Sunday the same as a 78-session Tuesday.
 *
 * Two counters in here are deliberately *not* offered as totals, because
 * summing them would be wrong in a way that looks right:
 *
 * - `Total Users` is a per-day unique count. Σ across days is user-*days* —
 *   someone who visits on three days counts three times. It is carried as
 *   `userDays` so the name can't be misread.
 * - `Users` on a page row is unique users *for that page*. Σ across pages
 *   double-counts anyone who read two pages, so `summarizePages` doesn't
 *   expose a users total at all.
 */

// ---------------------------------------------------------------------------
// Row shapes — what `rows.ts` produces from bound Notion rows
// ---------------------------------------------------------------------------

/** One row of 📈 Site Daily Summary. */
export type DailyRow = {
	id: string
	/** Calendar day, `YYYY-MM-DD`. Null when the row has no date. */
	day: string | null
	sessions: number
	engagedSessions: number
	/** A per-day mean, in seconds. Only ever combined weighted by sessions. */
	avgSessionDuration: number
	views: number
	/** Per-day unique users. Not additive across days — see the module note. */
	totalUsers: number
	newUsers: number
	keyEvents: number
	/** When the row was written. Used only to break duplicate-day ties. */
	createdAt: string | null
}

/** One row of 🚥 Traffic Session Source Medium Report. */
export type ChannelRow = {
	id: string
	day: string | null
	channel: string
	source: string
	medium: string
	sessions: number
	engagedSessions: number
	newUsers: number
	/** Total engaged seconds — a sum, so it adds up directly. */
	engagementSeconds: number
}

/** One row of 🗂️ Page Performance — a lifetime rollup, with a 28-day window. */
export type PageRow = {
	id: string
	path: string
	pageType: string
	views: number
	users: number
	engagementSeconds: number
	views28: number
	users28: number
	engagementSeconds28: number
	matched: boolean
	sourceTitle: string
}

/**
 * One row of 📄 Pages Path Report — one page on one day.
 *
 * Only ever read for one drill-down period at a time, through a date-filtered
 * query: the whole report is far past the 999-row cap (1,917 rows on
 * 2026-09-30), so it can't be loaded the way the other three are.
 */
export type PageDayRow = {
	id: string
	day: string | null
	path: string
	pageType: string
	views: number
	/** Per-day unique users. Not additive across days, like `DailyRow.totalUsers`. */
	users: number
	engagementSeconds: number
}

// ---------------------------------------------------------------------------
// Windows and buckets
// ---------------------------------------------------------------------------

export type Granularity = "day" | "week" | "month"

/** Presets are "the last N days"; `all` skips date filtering entirely. */
export type RangeKey = "28d" | "90d" | "all"

export const RANGE_LABELS: Record<RangeKey, string> = {
	"28d": "Last 28 days",
	"90d": "Last 90 days",
	all: "All time",
}

export const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = {
	"28d": 28,
	"90d": 90,
}

export const GRANULARITY_LABELS: Record<Granularity, string> = {
	day: "Daily",
	week: "Weekly",
	month: "Monthly",
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
]

/**
 * Parse `YYYY-MM-DD` as a UTC timestamp. Deliberately not `new Date(string)`:
 * local-time parsing shifts day boundaries and can push a day into the wrong
 * week for anyone east or west of UTC.
 */
export function parseDay(day: string): number {
	const [y, m, d] = day.split("-").map(Number)
	return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function formatDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10)
}

/** Calendar days; `n` may be negative. */
export function addDays(day: string, n: number): string {
	return formatDay(parseDay(day) + n * 86_400_000)
}

/** Monday of the week containing `day`. */
function weekStart(day: string): string {
	const ms = parseDay(day)
	const dow = new Date(ms).getUTCDay() // 0 = Sunday
	return formatDay(ms - ((dow + 6) % 7) * 86_400_000)
}

function bucketFor(
	day: string,
	granularity: Granularity,
): { key: string; label: string; start: string } {
	const [year, month, date] = day.split("-")

	if (granularity === "day") {
		return {
			key: day,
			label: `${Number(date)} ${MONTHS[Number(month) - 1]}`,
			start: day,
		}
	}
	if (granularity === "week") {
		const start = weekStart(day)
		const [, sm, sd] = start.split("-")
		return { key: start, label: `${Number(sd)} ${MONTHS[Number(sm) - 1]}`, start }
	}
	return {
		key: `${year}-${month}`,
		label: `${MONTHS[Number(month) - 1]} ${year}`,
		start: `${year}-${month}-01`,
	}
}

function safeRatio(numerator: number, denominator: number): number | null {
	return denominator > 0 ? numerator / denominator : null
}

// ---------------------------------------------------------------------------
// Site traffic
// ---------------------------------------------------------------------------

export type TrafficMetrics = {
	days: number
	sessions: number
	engagedSessions: number
	views: number
	newUsers: number
	keyEvents: number
	/**
	 * Σ of per-day unique users. This is user-*days*, not unique users — never
	 * label it "users" in the UI. Kept because it's the honest denominator for
	 * nothing at all, and because dropping it silently would invite someone to
	 * re-add it as a total.
	 */
	userDays: number
	/** Σ engaged sessions ÷ Σ sessions. Null without sessions to divide by. */
	engagementRate: number | null
	/** Σ (per-day mean × that day's sessions) ÷ Σ sessions, in seconds. */
	avgSessionDuration: number | null
	viewsPerSession: number | null
}

export type DailyBucket = TrafficMetrics & {
	/** Sortable bucket id: `2026-07-27` (day/week), `2026-07` (month). */
	key: string
	/** Axis label, e.g. `27 Jul`, `Jul 2026`. */
	label: string
	/** First day of the bucket, `YYYY-MM-DD`. */
	start: string
}

/** What the daily trend chart can plot. */
export type TrafficMetricKey = "sessions" | "views" | "newUsers"

export const TRAFFIC_METRIC_LABELS: Record<TrafficMetricKey, string> = {
	sessions: "Sessions",
	views: "Page views",
	newUsers: "New users",
}

/**
 * Roll a set of days into one set of aggregate figures.
 *
 * `engagementRate` and `avgSessionDuration` are recomputed from the counts
 * rather than averaged: the stored per-day values are means over that day's
 * sessions, so an unweighted average across days is a mean of means.
 */
export function summarizeDays(days: DailyRow[]): TrafficMetrics {
	let sessions = 0
	let engagedSessions = 0
	let views = 0
	let newUsers = 0
	let keyEvents = 0
	let userDays = 0
	let durationSeconds = 0

	for (const day of days) {
		sessions += day.sessions
		engagedSessions += day.engagedSessions
		views += day.views
		newUsers += day.newUsers
		keyEvents += day.keyEvents
		userDays += day.totalUsers
		// Re-expand the per-day mean into total session-seconds before summing.
		durationSeconds += day.avgSessionDuration * day.sessions
	}

	return {
		days: days.length,
		sessions,
		engagedSessions,
		views,
		newUsers,
		keyEvents,
		userDays,
		engagementRate: safeRatio(engagedSessions, sessions),
		avgSessionDuration: safeRatio(durationSeconds, sessions),
		viewsPerSession: safeRatio(views, sessions),
	}
}

export type DailySet = {
	days: DailyRow[]
	/** Rows collapsed away because another row already covered that day. */
	duplicates: number
	/** Rows with no date, which can't be placed on a time axis. */
	undated: number
}

/**
 * Collapse to one row per calendar day.
 *
 * `ga4-sync`'s `siteDailyDelta` re-inserts rather than upserts (its change key
 * is GA4's raw `20260801` while the primary-key property holds `2026-08-01`),
 * so the data source accumulates a duplicate of each of the last four days on
 * every six-hourly run. Summing blindly would double- or quadruple-count the
 * most recent days — the exact silent error this block exists to avoid.
 *
 * The newest write wins: GA4 keeps revising recent days as late hits and
 * attribution settle, so the most recently synced copy is the current truth.
 * Rows with no creation time sort oldest, so a real row always beats a blank.
 *
 * This stays even once the sync is fixed: the historical duplicates remain
 * until someone deletes them, and it costs one pass over ~100 rows.
 */
export function dedupeByDay(rows: DailyRow[]): DailySet {
	const byDay = new Map<string, DailyRow>()
	let undated = 0

	for (const row of rows) {
		if (!row.day) {
			undated += 1
			continue
		}
		const held = byDay.get(row.day)
		if (!held || (row.createdAt ?? "") > (held.createdAt ?? "")) {
			byDay.set(row.day, row)
		}
	}

	const days = [...byDay.values()].sort((a, b) =>
		(a.day ?? "") < (b.day ?? "") ? -1 : 1,
	)
	return { days, duplicates: rows.length - undated - days.length, undated }
}

/** Keep only days within the last N days of `today`, or all of them for `all`. */
export function filterDays(
	days: DailyRow[],
	range: RangeKey,
	today: string,
): DailyRow[] {
	if (range === "all") return days
	const from = addDays(today, -RANGE_DAYS[range])
	return days.filter((d) => d.day && d.day > from && d.day <= today)
}

/**
 * The equally-long window immediately before the selected one — but only when
 * the data actually spans it.
 *
 * This property was created 2026-04-12, so "the previous 90 days" reaches back
 * before any data exists and would compare a full quarter against the two or
 * three weeks that happen to fall inside it. That produces confident nonsense
 * (+296% sessions), so the comparison is withheld instead. `days` must be
 * sorted ascending, which `dedupeByDay` guarantees.
 */
export function previousDays(
	days: DailyRow[],
	range: RangeKey,
	today: string,
): DailyRow[] | null {
	if (range === "all") return null
	const span = RANGE_DAYS[range]
	const from = addDays(today, -2 * span)
	const to = addDays(today, -span)

	const earliest = days.find((d) => d.day)?.day
	if (!earliest || earliest > addDays(from, 1)) return null

	return days.filter((d) => d.day && d.day > from && d.day <= to)
}

/**
 * Group days into buckets, oldest first.
 *
 * Only periods that actually contain a day get a bucket. A gap in the sync is a
 * gap in the series, not a zero-traffic week — emitting an empty bucket would
 * draw the line to the floor and invent a collapse that didn't happen.
 */
export function bucketizeDays(
	days: DailyRow[],
	granularity: Granularity,
): DailyBucket[] {
	const groups = new Map<
		string,
		{ label: string; start: string; rows: DailyRow[] }
	>()

	for (const day of days) {
		if (!day.day) continue
		const { key, label, start } = bucketFor(day.day, granularity)
		const group = groups.get(key)
		if (group) group.rows.push(day)
		else groups.set(key, { label, start, rows: [day] })
	}

	return [...groups.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, { label, start, rows }]) => ({
			key,
			label,
			start,
			...summarizeDays(rows),
		}))
}

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

/**
 * Channels whose sessions carry no usable attribution. Direct is overwhelmingly
 * untagged links rather than people typing the URL, and Unassigned is GA4
 * giving up on a source/medium pair it can't map. Together they bound how much
 * of the acquisition picture is guesswork.
 */
export const UNTAGGED_CHANNELS = new Set(["Direct", "Unassigned"])

export type ChannelSummary = {
	channel: string
	sessions: number
	engagedSessions: number
	newUsers: number
	engagementSeconds: number
	/** Σ engaged ÷ Σ sessions for this channel. */
	engagementRate: number | null
	secondsPerSession: number | null
	/** This channel's share of sessions in the same window. */
	share: number | null
}

export type SourceSummary = {
	/** `source|medium`, stable across renders — React needs a key. */
	id: string
	source: string
	medium: string
	/** The channel GA4 assigned the most sessions of this pair to. */
	channel: string
	sessions: number
	engagedSessions: number
	engagementRate: number | null
	share: number | null
}

export function filterChannelRows(
	rows: ChannelRow[],
	range: RangeKey,
	today: string,
): ChannelRow[] {
	if (range === "all") return rows
	const from = addDays(today, -RANGE_DAYS[range])
	return rows.filter((r) => r.day && r.day > from && r.day <= today)
}

/** One entry per channel group, biggest first. */
export function summarizeChannels(rows: ChannelRow[]): ChannelSummary[] {
	const groups = new Map<string, ChannelSummary>()
	let total = 0

	for (const row of rows) {
		total += row.sessions
		const held = groups.get(row.channel)
		if (held) {
			held.sessions += row.sessions
			held.engagedSessions += row.engagedSessions
			held.newUsers += row.newUsers
			held.engagementSeconds += row.engagementSeconds
		} else {
			groups.set(row.channel, {
				channel: row.channel,
				sessions: row.sessions,
				engagedSessions: row.engagedSessions,
				newUsers: row.newUsers,
				engagementSeconds: row.engagementSeconds,
				engagementRate: null,
				secondsPerSession: null,
				share: null,
			})
		}
	}

	return [...groups.values()]
		.map((group) => ({
			...group,
			engagementRate: safeRatio(group.engagedSessions, group.sessions),
			secondsPerSession: safeRatio(group.engagementSeconds, group.sessions),
			share: safeRatio(group.sessions, total),
		}))
		.sort((a, b) => b.sessions - a.sessions)
}

/** One entry per source/medium pair, biggest first. */
export function summarizeSources(rows: ChannelRow[]): SourceSummary[] {
	const groups = new Map<
		string,
		SourceSummary & { channelSessions: Map<string, number> }
	>()
	let total = 0

	for (const row of rows) {
		total += row.sessions
		const id = `${row.source}|${row.medium}`
		let held = groups.get(id)
		if (!held) {
			held = {
				id,
				source: row.source,
				medium: row.medium,
				channel: row.channel,
				sessions: 0,
				engagedSessions: 0,
				engagementRate: null,
				share: null,
				channelSessions: new Map(),
			}
			groups.set(id, held)
		}
		held.sessions += row.sessions
		held.engagedSessions += row.engagedSessions
		held.channelSessions.set(
			row.channel,
			(held.channelSessions.get(row.channel) ?? 0) + row.sessions,
		)
	}

	return [...groups.values()]
		.map(({ channelSessions, ...group }) => ({
			...group,
			// A source/medium pair can drift between channel groups over time;
			// name it by whichever channel holds most of its sessions.
			channel: [...channelSessions.entries()].sort((a, b) => b[1] - a[1])[0][0],
			engagementRate: safeRatio(group.engagedSessions, group.sessions),
			share: safeRatio(group.sessions, total),
		}))
		.sort((a, b) => b.sessions - a.sessions)
}

/** How much of the window has no usable attribution. */
export function untaggedShare(rows: ChannelRow[]): {
	sessions: number
	share: number | null
} {
	let untagged = 0
	let total = 0
	for (const row of rows) {
		total += row.sessions
		if (UNTAGGED_CHANNELS.has(row.channel)) untagged += row.sessions
	}
	return { sessions: untagged, share: safeRatio(untagged, total) }
}

export type ChannelTrendBucket = {
	key: string
	label: string
	start: string
	/** Sessions for each of the named channels; absent channels read 0. */
	sessions: Record<string, number>
	/** Everything not in the named set, so the total still reconciles. */
	other: number
	total: number
}

/**
 * Sessions over time for a named set of channels.
 *
 * Deliberately takes an explicit channel list rather than plotting all seven:
 * the validated palette is three categorical hues, and seven series on a
 * low-traffic chart is unreadable regardless of colour. The remainder is kept
 * as `other` so the caller can say what it left out instead of hiding it.
 */
export function channelTrend(
	rows: ChannelRow[],
	granularity: Granularity,
	channels: string[],
): ChannelTrendBucket[] {
	const named = new Set(channels)
	const groups = new Map<string, ChannelTrendBucket>()

	for (const row of rows) {
		if (!row.day) continue
		const { key, label, start } = bucketFor(row.day, granularity)
		let bucket = groups.get(key)
		if (!bucket) {
			bucket = {
				key,
				label,
				start,
				sessions: Object.fromEntries(channels.map((c) => [c, 0])),
				other: 0,
				total: 0,
			}
			groups.set(key, bucket)
		}
		bucket.total += row.sessions
		if (named.has(row.channel)) bucket.sessions[row.channel] += row.sessions
		else bucket.other += row.sessions
	}

	return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Drill-down — one period of the traffic chart, taken apart
// ---------------------------------------------------------------------------

/** The rows whose day falls in the bucket `key` at this granularity. */
export function inBucket<T extends { day: string | null }>(
	rows: T[],
	granularity: Granularity,
	key: string,
): T[] {
	return rows.filter((row) => row.day && bucketFor(row.day, granularity).key === key)
}

/** Calendar days a full period of this granularity spans. */
function periodLength(start: string, granularity: Granularity): number {
	if (granularity === "day") return 1
	if (granularity === "week") return 7
	const [y, m] = start.split("-").map(Number)
	return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate()
}

export type BucketBreakdown = {
	bucket: DailyBucket
	/** First and last day inside the bucket that actually has data. */
	firstDay: string
	lastDay: string
	/** Days a full period would hold — 7 for a week — so a partial one shows. */
	periodDays: number
	/** The bucket's own days as one-day buckets. Empty when it already is a day. */
	days: DailyBucket[]
	channels: ChannelSummary[]
	sources: SourceSummary[]
	/**
	 * Σ sessions across the acquisition rows in the bucket. The two reports are
	 * separate GA4 queries, so this need not equal `bucket.sessions`; the caller
	 * says so rather than presenting the channel split as the whole period.
	 */
	attributedSessions: number
}

/**
 * Everything the drill-down shows for one bucket of the traffic chart.
 *
 * `days` and `channelRows` must already be deduplicated and filtered to the
 * same range the chart plots, so the breakdown can never disagree with the
 * bar that was clicked. Null when the bucket holds no days.
 */
export function breakdownBucket(
	days: DailyRow[],
	channelRows: ChannelRow[],
	granularity: Granularity,
	key: string,
): BucketBreakdown | null {
	const own = inBucket(days, granularity, key)
	const [bucket] = bucketizeDays(own, granularity)
	if (!bucket) return null

	const dated = own.map((d) => d.day).filter((d): d is string => d !== null)
	const rows = inBucket(channelRows, granularity, key)

	return {
		bucket,
		firstDay: dated[0],
		lastDay: dated[dated.length - 1],
		periodDays: periodLength(bucket.start, granularity),
		days: granularity === "day" ? [] : bucketizeDays(own, "day"),
		channels: summarizeChannels(rows),
		sources: summarizeSources(rows),
		attributedSessions: rows.reduce((sum, r) => sum + r.sessions, 0),
	}
}

export type PeriodPage = {
	path: string
	/** The linked Notion page's title from Page Performance, or empty. */
	title: string
	pageType: string
	views: number
	engagementSeconds: number
	secondsPerView: number | null
	/** This page's share of the period's views. */
	share: number | null
	/**
	 * Unique users, but only when the period is a single day. Across days the
	 * per-day counts sum to user-days, so it's withheld rather than mislabelled.
	 */
	users: number | null
}

export type PeriodPages = {
	pages: PeriodPage[]
	views: number
	/**
	 * Rows the host returned from outside the requested dates. Non-zero means
	 * the Notion client ignored the date filter (old clients do, silently), so
	 * the 999 rows it sent are an arbitrary slice and the ranking is partial.
	 */
	outOfRange: number
}

/**
 * The pages viewed between `from` and `to` inclusive, most-viewed first.
 *
 * Rows are re-checked against the dates even though the query filtered on
 * them — that re-check is what detects a client that ignored the filter.
 * `titles` maps a normalised path to its Notion title (Page Performance's
 * `Source Title`); both reports normalise paths the same way in the sync.
 */
export function summarizePeriodPages(
	rows: PageDayRow[],
	from: string,
	to: string,
	titles: Map<string, string>,
): PeriodPages {
	const byPath = new Map<
		string,
		{ pageType: string; views: number; engagementSeconds: number; users: number }
	>()
	let outOfRange = 0
	let views = 0

	for (const row of rows) {
		if (!row.day || row.day < from || row.day > to) {
			outOfRange += 1
			continue
		}
		views += row.views
		const held = byPath.get(row.path)
		if (held) {
			held.views += row.views
			held.engagementSeconds += row.engagementSeconds
			held.users += row.users
		} else {
			byPath.set(row.path, {
				pageType: row.pageType,
				views: row.views,
				engagementSeconds: row.engagementSeconds,
				users: row.users,
			})
		}
	}

	const oneDay = from === to
	const pages = [...byPath.entries()]
		.map(([path, page]) => ({
			path,
			title: titles.get(path) ?? "",
			pageType: page.pageType,
			views: page.views,
			engagementSeconds: page.engagementSeconds,
			secondsPerView: safeRatio(page.engagementSeconds, page.views),
			share: safeRatio(page.views, views),
			users: oneDay ? page.users : null,
		}))
		.sort((a, b) => b.views - a.views || (a.path < b.path ? -1 : 1))

	return { pages, views, outOfRange }
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * Why a page has no Notion source record. The split is the point of the triage
 * view: Bullet generates a page for every tag and author, and those correctly
 * have nothing behind them, so lumping them in with genuinely orphaned URLs
 * turns a short worklist into noise.
 */
export type PageGroup = "matched" | "missingSource" | "generated"

export const PAGE_GROUP_LABELS: Record<PageGroup, string> = {
	matched: "Linked to a Notion page",
	missingSource: "No source page",
	generated: "Generated by the CMS",
}

/** Page types Bullet generates from other content; no source record exists. */
const GENERATED_PAGE_TYPES = new Set(["Blog Tag", "Blog Author"])

export function pageGroup(page: PageRow): PageGroup {
	if (page.matched) return "matched"
	return GENERATED_PAGE_TYPES.has(page.pageType) ? "generated" : "missingSource"
}

export type PageTotals = {
	pages: number
	views: number
	views28: number
	engagementSeconds: number
	/**
	 * Engaged seconds per view. Note there is no users total: `Users` is unique
	 * *per page*, so summing it double-counts anyone who read two pages.
	 */
	secondsPerView: number | null
}

export function summarizePages(pages: PageRow[]): PageTotals {
	let views = 0
	let views28 = 0
	let engagementSeconds = 0

	for (const page of pages) {
		views += page.views
		views28 += page.views28
		engagementSeconds += page.engagementSeconds
	}

	return {
		pages: pages.length,
		views,
		views28,
		engagementSeconds,
		secondsPerView: safeRatio(engagementSeconds, views),
	}
}

export function groupPages(pages: PageRow[]): Record<PageGroup, PageRow[]> {
	const groups: Record<PageGroup, PageRow[]> = {
		matched: [],
		missingSource: [],
		generated: [],
	}
	for (const page of pages) groups[pageGroup(page)].push(page)
	return groups
}

export type PageMetric = "views" | "views28" | "secondsPerView"

export const PAGE_METRIC_LABELS: Record<PageMetric, string> = {
	views: "Views (all time)",
	views28: "Views (last 28 days)",
	secondsPerView: "Engaged seconds per view",
}

export type RankedPage = PageRow & {
	/** Recomputed rather than read from `Avg Engagement (s)`, for one reason:
	 *  a per-page stored mean can't be re-aggregated, and this one can. */
	secondsPerView: number | null
	group: PageGroup
}

export function rankPages(pages: PageRow[], metric: PageMetric): RankedPage[] {
	return pages
		.map((page) => ({
			...page,
			secondsPerView: safeRatio(page.engagementSeconds, page.views),
			group: pageGroup(page),
		}))
		.sort((a, b) => {
			const left = a[metric]
			const right = b[metric]
			if (left === null && right === null) return 0
			// Unknown is missing, not small: it sorts last either way.
			if (left === null) return 1
			if (right === null) return -1
			if (right !== left) return right - left
			return a.path < b.path ? -1 : 1
		})
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Relative change between two figures. Null unless both sides are known. */
export function delta(
	current: number | null,
	prior: number | null,
): number | null {
	if (current === null || prior === null || prior === 0) return null
	return (current - prior) / prior
}

export function formatPercent(value: number | null, digits = 1): string {
	if (value === null) return "—"
	return `${(value * 100).toFixed(digits)}%`
}

export function formatCount(value: number | null): string {
	if (value === null) return "—"
	return value.toLocaleString("en-US")
}

/** Seconds as `2m 05s` / `48s`. Sub-minute keeps its own unit, not `0m 48s`. */
export function formatDuration(value: number | null): string {
	if (value === null) return "—"
	const total = Math.round(value)
	if (total < 60) return `${total}s`
	const minutes = Math.floor(total / 60)
	return `${minutes}m ${String(total % 60).padStart(2, "0")}s`
}

export function formatDecimal(value: number | null, digits = 2): string {
	if (value === null) return "—"
	return value.toFixed(digits)
}

export function formatDelta(value: number | null): string {
	if (value === null) return ""
	const sign = value > 0 ? "+" : value < 0 ? "−" : ""
	return `${sign}${Math.abs(value * 100).toFixed(1)}%`
}

/** `13–19 Jul`, `28 Jul – 3 Aug`, or a single day. Parsed by hand, like `shortDate`. */
export function formatSpan(first: string, last: string): string {
	if (first === last) return shortDate(first)
	const [, fm, fd] = first.split("-")
	const [, lm, ld] = last.split("-")
	if (fm === lm) return `${Number(fd)}–${Number(ld)} ${MONTHS[Number(lm) - 1] ?? ""}`
	return `${shortDate(first)} – ${shortDate(last)}`
}

/** `2026-07-31` → `31 Jul`. Parsed by hand to avoid a timezone shift. */
export function shortDate(day: string | null): string {
	if (!day) return "—"
	const [, month, date] = day.split("-")
	return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`
}
