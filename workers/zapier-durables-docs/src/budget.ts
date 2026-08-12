import type { Pacer } from "./zapier.js";

/**
 * A per-execution spend budget for the syncs that walk the durable list.
 *
 * Both run syncs fan one cycle out across many executions, chaining via
 * `hasMore` and indexing into the workflow list. That fan-out used to be fixed
 * at **one durable per execution**, because doing all of them in a single
 * execution timed out at ~300s once volume grew: 81 runs meant ~75 upstream
 * calls, throttled by a pacer shared across three syncs.
 *
 * But that limit was sized for the worst case and paid on *every* durable. Most
 * durables are quiet in any given window — one `listRunsPage` that returns
 * nothing past the floor, no journal fetches, well under a second — so at 49
 * durables a cycle cost 50 executions where a handful would do.
 *
 * So the walk now consumes durables until it has actually spent something. It
 * stops **between** durables, never mid-durable, which is what keeps the
 * existing cursor / watermark resume logic untouched: a durable that pages out
 * still returns with its cursor exactly as before.
 *
 * The per-durable caps (`MAX_PAGES_PER_EXECUTION`, the detail-fetch ceilings)
 * are still load-bearing and must stay. This budget bounds how many durables an
 * execution takes on; those bound how expensive a single durable can get, which
 * is the case that caused the original timeout. Neither replaces the other.
 *
 * Two limits, because they fail differently:
 *
 * - `timeBudgetMs` is the real constraint — the execution timeout is what
 *   actually kills a cycle. Set well below it, because the check can only
 *   happen between durables and the next one may be expensive.
 * - `callBudget` bounds pacer contention. `zapierApi` allows 30/min shared
 *   across three syncs, so a long execution spends most of its time waiting.
 *   Elapsed time already absorbs that, but a call ceiling stops one execution
 *   monopolising a budget the other syncs are drawing on too.
 */

/** Upstream calls one execution may make before it stops taking new durables. */
export const CALL_BUDGET = 40;

/**
 * Wall clock one execution may use before it stops taking new durables. The
 * observed timeout is ~300s, so this leaves room for one costly durable to
 * start just under the line and still finish inside it.
 */
export const TIME_BUDGET_MS = 120_000;

export type Budget = {
	/**
	 * Wrap a pacer so every call paced through it counts against this budget.
	 * Call it once per pacer and pass the result downstream — `zapsSync` meters
	 * two (GitHub and Zapier) against one shared budget, because what it is
	 * protecting is the single execution both spend time in.
	 */
	meter: (pacer: Pacer) => Pacer;
	calls: () => number;
	elapsedMs: () => number;
	/** True once this execution should stop taking on new work. */
	exhausted: () => boolean;
};

/**
 * Metering the pacer rather than the call sites is deliberate: every upstream
 * call in this worker is preceded by `await pacer.wait()`, so this counts all of
 * them without any individual call site having to remember to. A new call added
 * later is counted for free; one that forgets its `wait()` was already a bug.
 *
 * The corollary is that an unmetered pacer is invisible here. Pass the metered
 * pacer downstream, never the bare one.
 */
export function createBudget(
	options: { callBudget?: number; timeBudgetMs?: number; now?: () => number } = {},
): Budget {
	const callBudget = options.callBudget ?? CALL_BUDGET;
	const timeBudgetMs = options.timeBudgetMs ?? TIME_BUDGET_MS;
	const now = options.now ?? Date.now;
	const startedAt = now();
	let calls = 0;

	return {
		meter: (pacer: Pacer) => ({
			wait: async () => {
				calls++;
				await pacer.wait();
			},
		}),
		calls: () => calls,
		elapsedMs: () => now() - startedAt,
		exhausted: () => calls >= callBudget || now() - startedAt >= timeBudgetMs,
	};
}
