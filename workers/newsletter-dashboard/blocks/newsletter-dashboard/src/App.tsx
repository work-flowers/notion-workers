import { useMemo, useState } from "react"

import {
	bucketize,
	delta,
	filterByRange,
	formatCount,
	formatDelta,
	formatPercent,
	GRANULARITY_LABELS,
	ISSUE_METRIC_LABELS,
	previousWindow,
	rankIssues,
	RANGE_LABELS,
	summarize,
	type Bucket,
	type Granularity,
	type IssueMetric,
	type Metrics,
	type RangeKey,
	type Send,
} from "./aggregate.ts"
import { ISSUE_LIMIT, IssueBars, RateTrend, VolumeColumns } from "./charts.tsx"
import { DataTable, type Column } from "./table.tsx"

const GRANULARITIES: Granularity[] = ["week", "month", "quarter"]
const RANGES: RangeKey[] = ["90d", "180d", "365d", "all"]
const ISSUE_METRICS: IssueMetric[] = [
	"clickRate",
	"openRate",
	"clickToOpenRate",
	"deliveries",
]

export type AppState = {
	sends: Send[]
	/** `YYYY-MM-DD`; injected so buckets and ranges are deterministic in tests. */
	today: string
	status: "ready" | "loading" | "error"
	message?: string
	/** True while a refetch is in flight — the frame is held, not replaced. */
	stale?: boolean
}

export function App({ sends, today, status, message, stale }: AppState) {
	const [granularity, setGranularity] = useState<Granularity>("month")
	const [range, setRange] = useState<RangeKey>("all")
	const [view, setView] = useState<"chart" | "table">("chart")
	const [issueMetric, setIssueMetric] = useState<IssueMetric>("clickRate")

	const model = useMemo(() => {
		const inRange = filterByRange(sends, range, today)
		const prior = previousWindow(sends, range, today)
		return {
			inRange,
			totals: summarize(inRange),
			prior: prior ? summarize(prior) : null,
			buckets: bucketize(inRange, granularity),
			issues: rankIssues(inRange, issueMetric),
			undated: sends.filter((s) => !s.sentOn).length,
		}
	}, [sends, range, today, granularity, issueMetric])

	if (status === "error") {
		return (
			<div className="nl-empty" role="alert">
				<h2>Couldn't load the data source</h2>
				<p>{message ?? "The block isn't bound to a data source yet."}</p>
				<p className="nl-empty-hint">
					Map the <code>sends</code> data source to <strong>Email Analytics</strong>, exposing
					subject, publish date, deliveries, opens, clicks and unsubscriptions.
				</p>
			</div>
		)
	}

	if (status === "loading") {
		return (
			<div className="nl-empty">
				<h2>Loading sends…</h2>
			</div>
		)
	}

	if (model.inRange.length === 0) {
		return (
			<div className="nl-empty">
				<h2>No sends in this window</h2>
				<p>
					Nothing dated within {RANGE_LABELS[range].toLowerCase()}.{" "}
					{model.undated > 0
						? `${model.undated} row${model.undated === 1 ? "" : "s"} have no publish date.`
						: ""}
				</p>
				<div className="nl-filters">
					<RangePicker range={range} onChange={setRange} />
				</div>
			</div>
		)
	}

	return (
		<div className={`nl-dash${stale ? " is-stale" : ""}`}>
			<header className="nl-header">
				<h1>Newsletter engagement</h1>
				<p>
					Rates recalculated from summed counts — Σ clicks ÷ Σ deliveries — so a big send
					counts for more than a small one.
				</p>
			</header>

			<div className="nl-filters" role="group" aria-label="Dashboard filters">
				<RangePicker range={range} onChange={setRange} />
				<Segmented
					label="Group by"
					options={GRANULARITIES.map((g) => ({ value: g, label: GRANULARITY_LABELS[g] }))}
					value={granularity}
					onChange={setGranularity}
				/>
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

			<Tiles totals={model.totals} prior={model.prior} range={range} />

			{view === "chart" ? (
				<>
					<Card
						title="Engagement rate"
						subtitle={`Aggregate rates by ${granularity}. Periods without a send are gaps, not zeroes.`}
					>
						<RateTrend buckets={model.buckets} />
					</Card>
					<Card title="Delivery volume" subtitle="Emails delivered per period.">
						<VolumeColumns buckets={model.buckets} />
					</Card>
					<Card
						title="By issue"
						subtitle={issueSubtitle(issueMetric, model.issues.length)}
						control={
							<Segmented
								label="Rank by"
								options={ISSUE_METRICS.map((m) => ({
									value: m,
									label: ISSUE_METRIC_LABELS[m],
								}))}
								value={issueMetric}
								onChange={setIssueMetric}
							/>
						}
					>
						<IssueBars
							rows={model.issues}
							metric={issueMetric}
							aggregate={model.totals}
						/>
					</Card>
				</>
			) : (
				<>
					<Card
						title="By period"
						subtitle="The same figures the charts plot. Click a column header to sort."
					>
						<PeriodTable buckets={model.buckets} />
					</Card>
					<Card
						title="By send"
						subtitle="One row per send, newest first. Click a column header to sort. Clicking a subject copies a link to its newsletter issue — Notion's sandbox won't let a block open a page, so right-click to open it in a new tab."
					>
						<SendTable sends={model.inRange} />
					</Card>
				</>
			)}

			<Notes totals={model.totals} undated={model.undated} />
		</div>
	)
}

function RangePicker({
	range,
	onChange,
}: {
	range: RangeKey
	onChange: (next: RangeKey) => void
}) {
	return (
		<Segmented
			label="Date range"
			options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
			value={range}
			onChange={onChange}
		/>
	)
}

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
		<div className="nl-segmented">
			<span className="nl-segmented-label">{label}</span>
			<div className="nl-segmented-options" role="group" aria-label={label}>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						className={`nl-segment${option.value === value ? " is-active" : ""}`}
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

function Tiles({
	totals,
	prior,
	range,
}: {
	totals: Metrics
	prior: Metrics | null
	range: RangeKey
}) {
	const since = range === "all" ? null : `vs previous ${RANGE_LABELS[range].toLowerCase()}`

	return (
		<div className="nl-tiles">
			<Tile
				label="Delivered"
				value={formatCount(totals.deliveries)}
				sub={`${formatCount(totals.sends)} ${totals.sends === 1 ? "send" : "sends"}`}
				change={prior ? delta(totals.deliveries, prior.deliveries) : null}
				since={since}
				upIsGood
			/>
			<Tile
				label="Open rate"
				value={formatPercent(totals.openRate)}
				sub={`${formatCount(totals.opens)} opens`}
				change={prior ? delta(totals.openRate, prior.openRate) : null}
				since={since}
				upIsGood
			/>
			<Tile
				label="Click rate"
				value={formatPercent(totals.clickRate)}
				sub={`${formatCount(totals.clicks)} clicks`}
				change={prior ? delta(totals.clickRate, prior.clickRate) : null}
				since={since}
				upIsGood
			/>
			<Tile
				label="Click-to-open"
				value={formatPercent(totals.clickToOpenRate)}
				sub="clicks ÷ opens"
				change={prior ? delta(totals.clickToOpenRate, prior.clickToOpenRate) : null}
				since={since}
				upIsGood
			/>
			<Tile
				label="Unsubscribe rate"
				value={formatPercent(totals.unsubRate, 2)}
				sub={`${formatCount(totals.unsubscribes)} unsubscribed`}
				change={prior ? delta(totals.unsubRate, prior.unsubRate) : null}
				since={since}
				upIsGood={false}
			/>
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
}: {
	label: string
	value: string
	sub: string
	change: number | null
	since: string | null
	upIsGood: boolean
}) {
	const good = change === null ? null : upIsGood === change > 0
	const tone = change === null || change === 0 ? "flat" : good ? "good" : "bad"

	return (
		<div className="nl-tile">
			<div className="nl-tile-label">{label}</div>
			<div className="nl-tile-value">{value}</div>
			<div className="nl-tile-sub">{sub}</div>
			{change !== null && since ? (
				<div className={`nl-tile-delta is-${tone}`}>
					{/* Arrow plus a signed number: direction never rides on colour alone. */}
					<span aria-hidden="true">{change > 0 ? "↑" : change < 0 ? "↓" : "→"}</span>
					{formatDelta(change)} <span className="nl-tile-since">{since}</span>
				</div>
			) : null}
		</div>
	)
}

/**
 * Ranking by a rate ignores size, so say so rather than letting a 54-delivery
 * issue silently look like the best-performing one.
 */
function issueSubtitle(metric: IssueMetric, count: number): string {
	const capped =
		count > ISSUE_LIMIT ? `Top ${ISSUE_LIMIT} of ${count} sends. ` : ""
	if (metric === "deliveries") return `${capped}Largest send first.`
	return `${capped}Highest first. Small sends can top a rate ranking — the line marks the aggregate, and each bar's delivery count is in its tooltip.`
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
		<section className="nl-card">
			<div className="nl-card-head">
				<div className="nl-card-head-row">
					<h2>{title}</h2>
					{control}
				</div>
				<p>{subtitle}</p>
			</div>
			{children}
		</section>
	)
}

const PERIOD_COLUMNS: Column<Bucket & { id: string }>[] = [
	{
		key: "period",
		label: "Period",
		left: true,
		// Sort on the bucket key, which is chronological; the label isn't.
		sortValue: (b) => b.key,
		render: (b) => b.label,
	},
	{ key: "sends", label: "Sends", sortValue: (b) => b.sends, render: (b) => formatCount(b.sends) },
	{
		key: "deliveries",
		label: "Delivered",
		sortValue: (b) => b.deliveries,
		render: (b) => formatCount(b.deliveries),
	},
	{ key: "opens", label: "Opens", sortValue: (b) => b.opens, render: (b) => formatCount(b.opens) },
	{
		key: "clicks",
		label: "Clicks",
		sortValue: (b) => b.clicks,
		render: (b) => formatCount(b.clicks),
	},
	{
		key: "openRate",
		label: "Open rate",
		sortValue: (b) => b.openRate,
		render: (b) => formatPercent(b.openRate),
	},
	{
		key: "clickRate",
		label: "Click rate",
		sortValue: (b) => b.clickRate,
		render: (b) => formatPercent(b.clickRate),
	},
	{
		key: "clickToOpenRate",
		label: "Click-to-open",
		sortValue: (b) => b.clickToOpenRate,
		render: (b) => formatPercent(b.clickToOpenRate),
	},
	{
		key: "unsubRate",
		label: "Unsub rate",
		sortValue: (b) => b.unsubRate,
		render: (b) => formatPercent(b.unsubRate, 2),
	},
]

function PeriodTable({ buckets }: { buckets: Bucket[] }) {
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

type SendRow = Send & Metrics

const SEND_COLUMNS: Column<SendRow>[] = [
	{
		key: "sent",
		label: "Sent",
		left: true,
		sortValue: (s) => s.sentOn,
		render: (s) => s.sentOn ?? "—",
	},
	{
		key: "subject",
		label: "Subject",
		left: true,
		sortValue: (s) => s.subject.toLowerCase(),
		render: (s) => <SubjectCell send={s} />,
	},
	{
		key: "deliveries",
		label: "Delivered",
		sortValue: (s) => s.deliveries,
		render: (s) => formatCount(s.deliveries),
	},
	{ key: "opens", label: "Opens", sortValue: (s) => s.opens, render: (s) => formatCount(s.opens) },
	{
		key: "clicks",
		label: "Clicks",
		sortValue: (s) => s.clicks,
		render: (s) => formatCount(s.clicks),
	},
	{
		key: "openRate",
		label: "Open rate",
		sortValue: (s) => s.openRate,
		render: (s) => formatPercent(s.openRate),
	},
	{
		key: "clickRate",
		label: "Click rate",
		sortValue: (s) => s.clickRate,
		render: (s) => formatPercent(s.clickRate),
	},
]

/** Canonical short-form page URL on the current Notion domain. */
function issueUrl(pageId: string): string {
	return `https://app.notion.com/p/${pageId.replace(/-/g, "")}`
}

/**
 * Best-effort clipboard write. The async Clipboard API needs a permission the
 * host's iframe may not grant, so fall back to the legacy selection copy, which
 * only needs the user gesture we're already inside. Returns false when neither
 * works, so the caller can show the URL for manual copying instead of silently
 * doing nothing.
 */
async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		// Fall through to the legacy path.
	}
	try {
		const field = document.createElement("textarea")
		field.value = text
		field.setAttribute("readonly", "")
		field.style.position = "fixed"
		field.style.opacity = "0"
		document.body.appendChild(field)
		field.select()
		const ok = document.execCommand("copy")
		document.body.removeChild(field)
		return ok
	} catch {
		return false
	}
}

/**
 * The subject of a send, linked to its Newsletter Issue page when the optional
 * `issue` relation is mapped and set.
 *
 * Clicking copies the URL rather than opening it. That isn't a preference: the
 * sandbox↔host protocol has no navigate/open message, and the SDK forbids
 * top-level navigation and `window.open`, so nothing in a custom block can make
 * Notion open a page. The `href` stays real so the browser's own context menu
 * ("Copy Link", "Open in New Tab") keeps working, and so this starts navigating
 * for free if the sandbox ever allows it.
 */
function SubjectCell({ send }: { send: SendRow }) {
	const [state, setState] = useState<"idle" | "copied" | "manual">("idle")

	if (!send.issuePageId) return <span className="nl-subject">{send.subject}</span>

	const url = issueUrl(send.issuePageId)

	if (state === "manual") {
		// Clipboard refused. Hand over the URL, selected, so ⌘C still works.
		return (
			<input
				className="nl-url-field"
				readOnly
				value={url}
				autoFocus
				onFocus={(e) => e.currentTarget.select()}
				onBlur={() => setState("idle")}
				aria-label={`Link to ${send.subject}`}
			/>
		)
	}

	return (
		<a
			className="nl-subject nl-link"
			href={url}
			onClick={async (event) => {
				event.preventDefault()
				const copied = await copyToClipboard(url)
				setState(copied ? "copied" : "manual")
				if (copied) window.setTimeout(() => setState("idle"), 1600)
			}}
			title={`Copy link to “${send.subject}”. Notion's sandbox won't let a custom block open a page — right-click to open it in a new tab.`}
		>
			{send.subject}
			{state === "copied" ? <span className="nl-copied"> copied</span> : null}
		</a>
	)
}

function SendTable({ sends }: { sends: Send[] }) {
	const rows = useMemo(
		() => sends.map((send) => ({ ...send, ...summarize([send]) })),
		[sends],
	)
	const linked = rows.filter((r) => r.issuePageId).length

	return (
		<>
			<DataTable
				columns={SEND_COLUMNS}
				rows={rows}
				initialSort={{ key: "sent", dir: "desc" }}
				caption="Row-level counts per send. Click a column header to sort."
			/>
			{linked > 0 && linked < rows.length ? (
				<p className="nl-table-note">
					{rows.length - linked} of {rows.length} sends aren't linked to a
					newsletter issue, so their subjects aren't clickable.
				</p>
			) : null}
		</>
	)
}

/** Data-quality caveats stay on screen rather than being silently filtered. */
function Notes({ totals, undated }: { totals: Metrics; undated: number }) {
	if (totals.untrackedSends === 0 && undated === 0) return null

	return (
		<footer className="nl-notes">
			{totals.untrackedSends > 0 ? (
				<p>
					<strong>
						{totals.untrackedSends} send{totals.untrackedSends === 1 ? "" : "s"}
					</strong>{" "}
					recorded deliveries but zero opens — usually missing tracking rather than a real 0%.
					Still counted in every total above.
				</p>
			) : null}
			{undated > 0 ? (
				<p>
					<strong>
						{undated} row{undated === 1 ? "" : "s"}
					</strong>{" "}
					have no publish date and can't be placed on the time axis, so they're excluded.
				</p>
			) : null}
		</footer>
	)
}
