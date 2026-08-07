import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTicketId } from "./triage-page.js";

/**
 * `Ticket ID` is a hand-made `auto_increment_id` property, not part of the
 * managed schema, so every one of these degrades to `undefined` rather than
 * throwing — the attachment simply loses its `ZAP-25` prefix.
 */

test("a prefixed unique id renders as ZAP-25", () => {
	assert.equal(formatTicketId({ type: "unique_id", unique_id: { prefix: "ZAP", number: 25 } }), "ZAP-25");
});

test("a unique id with no prefix is just the number", () => {
	assert.equal(formatTicketId({ unique_id: { prefix: null, number: 7 } }), "7");
});

test("zero is a real ticket number, not a missing one", () => {
	assert.equal(formatTicketId({ unique_id: { prefix: "ZAP", number: 0 } }), "ZAP-0");
});

test("a property that is not a unique id yields nothing", () => {
	assert.equal(formatTicketId({ type: "number", number: 25 }), undefined);
	assert.equal(formatTicketId({ unique_id: { prefix: "ZAP" } }), undefined);
	assert.equal(formatTicketId({}), undefined);
	assert.equal(formatTicketId(undefined), undefined);
	assert.equal(formatTicketId(null), undefined);
});
