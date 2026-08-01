import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import {
	formatCount,
	formatPercent,
	METRIC_LABELS,
	type Bucket,
	type MetricKey,
} from "./aggregate.ts"

/** Categorical slots 1–3, validated for CVD separation in both modes. */
export const SERIES: { key: MetricKey; cssVar: string }[] = [
	{ key: "openRate", cssVar: "--series-1" },
	{ key: "clickRate", cssVar: "--series-2" },
	{ key: "clickToOpenRate", cssVar: "--series-3" },
]

const PLOT_HEIGHT = 200
const AXIS_BAND = 26
const PAD = { top: 14, right: 64, bottom: AXIS_BAND, left: 46 }

/** Measure the container so the SVG is laid out in real pixels, not scaled. */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number] {
	const ref = useRef<HTMLDivElement | null>(null)
	const [width, setWidth] = useState(640)

	useLayoutEffect(() => {
		const node = ref.current
		if (!node) return
		const observer = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect.width
			if (next && next > 0) setWidth(next)
		})
		observer.observe(node)
		return () => observer.disconnect()
	}, [])

	return [ref, width]
}

/** Tick step that yields ~4 gridlines without odd numbers on the axis. */
function niceRateStep(max: number): number {
	for (const step of [0.02, 0.05, 0.1, 0.2, 0.25, 0.5]) {
		if (max / step <= 4.2) return step
	}
	return 1
}

function niceCountStep(max: number): number {
	const magnitude = 10 ** Math.floor(Math.log10(Math.max(max, 1)))
	for (const multiple of [1, 2, 2.5, 5, 10]) {
		const step = magnitude * multiple
		if (max / step <= 4.2) return step
	}
	return magnitude * 10
}

/** Label every nth bucket so x-axis text never overlaps. */
function labelStride(count: number, width: number): number {
	const perLabel = 62
	const room = Math.max(1, Math.floor((width - PAD.left - PAD.right) / perLabel))
	return Math.max(1, Math.ceil(count / room))
}

type Hover = { index: number; x: number } | null

/**
 * Aggregate rates over time. One y-axis for all three series — they share a
 * unit (percent of deliveries), so no second scale is needed or wanted.
 */
export function RateTrend({ buckets }: { buckets: Bucket[] }) {
	const [ref, width] = useMeasuredWidth()
	const [hover, setHover] = useState<Hover>(null)
	const svgRef = useRef<SVGSVGElement | null>(null)

	const height = PLOT_HEIGHT + PAD.top + PAD.bottom
	const innerWidth = Math.max(80, width - PAD.left - PAD.right)
	const values = buckets.flatMap((b) =>
		SERIES.map((s) => b[s.key]).filter((v): v is number => v !== null),
	)
	const max = values.length > 0 ? Math.max(...values) : 0.1
	const step = niceRateStep(max)
	const top = Math.max(step, Math.ceil(max / step) * step)
	const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

	// A single bucket has no band to spread across; centre it.
	const bandWidth = buckets.length > 1 ? innerWidth / (buckets.length - 1) : 0
	const xAt = (i: number) =>
		buckets.length > 1 ? PAD.left + i * bandWidth : PAD.left + innerWidth / 2
	const yAt = (value: number) => PAD.top + PLOT_HEIGHT * (1 - value / top)

	const nearest = useCallback(
		(clientX: number): number => {
			const box = svgRef.current?.getBoundingClientRect()
			if (!box || buckets.length === 0) return 0
			const local = clientX - box.left
			if (buckets.length === 1) return 0
			const raw = (local - PAD.left) / bandWidth
			return Math.min(buckets.length - 1, Math.max(0, Math.round(raw)))
		},
		[bandWidth, buckets.length],
	)

	const stride = labelStride(buckets.length, width)
	const endLabels = resolveEndLabels(buckets, yAt)

	return (
		<div className="nl-chart" ref={ref}>
			<svg
				ref={svgRef}
				width={width}
				height={height}
				role="img"
				aria-label={`Aggregate open, click and click-to-open rate by period, ${buckets.length} periods`}
				tabIndex={0}
				onPointerMove={(e) => {
					const index = nearest(e.clientX)
					setHover({ index, x: xAt(index) })
				}}
				onPointerLeave={() => setHover(null)}
				onFocus={() => setHover({ index: buckets.length - 1, x: xAt(buckets.length - 1) })}
				onBlur={() => setHover(null)}
				onKeyDown={(e) => {
					if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
					e.preventDefault()
					const from = hover?.index ?? buckets.length - 1
					const next = Math.min(
						buckets.length - 1,
						Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1)),
					)
					setHover({ index: next, x: xAt(next) })
				}}
			>
				{ticks.map((tick) => (
					<g key={tick}>
						<line
							className="nl-grid"
							x1={PAD.left}
							x2={PAD.left + innerWidth}
							y1={yAt(tick)}
							y2={yAt(tick)}
						/>
						<text className="nl-axis-text" x={PAD.left - 8} y={yAt(tick) + 4} textAnchor="end">
							{formatPercent(tick, 0)}
						</text>
					</g>
				))}

				{buckets.map((bucket, i) =>
					i % stride === 0 || i === buckets.length - 1 ? (
						<text
							key={bucket.key}
							className="nl-axis-text"
							x={xAt(i)}
							y={PAD.top + PLOT_HEIGHT + 18}
							textAnchor="middle"
						>
							{bucket.label}
						</text>
					) : null,
				)}

				{hover ? (
					<line
						className="nl-crosshair"
						x1={hover.x}
						x2={hover.x}
						y1={PAD.top}
						y2={PAD.top + PLOT_HEIGHT}
					/>
				) : null}

				{SERIES.map(({ key, cssVar }) => (
					<g key={key} style={{ color: `var(${cssVar})` }}>
						{segments(buckets, key).map((segment, i) => (
							<path
								key={i}
								className="nl-line"
								d={segment
									.map(
										(point, j) =>
											`${j === 0 ? "M" : "L"}${xAt(point.index)},${yAt(point.value)}`,
									)
									.join(" ")}
							/>
						))}
					</g>
				))}

				{/* End dots and direct labels — the relief for light-mode series 3,
				    whose contrast sits below 3:1 on white. */}
				{endLabels.map(({ key, cssVar, index, value, labelY, nudged }) => (
					<g key={key} style={{ color: `var(${cssVar})` }}>
						{nudged ? (
							<line
								className="nl-leader"
								x1={xAt(index) + 6}
								y1={yAt(value)}
								x2={PAD.left + innerWidth + 12}
								y2={labelY - 4}
							/>
						) : null}
						<circle className="nl-dot" cx={xAt(index)} cy={yAt(value)} r={4} />
						<text className="nl-end-label" x={PAD.left + innerWidth + 14} y={labelY}>
							{formatPercent(value)}
						</text>
					</g>
				))}

				{hover
					? SERIES.map(({ key, cssVar }) => {
							const value = buckets[hover.index]?.[key]
							if (value === null || value === undefined) return null
							return (
								<circle
									key={key}
									className="nl-dot"
									style={{ color: `var(${cssVar})` }}
									cx={hover.x}
									cy={yAt(value)}
									r={4.5}
								/>
							)
						})
					: null}
			</svg>

			{hover && buckets[hover.index] ? (
				<Tooltip
					anchor={hover.x}
					width={width}
					title={buckets[hover.index].label}
					rows={SERIES.map(({ key, cssVar }) => ({
						cssVar,
						label: METRIC_LABELS[key],
						value: formatPercent(buckets[hover.index][key]),
					}))}
					footer={`${formatCount(buckets[hover.index].deliveries)} delivered · ${formatCount(
						buckets[hover.index].sends,
					)} ${buckets[hover.index].sends === 1 ? "send" : "sends"}`}
				/>
			) : null}

			<Legend />
		</div>
	)
}

/** Break a series into unbroken runs so missing periods gap the line. */
function segments(buckets: Bucket[], key: MetricKey) {
	const runs: { index: number; value: number }[][] = []
	let current: { index: number; value: number }[] = []
	buckets.forEach((bucket, index) => {
		const value = bucket[key]
		if (value === null) {
			if (current.length > 0) runs.push(current)
			current = []
			return
		}
		current.push({ index, value })
	})
	if (current.length > 0) runs.push(current)
	// A lone point would render as an invisible zero-length path; give it a dot.
	return runs.filter((run) => run.length > 1).concat(runs.filter((r) => r.length === 1))
}

/**
 * Place one end label per series, nudging apart any that would collide and
 * drawing a leader line to whichever moved — stacking labels without a
 * connector detaches them from their line.
 */
function resolveEndLabels(buckets: Bucket[], yAt: (v: number) => number) {
	const MIN_GAP = 14
	const placed = SERIES.map(({ key, cssVar }) => {
		for (let i = buckets.length - 1; i >= 0; i -= 1) {
			const value = buckets[i][key]
			if (value !== null) return { key, cssVar, index: i, value }
		}
		return null
	})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
		.map((entry) => ({ ...entry, labelY: yAt(entry.value) + 4, nudged: false }))
		.sort((a, b) => a.labelY - b.labelY)

	for (let i = 1; i < placed.length; i += 1) {
		const gap = placed[i].labelY - placed[i - 1].labelY
		if (gap < MIN_GAP) {
			placed[i].labelY = placed[i - 1].labelY + MIN_GAP
			placed[i].nudged = true
		}
	}
	return placed
}

/** Delivery volume — a separate chart, because a second y-scale on the rate
 *  plot would invent a correlation the data doesn't contain. */
export function VolumeColumns({ buckets }: { buckets: Bucket[] }) {
	const [ref, width] = useMeasuredWidth()
	const [hover, setHover] = useState<number | null>(null)

	const height = 140 + PAD.top + PAD.bottom
	const plot = 140
	const innerWidth = Math.max(80, width - PAD.left - PAD.right)
	const max = Math.max(...buckets.map((b) => b.deliveries), 1)
	const step = niceCountStep(max)
	const top = Math.ceil(max / step) * step
	const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

	const band = innerWidth / Math.max(buckets.length, 1)
	const barWidth = Math.min(24, band * 0.6)
	const xAt = (i: number) => PAD.left + band * i + (band - barWidth) / 2
	const yAt = (value: number) => PAD.top + plot * (1 - value / top)
	const peak = buckets.reduce(
		(best, b, i) => (b.deliveries > (buckets[best]?.deliveries ?? -1) ? i : best),
		0,
	)
	const stride = labelStride(buckets.length, width)

	return (
		<div className="nl-chart" ref={ref}>
			<svg
				width={width}
				height={height}
				role="img"
				aria-label={`Emails delivered by period, ${buckets.length} periods`}
			>
				{ticks.map((tick) => (
					<g key={tick}>
						<line
							className="nl-grid"
							x1={PAD.left}
							x2={PAD.left + innerWidth}
							y1={yAt(tick)}
							y2={yAt(tick)}
						/>
						<text className="nl-axis-text" x={PAD.left - 8} y={yAt(tick) + 4} textAnchor="end">
							{formatCount(tick)}
						</text>
					</g>
				))}

				{buckets.map((bucket, i) => {
					const barHeight = Math.max(0, PAD.top + plot - yAt(bucket.deliveries))
					return (
						<g key={bucket.key} style={{ color: "var(--series-1)" }}>
							<rect
								className={`nl-bar${hover === i ? " is-hover" : ""}`}
								x={xAt(i)}
								y={yAt(bucket.deliveries)}
								width={barWidth}
								height={barHeight}
								rx={4}
							/>
							{/* Square off the baseline end: only the data end is rounded. */}
							{barHeight > 4 ? (
								<rect
									className={`nl-bar${hover === i ? " is-hover" : ""}`}
									x={xAt(i)}
									y={PAD.top + plot - 4}
									width={barWidth}
									height={4}
								/>
							) : null}
							{/* Hit target spans the whole band, not just the painted bar. */}
							<rect
								className="nl-hit"
								x={PAD.left + band * i}
								y={PAD.top}
								width={band}
								height={plot}
								onPointerEnter={() => setHover(i)}
								onPointerLeave={() => setHover((prev) => (prev === i ? null : prev))}
							/>
							{i === peak ? (
								<text
									className="nl-cap-label"
									x={xAt(i) + barWidth / 2}
									y={yAt(bucket.deliveries) - 7}
									textAnchor="middle"
								>
									{formatCount(bucket.deliveries)}
								</text>
							) : null}
						</g>
					)
				})}

				{buckets.map((bucket, i) =>
					i % stride === 0 || i === buckets.length - 1 ? (
						<text
							key={bucket.key}
							className="nl-axis-text"
							x={xAt(i) + barWidth / 2}
							y={PAD.top + plot + 18}
							textAnchor="middle"
						>
							{bucket.label}
						</text>
					) : null,
				)}

				<line
					className="nl-baseline"
					x1={PAD.left}
					x2={PAD.left + innerWidth}
					y1={PAD.top + plot}
					y2={PAD.top + plot}
				/>
			</svg>

			{hover !== null && buckets[hover] ? (
				<Tooltip
					anchor={xAt(hover) + barWidth / 2}
					width={width}
					title={buckets[hover].label}
					rows={[
						{
							cssVar: "--series-1",
							label: "Delivered",
							value: formatCount(buckets[hover].deliveries),
						},
					]}
					footer={`${formatCount(buckets[hover].sends)} ${
						buckets[hover].sends === 1 ? "send" : "sends"
					}`}
				/>
			) : null}
		</div>
	)
}

function Legend() {
	return (
		<ul className="nl-legend">
			{SERIES.map(({ key, cssVar }) => (
				<li key={key}>
					<span className="nl-key" style={{ color: `var(${cssVar})` }} aria-hidden="true" />
					{METRIC_LABELS[key]}
				</li>
			))}
		</ul>
	)
}

/**
 * Values lead, series names follow — the reader already knows which series they
 * care about and wants the number.
 */
function Tooltip({
	anchor,
	width,
	title,
	rows,
	footer,
}: {
	anchor: number
	width: number
	title: string
	rows: { cssVar: string; label: string; value: string }[]
	footer?: string
}) {
	const [box, setBox] = useState(180)
	const ref = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		const measured = ref.current?.offsetWidth
		if (measured) setBox(measured)
	}, [rows, title])

	const left = Math.min(Math.max(anchor - box / 2, 4), Math.max(4, width - box - 4))

	return (
		<div className="nl-tooltip" ref={ref} style={{ left }} role="status">
			<div className="nl-tooltip-title">{title}</div>
			{rows.map((row) => (
				<div className="nl-tooltip-row" key={row.label}>
					<span className="nl-key" style={{ color: `var(${row.cssVar})` }} aria-hidden="true" />
					<span className="nl-tooltip-value">{row.value}</span>
					<span className="nl-tooltip-label">{row.label}</span>
				</div>
			))}
			{footer ? <div className="nl-tooltip-footer">{footer}</div> : null}
		</div>
	)
}
