import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
	breakdownBucket,
	bucketizeDays,
	dedupeByDay,
	delta,
	filterDays,
	formatDuration,
	formatPercent,
	formatSpan,
	groupPages,
	pageGroup,
	previousDays,
	rankPages,
	summarizeChannels,
	summarizeDays,
	summarizePages,
	summarizeSources,
	untaggedShare,
	type ChannelRow,
	type DailyRow,
	type PageRow,
} from "../blocks/website-dashboard/src/aggregate.ts"
import {
	MOCK_CHANNELS,
	MOCK_DAYS,
	MOCK_PAGES,
} from "../blocks/website-dashboard/src/mock.ts"

/**
 * The fixtures are a verbatim snapshot of the three bound data sources taken
 * 2026-08-03, so the figures below were measured rather than invented. That is
 * what stops the block's premise rotting quietly: if someone "simplifies"
 * `summarizeDays` into averaging the stored per-day rates, these numbers move.
 */

function day(overrides: Partial<DailyRow> & { day: string }): DailyRow {
	return {
		id: overrides.day + (overrides.id ?? ""),
		sessions: 0,
		engagedSessions: 0,
		avgSessionDuration: 0,
		views: 0,
		totalUsers: 0,
		newUsers: 0,
		keyEvents: 0,
		createdAt: null,
		...overrides,
	}
}

function channel(overrides: Partial<ChannelRow> & { channel: string }): ChannelRow {
	return {
		id: Math.random().toString(36),
		day: "2026-07-01",
		source: "(direct)",
		medium: "(none)",
		sessions: 0,
		engagedSessions: 0,
		newUsers: 0,
		engagementSeconds: 0,
		...overrides,
	}
}

function page(overrides: Partial<PageRow> & { path: string }): PageRow {
	return {
		id: overrides.path,
		pageType: "Blog Post",
		views: 0,
		users: 0,
		engagementSeconds: 0,
		views28: 0,
		users28: 0,
		engagementSeconds28: 0,
		matched: false,
		sourceTitle: "",
		...overrides,
	}
}

describe("dedupeByDay", () => {
	it("collapses the duplicate rows siteDailyDelta creates each run", () => {
		const set = dedupeByDay(MOCK_DAYS)

		// 124 rows for 113 calendar days: the delta re-inserts its four-day
		// lookback window every six hours instead of upserting.
		assert.equal(MOCK_DAYS.length, 124)
		assert.equal(set.days.length, 113)
		assert.equal(set.duplicates, 11)
		assert.equal(set.undated, 0)
	})

	it("returns days in calendar order", () => {
		const set = dedupeByDay(MOCK_DAYS)
		assert.equal(set.days[0].day, "2026-04-12")
		assert.equal(set.days.at(-1)?.day, "2026-08-02")
		for (let i = 1; i < set.days.length; i += 1) {
			assert.ok((set.days[i - 1].day ?? "") < (set.days[i].day ?? ""))
		}
	})

	it("keeps the newest write when a day appears twice", () => {
		const set = dedupeByDay([
			day({ day: "2026-07-01", id: "-old", sessions: 10, createdAt: "2026-07-02T00:00" }),
			day({ day: "2026-07-01", id: "-new", sessions: 14, createdAt: "2026-07-03T00:00" }),
		])
		assert.equal(set.days.length, 1)
		// GA4 revises recent days as late hits land, so the latest sync wins.
		assert.equal(set.days[0].sessions, 14)
	})

	it("prefers any dated row over one with no creation time", () => {
		const set = dedupeByDay([
			day({ day: "2026-07-01", id: "-blank", sessions: 3, createdAt: null }),
			day({ day: "2026-07-01", id: "-real", sessions: 9, createdAt: "2026-07-02T00:00" }),
		])
		assert.equal(set.days[0].sessions, 9)
	})

	it("counts undated rows separately instead of dropping them silently", () => {
		const set = dedupeByDay([day({ day: "2026-07-01" }), { ...day({ day: "x" }), day: null }])
		assert.equal(set.days.length, 1)
		assert.equal(set.undated, 1)
		assert.equal(set.duplicates, 0)
	})
})

describe("summarizeDays", () => {
	const days = dedupeByDay(MOCK_DAYS).days
	const totals = summarizeDays(days)

	it("sums the additive counters", () => {
		assert.equal(totals.days, 113)
		assert.equal(totals.sessions, 2043)
		assert.equal(totals.engagedSessions, 673)
		assert.equal(totals.views, 3120)
		assert.equal(totals.newUsers, 1595)
	})

	it("reports engagement rate as Σ engaged ÷ Σ sessions, not a mean of means", () => {
		const naive =
			days.reduce((sum, d) => sum + (d.sessions ? d.engagedSessions / d.sessions : 0), 0) /
			days.length

		assert.equal(totals.engagementRate, 673 / 2043)
		assert.equal(formatPercent(totals.engagementRate), "32.9%")
		// Small on this dataset — 0.27pp — but wrong in the same direction a
		// native Notion chart would be, and it grows with the spread of daily
		// session counts (which here run from 3 to 78).
		assert.equal(naive.toFixed(6), "0.326715")
		assert.notEqual(naive, totals.engagementRate)
	})

	it("weights average session duration by sessions", () => {
		const naive =
			days.reduce((sum, d) => sum + d.avgSessionDuration, 0) / days.length

		assert.equal(totals.avgSessionDuration?.toFixed(4), "125.4946")
		assert.equal(naive.toFixed(4), "119.0268")
		// This is the gap that actually matters here: 5.4% site-wide, and 16%
		// in May, because the quiet days carry long outlier durations.
		assert.ok((totals.avgSessionDuration! - naive) / naive > 0.05)
		assert.equal(formatDuration(totals.avgSessionDuration), "2m 05s")
	})

	it("carries per-day unique users as user-days, never as a users total", () => {
		// 1,831 user-days across 113 days. Unique visitors is a smaller,
		// unknowable-from-here number; the name is the guard rail.
		assert.equal(totals.userDays, 1831)
		assert.ok(totals.userDays > 0)
		assert.ok(!("users" in totals))
	})

	it("reports the zero key events honestly rather than hiding the metric", () => {
		// No GA4 key event has ever fired on this property, so every Key Events
		// column is 0. A dashboard that quietly dropped the metric would read as
		// "not measured" instead of "measured, and it's nothing".
		assert.equal(totals.keyEvents, 0)
	})

	it("yields null, not zero, when there is no denominator", () => {
		const empty = summarizeDays([])
		assert.equal(empty.engagementRate, null)
		assert.equal(empty.avgSessionDuration, null)
		assert.equal(empty.viewsPerSession, null)
		assert.equal(formatPercent(empty.engagementRate), "—")
		assert.equal(formatDuration(empty.avgSessionDuration), "—")
	})
})

describe("filterDays and bucketizeDays", () => {
	const days = dedupeByDay(MOCK_DAYS).days

	it("filters to the trailing window, exclusive of its far edge", () => {
		const window = filterDays(days, "28d", "2026-08-02")
		assert.equal(window.length, 28)
		assert.equal(window[0].day, "2026-07-06")
		assert.equal(window.at(-1)?.day, "2026-08-02")
	})

	it("withholds the prior window when the data doesn't span it", () => {
		// The property was created 2026-04-12. "The previous 90 days" reaches
		// back to February, so comparing against it would report a ~296% jump
		// that is entirely an artefact of the data starting.
		assert.equal(previousDays(days, "90d", "2026-08-03"), null)
		// 28 days back lands on 2026-06-08, which the data does cover.
		assert.equal(previousDays(days, "28d", "2026-08-03")?.length, 28)
		assert.equal(previousDays(days, "all", "2026-08-03"), null)
	})

	it("buckets by week and month without inventing empty periods", () => {
		assert.equal(bucketizeDays(days, "week").length, 17)
		assert.equal(bucketizeDays(days, "month").length, 5)
	})

	it("leaves a gap rather than a zero when a period has no data", () => {
		const buckets = bucketizeDays(
			[day({ day: "2026-06-01", sessions: 5 }), day({ day: "2026-08-01", sessions: 5 })],
			"month",
		)
		// June and August, no July. A zero-traffic July bucket would draw the
		// line to the floor and invent a collapse that never happened.
		assert.deepEqual(
			buckets.map((b) => b.key),
			["2026-06", "2026-08"],
		)
	})

	it("aggregates within a bucket the same way the totals do", () => {
		const buckets = bucketizeDays(
			[
				day({ day: "2026-07-01", sessions: 100, engagedSessions: 10, avgSessionDuration: 10 }),
				day({ day: "2026-07-02", sessions: 1, engagedSessions: 1, avgSessionDuration: 500 }),
			],
			"month",
		)
		// Mean of the two rates would be 55%; the real rate is 11/101.
		assert.equal(buckets[0].engagementRate, 11 / 101)
		assert.equal(buckets[0].avgSessionDuration, (100 * 10 + 1 * 500) / 101)
	})
})

describe("summarizeChannels", () => {
	const channels = summarizeChannels(MOCK_CHANNELS)

	it("ranks by sessions and recomputes each channel's rate from its counts", () => {
		assert.equal(channels[0].channel, "Direct")
		assert.equal(channels[0].sessions, 1220)
		assert.equal(channels[0].engagementRate, 345 / 1220)
	})

	it("shows the biggest channel is also the least engaged", () => {
		// The finding the block exists to surface: ~59% of sessions arrive with
		// no attribution *and* engage worst. Asserted against a frozen fixture,
		// so this documents the snapshot rather than predicting the future.
		const worst = [...channels].sort(
			(a, b) => (a.engagementRate ?? 1) - (b.engagementRate ?? 1),
		)[0]
		assert.equal(worst.channel, "Direct")
		assert.equal(channels[0].channel, worst.channel)
		assert.ok(channels[0].share! > 0.5)

		const search = channels.find((c) => c.channel === "Organic Search")!
		assert.ok(search.engagementRate! > worst.engagementRate! * 1.5)
	})

	it("computes shares against the same window's total", () => {
		const total = channels.reduce((sum, c) => sum + c.share!, 0)
		assert.ok(Math.abs(total - 1) < 1e-9)
	})

	it("measures how much of the window has no usable attribution", () => {
		const untagged = untaggedShare(MOCK_CHANNELS)
		assert.equal(untagged.sessions, 1311)
		assert.equal(formatPercent(untagged.share), "63.8%")
	})
})

describe("summarizeSources", () => {
	it("names a source/medium pair by the channel holding most of its sessions", () => {
		const sources = summarizeSources([
			channel({ channel: "Organic Social", source: "linkedin.com", medium: "referral", sessions: 9 }),
			channel({ channel: "Referral", source: "linkedin.com", medium: "referral", sessions: 2 }),
		])
		assert.equal(sources.length, 1)
		assert.equal(sources[0].channel, "Organic Social")
		assert.equal(sources[0].sessions, 11)
	})

	it("keeps the two LinkedIn spellings apart, because GA4 does", () => {
		const sources = summarizeSources(MOCK_CHANNELS)
		const dotCom = sources.find((s) => s.id === "linkedin.com|referral")
		const bare = sources.find((s) => s.id === "linkedin|social")
		assert.ok(dotCom && bare)
		assert.notEqual(dotCom.sessions, bare.sessions)
	})
})

describe("page triage", () => {
	it("separates orphaned pages from ones the CMS generates", () => {
		assert.equal(pageGroup(page({ path: "/about-us", matched: true, pageType: "Static Page" })), "matched")
		// Bullet emits a page per tag and per author; nothing authors them, so
		// they are correctly unmatched and are not a worklist.
		assert.equal(pageGroup(page({ path: "/blog/tags/notion", pageType: "Blog Tag" })), "generated")
		assert.equal(pageGroup(page({ path: "/blog/authors/x", pageType: "Blog Author" })), "generated")
		// A post or a static page with no Notion record is a renamed slug or a
		// gap in the content inventory — that one is worth acting on.
		assert.equal(pageGroup(page({ path: "/legal/msa", pageType: "Static Page" })), "missingSource")
		assert.equal(pageGroup(page({ path: "/blog/slackgpt", pageType: "Blog Post" })), "missingSource")
	})

	it("splits the snapshot into a short worklist and a pile of noise", () => {
		const groups = groupPages(MOCK_PAGES)
		assert.equal(groups.matched.length, 61)
		assert.equal(groups.missingSource.length, 19)
		assert.equal(groups.generated.length, 28)
		// The distinction earns its keep: 28 of the 47 unmatched rows are noise.
		assert.equal(summarizePages(groups.missingSource).views, 165)
		assert.equal(summarizePages(groups.generated).views, 261)
	})

	it("recomputes engaged seconds per view instead of reading the stored mean", () => {
		const ranked = rankPages(
			[page({ path: "/a", views: 100, engagementSeconds: 500 })],
			"secondsPerView",
		)
		assert.equal(ranked[0].secondsPerView, 5)
	})

	it("sorts unknown rates last, in either direction", () => {
		const ranked = rankPages(
			[
				page({ path: "/none", views: 0, engagementSeconds: 0 }),
				page({ path: "/some", views: 10, engagementSeconds: 20 }),
			],
			"secondsPerView",
		)
		assert.equal(ranked[0].path, "/some")
		assert.equal(ranked[1].secondsPerView, null)
	})

	it("has no users total, because per-page uniques don't add up", () => {
		const totals = summarizePages(MOCK_PAGES)
		assert.ok(!("users" in totals))
		assert.equal(totals.views, 3120)
		// Both reports independently agree on lifetime views, which is a free
		// cross-check that the page rollup and the daily summary are in sync.
		assert.equal(totals.views, summarizeDays(dedupeByDay(MOCK_DAYS).days).views)
	})
})

describe("delta", () => {
	it("is null unless both sides are known and the prior is non-zero", () => {
		assert.equal(delta(0.5, null), null)
		assert.equal(delta(null, 0.5), null)
		assert.equal(delta(0.5, 0), null)
		assert.ok(Math.abs(delta(0.6, 0.5)! - 0.2) < 1e-12)
	})
})

describe("formatDuration", () => {
	it("keeps sub-minute values in seconds", () => {
		assert.equal(formatDuration(48), "48s")
		assert.equal(formatDuration(0), "0s")
		assert.equal(formatDuration(125.4946), "2m 05s")
		assert.equal(formatDuration(3600), "60m 00s")
		assert.equal(formatDuration(null), "—")
	})
})

describe("breakdownBucket", () => {
	const days = dedupeByDay(MOCK_DAYS).days

	it("explains the spike week: the newsletter, not a general lift", () => {
		// The tallest bar in the weekly chart. Its breakdown is the point of the
		// drill-down: 54 of the 274 sessions came in on one email campaign.
		const spike = breakdownBucket(days, MOCK_CHANNELS, "week", "2026-06-29")!
		assert.equal(spike.bucket.sessions, 274)
		assert.equal(spike.attributedSessions, 274)
		assert.deepEqual(
			spike.channels.slice(0, 2).map((c) => [c.channel, c.sessions]),
			[
				["Direct", 129],
				["Email", 54],
			],
		)
		const email = spike.sources.find((s) => s.medium === "email")
		assert.equal(email?.source, "workflowers")
		assert.equal(email?.sessions, 54)
		// And the day-by-day split shows where inside the week it landed.
		assert.equal(spike.days.find((d) => d.key === "2026-07-02")?.sessions, 77)
	})

	it("splits a period into its own days, which add back up to the bar", () => {
		for (const bucket of bucketizeDays(days, "week")) {
			const drill = breakdownBucket(days, MOCK_CHANNELS, "week", bucket.key)!
			const sum = drill.days.reduce((total, d) => total + d.sessions, 0)
			assert.equal(sum, bucket.sessions, bucket.key)
			assert.equal(drill.bucket.sessions, bucket.sessions, bucket.key)
		}
	})

	it("recomputes the period's rates from its own counts", () => {
		const drill = breakdownBucket(days, MOCK_CHANNELS, "week", "2026-06-29")!
		const [bucket] = bucketizeDays(
			days.filter((d) => d.day! >= "2026-06-29" && d.day! <= "2026-07-05"),
			"week",
		)
		assert.equal(drill.bucket.engagementRate, bucket.engagementRate)
		assert.equal(drill.bucket.avgSessionDuration, bucket.avgSessionDuration)
	})

	it("reports a partial period against its full length", () => {
		// Data starts 2026-04-12 and the snapshot ends 2026-08-02, so both ends
		// of the monthly chart are partial and must not read as whole months.
		const april = breakdownBucket(days, MOCK_CHANNELS, "month", "2026-04")!
		assert.equal(april.firstDay, "2026-04-12")
		assert.equal(april.days.length, 19)
		assert.equal(april.periodDays, 30)
		const august = breakdownBucket(days, MOCK_CHANNELS, "month", "2026-08")!
		assert.equal(august.days.length, 2)
		assert.equal(august.periodDays, 31)
	})

	it("keeps the acquisition total separate when the two reports disagree", () => {
		// Recent days carry GA4 sessions still marked (not set) in the
		// source/medium report, so its total runs ahead of Site Daily's. The
		// drill-down has to say so rather than pass the channel split off as
		// the whole bar.
		const last = breakdownBucket(days, MOCK_CHANNELS, "week", "2026-07-27")!
		assert.equal(last.bucket.sessions, 115)
		assert.equal(last.attributedSessions, 128)
	})

	it("has no day split for a bar that is already one day", () => {
		const one = breakdownBucket(days, MOCK_CHANNELS, "day", "2026-07-02")!
		assert.equal(one.bucket.sessions, 77)
		assert.deepEqual(one.days, [])
		assert.equal(one.periodDays, 1)
	})

	it("is null for a period with no days", () => {
		assert.equal(breakdownBucket(days, MOCK_CHANNELS, "week", "2025-01-06"), null)
		assert.equal(breakdownBucket(days, [], "week", "2026-06-29")?.attributedSessions, 0)
	})
})

describe("formatSpan", () => {
	it("names a range compactly, without a timezone shift", () => {
		assert.equal(formatSpan("2026-07-13", "2026-07-19"), "13–19 Jul")
		assert.equal(formatSpan("2026-07-27", "2026-08-02"), "27 Jul – 2 Aug")
		assert.equal(formatSpan("2026-07-02", "2026-07-02"), "2 Jul")
	})
})
