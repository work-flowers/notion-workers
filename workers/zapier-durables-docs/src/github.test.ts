import assert from "node:assert/strict";
import { test } from "node:test";
import { isDirCached, type RepoDirState } from "./github.js";

const cache: Record<string, RepoDirState> = {
	"send-invoice": { sha: "abc123", workflowIds: ["019f-1111"] },
	// A directory with no zap.json is cached too, so it stops costing a call.
	docs: { sha: "def456", workflowIds: [] },
};

test("an unchanged sha is served from the cache", () => {
	assert.equal(isDirCached({ name: "send-invoice", sha: "abc123" }, cache), true);
	assert.equal(isDirCached({ name: "docs", sha: "def456" }, cache), true);
});

test("a moved sha forces a re-read", () => {
	assert.equal(isDirCached({ name: "send-invoice", sha: "zzz999" }, cache), false);
});

test("a directory absent from the cache is read", () => {
	assert.equal(isDirCached({ name: "brand-new", sha: "abc123" }, cache), false);
});

test("no cache at all reads everything", () => {
	assert.equal(isDirCached({ name: "send-invoice", sha: "abc123" }, undefined), false);
	assert.equal(isDirCached({ name: "send-invoice", sha: "abc123" }, {}), false);
});

test("a listing entry with no sha is always re-read", () => {
	// The regression this guards: comparing `undefined === undefined` would match
	// a cache entry that also lacked a sha and pin the directory forever, so the
	// README could never be picked up again.
	assert.equal(isDirCached({ name: "send-invoice" }, cache), false);
	assert.equal(
		isDirCached({ name: "shaless" }, { shaless: { sha: "", workflowIds: [] } }),
		false,
	);
});
