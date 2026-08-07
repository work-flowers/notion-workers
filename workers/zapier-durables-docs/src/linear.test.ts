import assert from "node:assert/strict";
import { test } from "node:test";
import { extractIssue } from "./linear.js";

/**
 * `extractIssue` is the one part of the Linear leg worth testing in isolation:
 * everything else is a `runAction` call, and the response is Zapier's rendering
 * of Linear's rather than a contract this repo controls. Losing the id is the
 * failure that matters — it means a duplicate issue on the next recurrence — so
 * these cover the shapes that could plausibly come back.
 */

test("a flat record yields id and url", () => {
	assert.deepEqual(
		extractIssue({ id: "iss_1", url: "https://linear.app/wf/issue/WF-1", title: "…" }),
		{ id: "iss_1", url: "https://linear.app/wf/issue/WF-1" },
	);
});

test("an issue nested under `issue` is unwrapped", () => {
	assert.deepEqual(
		extractIssue({ issue: { id: "iss_2", url: "https://linear.app/wf/issue/WF-2" } }),
		{ id: "iss_2", url: "https://linear.app/wf/issue/WF-2" },
	);
});

test("an issue nested under `data` is unwrapped", () => {
	assert.deepEqual(extractIssue({ data: { id: "iss_3" } }), { id: "iss_3" });
});

test("the url is optional — an id alone is still usable", () => {
	// Without a url the Notion row simply carries no link; the ticket is still
	// bound to its issue and recurrences still land.
	assert.deepEqual(extractIssue({ id: "iss_4" }), { id: "iss_4" });
});

test("identifier stands in for a missing id", () => {
	assert.deepEqual(extractIssue({ identifier: "WF-5" }), { id: "WF-5" });
});

test("a record with no id at all is not an issue", () => {
	// The caller must treat this as "not created" and retry next cycle rather
	// than record a ticket as linked.
	assert.equal(extractIssue({ url: "https://linear.app/wf/issue/WF-6" }), undefined);
	assert.equal(extractIssue({}), undefined);
	assert.equal(extractIssue(null), undefined);
	assert.equal(extractIssue("nope"), undefined);
});

test("an empty-string id does not count as an id", () => {
	assert.equal(extractIssue({ id: "" }), undefined);
});
