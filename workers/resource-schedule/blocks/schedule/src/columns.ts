/**
 * The date axis: which columns the grid shows for a timescale, how wide each
 * is, and where a booking's bar starts and ends in pixels. Pure, so it is
 * testable and the grid stays layout-only.
 */

import { addDays, dayRange, isWeekend, mondayOf } from "./model.ts"

export type Scale = "day" | "week"

export type Column = {
	key: string
	from: string
	/** Inclusive. */
	to: string
	width: number
	weekend: boolean
	/** First column of a week, for the heavier gridline and the week header. */
	weekStart: boolean
}

export const DAY_WIDTH = 52
export const WEEKEND_WIDTH = 18
export const WEEK_WIDTH = 92
export const DAY_WEEKS = 4
export const WEEK_WEEKS = 12

export function columnsFor(scale: Scale, anchor: string): Column[] {
	const monday = mondayOf(anchor)
	if (scale === "week") {
		return Array.from({ length: WEEK_WEEKS }, (_, i) => {
			const from = addDays(monday, i * 7)
			return { key: from, from, to: addDays(from, 6), width: WEEK_WIDTH, weekend: false, weekStart: true }
		})
	}
	return dayRange(monday, DAY_WEEKS * 7).map((d, i) => ({
		key: d,
		from: d,
		to: d,
		width: isWeekend(d) ? WEEKEND_WIDTH : DAY_WIDTH,
		weekend: isWeekend(d),
		weekStart: i % 7 === 0,
	}))
}

/** How far the anchor moves for one press of ‹ or ›. */
export function stepDays(scale: Scale): number {
	return scale === "week" ? 28 : 7
}

export function totalWidth(cols: readonly Column[]): number {
	return cols.reduce((s, c) => s + c.width, 0)
}

/** Pixel span of [start, end] on the axis, clipped to it; null if it's off-screen. */
export function barSpan(
	cols: readonly Column[],
	start: string,
	end: string,
): { left: number; width: number; clippedLeft: boolean; clippedRight: boolean } | null {
	if (cols.length === 0) return null
	const first = cols[0].from
	const last = cols[cols.length - 1].to
	if (end < first || start > last) return null
	let left = 0
	let right = 0
	let x = 0
	let seenStart = false
	for (const c of cols) {
		if (!seenStart && c.to >= start) {
			left = x
			seenStart = true
		}
		if (c.from <= end) right = x + c.width
		x += c.width
	}
	return { left, width: Math.max(8, right - left), clippedLeft: start < first, clippedRight: end > last }
}

/** The column under a pixel offset, for drag-to-move. */
export function columnAt(cols: readonly Column[], px: number): Column | null {
	let x = 0
	for (const c of cols) {
		if (px < x + c.width) return c
		x += c.width
	}
	return null
}
