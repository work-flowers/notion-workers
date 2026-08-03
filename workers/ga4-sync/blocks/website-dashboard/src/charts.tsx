import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { formatCount, formatPercent } from "./aggregate.ts"

/**
 * Three chart idioms, shared by all three tabs:
 *
 * - `TrendLines` — one or more series over time, one unit per chart.
 * - `Columns` — a single count over time.
 * - `RankedBars` — a horizontal ranking, optionally against a reference line.
 *
 * Deliberately no dual-axis chart. Sessions and engagement rate over the same
 * weeks would fit on one plot, but overlaying two scales invents a correlation
 * the reader can't check — so volume and quality get separate cards and the
 * reader compares them by eye, knowing they are separate.
 */

/** Categorical slots 1–3, validated for CVD separation on both Notion surfaces. */
export const SERIES_VARS = ["--series-1", "--series-2", "--series-3"] as const

const PLOT_HEIGHT = 190
const AXIS_BAND = 26
const PAD = { top: 14, right: 62, bottom: AXIS_BAND, left: 48 }

export type SeriesSpec = {
	/** Key into a bucket's `values`. */
	key: string
	label: string
	cssVar: string
}

export type TrendBucket = {
	key: string
	label: string
	/** Null is a gap in that series, not a zero. */
	values: Record<string, number | null>
	/** Extra lines for the tooltip, e.g. the bucket's session count. */
	footer?: string
}

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

/**
 * Smallest round step that keeps the axis to ~4 intervals. Candidates start a
 * magnitude *below* the value so a max of 1,118 gets a 1,500 top rather than
 * 2,000 — snapping straight to the leading magnitude leaves nearly half the
 * plot empty and flattens every bar in it.
 */
function niceCountStep(max: number): number {
	const magnitude = 10 ** Math.floor(Math.log10(Math.max(max, 1)))
	for (const scale of [magnitude / 10, magnitude, magnitude * 10]) {
		for (const multiple of [1, 2, 2.5, 5]) {
			const step = scale * multiple
			if (step > 0 && max / step <= 4.2) return step
		}
	}
	return magnitude * 10
}

/** Label every nth bucket so x-axis text never overlaps. */
function labelStride(count: number, width: number): number {
	const room = Math.max(1, Math.floor((width - PAD.left - PAD.right) / 62))
	return Math.max(1, Math.ceil(count / room))
}

type Hover = { index: number; x: number } | null

// ---------------------------------------------------------------------------
// Lines over time
// ---------------------------------------------------------------------------

export function TrendLines({
	buckets,
	series,
	isRate,
	ariaLabel,
	reference,
	referenceLabel,
}: {
	buckets: TrendBucket[]
	series: SeriesSpec[]
	isRate: boolean
	ariaLabel: string
	/** A horizontal benchmark, e.g. the whole window's aggregate rate. */
	reference?: number | null
	referenceLabel?: string
}) {
	const [ref, width] = useMeasuredWidth()
	const [hover, setHover] = useState<Hover>(null)
	const svgRef = useRef<SVGSVGElement | null>(null)

	const height = PLOT_HEIGHT + PAD.top + PAD.bottom
	const innerWidth = Math.max(80, width - PAD.left - PAD.right)
	const values = buckets.flatMap((b) =>
		series.map((s) => b.values[s.key]).filter((v): v is number => v != null),
	)
	const max = Math.max(...values, reference ?? 0, isRate ? 0.1 : 1)
	const step = isRate ? niceRateStep(max) : niceCountStep(max)
	const top = Math.max(step, Math.ceil(max / step) * step)
	const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
	const format = (value: number) => (isRate ? formatPercent(value, 0) : formatCount(value))

	// A single bucket has no band to spread across; centre it.
	const bandWidth = buckets.length > 1 ? innerWidth / (buckets.length - 1) : 0
	const xAt = (i: number) =>
		buckets.length > 1 ? PAD.left + i * bandWidth : PAD.left + innerWidth / 2
	const yAt = (value: number) => PAD.top + PLOT_HEIGHT * (1 - value / top)

	const nearest = useCallback(
		(clientX: number): number => {
			const box = svgRef.current?.getBoundingClientRect()
			if (!box || buckets.length <= 1) return 0
			const raw = (clientX - box.left - PAD.left) / bandWidth
			return Math.min(buckets.length - 1, Math.max(0, Math.round(raw)))
		},
		[bandWidth, buckets.length],
	)

	const stride = labelStride(buckets.length, width)
	const endLabels = resolveEndLabels(buckets, series, yAt)
	const runs = new Map(series.map(({ key }) => [key, segments(buckets, key)]))

	return (
		<div className="wd-chart" ref={ref}>
			<svg
				ref={svgRef}
				width={width}
				height={height}
				role="img"
				aria-label={ariaLabel}
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
							className="wd-grid"
							x1={PAD.left}
							x2={PAD.left + innerWidth}
							y1={yAt(tick)}
							y2={yAt(tick)}
						/>
						<text className="wd-axis-text" x={PAD.left - 8} y={yAt(tick) + 4} textAnchor="end">
							{format(tick)}
						</text>
					</g>
				))}

				{buckets.map((bucket, i) =>
					i % stride === 0 || i === buckets.length - 1 ? (
						<text
							key={bucket.key}
							className="wd-axis-text"
							x={xAt(i)}
							y={PAD.top + PLOT_HEIGHT + 18}
							textAnchor="middle"
						>
							{bucket.label}
						</text>
					) : null,
				)}

				{reference != null && reference > 0 && reference <= top ? (
					<g>
						{/* Solid, like every other rule here — a dashed line would read
						    as a target or projection rather than the measured figure. */}
						<line
							className="wd-reference"
							x1={PAD.left}
							x2={PAD.left + innerWidth}
							y1={yAt(reference)}
							y2={yAt(reference)}
						/>
						<text className="wd-reference-label" x={PAD.left + 4} y={yAt(reference) - 5}>
							{`${referenceLabel ?? "Aggregate"} ${format(reference)}`}
						</text>
					</g>
				) : null}

				{hover ? (
					<line
						className="wd-crosshair"
						x1={hover.x}
						x2={hover.x}
						y1={PAD.top}
						y2={PAD.top + PLOT_HEIGHT}
					/>
				) : null}

				{series.map(({ key, cssVar }) => (
					<g key={key} style={{ color: `var(${cssVar})` }}>
						{(runs.get(key) ?? []).map((segment, i) =>
							segment.length > 1 ? (
								<path
									key={i}
									className="wd-line"
									d={segment
										.map((p, j) => `${j === 0 ? "M" : "L"}${xAt(p.index)},${yAt(p.value)}`)
										.join(" ")}
								/>
							) : (
								// A lone point has no path to draw; give it a dot so an
								// isolated bucket between two gaps isn't invisible.
								<circle
									key={i}
									className="wd-dot"
									cx={xAt(segment[0].index)}
									cy={yAt(segment[0].value)}
									r={3.5}
								/>
							),
						)}
					</g>
				))}

				{/* Direct end labels — the secondary encoding that keeps the series
				    separable for colour-vision-deficient readers. Don't remove. */}
				{endLabels.map(({ key, cssVar, index, value, labelY, nudged }) => (
					<g key={key} style={{ color: `var(${cssVar})` }}>
						{nudged ? (
							<line
								className="wd-leader"
								x1={xAt(index) + 6}
								y1={yAt(value)}
								x2={PAD.left + innerWidth + 12}
								y2={labelY - 4}
							/>
						) : null}
						<circle className="wd-dot" cx={xAt(index)} cy={yAt(value)} r={4} />
						<text className="wd-end-label" x={PAD.left + innerWidth + 14} y={labelY}>
							{isRate ? formatPercent(value) : formatCount(value)}
						</text>
					</g>
				))}

				{hover
					? series.map(({ key, cssVar }) => {
							const value = buckets[hover.index]?.values[key]
							if (value == null) return null
							return (
								<circle
									key={key}
									className="wd-dot"
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
					rows={series.map(({ key, label, cssVar }) => ({
						cssVar,
						label,
						value: isRate
							? formatPercent(buckets[hover.index].values[key])
							: formatCount(buckets[hover.index].values[key]),
					}))}
					footer={buckets[hover.index].footer}
				/>
			) : null}

			{series.length > 1 ? <Legend series={series} /> : null}
		</div>
	)
}

/** Break a series into unbroken runs so missing periods gap the line. */
function segments(buckets: TrendBucket[], key: string) {
	const runs: { index: number; value: number }[][] = []
	let current: { index: number; value: number }[] = []
	buckets.forEach((bucket, index) => {
		const value = bucket.values[key]
		if (value == null) {
			if (current.length > 0) runs.push(current)
			current = []
			return
		}
		current.push({ index, value })
	})
	if (current.length > 0) runs.push(current)
	return runs
}

/**
 * Place one end label per series, nudging apart any that would collide and
 * drawing a leader line to whichever moved — stacking labels without a
 * connector detaches them from their line.
 */
function resolveEndLabels(
	buckets: TrendBucket[],
	series: SeriesSpec[],
	yAt: (v: number) => number,
) {
	const MIN_GAP = 14
	const placed = series
		.map(({ key, cssVar }) => {
			for (let i = buckets.length - 1; i >= 0; i -= 1) {
				const value = buckets[i].values[key]
				if (value != null) return { key, cssVar, index: i, value }
			}
			return null
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
		.map((entry) => ({ ...entry, labelY: yAt(entry.value) + 4, nudged: false }))
		.sort((a, b) => a.labelY - b.labelY)

	for (let i = 1; i < placed.length; i += 1) {
		if (placed[i].labelY - placed[i - 1].labelY < MIN_GAP) {
			placed[i].labelY = placed[i - 1].labelY + MIN_GAP
			placed[i].nudged = true
		}
	}
	return placed
}

// ---------------------------------------------------------------------------
// Columns over time
// ---------------------------------------------------------------------------

export function Columns({
	buckets,
	seriesKey,
	valueLabel,
	ariaLabel,
}: {
	buckets: TrendBucket[]
	seriesKey: string
	valueLabel: string
	ariaLabel: string
}) {
	const [ref, width] = useMeasuredWidth()
	const [hover, setHover] = useState<number | null>(null)

	const plot = 150
	const height = plot + PAD.top + PAD.bottom
	const innerWidth = Math.max(80, width - PAD.left - PAD.right)
	const valueOf = (i: number) => buckets[i]?.values[seriesKey] ?? 0
	const max = Math.max(...buckets.map((_, i) => valueOf(i)), 1)
	const step = niceCountStep(max)
	const top = Math.ceil(max / step) * step
	const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

	const band = innerWidth / Math.max(buckets.length, 1)
	// Capped so a four-week window doesn't render as slivers stranded in a wide
	// card, but well under the band so the columns stay visibly separate.
	const barWidth = Math.min(44, band * 0.62)
	const xAt = (i: number) => PAD.left + band * i + (band - barWidth) / 2
	const yAt = (value: number) => PAD.top + plot * (1 - value / top)
	const peak = buckets.reduce((best, _, i) => (valueOf(i) > valueOf(best) ? i : best), 0)
	const stride = labelStride(buckets.length, width)

	return (
		<div className="wd-chart" ref={ref}>
			<svg width={width} height={height} role="img" aria-label={ariaLabel}>
				{ticks.map((tick) => (
					<g key={tick}>
						<line
							className="wd-grid"
							x1={PAD.left}
							x2={PAD.left + innerWidth}
							y1={yAt(tick)}
							y2={yAt(tick)}
						/>
						<text className="wd-axis-text" x={PAD.left - 8} y={yAt(tick) + 4} textAnchor="end">
							{formatCount(tick)}
						</text>
					</g>
				))}

				{buckets.map((bucket, i) => {
					const value = valueOf(i)
					const barHeight = Math.max(0, PAD.top + plot - yAt(value))
					return (
						<g key={bucket.key} style={{ color: "var(--series-1)" }}>
							<rect
								className={`wd-bar${hover === i ? " is-hover" : ""}`}
								x={xAt(i)}
								y={yAt(value)}
								width={barWidth}
								height={barHeight}
								rx={4}
							/>
							{/* Square off the baseline end: only the data end is rounded. */}
							{barHeight > 4 ? (
								<rect
									className={`wd-bar${hover === i ? " is-hover" : ""}`}
									x={xAt(i)}
									y={PAD.top + plot - 4}
									width={barWidth}
									height={4}
								/>
							) : null}
							{/* Hit target spans the whole band, not just the painted bar. */}
							<rect
								className="wd-hit"
								x={PAD.left + band * i}
								y={PAD.top}
								width={band}
								height={plot}
								onPointerEnter={() => setHover(i)}
								onPointerLeave={() => setHover((prev) => (prev === i ? null : prev))}
							/>
							{i === peak ? (
								<text
									className="wd-cap-label"
									x={xAt(i) + barWidth / 2}
									y={yAt(value) - 7}
									textAnchor="middle"
								>
									{formatCount(value)}
								</text>
							) : null}
						</g>
					)
				})}

				{buckets.map((bucket, i) =>
					i % stride === 0 || i === buckets.length - 1 ? (
						<text
							key={bucket.key}
							className="wd-axis-text"
							x={xAt(i) + barWidth / 2}
							y={PAD.top + plot + 18}
							textAnchor="middle"
						>
							{bucket.label}
						</text>
					) : null,
				)}

				<line
					className="wd-baseline"
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
						{ cssVar: "--series-1", label: valueLabel, value: formatCount(valueOf(hover)) },
					]}
					footer={buckets[hover].footer}
				/>
			) : null}
		</div>
	)
}

// ---------------------------------------------------------------------------
// Horizontal ranking
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 26
const BAR_THICKNESS = 14
const LABEL_WIDTH = 210

export type RankedRow = {
	id: string
	label: string
	/** Small prefix ahead of the label — a date, a medium, a page type. */
	prefix?: string
	value: number | null
	tooltipTitle: string
	tooltipFooter?: string
}

/**
 * One bar per row, ranked. Horizontal because the labels are long strings
 * (page paths, channel names) — rotated x-axis labels would be unreadable.
 * Single series, so every bar takes one colour: shading by value would
 * double-encode the bar's own length.
 */
export function RankedBars({
	rows,
	isRate,
	limit,
	reference,
	referenceLabel,
	ariaLabel,
	valueLabel,
	format,
}: {
	rows: RankedRow[]
	isRate: boolean
	limit: number
	reference?: number | null
	referenceLabel?: string
	ariaLabel: string
	valueLabel: string
	format: (value: number | null) => string
}) {
	const [ref, width] = useMeasuredWidth()
	const [hover, setHover] = useState<number | null>(null)

	const shown = rows.slice(0, limit)
	const plotHeight = shown.length * ROW_HEIGHT
	const height = plotHeight + PAD.top + AXIS_BAND
	const labelWidth = Math.min(LABEL_WIDTH, Math.max(100, width * 0.34))
	const innerWidth = Math.max(60, width - labelWidth - 64)

	const values = shown.map((r) => r.value).filter((v): v is number => v != null && v > 0)
	const max = Math.max(...values, reference ?? 0, isRate ? 0.1 : 1)
	const step = isRate ? niceRateStep(max) : niceCountStep(max)
	const top = Math.max(step, Math.ceil(max / step) * step)
	const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

	const xAt = (value: number) => labelWidth + (value / top) * innerWidth
	const yAt = (i: number) => PAD.top + i * ROW_HEIGHT

	return (
		<div className="wd-chart" ref={ref}>
			<svg width={width} height={height} role="img" aria-label={ariaLabel}>
				{ticks.map((tick) => (
					<g key={tick}>
						<line
							className="wd-grid"
							x1={xAt(tick)}
							x2={xAt(tick)}
							y1={PAD.top}
							y2={PAD.top + plotHeight}
						/>
						<text
							className="wd-axis-text"
							x={xAt(tick)}
							y={PAD.top + plotHeight + 16}
							textAnchor="middle"
						>
							{isRate ? formatPercent(tick, 0) : formatCount(tick)}
						</text>
					</g>
				))}

				{shown.map((row, i) => {
					const barWidth = row.value == null ? 0 : Math.max(0, xAt(row.value) - labelWidth)
					return (
						<g key={row.id} style={{ color: "var(--series-1)" }}>
							<text
								className="wd-row-label"
								x={labelWidth - 10}
								y={yAt(i) + ROW_HEIGHT / 2 + 4}
								textAnchor="end"
							>
								{row.prefix ? (
									<tspan className="wd-row-prefix">{`${row.prefix}  `}</tspan>
								) : null}
								{truncate(row.label, row.prefix ? 26 : 34)}
							</text>
							{barWidth > 0 ? (
								<>
									<rect
										className={`wd-bar${hover === i ? " is-hover" : ""}`}
										x={labelWidth}
										y={yAt(i) + (ROW_HEIGHT - BAR_THICKNESS) / 2}
										width={barWidth}
										height={BAR_THICKNESS}
										rx={4}
									/>
									{/* Square the baseline end; only the data end is rounded. */}
									<rect
										className={`wd-bar${hover === i ? " is-hover" : ""}`}
										x={labelWidth}
										y={yAt(i) + (ROW_HEIGHT - BAR_THICKNESS) / 2}
										width={Math.min(4, barWidth)}
										height={BAR_THICKNESS}
									/>
								</>
							) : null}
							<text
								className="wd-cap-label"
								x={labelWidth + barWidth + 8}
								y={yAt(i) + ROW_HEIGHT / 2 + 4}
							>
								{format(row.value)}
							</text>
							{/* Hit target covers the whole row, not the painted bar. */}
							<rect
								className="wd-hit"
								x={0}
								y={yAt(i)}
								width={Math.max(width, 1)}
								height={ROW_HEIGHT}
								onPointerEnter={() => setHover(i)}
								onPointerLeave={() => setHover((prev) => (prev === i ? null : prev))}
							/>
						</g>
					)
				})}

				{reference != null && reference > 0 && reference <= top ? (
					<g>
						<line
							className="wd-reference"
							x1={xAt(reference)}
							x2={xAt(reference)}
							y1={PAD.top - 8}
							y2={PAD.top + plotHeight}
						/>
						<text className="wd-reference-label" x={xAt(reference) + 4} y={PAD.top - 12}>
							{`${referenceLabel ?? "Aggregate"} ${format(reference)}`}
						</text>
					</g>
				) : null}

				<line
					className="wd-baseline"
					x1={labelWidth}
					x2={labelWidth}
					y1={PAD.top}
					y2={PAD.top + plotHeight}
				/>
			</svg>

			{hover !== null && shown[hover] ? (
				<Tooltip
					anchor={Math.min(labelWidth + innerWidth / 2, width)}
					width={width}
					top={yAt(hover) + ROW_HEIGHT}
					title={shown[hover].tooltipTitle}
					rows={[
						{
							cssVar: "--series-1",
							label: valueLabel,
							value: format(shown[hover].value),
						},
					]}
					footer={shown[hover].tooltipFooter}
				/>
			) : null}
		</div>
	)
}

/** Long labels stay complete in the tooltip and the table view. */
function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

function Legend({ series }: { series: SeriesSpec[] }) {
	return (
		<ul className="wd-legend">
			{series.map(({ key, label, cssVar }) => (
				<li key={key}>
					<span className="wd-key" style={{ color: `var(${cssVar})` }} aria-hidden="true" />
					{label}
				</li>
			))}
		</ul>
	)
}

/**
 * Values lead, series names follow — the reader already knows which series
 * they care about and wants the number.
 */
function Tooltip({
	anchor,
	width,
	top,
	title,
	rows,
	footer,
}: {
	anchor: number
	width: number
	top?: number
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
		<div className="wd-tooltip" ref={ref} style={{ left, top }} role="status">
			<div className="wd-tooltip-title">{title}</div>
			{rows.map((row) => (
				<div className="wd-tooltip-row" key={row.label}>
					<span className="wd-key" style={{ color: `var(${row.cssVar})` }} aria-hidden="true" />
					<span className="wd-tooltip-value">{row.value}</span>
					<span className="wd-tooltip-label">{row.label}</span>
				</div>
			))}
			{footer ? <div className="wd-tooltip-footer">{footer}</div> : null}
		</div>
	)
}
