import assert from "node:assert/strict";
import { test } from "node:test";
import { buildValidationRequest, decide, FAIL, type FollowUpCandidate, PASS } from "./validate.js";

const cand: FollowUpCandidate = {
	ref: "a",
	title: "Send the proposal",
	owner: "Dennis",
	evidence: "Dennis to send the proposal",
};

/** Raw Jev answers for candidate c1, with "pass" values as Jev would return them. */
function answers(over: Record<string, number> = {}) {
	// not_done and grounded are asked as the failure condition, so a pass is a low value.
	const raw = { concrete: 0.95, committed: 0.95, grounded: 0.05, not_done: 0.02, owner_clear: 0.95, owner_internal: 0.95, ...over };
	return Object.fromEntries(Object.entries(raw).map(([k, v]) => [`c1__${k}`, { type: "noul", noul: v }]));
}

test("all checks passing creates", () => {
	const r = decide(cand, 0, answers());
	assert.equal(r.verdict, "create");
	assert.deepEqual(r.reasons, []);
	assert.equal(r.checks.not_done, 0.98);
	assert.equal(r.checks.grounded, 0.95);
});

test("a clear failure rejects, even when another check is uncertain", () => {
	const r = decide(cand, 0, answers({ committed: FAIL, concrete: 0.5 }));
	assert.equal(r.verdict, "reject");
	assert.equal(r.reasons.length, 1);
	assert.match(r.reasons[0], /suggestion/);
});

test("already done (inverted check) rejects", () => {
	assert.equal(decide(cand, 0, answers({ not_done: 0.9 })).verdict, "reject");
});

test("a title that overclaims (inverted check) rejects", () => {
	assert.equal(decide(cand, 0, answers({ grounded: 0.9 })).verdict, "reject");
});

test("an uncertain hard check goes to review", () => {
	assert.equal(decide(cand, 0, answers({ concrete: PASS - 0.01 })).verdict, "review");
});

test("a missing answer goes to review, not create", () => {
	const a = answers();
	delete a.c1__committed;
	const r = decide(cand, 0, a);
	assert.equal(r.verdict, "review");
	assert.equal(r.checks.committed, null);
});

test("no clear owner asks for one, and ignores the meaningless internal-owner answer", () => {
	const r = decide(cand, 0, answers({ owner_clear: 0.1, owner_internal: 0.1 }));
	assert.equal(r.verdict, "needs_owner");
});

test("an external owner rejects", () => {
	assert.equal(decide(cand, 0, answers({ owner_internal: 0.05 })).verdict, "reject");
});

test("questions are keyed by position, whatever the agent's refs", () => {
	const { state, questions } = buildValidationRequest(
		{ title: "M", workflowersPeople: ["Dennis"], externalPeople: [] },
		[cand, { ...cand, ref: "weird ref!" }],
	);
	assert.deepEqual(Object.keys((state as any).candidates), ["c1", "c2"]);
	assert.equal(Object.keys(questions).length, 12);
	assert.ok("c2__owner_internal" in questions);
	assert.equal((state as any).meeting.external_people, "(none listed)");
});
