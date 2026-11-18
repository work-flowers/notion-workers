import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { barSpan, columnAt, totalWidth, type Column, type Scale } from "./columns.ts"
import { addDays, daysBetween, weekday } from "./model.ts"

export type CellTone = "free" | "partial" | "full" | "over" | "overflow" | "none"

export type CellSpec = { text: string; tone: CellTone; title?: string }

export type BarSpec = {
	id: string
	start: string
	end: string
	label: string
	sublabel?: string
	color: string | null
	selected?: boolean
	placeholder?: boolean
	draggable?: boolean
}

export type GridRow = {
	key: string
	kind: "person" | "overflow" | "job" | "client" | "sub"
	label: ReactNode
	sublabel?: ReactNode
	badge?: ReactNode
	expandable?: boolean
	expanded?: boolean
	highlight?: boolean
	/** One per column. Omitted for rows that only carry bars. */
	cells?: CellSpec[]
	bars?: BarSpec[]
}

type Props = {
	scale: Scale
	cols: Column[]
	rows: GridRow[]
	today: string
	onToggle: (key: string) => void
	onBarClick: (bookingId: string) => void
	/** Drag-to-move. `days` is the calendar-day shift; the caller re-rolls weekends. */
	onBarMove: (bookingId: string, days: number) => void
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS = ["M", "T", "W", "T", "F", "S", "S"]

function fmtDay(iso: string): string {
	const [, m, d] = iso.split("-").map(Number)
	return `${d} ${MONTHS[m - 1]}`
}

type Drag = { id: string; originX: number; originCol: Column; days: number; moved: boolean }

export function Grid({ scale, cols, rows, today, onToggle, onBarClick, onBarMove }: Props) {
	const width = totalWidth(cols)
	const [drag, setDrag] = useState<Drag | null>(null)
	const dragRef = useRef<Drag | null>(null)

	function startDrag(e: ReactPointerEvent<HTMLButtonElement>, bar: BarSpec) {
		if (!bar.draggable || e.button !== 0) return
		const track = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
		const col = columnAt(cols, e.clientX - track.left)
		if (col === null) return
		// No pointer capture yet: capturing on pointerdown swallows the click in
		// some hosts. It starts in moveDrag once the pointer has really moved.
		dragRef.current = { id: bar.id, originX: e.clientX, originCol: col, days: 0, moved: false }
	}

	function moveDrag(e: ReactPointerEvent<HTMLButtonElement>) {
		const d = dragRef.current
		if (d === null) return
		if (e.buttons === 0) {
			// The button was released somewhere else before any drag started.
			dragRef.current = null
			if (d.moved) setDrag(null)
			return
		}
		const track = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
		const col = columnAt(cols, Math.min(Math.max(0, e.clientX - track.left), width - 1))
		const moved = d.moved || Math.abs(e.clientX - d.originX) > 4
		if (moved && !d.moved) e.currentTarget.setPointerCapture(e.pointerId)
		const days = col === null ? d.days : daysBetween(d.originCol.from, col.from)
		if (days !== d.days || moved !== d.moved) {
			const next = { ...d, days, moved }
			dragRef.current = next
			setDrag(next)
		}
	}

	/** Set when a drag actually moved, so the click that follows pointerup doesn't also open the editor. */
	const suppressClick = useRef(false)

	function endDrag(bar: BarSpec) {
		const d = dragRef.current
		dragRef.current = null
		setDrag(null)
		if (d === null || !d.moved) return
		suppressClick.current = true
		if (d.days !== 0) onBarMove(bar.id, d.days)
	}

	function click(bar: BarSpec) {
		if (suppressClick.current) {
			suppressClick.current = false
			return
		}
		onBarClick(bar.id)
	}

	return (
		<div className="rs-grid" role="grid">
			<div className="rs-head" role="row">
				<div className="rs-name rs-name--head" />
				<div className="rs-track rs-track--head" style={{ width }}>
					{cols.map((c) => (
						<div
							key={c.key}
							className={`rs-hcell${c.weekend ? " rs-hcell--weekend" : ""}${c.weekStart ? " rs-hcell--weekstart" : ""}${
								today >= c.from && today <= c.to ? " rs-hcell--today" : ""
							}`}
							style={{ width: c.width }}
						>
							{scale === "week" ? (
								<>
									<span className="rs-hcell-top">Week of</span>
									<span className="rs-hcell-bottom">{fmtDay(c.from)}</span>
								</>
							) : c.weekend ? null : (
								<>
									<span className="rs-hcell-top">{weekday(c.from) === 0 ? fmtDay(c.from) : ""}</span>
									<span className="rs-hcell-bottom">
										{DAYS[weekday(c.from)]} {Number(c.from.slice(8))}
									</span>
								</>
							)}
						</div>
					))}
				</div>
			</div>

			{rows.map((row) => (
				<div
					key={row.key}
					role="row"
					className={`rs-row rs-row--${row.kind}${row.highlight ? " rs-row--highlight" : ""}${row.expanded ? " rs-row--expanded" : ""}`}
				>
					<div className="rs-name">
						{row.expandable ? (
							<button
								type="button"
								className="rs-toggle"
								aria-expanded={row.expanded}
								aria-label={row.expanded ? "Collapse" : "Expand"}
								onClick={() => onToggle(row.key)}
							>
								<span className={`rs-caret${row.expanded ? " rs-caret--open" : ""}`}>›</span>
							</button>
						) : (
							<span className="rs-toggle-spacer" />
						)}
						<div className="rs-name-text" onClick={row.expandable ? () => onToggle(row.key) : undefined}>
							<div className="rs-name-label">{row.label}</div>
							{row.sublabel ? <div className="rs-name-sub">{row.sublabel}</div> : null}
						</div>
						{row.badge}
					</div>
					<div className="rs-track" style={{ width }}>
						{cols.map((c, i) => {
							const cell = row.cells?.[i]
							return (
								<div
									key={c.key}
									className={`rs-cell${c.weekend ? " rs-cell--weekend" : ""}${c.weekStart ? " rs-cell--weekstart" : ""}${
										cell ? ` rs-heat rs-heat--${cell.tone}` : ""
									}`}
									style={{ width: c.width }}
									title={cell?.title}
								>
									{cell && !c.weekend ? cell.text : null}
								</div>
							)
						})}
						{row.bars?.map((bar) => {
							const shift = drag?.id === bar.id ? drag.days : 0
							const span = barSpan(cols, addDays(bar.start, shift), addDays(bar.end, shift))
							if (span === null) return null
							return (
								<button
									type="button"
									key={bar.id}
									className={`rs-bar${bar.placeholder ? " rs-bar--placeholder" : ""}${bar.selected ? " rs-bar--selected" : ""}${
										drag?.id === bar.id && drag.moved ? " rs-bar--dragging" : ""
									}${span.clippedLeft ? " rs-bar--clip-left" : ""}${span.clippedRight ? " rs-bar--clip-right" : ""}`}
									data-color={bar.color ?? "gray"}
									style={{ left: span.left + 1, width: span.width - 2 }}
									title={`${bar.label}${bar.sublabel ? ` — ${bar.sublabel}` : ""}`}
									onPointerDown={(e) => startDrag(e, bar)}
									onPointerMove={moveDrag}
									onPointerUp={() => endDrag(bar)}
									onPointerCancel={() => {
										dragRef.current = null
										setDrag(null)
									}}
									onClick={() => click(bar)}
								>
									<span className="rs-bar-label">{bar.label}</span>
									{bar.sublabel ? <span className="rs-bar-sub">{bar.sublabel}</span> : null}
								</button>
							)
						})}
					</div>
				</div>
			))}
		</div>
	)
}
