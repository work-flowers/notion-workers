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

test("a title judged to overclaim adds a note but never changes the verdict", () => {
	const r = decide(cand, 0, answers({ grounded: 0.9 }));
	assert.equal(r.verdict, "create");
	assert.equal(r.checks.grounded, 0.1);
	assert.equal(r.reasons.length, 1);
	assert.match(r.reasons[0], /^title note:/);
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

test("no clear owner asks for one; a middling internal-owner answer is ignored", () => {
	const r = decide(cand, 0, answers({ owner_clear: 0.1, owner_internal: 0.55 }));
	assert.equal(r.verdict, "needs_owner");
});

test("no clear owner but clearly external (e.g. 'Team to send…') still rejects", () => {
	assert.equal(decide(cand, 0, answers({ owner_clear: 0.09, owner_internal: 0.17 })).verdict, "reject");
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

/**
 * Recorded checks (P(pass)) from the agent's first live run, DU EMBA meeting,
 * 2026-10-13. Under the original rules this filed nothing: both of Dennis's
 * tasks were dropped on `grounded`, and two external items only reached review.
 */
const EMBA: [string, Record<string, number>, string][] = [
	["Allison to send the brief", { concrete: 0.94, committed: 0.63, grounded: 0.67, not_done: 0.97, owner_internal: 0.08, owner_clear: 0.14 }, "reject"],
	["Dennis to review the brief", { concrete: 0.82, committed: 0.92, grounded: 0.3, not_done: 0.97, owner_internal: 0.98, owner_clear: 0.88 }, "create"],
	["Team to prepare an agenda", { concrete: 0.8, committed: 0.33, grounded: 0.46, not_done: 0.97, owner_internal: 0.17, owner_clear: 0.09 }, "reject"],
	["Team to send a calendar block", { concrete: 0.89, committed: 0.91, grounded: 0.12, not_done: 0.92, owner_internal: 0.17, owner_clear: 0.09 }, "reject"],
	["Allison to confirm the visit", { concrete: 0.9, committed: 0.96, grounded: 0.71, not_done: 0.98, owner_internal: 0.1, owner_clear: 0.74 }, "reject"],
	["Dennis to share recommendations", { concrete: 0.83, committed: 0.95, grounded: 0.65, not_done: 0.98, owner_internal: 0.97, owner_clear: 0.89 }, "create"],
	// "Dennis to consider…": Jev missed the "consider" (committed 0.8), so this is filed
	// to the default owner. A known miss, kept here so a fix shows up as a test change.
	["Dennis to consider contacts", { concrete: 0.72, committed: 0.8, grounded: 0.51, not_done: 0.97, owner_internal: 0.76, owner_clear: 0.4 }, "needs_owner"],
];

for (const [label, pass, expected] of EMBA) {
	test(`EMBA run: ${label} → ${expected}`, () => {
		// answers() takes raw Jev values; grounded and not_done are asked inverted.
		const raw = { ...pass, grounded: 1 - pass.grounded, not_done: 1 - pass.not_done };
		assert.equal(decide(cand, 0, answers(raw)).verdict, expected);
	});
}
