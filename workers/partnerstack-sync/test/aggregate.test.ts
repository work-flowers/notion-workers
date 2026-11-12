import assert from "node:assert/strict"
import { test } from "node:test"

import { normId, summarize } from "../blocks/program-summary/src/aggregate.ts"
import { MOCK_PAYOUTS, MOCK_PROGRAMS, MOCK_REWARDS } from "../blocks/program-summary/src/mock.ts"

// Figures are from the fictional fixture in mock.ts, not real earnings.
const SETUP = "prog_setup"
const AFFILIATE = "prog_affiliate"
const CONSULTANTS = "prog_consultants"
const COMBINED_PAYOUT = "po_3"

test("lump-sum program: totals and months", () => {
	const s = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, SETUP)
	assert.equal(s.program?.name, "Notion Setup Sessions")
	assert.equal(s.totals.paid.amount, 2350)
	assert.equal(s.totals.rewards, 3)
	assert.deepEqual(
		s.months.map((m) => [m.month, m.paid]),
		[["2026-08", 500], ["2026-09", 1200], ["2026-10", 650]],
	)
})

test("per-referral program: paid, awaiting and declined", () => {
	const s = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, AFFILIATE)
	assert.equal(s.totals.paid.amount, 125)
	assert.equal(s.totals.approved.amount, 75)
	assert.equal(s.totals.pending.amount, 50)
	assert.equal(s.totals.declined.amount, 50)
	assert.equal(s.totals.rewards, 18)
	assert.equal(s.totals.nextPaymentDate, "2026-11-13")
	// $0 events and declined rewards add nothing to the months.
	assert.deepEqual(
		s.months.map((m) => [m.month, m.paid, m.scheduled]),
		[
			["2026-06", 50, 0],
			["2026-07", 0, 0],
			["2026-08", 0, 0],
			["2026-09", 50, 0],
			["2026-10", 25, 0],
			["2026-11", 0, 75],
			["2026-12", 0, 50],
		],
	)
})

test("a combined payout shows only this program's share", () => {
	const share = (programId: string) =>
		summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, programId).payouts.find(
			(l) => l.payout.id === COMBINED_PAYOUT,
		)?.share
	assert.equal(share(SETUP), 1200)
	assert.equal(share(AFFILIATE), 50)
	// A batch where this program only had $0 events isn't listed for it.
	const affiliate = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, AFFILIATE)
	assert.ok(affiliate.payouts.every((l) => l.share > 0))
	assert.ok(!affiliate.payouts.some((l) => l.payout.id === "po_2"))
})

test("a program with no rewards is empty, not the overview", () => {
	const s = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, CONSULTANTS)
	assert.equal(s.program?.name, "Notion Consultants")
	assert.equal(s.totals.rewards, 0)
	assert.equal(s.payouts.length, 0)
})

test("off a program page: overview of everything", () => {
	const s = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, "some-other-page")
	assert.equal(s.program, null)
	assert.equal(s.totals.paid.amount, 2475)
	assert.equal(s.payouts.length, 5)
	assert.equal(s.programs[0].program.name, "Notion Setup Sessions")
	const combined = s.payouts.find((l) => l.payout.id === COMBINED_PAYOUT)
	assert.deepEqual(combined?.programNames.sort(), ["Notion", "Notion Setup Sessions"])
})

test("ids match with or without dashes", () => {
	assert.equal(normId("41691B07-11ac-818f"), normId("41691b0711ac818f"))
})
