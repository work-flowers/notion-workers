import assert from "node:assert/strict";
import { test } from "node:test";
import { deletedKeys, FULL_EMIT_INTERVAL_MS, isFullEmitDue, rowFingerprint } from "./zaps.js";

const props = { Name: [["send-invoice"]], Status: [["Enabled"]] };
const seed = { apps: [{ name: "Notion", color: "default" }] };

test("identical properties and seed give the same fingerprint", () => {
	assert.equal(rowFingerprint(props, seed), rowFingerprint({ ...props }, { ...seed }));
});

test("a property change moves the fingerprint", () => {
	assert.notEqual(
		rowFingerprint(props, seed),
		rowFingerprint({ ...props, Status: [["Disabled"]] }, seed),
	);
});

// Declaring a previously-dropped option has to re-send rows whose values did not
// change, or the platform keeps the cell it already emptied.
test("a change to the declared options moves every fingerprint", () => {
	const declaredMore = { apps: [...seed.apps, { name: "Slack", color: "blue" }] };
	assert.notEqual(rowFingerprint(props, seed), rowFingerprint(props, declaredMore));
});

test("a full emit is due with no record, an unparseable one, or an old one", () => {
	const now = Date.parse("2026-10-03T12:00:00Z");
	assert.equal(isFullEmitDue(undefined, now), true);
	assert.equal(isFullEmitDue("not a date", now), true);
	assert.equal(isFullEmitDue(new Date(now - FULL_EMIT_INTERVAL_MS).toISOString(), now), true);
	assert.equal(isFullEmitDue(new Date(now - 60_000).toISOString(), now), false);
});

test("only keys this sync emitted and that are no longer deployed are deleted", () => {
	const previous = { a: "h1", b: "h2", gone: "h3" };
	assert.deepEqual(deletedKeys(previous, new Set(["a", "b", "new"])), ["gone"]);
});

// First incremental cycle: nothing is known yet, so nothing can be deleted —
// in particular not every row.
test("an empty previous state deletes nothing", () => {
	assert.deepEqual(deletedKeys({}, new Set(["a"])), []);
});
