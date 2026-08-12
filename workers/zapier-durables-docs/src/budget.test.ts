import assert from "node:assert/strict";
import { test } from "node:test";
import { createBudget } from "./budget.js";

/** A pacer that records how often it was asked to wait. */
function countingPacer() {
	let waits = 0;
	return { pacer: { wait: async () => void waits++ }, waits: () => waits };
}

/** A pacer for tests that only care about the counting, not the pacing. */
const noop = { wait: async () => {} };

test("a fresh budget is not exhausted", () => {
	const budget = createBudget();
	assert.equal(budget.exhausted(), false);
	assert.equal(budget.calls(), 0);
});

test("the wrapped pacer still paces, and counts every call", async () => {
	const upstream = countingPacer();
	const budget = createBudget();
	const metered = budget.meter(upstream.pacer);

	await metered.wait();
	await metered.wait();

	assert.equal(budget.calls(), 2);
	// The point of wrapping rather than replacing: the real pacer still runs, so
	// rate limiting is unaffected by the metering.
	assert.equal(upstream.waits(), 2);
});

test("the call budget exhausts on reaching the ceiling, not past it", async () => {
	const budget = createBudget({ callBudget: 3 });

	await budget.meter(noop).wait();
	await budget.meter(noop).wait();
	assert.equal(budget.exhausted(), false);

	await budget.meter(noop).wait();
	assert.equal(budget.exhausted(), true);
});

test("the time budget exhausts on elapsed wall clock alone", async () => {
	let now = 1_000;
	const budget = createBudget({
		callBudget: 1_000,
		timeBudgetMs: 500,
		now: () => now,
	});

	now = 1_400;
	assert.equal(budget.elapsedMs(), 400);
	assert.equal(budget.exhausted(), false);

	now = 1_500;
	assert.equal(budget.exhausted(), true);
});

test("either limit alone is enough to exhaust the budget", async () => {
	// Calls, with time to spare.
	let now = 0;
	const byCalls = createBudget({
		callBudget: 1,
		timeBudgetMs: 1_000_000,
		now: () => now,
	});
	await byCalls.meter(noop).wait();
	assert.equal(byCalls.exhausted(), true);

	// Time, with calls to spare.
	const byTime = createBudget({
		callBudget: 1_000,
		timeBudgetMs: 10,
		now: () => now,
	});
	now = 10;
	assert.equal(byTime.exhausted(), true);
	assert.equal(byTime.calls(), 0);
});
