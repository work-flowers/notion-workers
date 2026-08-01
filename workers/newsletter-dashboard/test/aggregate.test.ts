import assert from "node:assert/strict"
import test from "node:test"

import {
	addDays,
	bucketize,
	delta,
	filterByRange,
	formatPercent,
	previousWindow,
	rankIssues,
	summarize,
	type Send,
} from "../blocks/newsletter-dashboard/src/aggregate.ts"

function send(partial: Partial<Send> & { id: string }): Send {
	return {
		subject: partial.id,
		sentOn: "2026-07-01",
		deliveries: 0,
		opens: 0,
		clicks: 0,
		unsubscribes: 0,
		...partial,
	}
}

test("aggregate rates divide summed counts, not averaged ratios", () => {
	// A big send at 10% and a small one at 50%. The true combined rate is
	// 60/600 = 10%, not the 30% a mean-of-ratios would report.
	const rows = [
		send({ id: "big", deliveries: 500, opens: 250, clicks: 50 }),
		send({ id: "small", deliveries: 100, opens: 60, clicks: 10 }),
	]
	const totals = summarize(rows)

	assert.equal(totals.deliveries, 600)
	assert.equal(totals.clicks, 60)
	assert.equal(totals.clickRate, 0.1)

	const meanOfRatios = (50 / 500 + 10 / 100) / 2
	assert.equal(meanOfRatios, 0.1) // equal here only because both are 10%

	const skewed = summarize([
		send({ id: "big", deliveries: 1000, opens: 500, clicks: 20 }),
		send({ id: "tiny", deliveries: 10, opens: 8, clicks: 5 }),
	])
	assert.equal(skewed.clickRate, 25 / 1010)
	const skewedMean = (20 / 1000 + 5 / 10) / 2
	assert.ok(
		skewedMean > (skewed.clickRate ?? 0) * 10,
		"mean-of-ratios should be wildly inflated by the tiny send",
	)
})

test("real Buttondown figures: aggregate click rate is not the row-level mean", () => {
	// The 12 sends currently in Email Analytics.
	const rows: Send[] = [
		[176, 88, 18],
		[180, 101, 26],
		[169, 98, 20],
		[55, 37, 1],
		[54, 34, 3],
		[54, 35, 2],
		[54, 40, 3],
		[52, 36, 5],
		[50, 35, 3],
		[51, 34, 8],
		[51, 38, 4],
		[49, 0, 0],
	].map(([deliveries, opens, clicks], i) =>
		send({ id: `s${i}`, deliveries, opens, clicks }),
	)

	const totals = summarize(rows)
	assert.equal(totals.deliveries, 995)
	assert.equal(totals.clicks, 93)
	assert.equal(totals.opens, 576)
	assert.equal(formatPercent(totals.clickRate), "9.3%")
	assert.equal(formatPercent(totals.openRate), "57.9%")
	assert.equal(formatPercent(totals.clickToOpenRate), "16.1%")

	const rowMean =
		rows.reduce((sum, r) => sum + r.clicks / r.deliveries, 0) / rows.length
	assert.equal(formatPercent(rowMean), "7.7%")
})

test("rates are null, never zero, when the denominator is missing", () => {
	const totals = summarize([send({ id: "unsent", deliveries: 0 })])
	assert.equal(totals.openRate, null)
	assert.equal(totals.clickRate, null)
	assert.equal(totals.clickToOpenRate, null)
	assert.equal(formatPercent(totals.clickRate), "—")
})

test("a delivered send with zero opens is counted, not dropped", () => {
	const totals = summarize([
		send({ id: "tracked", deliveries: 100, opens: 50, clicks: 5 }),
		send({ id: "untracked", deliveries: 50, opens: 0, clicks: 0 }),
	])
	assert.equal(totals.untrackedSends, 1)
	assert.equal(totals.deliveries, 150)
	assert.equal(totals.openRate, 50 / 150)
})

test("weeks start on Monday and don't drift across timezones", () => {
	const rows = [
		send({ id: "sun", sentOn: "2026-07-05", deliveries: 10 }), // Sunday
		send({ id: "mon", sentOn: "2026-07-06", deliveries: 10 }), // Monday
		send({ id: "sat", sentOn: "2026-07-11", deliveries: 10 }), // Saturday
	]
	const weeks = bucketize(rows, "week")
	assert.deepEqual(
		weeks.map((w) => w.key),
		["2026-06-29", "2026-07-06"],
	)
	assert.deepEqual(
		weeks.map((w) => w.sends),
		[1, 2],
	)
	assert.equal(weeks[1].label, "6 Jul")
})

test("months and quarters bucket and sort correctly", () => {
	const rows = [
		send({ id: "a", sentOn: "2026-01-15", deliveries: 10 }),
		send({ id: "b", sentOn: "2025-12-31", deliveries: 10 }),
		send({ id: "c", sentOn: "2026-01-02", deliveries: 10 }),
	]
	assert.deepEqual(
		bucketize(rows, "month").map((b) => [b.key, b.label, b.sends]),
		[
			["2025-12", "Dec 2025", 1],
			["2026-01", "Jan 2026", 2],
		],
	)
	assert.deepEqual(
		bucketize(rows, "quarter").map((b) => [b.key, b.label, b.start]),
		[
			["2025-Q4", "Q4 2025", "2025-10-01"],
			["2026-Q1", "Q1 2026", "2026-01-01"],
		],
	)
})

test("periods with no sends produce no bucket, so the line gaps instead of hitting zero", () => {
	const rows = [
		send({ id: "may", sentOn: "2026-05-10", deliveries: 100, opens: 50 }),
		send({ id: "jul", sentOn: "2026-07-10", deliveries: 100, opens: 60 }),
	]
	const months = bucketize(rows, "month")
	assert.deepEqual(
		months.map((m) => m.key),
		["2026-05", "2026-07"],
	)
	assert.ok(months.every((m) => m.openRate !== 0))
})

test("range filter keeps the window inclusive of today, and undated rows are dropped", () => {
	const rows = [
		send({ id: "today", sentOn: "2026-08-01", deliveries: 1 }),
		send({ id: "edge", sentOn: "2026-05-04", deliveries: 1 }), // 89 days back
		send({ id: "old", sentOn: "2026-04-01", deliveries: 1 }),
		send({ id: "undated", sentOn: null, deliveries: 1 }),
	]
	assert.deepEqual(
		filterByRange(rows, "90d", "2026-08-01").map((s) => s.id),
		["today", "edge"],
	)
	assert.deepEqual(
		filterByRange(rows, "all", "2026-08-01").map((s) => s.id),
		["today", "edge", "old"],
	)
})

test("previous window is the equally long span before the current one", () => {
	const rows = [
		send({ id: "current", sentOn: "2026-07-15", deliveries: 1 }),
		send({ id: "prior", sentOn: "2026-04-15", deliveries: 1 }),
		send({ id: "ancient", sentOn: "2025-01-01", deliveries: 1 }),
	]
	assert.deepEqual(
		previousWindow(rows, "90d", "2026-08-01")?.map((s) => s.id),
		["prior"],
	)
	assert.equal(previousWindow(rows, "all", "2026-08-01"), null)
})

test("delta is relative change, and null when either side is unknown", () => {
	assert.ok(Math.abs((delta(0.12, 0.1) ?? 0) - 0.2) < 1e-9)
	assert.ok(Math.abs((delta(0.08, 0.1) ?? 0) + 0.2) < 1e-9)
	assert.equal(delta(null, 0.1), null)
	assert.equal(delta(0.1, null), null)
	assert.equal(delta(0.1, 0), null)
})

test("issues rank by the chosen metric, with unknown values last", () => {
	const rows = [
		send({ id: "mid", sentOn: "2026-07-01", deliveries: 100, opens: 50, clicks: 8 }),
		send({ id: "best", sentOn: "2026-07-02", deliveries: 50, opens: 30, clicks: 10 }),
		send({ id: "unsent", sentOn: "2026-07-03", deliveries: 0 }),
		send({ id: "worst", sentOn: "2026-07-04", deliveries: 200, opens: 90, clicks: 4 }),
	]

	// A 50-delivery send at 20% outranks a 200-delivery send at 2%: the ranking
	// is by rate, which is exactly why the chart shows the aggregate line.
	assert.deepEqual(
		rankIssues(rows, "clickRate").map((r) => r.id),
		["best", "mid", "worst", "unsent"],
	)
	assert.equal(rankIssues(rows, "clickRate")[3].clickRate, null)

	assert.deepEqual(
		rankIssues(rows, "deliveries").map((r) => r.id),
		["worst", "mid", "best", "unsent"],
	)

	// Click-to-open needs opens, not deliveries, to be defined.
	const noOpens = rankIssues(
		[send({ id: "delivered-unopened", deliveries: 40, opens: 0 })],
		"clickToOpenRate",
	)
	assert.equal(noOpens[0].clickToOpenRate, null)
})

test("equal metric values keep a stable, newest-first order", () => {
	const rows = [
		send({ id: "older", sentOn: "2026-06-01", deliveries: 100, opens: 50, clicks: 5 }),
		send({ id: "newer", sentOn: "2026-07-01", deliveries: 200, opens: 100, clicks: 10 }),
	]
	assert.deepEqual(
		rankIssues(rows, "clickRate").map((r) => r.id),
		["newer", "older"],
	)
})

test("addDays crosses month and year boundaries", () => {
	assert.equal(addDays("2026-03-01", -1), "2026-02-28")
	assert.equal(addDays("2026-01-01", -1), "2025-12-31")
	assert.equal(addDays("2024-03-01", -1), "2024-02-29")
})
