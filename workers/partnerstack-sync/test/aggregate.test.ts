import assert from "node:assert/strict"
import { test } from "node:test"

import { normId, summarize } from "../blocks/program-summary/src/aggregate.ts"
import { MOCK_PAYOUTS, MOCK_PROGRAMS, MOCK_REWARDS } from "../blocks/program-summary/src/mock.ts"

const SETUP = "co_nGPWJluChgP4Ty"
const NOTION = "co_F3ykHPjXYLjrOd"
const CONSULTANTS = "co_tZWC7exiHarpRd"

// Figures measured against the PartnerStack dashboard on 2026-11-12.
test("Setup Sessions totals match the dashboard", () => {
	const s = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, SETUP)
	assert.equal(s.program?.name, "Notion Setup Sessions")
	assert.equal(s.totals.paid.amount, 3400)
	assert.equal(s.totals.rewards, 3)
	assert.deepEqual(
		s.months.map((m) => [m.month, m.paid]),
		[["2026-08", 820], ["2026-09", 1750], ["2026-10", 830]],
	)
})

test("Notion program: paid, awaiting and declined", () => {
	const s = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, NOTION)
	assert.equal(s.totals.paid.amount, 360)
	assert.equal(s.totals.approved.amount + s.totals.pending.amount, 210)
	assert.equal(s.totals.declined.amount, 150)
	assert.equal(s.totals.nextPaymentDate, "2026-11-13")
})

test("a combined payout shows only this program's share", () => {
	const setup = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, SETUP)
	const notion = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, NOTION)
	const aug = (s: typeof setup) => s.payouts.find((l) => l.payout.id === "pay_cF0o4nPnvMlyzi")?.share
	assert.equal(aug(setup), 1750)
	assert.equal(aug(notion), 210)
	// $0-only batches don't make a program look like it was paid in them.
	assert.ok(setup.payouts.every((l) => l.share > 0))
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
	assert.equal(s.totals.paid.amount, 3760)
	assert.equal(s.payouts.length, 5)
	assert.equal(s.programs[0].program.name, "Notion Setup Sessions")
	const aug = s.payouts.find((l) => l.payout.id === "pay_cF0o4nPnvMlyzi")
	assert.deepEqual(aug?.programNames.sort(), ["Notion", "Notion Setup Sessions"])
})

test("ids match with or without dashes", () => {
	assert.equal(normId("41691B07-11ac-818f"), normId("41691b0711ac818f"))
})
