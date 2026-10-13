import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildMatchRequest,
	MAX_CLOSED,
	type MatchCandidate,
	MIN_SAME_SCOPE,
	recommend,
	selectPool,
	toMatches,
} from "./match.js";
import { normalizeId, type TaskRecord } from "./tasks.js";

let n = 0;
function task(over: Partial<TaskRecord> = {}): TaskRecord {
	n++;
	const id = n.toString(16).padStart(32, "0");
	return {
		id,
		url: `https://app.notion.com/p/${id}`,
		ticketId: n,
		title: `Task ${n}`,
		summary: "",
		status: "Not started",
		open: true,
		assignee: "Dennis",
		due: null,
		lastEdited: "2026-10-01T00:00:00.000Z",
		parentId: null,
		meetingNoteIds: [],
		contextIds: [],
		...over,
	};
}

const cand: MatchCandidate = {
	ref: "1",
	title: "Write the MRT proposal",
	description: "Dennis to put together the MRT client proposal",
	owner: "Dennis",
	client: "MRT",
};
const ctx = { meetingNoteId: null, meetingRelationIds: new Set<string>() };

/** Jev answers for pool position i: a relationship distribution plus the scope noul. */
function answer(i: number, probs: Record<string, number>, scope = 0.95) {
	return {
		[`t${i}`]: { type: "choice", probabilities: { unrelated: 0, ...probs } },
		[`s${i}`]: { type: "noul", noul: scope },
	};
}

test("normalizeId handles dashed ids, bare ids and URLs with slugs", () => {
	const hex = "3f791b0711ac808e97a8d8d6f67c4e1a";
	assert.equal(normalizeId("3f791b07-11ac-808e-97a8-d8d6f67c4e1a"), hex);
	assert.equal(normalizeId(`https://app.notion.com/p/Code-Review-${hex}?pvs=4`), hex);
	assert.equal(normalizeId("not an id"), null);
});

test("the pool keeps every open task and only word-matching closed ones", () => {
	const open = [task({ title: "Unrelated open thing" }), task({ title: "MRT demo" })];
	const closed = [
		task({ title: "Old MRT proposal", open: false, status: "Done" }),
		task({ title: "Payroll", open: false, status: "Done" }),
	];
	const pool = selectPool(cand, [...open, ...closed], ctx);
	assert.equal(pool.filter((t) => t.open).length, 2);
	assert.deepEqual(pool.filter((t) => !t.open).map((t) => t.title), ["Old MRT proposal"]);
});

test("closed shortlist is capped", () => {
	const closed = Array.from({ length: MAX_CLOSED + 5 }, () =>
		task({ title: "MRT proposal", open: false, status: "Done" }),
	);
	assert.equal(selectPool(cand, closed, ctx).length, MAX_CLOSED);
});

test("one choice and one scope question per pooled task", () => {
	const { questions } = buildMatchRequest(cand, [task(), task()]);
	assert.deepEqual(Object.keys(questions).sort(), ["s0", "s1", "t0", "t1"]);
});

test("a different client drops the match, even a confident duplicate", () => {
	const pool = [task()];
	const m = toMatches(pool, answer(0, { same: 0.9 }, MIN_SAME_SCOPE - 0.01));
	assert.deepEqual(m, []);
});

test("an open duplicate means update, not create", () => {
	const pool = [task({ title: "Draft MRT proposal" })];
	const r = recommend(cand, toMatches(pool, answer(0, { same: 0.9, related: 0.1 })), { open: 1, closed: 0 });
	assert.equal(r.recommendation, "update_existing");
	assert.equal(r.targetTaskId, pool[0].id);
});

test("a borderline duplicate asks", () => {
	const pool = [task()];
	const r = recommend(cand, toMatches(pool, answer(0, { same: 0.45, related: 0.4 })), { open: 1, closed: 0 });
	assert.equal(r.recommendation, "confirm_duplicate");
});

test("a closed duplicate asks the agent to check whether it's already done", () => {
	const pool = [task({ open: false, status: "Done" })];
	const r = recommend(cand, toMatches(pool, answer(0, { same: 0.8 })), { open: 0, closed: 1 });
	assert.equal(r.recommendation, "check_already_done");
});

test("an open parent makes a sub-task and the rest become links", () => {
	const parent = task({ title: "MRT engagement" });
	const sibling = task({ title: "MRT discovery questions" });
	const child = task({ title: "MRT pricing sheet" });
	const answers = {
		...answer(0, { existing_contains_candidate: 0.8 }),
		...answer(1, { related: 0.7 }),
		...answer(2, { candidate_contains_existing: 0.75 }),
	};
	const r = recommend(cand, toMatches([parent, sibling, child], answers), { open: 3, closed: 0 });
	assert.equal(r.recommendation, "create_as_subtask");
	assert.equal(r.targetTaskId, parent.id);
	assert.deepEqual(r.relatedTaskIds, [sibling.id]);
	assert.deepEqual(r.childTaskIds, [child.id]);
});

test("weak relations aren't linked", () => {
	const pool = [task()];
	const r = recommend(cand, toMatches(pool, answer(0, { related: 0.45, unrelated: 0.55 })), { open: 1, closed: 0 });
	assert.equal(r.recommendation, "create");
	assert.equal(r.matches.length, 1);
	assert.deepEqual(r.relatedTaskIds, []);
});
