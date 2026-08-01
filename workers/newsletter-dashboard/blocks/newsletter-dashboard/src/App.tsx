import { useMemo, useState } from "react"

import {
	bucketize,
	delta,
	filterByRange,
	formatCount,
	formatDelta,
	formatPercent,
	GRANULARITY_LABELS,
	previousWindow,
	RANGE_LABELS,
	summarize,
	type Bucket,
	type Granularity,
	type Metrics,
	type RangeKey,
	type Send,
} from "./aggregate.ts"
import { RateTrend, VolumeColumns } from "./charts.tsx"

const GRANULARITIES: Granularity[] = ["week", "month", "quarter"]
const RANGES: RangeKey[] = ["90d", "180d", "365d", "all"]

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

	const model = useMemo(() => {
		const inRange = filterByRange(sends, range, today)
		const prior = previousWindow(sends, range, today)
		return {
			inRange,
			totals: summarize(inRange),
			prior: prior ? summarize(prior) : null,
			buckets: bucketize(inRange, granularity),
			undated: sends.filter((s) => !s.sentOn).length,
		}
	}, [sends, range, today, granularity])

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
				</>
			) : (
				<>
					<Card title="By period" subtitle="The same figures the charts plot.">
						<PeriodTable buckets={model.buckets} />
					</Card>
					<Card title="By send" subtitle="Row-level counts, newest first.">
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

function Card({
	title,
	subtitle,
	children,
}: {
	title: string
	subtitle: string
	children: React.ReactNode
}) {
	return (
		<section className="nl-card">
			<div className="nl-card-head">
				<h2>{title}</h2>
				<p>{subtitle}</p>
			</div>
			{children}
		</section>
	)
}

function PeriodTable({ buckets }: { buckets: Bucket[] }) {
	return (
		<div className="nl-table-wrap">
			<table className="nl-table">
				<thead>
					<tr>
						<th scope="col">Period</th>
						<th scope="col">Sends</th>
						<th scope="col">Delivered</th>
						<th scope="col">Opens</th>
						<th scope="col">Clicks</th>
						<th scope="col">Open rate</th>
						<th scope="col">Click rate</th>
						<th scope="col">Click-to-open</th>
						<th scope="col">Unsub rate</th>
					</tr>
				</thead>
				<tbody>
					{[...buckets].reverse().map((bucket) => (
						<tr key={bucket.key}>
							<th scope="row">{bucket.label}</th>
							<td>{formatCount(bucket.sends)}</td>
							<td>{formatCount(bucket.deliveries)}</td>
							<td>{formatCount(bucket.opens)}</td>
							<td>{formatCount(bucket.clicks)}</td>
							<td>{formatPercent(bucket.openRate)}</td>
							<td>{formatPercent(bucket.clickRate)}</td>
							<td>{formatPercent(bucket.clickToOpenRate)}</td>
							<td>{formatPercent(bucket.unsubRate, 2)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

function SendTable({ sends }: { sends: Send[] }) {
	const rows = [...sends].sort((a, b) => (a.sentOn ?? "") < (b.sentOn ?? "") ? 1 : -1)

	return (
		<div className="nl-table-wrap">
			<table className="nl-table">
				<thead>
					<tr>
						<th scope="col">Sent</th>
						<th scope="col">Subject</th>
						<th scope="col">Delivered</th>
						<th scope="col">Opens</th>
						<th scope="col">Clicks</th>
						<th scope="col">Open rate</th>
						<th scope="col">Click rate</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((send) => {
						const summary = summarize([send])
						return (
							<tr key={send.id}>
								<td className="nl-nowrap">{send.sentOn ?? "—"}</td>
								<th scope="row" className="nl-subject">
									{send.subject}
								</th>
								<td>{formatCount(send.deliveries)}</td>
								<td>{formatCount(send.opens)}</td>
								<td>{formatCount(send.clicks)}</td>
								<td>{formatPercent(summary.openRate)}</td>
								<td>{formatPercent(summary.clickRate)}</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
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
