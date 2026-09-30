import { useMemo, useState } from "react"

import {
	breakdownBucket,
	bucketizeDays,
	channelTrend,
	dedupeByDay,
	delta,
	filterChannelRows,
	filterDays,
	formatCount,
	formatDecimal,
	formatDelta,
	formatDuration,
	formatPercent,
	formatSpan,
	GRANULARITY_LABELS,
	groupPages,
	PAGE_GROUP_LABELS,
	PAGE_METRIC_LABELS,
	previousDays,
	rankPages,
	RANGE_LABELS,
	summarizeChannels,
	summarizeDays,
	summarizePages,
	summarizePeriodPages,
	shortDate,
	summarizeSources,
	TRAFFIC_METRIC_LABELS,
	untaggedShare,
	type BucketBreakdown,
	type ChannelRow,
	type ChannelSummary,
	type ChannelTrendBucket,
	type DailyBucket,
	type DailyRow,
	type Granularity,
	type PageMetric,
	type PageRow,
	type PageTotals,
	type RangeKey,
	type RankedPage,
	type SourceSummary,
	type TrafficMetricKey,
	type TrafficMetrics,
} from "./aggregate.ts"
import {
	Columns,
	RankedBars,
	SERIES_VARS,
	TrendLines,
	type RankedRow,
	type SeriesSpec,
	type TrendBucket,
} from "./charts.tsx"
import { usePeriodPages } from "./periodPages.ts"
import { DataTable, type Column } from "./table.tsx"

type Tab = "traffic" | "acquisition" | "content"

const TABS: { id: Tab; label: string }[] = [
	{ id: "traffic", label: "Traffic" },
	{ id: "acquisition", label: "Acquisition" },
	{ id: "content", label: "Content" },
]

const RANGES: RangeKey[] = ["28d", "90d", "all"]
const GRANULARITIES: Granularity[] = ["day", "week", "month"]
const TRAFFIC_METRICS: TrafficMetricKey[] = ["sessions", "views", "newUsers"]
const PAGE_METRICS: PageMetric[] = ["views", "views28", "secondsPerView"]

/** Past this a ranking becomes a scroll-hunt; the overflow is reported, never hidden. */
const BAR_LIMIT = 15
/** Only as many channel series as the palette has validated hues. */
const TREND_CHANNELS = 3

export type AppState = {
	/** Raw Site Daily rows, before deduplication — the block does that itself. */
	days: DailyRow[]
	channels: ChannelRow[]
	pages: PageRow[]
	/** `YYYY-MM-DD`; injected so ranges are deterministic in `?mock`. */
	today: string
	status: "ready" | "loading" | "error"
	message?: string
	/** True while a refetch is in flight — the frame is held, not replaced. */
	stale?: boolean
	/** Which data-source keys the config panel actually bound. */
	bound: Record<"daily" | "acquisition" | "pages", boolean>
}

export function App({ days, channels, pages, today, status, message, stale, bound }: AppState) {
	const [tab, setTab] = useState<Tab>("traffic")
	const [range, setRange] = useState<RangeKey>("90d")
	const [granularity, setGranularity] = useState<Granularity>("week")
	const [view, setView] = useState<"chart" | "table">("chart")
	const [trafficMetric, setTrafficMetric] = useState<TrafficMetricKey>("sessions")
	const [pageMetric, setPageMetric] = useState<PageMetric>("views")

	const model = useMemo(() => {
		const daily = dedupeByDay(days)
		const inRange = filterDays(daily.days, range, today)
		const prior = previousDays(daily.days, range, today)
		const channelRows = filterChannelRows(channels, range, today)
		const channelSummary = summarizeChannels(channelRows)

		return {
			daily,
			inRange,
			totals: summarizeDays(inRange),
			prior: prior && prior.length > 0 ? summarizeDays(prior) : null,
			buckets: bucketizeDays(inRange, granularity),
			channelRows,
			channelSummary,
			sources: summarizeSources(channelRows),
			untagged: untaggedShare(channelRows),
			channelBuckets: channelTrend(
				channelRows,
				granularity,
				channelSummary.slice(0, TREND_CHANNELS).map((c) => c.channel),
			),
			pageGroups: groupPages(pages),
			pageTotals: summarizePages(pages),
			// Path → Notion title, so the drill-down's page ranking reads as content.
			titles: new Map(pages.filter((p) => p.sourceTitle).map((p) => [p.path, p.sourceTitle])),
		}
	}, [days, channels, pages, range, today, granularity])

	if (status === "error") {
		return (
			<Setup title="Couldn't load the data sources" message={message} />
		)
	}

	if (status === "loading") {
		return (
			<div className="wd-empty">
				<h2>Loading…</h2>
			</div>
		)
	}

	if (!bound.daily && !bound.acquisition && !bound.pages) {
		return <Setup title="Nothing is bound yet" />
	}

	const showTimeControls = tab !== "content"

	return (
		<div className={`wd-dash${stale ? " is-stale" : ""}`}>
			<header className="wd-header">
				<h1>Website analytics</h1>
				<p>
					Every rate is recomputed from summed counts — Σ engaged sessions ÷ Σ sessions, and
					session duration weighted by sessions — so a 78-session Tuesday counts for more than
					a 3-session Sunday.
				</p>
			</header>

			<div className="wd-tabs" role="tablist" aria-label="Dashboard section">
				{TABS.map(({ id, label }) => (
					<button
						key={id}
						type="button"
						role="tab"
						id={`wd-tab-${id}`}
						aria-selected={tab === id}
						aria-controls={`wd-panel-${id}`}
						className={`wd-tab${tab === id ? " is-active" : ""}`}
						onClick={() => setTab(id)}
					>
						{label}
					</button>
				))}
			</div>

			<div className="wd-filters" role="group" aria-label="Dashboard filters">
				{showTimeControls ? (
					<>
						<Segmented
							label="Date range"
							options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
							value={range}
							onChange={setRange}
						/>
						<Segmented
							label="Group by"
							options={GRANULARITIES.map((g) => ({
								value: g,
								label: GRANULARITY_LABELS[g],
							}))}
							value={granularity}
							onChange={setGranularity}
						/>
					</>
				) : (
					<p className="wd-filters-note">
						Page Performance is a lifetime rollup with no per-day history, so the date range
						doesn't apply here. Rank by <strong>last 28 days</strong> for what's live now.
					</p>
				)}
				<Segmented
					label="View"
					options={[
						{ value: "chart" as const, label: "Charts" },
						{ value: "table" as const, label: "Table" },
					]}
					value={view}
					onChange={setView}
				/>
			</div>

			<div role="tabpanel" id={`wd-panel-${tab}`} aria-labelledby={`wd-tab-${tab}`}>
				{tab === "traffic" ? (
					<TrafficTab
						bound={bound.daily}
						days={model.inRange}
						channelRows={model.channelRows}
						acquisitionBound={bound.acquisition}
						titles={model.titles}
						totals={model.totals}
						prior={model.prior}
						buckets={model.buckets}
						range={range}
						granularity={granularity}
						metric={trafficMetric}
						onMetric={setTrafficMetric}
						view={view}
					/>
				) : null}

				{tab === "acquisition" ? (
					<AcquisitionTab
						bound={bound.acquisition}
						channels={model.channelSummary}
						sources={model.sources}
						untagged={model.untagged}
						buckets={model.channelBuckets}
						granularity={granularity}
						view={view}
					/>
				) : null}

				{tab === "content" ? (
					<ContentTab
						bound={bound.pages}
						groups={model.pageGroups}
						totals={model.pageTotals}
						metric={pageMetric}
						onMetric={setPageMetric}
						view={view}
					/>
				) : null}
			</div>

			<Notes
				duplicates={model.daily.duplicates}
				undated={model.daily.undated}
				keyEvents={model.totals.keyEvents}
				hasDaily={bound.daily}
			/>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

function TrafficTab({
	bound,
	days,
	channelRows,
	acquisitionBound,
	titles,
	totals,
	prior,
	buckets,
	range,
	granularity,
	metric,
	onMetric,
	view,
}: {
	bound: boolean
	/** Deduplicated and range-filtered — the same days the chart plots. */
	days: DailyRow[]
	/** Range-filtered acquisition rows, for splitting a period by channel. */
	channelRows: ChannelRow[]
	acquisitionBound: boolean
	titles: Map<string, string>
	totals: TrafficMetrics
	prior: TrafficMetrics | null
	buckets: DailyBucket[]
	range: RangeKey
	granularity: Granularity
	metric: TrafficMetricKey
	onMetric: (next: TrafficMetricKey) => void
	view: "chart" | "table"
}) {
	// Remembered with its granularity: a week key is also a valid day key (its
	// Monday), so switching Weekly → Daily must close the panel, not reinterpret it.
	const [selection, setSelection] = useState<{ key: string; granularity: Granularity } | null>(
		null,
	)

	if (!bound) {
		return (
			<Unbound
				name="daily"
				source="📈 Site Daily Summary"
				needs="date, sessions, engaged sessions, average session duration, page views, total users, new users and key events"
			/>
		)
	}
	if (buckets.length === 0) {
		return (
			<div className="wd-empty">
				<h2>No days in this window</h2>
				<p>Nothing dated within {RANGE_LABELS[range].toLowerCase()}.</p>
			</div>
		)
	}

	const since = range === "all" ? null : `vs previous ${RANGE_LABELS[range].toLowerCase()}`
	const trend = buckets.map(toTrend)

	// A selection outlives neither a granularity change nor a range that no
	// longer contains its period.
	const index =
		selection?.granularity === granularity
			? buckets.findIndex((b) => b.key === selection.key)
			: -1
	const selectedKey = index >= 0 ? buckets[index].key : null
	const breakdown = selectedKey
		? breakdownBucket(days, channelRows, granularity, selectedKey)
		: null
	const select = (key: string | null) => setSelection(key ? { key, granularity } : null)

	return (
		<>
			<div className="wd-tiles">
				<Tile
					label="Sessions"
					value={formatCount(totals.sessions)}
					sub={`${formatCount(totals.days)} ${totals.days === 1 ? "day" : "days"}`}
					change={prior ? delta(totals.sessions, prior.sessions) : null}
					since={since}
					upIsGood
				/>
				<Tile
					label="Engagement rate"
					value={formatPercent(totals.engagementRate)}
					sub={`${formatCount(totals.engagedSessions)} engaged`}
					change={prior ? delta(totals.engagementRate, prior.engagementRate) : null}
					since={since}
					upIsGood
				/>
				<Tile
					label="Avg session"
					value={formatDuration(totals.avgSessionDuration)}
					sub="weighted by sessions"
					change={prior ? delta(totals.avgSessionDuration, prior.avgSessionDuration) : null}
					since={since}
					upIsGood
				/>
				<Tile
					label="Page views"
					value={formatCount(totals.views)}
					sub={`${formatDecimal(totals.viewsPerSession)} per session`}
					change={prior ? delta(totals.views, prior.views) : null}
					since={since}
					upIsGood
				/>
				<Tile
					label="New users"
					value={formatCount(totals.newUsers)}
					sub="first-ever visits"
					change={prior ? delta(totals.newUsers, prior.newUsers) : null}
					since={since}
					upIsGood
				/>
				{/* Shown, not hidden. No GA4 key event has ever fired on this
				    property, and a dashboard that quietly dropped the metric would
				    read as "not measured" rather than "measured, and it's nothing". */}
				<Tile
					label="Key events"
					value={formatCount(totals.keyEvents)}
					sub={totals.keyEvents === 0 ? "none configured in GA4" : "conversions"}
					change={null}
					since={null}
					upIsGood
					muted={totals.keyEvents === 0}
				/>
			</div>

			{view === "chart" ? (
				<>
					<Card
						title="Traffic over time"
						subtitle={`${TRAFFIC_METRIC_LABELS[metric]} per ${granularity}. Periods with no data are gaps, not zeroes. Click a bar to break it down.`}
						control={
							<Segmented
								label="Measure"
								options={TRAFFIC_METRICS.map((m) => ({
									value: m,
									label: TRAFFIC_METRIC_LABELS[m],
								}))}
								value={metric}
								onChange={onMetric}
							/>
						}
					>
						<Columns
							buckets={trend}
							seriesKey={metric}
							valueLabel={TRAFFIC_METRIC_LABELS[metric]}
							ariaLabel={`${TRAFFIC_METRIC_LABELS[metric]} by ${granularity}, ${buckets.length} periods`}
							selectedKey={selectedKey}
							onSelect={(key) => select(key === selectedKey ? null : key)}
						/>
						{breakdown ? (
							<DrillDown
								key={breakdown.bucket.key}
								breakdown={breakdown}
								days={days}
								channelRows={channelRows}
								titles={titles}
								window={totals}
								granularity={granularity}
								metric={metric}
								acquisitionBound={acquisitionBound}
								onClose={() => select(null)}
								onPrevious={index > 0 ? () => select(buckets[index - 1].key) : null}
								onNext={
									index < buckets.length - 1 ? () => select(buckets[index + 1].key) : null
								}
							/>
						) : null}
					</Card>

					<Card
						title="Engagement rate"
						subtitle="Σ engaged sessions ÷ Σ sessions per period. The line marks the whole window's rate, so periods above it beat the average."
					>
						<TrendLines
							buckets={trend}
							series={[
								{ key: "engagementRate", label: "Engagement rate", cssVar: SERIES_VARS[0] },
							]}
							isRate
							reference={totals.engagementRate}
							referenceLabel={RANGE_LABELS[range]}
							ariaLabel={`Engagement rate by ${granularity}, ${buckets.length} periods`}
						/>
					</Card>
				</>
			) : (
				<Card
					title="By period"
					subtitle="The same figures the charts plot. Click a column header to sort."
				>
					<PeriodTable buckets={buckets} />
				</Card>
			)}
		</>
	)
}

function toTrend(b: DailyBucket): TrendBucket {
	return {
		key: b.key,
		label: b.label,
		values: {
			sessions: b.sessions,
			views: b.views,
			newUsers: b.newUsers,
			engagementRate: b.engagementRate,
		},
		footer: `${formatCount(b.sessions)} sessions · ${formatCount(b.days)} ${
			b.days === 1 ? "day" : "days"
		}`,
	}
}

/** How many source/medium pairs a drill-down ranks before it's a long tail. */
const DRILL_SOURCES = 8
/** How many pages a drill-down ranks. */
const DRILL_PAGES = 10

/**
 * One period of the traffic chart, taken apart: its own figures against the
 * window, the days inside it, and the channels, sources and pages behind it.
 *
 * Counts are compared **per day** against the window's per-day average, never
 * as a raw total against an average period: a partial week — the current one,
 * or the week the data starts — would otherwise read as a collapse.
 *
 * Clicking a day in the day-by-day chart narrows the channel, source and page
 * splits to that day; the tiles stay on the whole period. The parent keys this
 * component by period, so moving to another period drops the focused day.
 */
function DrillDown({
	breakdown,
	days: allDays,
	channelRows,
	titles,
	window,
	granularity,
	metric,
	acquisitionBound,
	onClose,
	onPrevious,
	onNext,
}: {
	breakdown: BucketBreakdown
	/** The same range-filtered days the chart plots, to split out a focused day. */
	days: DailyRow[]
	channelRows: ChannelRow[]
	/** Normalised path → Notion title, from Page Performance. */
	titles: Map<string, string>
	window: TrafficMetrics
	granularity: Granularity
	metric: TrafficMetricKey
	acquisitionBound: boolean
	onClose: () => void
	onPrevious: (() => void) | null
	onNext: (() => void) | null
}) {
	const [focusDay, setFocusDay] = useState<string | null>(null)
	const { bucket, days } = breakdown
	const title =
		granularity === "week"
			? `Week of ${bucket.label}`
			: granularity === "month"
				? bucket.label
				: shortDate(bucket.start)
	const partial = bucket.days < breakdown.periodDays
	const perDay = (value: number, of: TrafficMetrics) => (of.days > 0 ? value / of.days : null)
	const vsWindow = (key: "sessions" | "views" | "newUsers") =>
		delta(perDay(bucket[key], bucket), perDay(window[key], window))
	const since = granularity === "day" ? "vs daily average" : "per day, vs average"

	// What the lower splits describe: the focused day, or the whole period.
	const focus = focusDay ? breakdownBucket(allDays, channelRows, "day", focusDay) : null
	const split = focus ?? breakdown
	// Headings name the date when there is one; prose needs its preposition.
	const oneDate = focus ? focus.bucket.start : granularity === "day" ? bucket.start : null
	const scope = oneDate ? shortDate(oneDate) : `this ${granularity}`
	const inScope = oneDate ? `on ${shortDate(oneDate)}` : `in this ${granularity}`
	const { channels, sources, attributedSessions } = split

	// The source/medium report carries sessions and new users but not page
	// views, so a page-view drill-down splits channels by sessions — and says so.
	const channelMetric: "sessions" | "newUsers" = metric === "newUsers" ? "newUsers" : "sessions"
	const channelLabel = TRAFFIC_METRIC_LABELS[channelMetric]
	const channelTotal = channels.reduce((sum, c) => sum + c[channelMetric], 0)
	const byChannel: RankedRow[] = [...channels]
		.sort((a, b) => b[channelMetric] - a[channelMetric])
		.map((c) => ({
			id: c.channel,
			label: c.channel,
			value: c[channelMetric],
			tooltipTitle: c.channel,
			tooltipFooter: `${formatPercent(
				channelTotal > 0 ? c[channelMetric] / channelTotal : null,
			)} of ${scope} · ${formatPercent(c.engagementRate)} engaged`,
		}))
	const bySource: RankedRow[] = sources.slice(0, DRILL_SOURCES).map((s) => ({
		id: s.id,
		label: `${s.source} / ${s.medium}`,
		value: s.sessions,
		tooltipTitle: `${s.source} / ${s.medium}`,
		tooltipFooter: `${s.channel} · ${formatPercent(s.share)} of sessions · ${formatPercent(
			s.engagementRate,
		)} engaged`,
	}))

	return (
		<section
			className="wd-drill"
			aria-labelledby="wd-drill-title"
			onKeyDown={(e) => {
				if (e.key !== "Escape") return
				// Escape backs out one level: the focused day first, then the panel.
				if (focusDay) setFocusDay(null)
				else onClose()
			}}
		>
			<div className="wd-drill-head">
				<div>
					<h3 id="wd-drill-title">{title}</h3>
					<p>
						{formatSpan(breakdown.firstDay, breakdown.lastDay)} ·{" "}
						{partial
							? `${formatCount(bucket.days)} of ${formatCount(breakdown.periodDays)} days — a partial ${granularity}`
							: `${formatCount(bucket.days)} ${bucket.days === 1 ? "day" : "days"}`}
					</p>
				</div>
				<div className="wd-drill-nav" role="group" aria-label="Breakdown navigation">
					<button
						type="button"
						className="wd-drill-button"
						onClick={onPrevious ?? undefined}
						disabled={!onPrevious}
						aria-label={`Previous ${granularity}`}
					>
						‹
					</button>
					<button
						type="button"
						className="wd-drill-button"
						onClick={onNext ?? undefined}
						disabled={!onNext}
						aria-label={`Next ${granularity}`}
					>
						›
					</button>
					<button type="button" className="wd-drill-button is-text" onClick={onClose}>
						Close
					</button>
				</div>
			</div>

			<div className="wd-tiles">
				<Tile
					label="Sessions"
					value={formatCount(bucket.sessions)}
					sub={`${formatPercent(window.sessions > 0 ? bucket.sessions / window.sessions : null)} of the window`}
					change={vsWindow("sessions")}
					since={since}
					upIsGood
				/>
				<Tile
					label="Engagement rate"
					value={formatPercent(bucket.engagementRate)}
					sub={`${formatCount(bucket.engagedSessions)} engaged`}
					change={delta(bucket.engagementRate, window.engagementRate)}
					since="vs the window"
					upIsGood
				/>
				<Tile
					label="Avg session"
					value={formatDuration(bucket.avgSessionDuration)}
					sub="weighted by sessions"
					change={delta(bucket.avgSessionDuration, window.avgSessionDuration)}
					since="vs the window"
					upIsGood
				/>
				<Tile
					label="Page views"
					value={formatCount(bucket.views)}
					sub={`${formatDecimal(bucket.viewsPerSession)} per session`}
					change={vsWindow("views")}
					since={since}
					upIsGood
				/>
				<Tile
					label="New users"
					value={formatCount(bucket.newUsers)}
					sub="first-ever visits"
					change={vsWindow("newUsers")}
					since={since}
					upIsGood
				/>
			</div>

			{days.length > 0 ? (
				<div className="wd-drill-part">
					<div className="wd-drill-part-head">
						<h4>Day by day</h4>
						{focus ? (
							<button
								type="button"
								className="wd-drill-button is-text"
								onClick={() => setFocusDay(null)}
							>
								Show the whole {granularity}
							</button>
						) : null}
					</div>
					<p>
						{TRAFFIC_METRIC_LABELS[metric]} each day of the {granularity}.{" "}
						{focus
							? `Showing ${scope} below — click it again, or press Escape, for the whole ${granularity}.`
							: "Click a day to narrow the channels, sources and pages below to it."}
					</p>
					<Columns
						buckets={days.map(toTrend)}
						seriesKey={metric}
						valueLabel={TRAFFIC_METRIC_LABELS[metric]}
						ariaLabel={`${TRAFFIC_METRIC_LABELS[metric]} for each of ${days.length} days`}
						selectedKey={focusDay}
						onSelect={(day) => setFocusDay((held) => (held === day ? null : day))}
					/>
				</div>
			) : null}

			<div className="wd-drill-grid">
				<PeriodPagesPart
					from={breakdown.firstDay}
					to={breakdown.lastDay}
					focusDay={focusDay}
					scope={scope}
					inScope={inScope}
					granularity={granularity}
					expectedViews={split.bucket.views}
					titles={titles}
				/>

				<div className="wd-drill-part">
					<h4>By channel · {scope}</h4>
					{!acquisitionBound ? (
						<p>
							Map <code>acquisition</code> to 🚥 Traffic Session Source Medium Report to split{" "}
							{scope} by channel.
						</p>
					) : channels.length === 0 ? (
						<p>No acquisition rows fall {inScope}.</p>
					) : (
						<>
							<p>
								{channelLabel} per channel group
								{metric === "views"
									? " — page views aren't in the source/medium report, so channels are split by sessions."
									: "."}
							</p>
							<RankedBars
								rows={byChannel}
								isRate={false}
								limit={BAR_LIMIT}
								ariaLabel={`${channelLabel} for each of ${channels.length} channels ${inScope}`}
								valueLabel={channelLabel}
								format={(v) => formatCount(v)}
							/>
						</>
					)}
				</div>
			</div>

			{acquisitionBound && sources.length > 0 ? (
				<div className="wd-drill-part">
					<h4>Top sources · {scope}</h4>
					<p>
						Sessions per source and medium
						{sources.length > DRILL_SOURCES
							? ` — the top ${DRILL_SOURCES} of ${formatCount(sources.length)}.`
							: "."}
					</p>
					<RankedBars
						rows={bySource}
						isRate={false}
						limit={DRILL_SOURCES}
						ariaLabel={`Sessions for the top ${bySource.length} sources ${inScope}`}
						valueLabel="Sessions"
						format={(v) => formatCount(v)}
					/>
				</div>
			) : null}

			{/* Two separate GA4 reports. Say when they disagree rather than pass the
			    channel split off as the whole bar. */}
			{acquisitionBound && channels.length > 0 && attributedSessions !== split.bucket.sessions ? (
				<p className="wd-table-note">
					The source/medium report counts {formatCount(attributedSessions)} sessions {inScope}{" "}
					against {formatCount(split.bucket.sessions)} in Site Daily Summary. They're separate GA4
					reports, and recent days usually differ until GA4 finishes processing them.
				</p>
			) : null}
		</section>
	)
}

/**
 * The pages behind a period, from 📄 Pages Path Report.
 *
 * Always subscribes for the whole period (`from`–`to`) and narrows to
 * `focusDay` client-side, so clicking between days doesn't replace the
 * subscription and blank the list while it reloads.
 */
function PeriodPagesPart({
	from,
	to,
	focusDay,
	scope,
	inScope,
	granularity,
	expectedViews,
	titles,
}: {
	from: string
	to: string
	focusDay: string | null
	/** "this week" or "2 Jul", for headings. */
	scope: string
	/** "in this week" or "on 2 Jul", for prose. */
	inScope: string
	granularity: Granularity
	/** Site Daily's page views for the same scope, to reconcile against. */
	expectedViews: number
	titles: Map<string, string>
}) {
	const result = usePeriodPages(from, to)
	const period = useMemo(
		() => summarizePeriodPages(result.rows, from, to, titles),
		[result.rows, from, to, titles],
	)
	const shown = useMemo(
		() => (focusDay ? summarizePeriodPages(result.rows, focusDay, focusDay, titles) : period),
		[focusDay, period, result.rows, titles],
	)

	const heading = <h4>Top pages · {scope}</h4>

	if (result.status === "unbound") {
		return (
			<div className="wd-drill-part">
				{heading}
				<p>
					Map <code>pageDays</code> to 📄 Pages Path Report in the block's config panel to see
					which pages drove {scope}.
				</p>
			</div>
		)
	}
	if (result.status === "error") {
		return (
			<div className="wd-drill-part">
				{heading}
				<p>Couldn't load Pages Path Report: {result.message ?? "unknown error"}.</p>
			</div>
		)
	}
	if (result.status === "loading") {
		return (
			<div className="wd-drill-part">
				{heading}
				<p>Loading pages…</p>
			</div>
		)
	}
	if (shown.pages.length === 0) {
		return (
			<div className="wd-drill-part">
				{heading}
				<p>No page views recorded {inScope}.</p>
			</div>
		)
	}

	const oneDay = focusDay !== null || from === to
	const rows: RankedRow[] = shown.pages.slice(0, DRILL_PAGES).map((p) => ({
		id: p.path,
		label: p.title || p.path,
		value: p.views,
		tooltipTitle: p.path,
		tooltipFooter: [
			p.pageType,
			`${formatPercent(p.share)} of views`,
			`${formatDuration(p.secondsPerView)} engaged per view`,
			p.users !== null ? `${formatCount(p.users)} ${p.users === 1 ? "user" : "users"}` : null,
		]
			.filter(Boolean)
			.join(" · "),
	}))

	return (
		<div className="wd-drill-part">
			{heading}
			<p>
				Page views per page
				{shown.pages.length > DRILL_PAGES
					? ` — the top ${DRILL_PAGES} of ${formatCount(shown.pages.length)}`
					: ""}
				. Titles come from Page Performance; pages with none show their URL.
				{oneDay ? "" : " Hover for engaged time; unique users only add up within a single day."}
			</p>
			<RankedBars
				rows={rows}
				isRate={false}
				limit={DRILL_PAGES}
				ariaLabel={`Page views for the top ${rows.length} pages ${inScope}`}
				valueLabel="Views"
				format={(v) => formatCount(v)}
			/>
			{period.outOfRange > 0 ? (
				<p className="wd-table-note">
					This Notion client ignored the date filter, so these pages come from an arbitrary slice
					of the report rather than everything {inScope}. Updating Notion fixes it.
				</p>
			) : result.hasMore ? (
				<p className="wd-table-note">
					This {granularity} has more page-days than one query returns; the least-viewed pages
					are missing from the ranking.
				</p>
			) : shown.views !== expectedViews ? (
				<p className="wd-table-note">
					Pages Path Report counts {formatCount(shown.views)} views {inScope} against{" "}
					{formatCount(expectedViews)} in Site Daily Summary — separate GA4 reports, which differ
					on recent days until GA4 finishes processing them.
				</p>
			) : null}
		</div>
	)
}

const PERIOD_COLUMNS: Column<DailyBucket & { id: string }>[] = [
	{
		key: "period",
		label: "Period",
		left: true,
		// Sort on the bucket key, which is chronological; the label isn't.
		sortValue: (b) => b.key,
		render: (b) => b.label,
	},
	{ key: "days", label: "Days", sortValue: (b) => b.days, render: (b) => formatCount(b.days) },
	{
		key: "sessions",
		label: "Sessions",
		sortValue: (b) => b.sessions,
		render: (b) => formatCount(b.sessions),
	},
	{
		key: "engaged",
		label: "Engaged",
		sortValue: (b) => b.engagedSessions,
		render: (b) => formatCount(b.engagedSessions),
	},
	{
		key: "engagementRate",
		label: "Engagement rate",
		sortValue: (b) => b.engagementRate,
		render: (b) => formatPercent(b.engagementRate),
	},
	{
		key: "duration",
		label: "Avg session",
		sortValue: (b) => b.avgSessionDuration,
		render: (b) => formatDuration(b.avgSessionDuration),
	},
	{ key: "views", label: "Views", sortValue: (b) => b.views, render: (b) => formatCount(b.views) },
	{
		key: "viewsPerSession",
		label: "Views / session",
		sortValue: (b) => b.viewsPerSession,
		render: (b) => formatDecimal(b.viewsPerSession),
	},
	{
		key: "newUsers",
		label: "New users",
		sortValue: (b) => b.newUsers,
		render: (b) => formatCount(b.newUsers),
	},
]

function PeriodTable({ buckets }: { buckets: DailyBucket[] }) {
	const rows = useMemo(() => buckets.map((b) => ({ ...b, id: b.key })), [buckets])
	return (
		<DataTable
			columns={PERIOD_COLUMNS}
			rows={rows}
			initialSort={{ key: "period", dir: "desc" }}
			caption="Aggregate figures per period. Click a column header to sort."
		/>
	)
}

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

function AcquisitionTab({
	bound,
	channels,
	sources,
	untagged,
	buckets,
	granularity,
	view,
}: {
	bound: boolean
	channels: ChannelSummary[]
	sources: SourceSummary[]
	untagged: { sessions: number; share: number | null }
	buckets: ChannelTrendBucket[]
	granularity: Granularity
	view: "chart" | "table"
}) {
	if (!bound) {
		return (
			<Unbound
				name="acquisition"
				source="🚥 Traffic Session Source Medium Report"
				needs="date, channel group, session source, session medium, sessions, engaged sessions, new users and user engagement duration"
			/>
		)
	}
	if (channels.length === 0) {
		return (
			<div className="wd-empty">
				<h2>No sessions in this window</h2>
			</div>
		)
	}

	const sessions = channels.reduce((sum, c) => sum + c.sessions, 0)
	const engaged = channels.reduce((sum, c) => sum + c.engagedSessions, 0)
	const overallRate = sessions > 0 ? engaged / sessions : null
	// Rank on quality, but only among channels big enough for a rate to mean
	// something — one session at 100% is not the best-performing channel.
	const meaningful = channels.filter((c) => c.sessions >= 20)
	const best = [...meaningful].sort(
		(a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0),
	)[0]

	const named = buckets.length > 0 ? Object.keys(buckets[0].sessions) : []
	const series: SeriesSpec[] = named.map((channel, i) => ({
		key: channel,
		label: channel,
		cssVar: SERIES_VARS[i % SERIES_VARS.length],
	}))
	const otherTotal = buckets.reduce((sum, b) => sum + b.other, 0)

	const trend: TrendBucket[] = buckets.map((b) => ({
		key: b.key,
		label: b.label,
		values: Object.fromEntries(named.map((c) => [c, b.sessions[c]])),
		footer: `${formatCount(b.total)} sessions total · ${formatCount(b.other)} in other channels`,
	}))

	const bySessions: RankedRow[] = channels.map((c) => ({
		id: c.channel,
		label: c.channel,
		value: c.sessions,
		tooltipTitle: c.channel,
		tooltipFooter: `${formatPercent(c.share)} of sessions · ${formatPercent(
			c.engagementRate,
		)} engaged · ${formatDuration(c.secondsPerSession)} engaged per session`,
	}))

	const byRate: RankedRow[] = [...channels]
		.sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
		.map((c) => ({
			id: c.channel,
			label: c.channel,
			prefix: formatCount(c.sessions),
			value: c.engagementRate,
			tooltipTitle: c.channel,
			tooltipFooter: `${formatCount(c.engagedSessions)} of ${formatCount(
				c.sessions,
			)} sessions engaged`,
		}))

	return (
		<>
			<div className="wd-tiles">
				<Tile
					label="Sessions"
					value={formatCount(sessions)}
					sub={`across ${channels.length} channels`}
					change={null}
					since={null}
					upIsGood
				/>
				<Tile
					label="Untagged"
					value={formatPercent(untagged.share)}
					sub={`${formatCount(untagged.sessions)} direct or unassigned`}
					change={null}
					since={null}
					upIsGood={false}
				/>
				<Tile
					label="Engagement rate"
					value={formatPercent(overallRate)}
					sub="all channels"
					change={null}
					since={null}
					upIsGood
				/>
				<Tile
					label="Best engaged"
					value={best ? formatPercent(best.engagementRate) : "—"}
					sub={best ? `${best.channel} · ${formatCount(best.sessions)} sessions` : "—"}
					change={null}
					since={null}
					upIsGood
				/>
			</div>

			{view === "chart" ? (
				<>
					<Card
						title="Sessions by channel"
						subtitle="How much traffic each channel brings. Hover for its engagement rate."
					>
						<RankedBars
							rows={bySessions}
							isRate={false}
							limit={BAR_LIMIT}
							ariaLabel={`Sessions for each of ${channels.length} channels, largest first`}
							valueLabel="Sessions"
							format={(v) => formatCount(v)}
						/>
					</Card>

					<Card
						title="Engagement rate by channel"
						subtitle="Each channel's own Σ engaged ÷ Σ sessions, against the line for all channels together. The session count sits ahead of each label — a channel with a handful of sessions can top this ranking on noise."
					>
						<RankedBars
							rows={byRate}
							isRate
							limit={BAR_LIMIT}
							reference={overallRate}
							referenceLabel="All channels"
							ariaLabel={`Engagement rate for each of ${channels.length} channels, highest first`}
							valueLabel="Engagement rate"
							format={(v) => formatPercent(v)}
						/>
					</Card>

					{trend.length > 0 ? (
						<Card
							title={`Sessions over time — top ${series.length} channels`}
							subtitle={`By ${granularity}. ${formatCount(
								otherTotal,
							)} sessions in the remaining channels aren't plotted; they're in each period's tooltip.`}
						>
							<TrendLines
								buckets={trend}
								series={series}
								isRate={false}
								ariaLabel={`Sessions by ${granularity} for ${series
									.map((s) => s.label)
									.join(", ")}`}
							/>
						</Card>
					) : null}
				</>
			) : (
				<>
					<Card
						title="By channel"
						subtitle="The same figures the charts plot. Click a column header to sort."
					>
						<ChannelTable channels={channels} />
					</Card>
					<Card
						title="By source and medium"
						subtitle="Where sessions actually came from. GA4 keeps source spellings apart, so one site can appear twice."
					>
						<SourceTable sources={sources} />
					</Card>
				</>
			)}
		</>
	)
}

const CHANNEL_COLUMNS: Column<ChannelSummary & { id: string }>[] = [
	{ key: "channel", label: "Channel", left: true, sortValue: (c) => c.channel, render: (c) => c.channel },
	{
		key: "sessions",
		label: "Sessions",
		sortValue: (c) => c.sessions,
		render: (c) => formatCount(c.sessions),
	},
	{ key: "share", label: "Share", sortValue: (c) => c.share, render: (c) => formatPercent(c.share) },
	{
		key: "engaged",
		label: "Engaged",
		sortValue: (c) => c.engagedSessions,
		render: (c) => formatCount(c.engagedSessions),
	},
	{
		key: "rate",
		label: "Engagement rate",
		sortValue: (c) => c.engagementRate,
		render: (c) => formatPercent(c.engagementRate),
	},
	{
		key: "seconds",
		label: "Engaged / session",
		sortValue: (c) => c.secondsPerSession,
		render: (c) => formatDuration(c.secondsPerSession),
	},
	{
		key: "newUsers",
		label: "New users",
		sortValue: (c) => c.newUsers,
		render: (c) => formatCount(c.newUsers),
	},
]

function ChannelTable({ channels }: { channels: ChannelSummary[] }) {
	const rows = useMemo(() => channels.map((c) => ({ ...c, id: c.channel })), [channels])
	return (
		<DataTable
			columns={CHANNEL_COLUMNS}
			rows={rows}
			initialSort={{ key: "sessions", dir: "desc" }}
			caption="Sessions and engagement per channel group. Click a column header to sort."
		/>
	)
}

const SOURCE_LIMIT = 30

const SOURCE_COLUMNS: Column<SourceSummary>[] = [
	{ key: "source", label: "Source", left: true, sortValue: (s) => s.source, render: (s) => s.source },
	{ key: "medium", label: "Medium", left: true, sortValue: (s) => s.medium, render: (s) => s.medium },
	{
		key: "channel",
		label: "Channel",
		left: true,
		sortValue: (s) => s.channel,
		render: (s) => s.channel,
	},
	{
		key: "sessions",
		label: "Sessions",
		sortValue: (s) => s.sessions,
		render: (s) => formatCount(s.sessions),
	},
	{ key: "share", label: "Share", sortValue: (s) => s.share, render: (s) => formatPercent(s.share) },
	{
		key: "rate",
		label: "Engagement rate",
		sortValue: (s) => s.engagementRate,
		render: (s) => formatPercent(s.engagementRate),
	},
]

function SourceTable({ sources }: { sources: SourceSummary[] }) {
	const rows = useMemo(() => sources.slice(0, SOURCE_LIMIT), [sources])
	return (
		<>
			<DataTable
				columns={SOURCE_COLUMNS}
				rows={rows}
				initialSort={{ key: "sessions", dir: "desc" }}
				caption="Sessions per source and medium pair. Click a column header to sort."
			/>
			{sources.length > rows.length ? (
				<p className="wd-table-note">
					Showing the top {rows.length} of {formatCount(sources.length)} source/medium pairs.
				</p>
			) : null}
		</>
	)
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function ContentTab({
	bound,
	groups,
	totals,
	metric,
	onMetric,
	view,
}: {
	bound: boolean
	groups: Record<"matched" | "missingSource" | "generated", PageRow[]>
	totals: PageTotals
	metric: PageMetric
	onMetric: (next: PageMetric) => void
	view: "chart" | "table"
}) {
	if (!bound) {
		return (
			<Unbound
				name="pages"
				source="🗂️ Page Performance"
				needs="page path, page type, views, users, engagement seconds, the 28-day equivalents, the matched checkbox and the source title"
			/>
		)
	}

	const all = [...groups.matched, ...groups.missingSource, ...groups.generated]
	if (all.length === 0) {
		return (
			<div className="wd-empty">
				<h2>No pages tracked yet</h2>
			</div>
		)
	}

	const ranked = rankPages(all, metric)
	const missing = summarizePages(groups.missingSource)
	const generated = summarizePages(groups.generated)

	const bars: RankedRow[] = ranked.map((p) => ({
		id: p.id,
		label: p.sourceTitle || p.path,
		value: p[metric],
		tooltipTitle: p.path,
		tooltipFooter: `${formatCount(p.views)} views all time · ${formatCount(
			p.views28,
		)} in 28 days · ${formatDuration(p.secondsPerView)} engaged per view${
			p.matched ? "" : " · no source page"
		}`,
	}))

	return (
		<>
			<div className="wd-tiles">
				<Tile
					label="Pages"
					value={formatCount(totals.pages)}
					sub="with at least one view"
					change={null}
					since={null}
					upIsGood
				/>
				<Tile
					label="Views"
					value={formatCount(totals.views)}
					sub="all time"
					change={null}
					since={null}
					upIsGood
				/>
				<Tile
					label="Views (28d)"
					value={formatCount(totals.views28)}
					sub="what's live now"
					change={null}
					since={null}
					upIsGood
				/>
				<Tile
					label="Engaged / view"
					value={formatDuration(totals.secondsPerView)}
					sub="Σ seconds ÷ Σ views"
					change={null}
					since={null}
					upIsGood
				/>
				<Tile
					label="No source page"
					value={formatCount(groups.missingSource.length)}
					sub={`${formatCount(missing.views)} views to triage`}
					change={null}
					since={null}
					upIsGood={false}
				/>
			</div>

			{view === "chart" ? (
				<>
					<Card
						title="Top pages"
						subtitle={`${PAGE_METRIC_LABELS[metric]}, highest first.${
							ranked.length > BAR_LIMIT
								? ` Top ${BAR_LIMIT} of ${formatCount(ranked.length)} pages.`
								: ""
						} Titles come from the linked Notion page; unmatched rows fall back to the URL.`}
						control={
							<Segmented
								label="Rank by"
								options={PAGE_METRICS.map((m) => ({ value: m, label: PAGE_METRIC_LABELS[m] }))}
								value={metric}
								onChange={onMetric}
							/>
						}
					>
						<RankedBars
							rows={bars}
							isRate={false}
							limit={BAR_LIMIT}
							ariaLabel={`${PAGE_METRIC_LABELS[metric]} for the top ${Math.min(
								BAR_LIMIT,
								ranked.length,
							)} pages`}
							valueLabel={PAGE_METRIC_LABELS[metric]}
							format={(v) =>
								metric === "secondsPerView" ? formatDuration(v) : formatCount(v)
							}
						/>
					</Card>

					<Card
						title="Content with no source page"
						subtitle={`${groups.missingSource.length} URLs getting traffic that no Notion record accounts for — renamed slugs needing a redirect, pages missing from the content inventory, or broken links in published copy. The ${groups.generated.length} tag and author pages the CMS generates are excluded: nothing authors those, so they're noise rather than a worklist.`}
					>
						<TriageTable pages={rankPages(groups.missingSource, "views")} />
					</Card>
				</>
			) : (
				<Card
					title="Every page"
					subtitle="One row per URL. Click a column header to sort."
				>
					<PageTable pages={ranked} />
				</Card>
			)}

			<p className="wd-table-note">
				{formatCount(groups.matched.length)} pages link to a Notion record ·{" "}
				{formatCount(groups.missingSource.length)} have none ({formatCount(missing.views)}{" "}
				views) · {formatCount(groups.generated.length)} are CMS-generated tag and author pages
				({formatCount(generated.views)} views).{" "}
				{/* A block can't open a Notion page, so this deliberately renders no
				    links — Notion's own relation cell on Page Performance does that. */}
				Use the <strong>Website Page</strong> and <strong>Blog Post</strong> relation columns in
				Notion to open the source.
			</p>
		</>
	)
}

const TRIAGE_COLUMNS: Column<RankedPage>[] = [
	{ key: "path", label: "URL", left: true, sortValue: (p) => p.path, render: (p) => <span className="wd-path">{p.path}</span> },
	{
		key: "type",
		label: "Type",
		left: true,
		sortValue: (p) => p.pageType,
		render: (p) => p.pageType,
	},
	{ key: "views", label: "Views", sortValue: (p) => p.views, render: (p) => formatCount(p.views) },
	{
		key: "views28",
		label: "Views (28d)",
		sortValue: (p) => p.views28,
		render: (p) => formatCount(p.views28),
	},
	{
		key: "seconds",
		label: "Engaged / view",
		sortValue: (p) => p.secondsPerView,
		render: (p) => formatDuration(p.secondsPerView),
	},
]

function TriageTable({ pages }: { pages: RankedPage[] }) {
	return (
		<DataTable
			columns={TRIAGE_COLUMNS}
			rows={pages}
			// Still-active URLs matter more than historical ones: a page with
			// recent traffic and no source is a live redirect to write.
			initialSort={{ key: "views28", dir: "desc" }}
			caption="URLs with no linked Notion page. Click a column header to sort."
		/>
	)
}

const PAGE_COLUMNS: Column<RankedPage>[] = [
	{
		key: "title",
		label: "Page",
		left: true,
		sortValue: (p) => (p.sourceTitle || p.path).toLowerCase(),
		render: (p) => <span className="wd-title">{p.sourceTitle || p.path}</span>,
	},
	{ key: "path", label: "URL", left: true, sortValue: (p) => p.path, render: (p) => <span className="wd-path">{p.path}</span> },
	{ key: "type", label: "Type", left: true, sortValue: (p) => p.pageType, render: (p) => p.pageType },
	{
		key: "source",
		label: "Source page",
		left: true,
		sortValue: (p) => PAGE_GROUP_LABELS[p.group],
		render: (p) => PAGE_GROUP_LABELS[p.group],
	},
	{ key: "views", label: "Views", sortValue: (p) => p.views, render: (p) => formatCount(p.views) },
	{
		key: "views28",
		label: "Views (28d)",
		sortValue: (p) => p.views28,
		render: (p) => formatCount(p.views28),
	},
	{
		key: "seconds",
		label: "Engaged / view",
		sortValue: (p) => p.secondsPerView,
		render: (p) => formatDuration(p.secondsPerView),
	},
]

function PageTable({ pages }: { pages: RankedPage[] }) {
	return (
		<DataTable
			columns={PAGE_COLUMNS}
			rows={pages}
			initialSort={{ key: "views", dir: "desc" }}
			caption="Lifetime and 28-day figures per URL. Click a column header to sort."
		/>
	)
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function Segmented<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string
	options: { value: T; label: string }[]
	value: T
	onChange: (next: T) => void
}) {
	return (
		<div className="wd-segmented">
			<span className="wd-segmented-label">{label}</span>
			<div className="wd-segmented-options" role="group" aria-label={label}>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						className={`wd-segment${option.value === value ? " is-active" : ""}`}
						aria-pressed={option.value === value}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	)
}

function Tile({
	label,
	value,
	sub,
	change,
	since,
	upIsGood,
	muted,
}: {
	label: string
	value: string
	sub: string
	change: number | null
	since: string | null
	upIsGood: boolean
	muted?: boolean
}) {
	const good = change === null ? null : upIsGood === change > 0
	const tone = change === null || change === 0 ? "flat" : good ? "good" : "bad"

	return (
		<div className={`wd-tile${muted ? " is-muted" : ""}`}>
			<div className="wd-tile-label">{label}</div>
			<div className="wd-tile-value">{value}</div>
			<div className="wd-tile-sub">{sub}</div>
			{change !== null && since ? (
				<div className={`wd-tile-delta is-${tone}`}>
					{/* Arrow plus a signed number: direction never rides on colour alone. */}
					<span aria-hidden="true">{change > 0 ? "↑" : change < 0 ? "↓" : "→"}</span>
					{formatDelta(change)} <span className="wd-tile-since">{since}</span>
				</div>
			) : null}
		</div>
	)
}

function Card({
	title,
	subtitle,
	control,
	children,
}: {
	title: string
	subtitle: string
	control?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<section className="wd-card">
			<div className="wd-card-head">
				<div className="wd-card-head-row">
					<h2>{title}</h2>
					{control}
				</div>
				<p>{subtitle}</p>
			</div>
			{children}
		</section>
	)
}

/** A declared-but-unmapped key is a supported state, not a broken binding. */
function Unbound({
	name,
	source,
	needs,
}: {
	name: string
	source: string
	needs: string
}) {
	return (
		<div className="wd-empty">
			<h2>Nothing mapped to “{name}”</h2>
			<p className="wd-empty-hint">
				Point the <code>{name}</code> data source at <strong>{source}</strong> in the block's
				config panel, exposing {needs}. The other tabs work without it.
			</p>
		</div>
	)
}

function Setup({ title, message }: { title: string; message?: string }) {
	return (
		<div className="wd-empty" role="alert">
			<h2>{title}</h2>
			<p>{message ?? "The block isn't bound to any data source yet."}</p>
			<p className="wd-empty-hint">
				Map <code>daily</code>, <code>acquisition</code> and <code>pages</code> to the Site Daily
				Summary, Traffic Session Source Medium and Page Performance data sources of the{" "}
				<strong>Website Analytics</strong> database.
			</p>
		</div>
	)
}

/** Data-quality caveats stay on screen rather than being silently filtered. */
function Notes({
	duplicates,
	undated,
	keyEvents,
	hasDaily,
}: {
	duplicates: number
	undated: number
	keyEvents: number
	hasDaily: boolean
}) {
	if (!hasDaily) return null
	if (duplicates === 0 && undated === 0 && keyEvents > 0) return null

	return (
		<footer className="wd-notes">
			{duplicates > 0 ? (
				<p>
					<strong>
						{formatCount(duplicates)} duplicate row{duplicates === 1 ? "" : "s"}
					</strong>{" "}
					collapsed in Site Daily Summary — the same calendar day stored more than once. The
					newest copy of each day is used; counting them all would inflate the most recent
					days.
				</p>
			) : null}
			{undated > 0 ? (
				<p>
					<strong>
						{formatCount(undated)} row{undated === 1 ? "" : "s"}
					</strong>{" "}
					have no date and can't be placed on the time axis, so they're excluded.
				</p>
			) : null}
			{keyEvents === 0 ? (
				<p>
					<strong>No key events are configured in GA4</strong>, so there is no conversion data
					to show — the zero above is measured, not missing.
				</p>
			) : null}
		</footer>
	)
}
