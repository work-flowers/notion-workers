/**
 * Pure aggregation logic. No React, no Notion SDK — so it can be unit-tested
 * with `npm run test --workspace=notion-worker-newsletter-dashboard`.
 *
 * The whole point of this block: every rate is a ratio of summed counts, never
 * an average of per-row ratios. Notion's native charts can only sum/average
 * the row-level `Click Rate`, which weights a 50-delivery send the same as a
 * 180-delivery one. Here, a period's click rate is Σ clicks / Σ deliveries.
 */

export type Send = {
	id: string
	subject: string
	/** Calendar day, `YYYY-MM-DD`. Null when the row has no date. */
	sentOn: string | null
	deliveries: number
	opens: number
	clicks: number
	unsubscribes: number
}

export type Granularity = "week" | "month" | "quarter"

/** Presets are "the last N days"; `all` skips date filtering entirely. */
export type RangeKey = "90d" | "180d" | "365d" | "all"

export type Metrics = {
	sends: number
	deliveries: number
	opens: number
	clicks: number
	unsubscribes: number
	/** Null when there were no deliveries to divide by — never a misleading 0. */
	openRate: number | null
	clickRate: number | null
	/** Clicks per open. Null without opens. */
	clickToOpenRate: number | null
	unsubRate: number | null
	/**
	 * Sends that were delivered but recorded zero opens — almost always missing
	 * tracking data rather than a genuine 0%. Counted, never silently dropped.
	 */
	untrackedSends: number
}

export type Bucket = Metrics & {
	/** Sortable bucket id: `2026-07-27` (week), `2026-07`, `2026-Q3`. */
	key: string
	/** Axis label, e.g. `27 Jul`, `Jul 2026`, `Q3 2026`. */
	label: string
	/** First day of the bucket, `YYYY-MM-DD`. */
	start: string
}

export type MetricKey = "openRate" | "clickRate" | "clickToOpenRate"

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

export const RANGE_LABELS: Record<RangeKey, string> = {
	"90d": "Last 90 days",
	"180d": "Last 180 days",
	"365d": "Last 12 months",
	all: "All time",
}

export const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = {
	"90d": 90,
	"180d": 180,
	"365d": 365,
}

export const GRANULARITY_LABELS: Record<Granularity, string> = {
	week: "Weekly",
	month: "Monthly",
	quarter: "Quarterly",
}

export const METRIC_LABELS: Record<MetricKey, string> = {
	openRate: "Open rate",
	clickRate: "Click rate",
	clickToOpenRate: "Click-to-open",
}

/**
 * Parse `YYYY-MM-DD` as a UTC timestamp. Deliberately not `new Date(string)`
 * for the arithmetic below: local-time parsing shifts day boundaries and can
 * push a send into the wrong week.
 */
export function parseDay(day: string): number {
	const [y, m, d] = day.split("-").map(Number)
	return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function formatDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10)
}

/** Days are calendar days; `n` may be negative. */
export function addDays(day: string, n: number): string {
	return formatDay(parseDay(day) + n * 86_400_000)
}

/** Monday of the week containing `day`. */
function weekStart(day: string): string {
	const ms = parseDay(day)
	const dow = new Date(ms).getUTCDay() // 0 = Sunday
	const backToMonday = (dow + 6) % 7
	return formatDay(ms - backToMonday * 86_400_000)
}

function bucketFor(
	day: string,
	granularity: Granularity,
): { key: string; label: string; start: string } {
	const [year, month] = day.split("-")
	const y = Number(year)
	const m = Number(month)

	if (granularity === "week") {
		const start = weekStart(day)
		const [, sm, sd] = start.split("-")
		return {
			key: start,
			label: `${Number(sd)} ${MONTHS[Number(sm) - 1]}`,
			start,
		}
	}
	if (granularity === "month") {
		return {
			key: `${year}-${month}`,
			label: `${MONTHS[m - 1]} ${y}`,
			start: `${year}-${month}-01`,
		}
	}
	const quarter = Math.floor((m - 1) / 3) + 1
	const startMonth = String((quarter - 1) * 3 + 1).padStart(2, "0")
	return {
		key: `${year}-Q${quarter}`,
		label: `Q${quarter} ${y}`,
		start: `${year}-${startMonth}-01`,
	}
}

function safeRatio(numerator: number, denominator: number): number | null {
	return denominator > 0 ? numerator / denominator : null
}

/** Roll a set of sends into one set of aggregate figures. */
export function summarize(sends: Send[]): Metrics {
	let deliveries = 0
	let opens = 0
	let clicks = 0
	let unsubscribes = 0
	let untrackedSends = 0

	for (const send of sends) {
		deliveries += send.deliveries
		opens += send.opens
		clicks += send.clicks
		unsubscribes += send.unsubscribes
		if (send.deliveries > 0 && send.opens === 0) untrackedSends += 1
	}

	return {
		sends: sends.length,
		deliveries,
		opens,
		clicks,
		unsubscribes,
		openRate: safeRatio(opens, deliveries),
		clickRate: safeRatio(clicks, deliveries),
		clickToOpenRate: safeRatio(clicks, opens),
		unsubRate: safeRatio(unsubscribes, deliveries),
		untrackedSends,
	}
}

/**
 * Keep only sends dated within the last N days of `today`, or all dated sends
 * for `all`. Undated rows can't be placed on a time axis, so they are dropped
 * here and reported separately by the caller.
 */
export function filterByRange(
	sends: Send[],
	range: RangeKey,
	today: string,
): Send[] {
	const dated = sends.filter((s): s is Send & { sentOn: string } =>
		Boolean(s.sentOn),
	)
	if (range === "all") return dated
	const from = addDays(today, -RANGE_DAYS[range])
	return dated.filter((s) => s.sentOn > from && s.sentOn <= today)
}

/** The equally-long window immediately before the selected one. */
export function previousWindow(
	sends: Send[],
	range: RangeKey,
	today: string,
): Send[] | null {
	if (range === "all") return null
	const days = RANGE_DAYS[range]
	const from = addDays(today, -2 * days)
	const to = addDays(today, -days)
	return sends.filter((s) => s.sentOn && s.sentOn > from && s.sentOn <= to)
}

/**
 * Group sends into time buckets, oldest first.
 *
 * Only periods that actually contain a send get a bucket. A month with no
 * newsletter is a gap in the series, not a 0% month — emitting an empty
 * bucket would draw a line down to zero and invent a collapse in engagement.
 */
export function bucketize(sends: Send[], granularity: Granularity): Bucket[] {
	const groups = new Map<string, { label: string; start: string; rows: Send[] }>()

	for (const send of sends) {
		if (!send.sentOn) continue
		const { key, label, start } = bucketFor(send.sentOn, granularity)
		const group = groups.get(key)
		if (group) group.rows.push(send)
		else groups.set(key, { label, start, rows: [send] })
	}

	return [...groups.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, { label, start, rows }]) => ({
			key,
			label,
			start,
			...summarize(rows),
		}))
}

/** Relative change between two rates. Null unless both sides are known. */
export function delta(current: number | null, prior: number | null): number | null {
	if (current === null || prior === null || prior === 0) return null
	return (current - prior) / prior
}

export function formatPercent(value: number | null, digits = 1): string {
	if (value === null) return "—"
	return `${(value * 100).toFixed(digits)}%`
}

export function formatCount(value: number): string {
	return value.toLocaleString("en-US")
}

export function formatDelta(value: number | null): string {
	if (value === null) return ""
	const sign = value > 0 ? "+" : value < 0 ? "−" : ""
	return `${sign}${Math.abs(value * 100).toFixed(1)}%`
}
