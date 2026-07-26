import assert from "node:assert/strict";
import { test } from "node:test";
import {
	normaliseStatus,
	RUN_STATUS_OPTIONS,
	runDurationSeconds,
	runErrorText,
	type WorkflowRun,
} from "./runs.js";

const baseRun: WorkflowRun = {
	id: "019f9c34-56b7-741e-9219-73b004267798",
	status: "finished",
	created_at: "2026-07-26T02:15:03.602Z",
	updated_at: "2026-07-26T02:15:26.280Z",
};

test("known statuses pass through", () => {
	for (const status of ["finished", "failed", "running", "queued"]) {
		assert.equal(normaliseStatus(status), status);
	}
});

test("unknown or missing status collapses to unknown", () => {
	assert.equal(normaliseStatus("something_new"), "unknown");
	assert.equal(normaliseStatus(undefined), "unknown");
	assert.equal(normaliseStatus(""), "unknown");
});

test("every value normaliseStatus can return is a declared select option", () => {
	// The select schema is built from RUN_STATUS_OPTIONS, so any value the
	// normaliser emits must be in it or the write would reference a missing option.
	const options = new Set(RUN_STATUS_OPTIONS);
	for (const status of [...RUN_STATUS_OPTIONS, "surprise", "", undefined]) {
		assert.ok(options.has(normaliseStatus(status as string)), `missing: ${status}`);
	}
});

test("a successful run has no error text", () => {
	assert.equal(runErrorText(null), "");
	assert.equal(runErrorText(undefined), "");
});

test("error text flattens the real failure shape", () => {
	// Exactly the shape the API returned for a failed run.
	const text = runErrorText({
		code: "execution_failed",
		message: 'Step "update-contact-record" exhausted all retry attempts.',
		details: {
			name: "StepExhaustedError",
			message: 'Step "update-contact-record" exhausted all retry attempts.',
		},
	});
	assert.ok(text.includes("execution_failed"));
	assert.ok(text.includes("StepExhaustedError"));
	assert.ok(text.includes("exhausted all retry attempts"));
});

test("error text copes with a code and nothing else", () => {
	assert.equal(runErrorText({ code: "execution_failed" }), "execution_failed");
});

test("duration is created -> last update, in seconds", () => {
	assert.equal(runDurationSeconds(baseRun), 23);
});

test("duration is undefined rather than negative or NaN", () => {
	assert.equal(runDurationSeconds({ ...baseRun, updated_at: "not a date" }), undefined);
	assert.equal(
		runDurationSeconds({ ...baseRun, created_at: "2026-07-26T03:00:00.000Z" }),
		undefined,
		"an update before creation is nonsense, not a negative duration",
	);
});
