import assert from "node:assert/strict";
import { test } from "node:test";
import {
	accumulate,
	assessGate,
	errorType,
	evictOldest,
	isFullWalkDue,
	isTriageable,
	MAX_RUNS_PER_TICKET,
	normaliseMessage,
	type Occurrence,
	occurrenceFrom,
	signatureFor,
	type TicketState,
	ticketTitle,
} from "./errors.js";
import type { RunError, WorkflowRun } from "./runs.js";

const WORKFLOW = "019f878c-64ff-7332-92df-58e39f803836";
const OTHER_WORKFLOW = "019f735e-b5fa-7bf1-be8b-82f35858b211";

/** Errors below are copied verbatim from failed runs in the Zap Runs database. */
function runError(name: string, message: string): RunError {
	return { code: "execution_failed", message, details: { name, message } };
}

const WEBHOOK_PAYLOAD = runError(
	"Error",
	'Could not find a Notion page id in webhook payload: {"querystring":{}}',
);
const STEP_EXHAUSTED = runError(
	"StepExhaustedError",
	'Step "update-contact-record" exhausted all retry attempts.',
);
const DETERMINISM = runError(
	"DeterminismViolation",
	'Non-deterministic API "new Date()" called in GUARDED mode. Move this call into a step.',
);

// -- The account-wide gate --------------------------------------------------

/** `listDurableRuns` rows, newest-first, as the API returns them. */
function gateRuns(specs: Array<[string, string]>): Array<{ status: string; updated_at: string }> {
	return specs.map(([status, updated_at]) => ({ status, updated_at }));
}

test("the gate clears a cycle when nothing failed since the watermark", () => {
	const verdict = assessGate(
		gateRuns([
			["finished", "2026-07-29T02:19:58.088Z"],
			["finished", "2026-07-29T01:10:00.000Z"],
			["failed", "2026-07-28T16:06:14.576Z"], // older than the watermark
		]),
		"2026-07-29T00:00:00.000Z",
	);
	assert.equal(verdict.hasNewFailures, false);
	assert.equal(verdict.conclusive, true);
	assert.equal(verdict.highest, "2026-07-29T02:19:58.088Z");
});

test("the gate opens on a failure newer than the watermark", () => {
	const verdict = assessGate(
		gateRuns([
			["finished", "2026-07-29T02:19:58.088Z"],
			["failed", "2026-07-29T01:30:00.000Z"],
		]),
		"2026-07-29T00:00:00.000Z",
	);
	assert.equal(verdict.hasNewFailures, true);
});

test("timed_out opens the gate, cancelled and halted do not", () => {
	const watermark = "2026-07-29T00:00:00.000Z";
	const at = "2026-07-29T01:00:00.000Z";
	assert.equal(assessGate(gateRuns([["timed_out", at]]), watermark).hasNewFailures, true);
	assert.equal(assessGate(gateRuns([["cancelled", at]]), watermark).hasNewFailures, false);
	assert.equal(assessGate(gateRuns([["halted", at]]), watermark).hasNewFailures, false);
});

test("no watermark is inconclusive, so the first cycle always walks", () => {
	// Otherwise a deploy or state reset would clear itself having checked nothing.
	const verdict = assessGate(gateRuns([["finished", "2026-07-29T02:19:58.088Z"]]), undefined);
	assert.equal(verdict.conclusive, false);
	assert.equal(verdict.hasNewFailures, true);
	assert.equal(verdict.highest, "2026-07-29T02:19:58.088Z");
});

test("a full page that never reached the watermark is inconclusive", () => {
	// Newest-first, so failures may sit in the gap between the page and the
	// watermark. Absence of failures in the page proves nothing.
	const runs = gateRuns(
		Array.from({ length: 4 }, (_, i) => ["finished", `2026-07-29T0${i}:00:00.000Z`] as [string, string]),
	);
	const verdict = assessGate(runs, "2026-07-01T00:00:00.000Z", 4);
	assert.equal(verdict.hasNewFailures, false);
	assert.equal(verdict.conclusive, false, "must not clear the cycle");
});

test("a partial page is conclusive — it saw everything there was", () => {
	const runs = gateRuns([["finished", "2026-07-29T02:00:00.000Z"]]);
	assert.equal(assessGate(runs, "2026-07-01T00:00:00.000Z", 100).conclusive, true);
});

test("an empty page clears the cycle and leaves the watermark alone", () => {
	const verdict = assessGate([], "2026-07-29T00:00:00.000Z");
	assert.equal(verdict.hasNewFailures, false);
	assert.equal(verdict.conclusive, true);
	assert.equal(verdict.highest, "", "an empty page must not move the watermark");
});

test("a run exactly at the watermark is not new", () => {
	const watermark = "2026-07-29T01:00:00.000Z";
	const verdict = assessGate(gateRuns([["failed", watermark]]), watermark);
	assert.equal(verdict.hasNewFailures, false, "already counted on the previous cycle");
});

test("the full walk is overdue without a stamp, and after the interval", () => {
	const now = Date.parse("2026-07-29T12:00:00.000Z");
	assert.equal(isFullWalkDue(undefined, now), true, "no stamp means never walked");
	assert.equal(isFullWalkDue("not a date", now), true, "an unparseable stamp must not skip");
	assert.equal(isFullWalkDue("2026-07-29T11:00:00.000Z", now), false, "one hour ago");
	assert.equal(isFullWalkDue("2026-07-29T06:00:00.000Z", now), true, "exactly six hours ago");
	assert.equal(isFullWalkDue("2026-07-28T12:00:00.000Z", now), true, "a day ago");
});

test("only failed and timed_out are triaged", () => {
	assert.ok(isTriageable("failed"));
	assert.ok(isTriageable("timed_out"));
	// Deliberate stops, not faults.
	assert.ok(!isTriageable("cancelled"));
	assert.ok(!isTriageable("halted"));
	assert.ok(!isTriageable("finished"));
	assert.ok(!isTriageable(undefined));
});

test("an appended payload dump is stripped", () => {
	// The 14 observed occurrences of this differ only in the trailing JSON.
	assert.equal(
		normaliseMessage('Could not find a Notion page id in webhook payload: {"querystring":{}}'),
		"Could not find a Notion page id in webhook payload",
	);
	assert.equal(
		normaliseMessage('No event id in Luma event payload: {"id":"evt-1","name":"x"}'),
		"No event id in Luma event payload",
	);
});

test("versions and timestamps in a multi-line message collapse", () => {
	// The dependency-install failure carries both, and both move on every publish.
	const message =
		"Dependency installation failed: exit code 1: aint\n\n" +
		'The latest release of @zapier/zapier-durable is "0.11.0". ' +
		"Published at 7/27/2026 2:58:15 PM";
	const later = message.replace("0.11.0", "0.12.0").replace("7/27/2026 2:58:15 PM", "8/1/2026 9:04:01 AM");
	assert.equal(normaliseMessage(message), normaliseMessage(later));
	assert.ok(normaliseMessage(message).includes("<version>"));
	assert.ok(normaliseMessage(message).includes("<ts>"));
});

test("ids and ISO timestamps collapse", () => {
	assert.equal(
		normaliseMessage("Page 3a991b07-11ac-81ce-9bd4-de2030024dd2 at 2026-07-26T12:54:42.537Z is gone"),
		"Page <id> at <ts> is gone",
	);
});

test("quoted substrings survive normalisation", () => {
	// They are the discriminating part — two steps of one durable must not merge.
	assert.ok(normaliseMessage(DETERMINISM.message ?? "").includes('"new Date()"'));
	assert.ok(normaliseMessage(STEP_EXHAUSTED.message ?? "").includes('"update-contact-record"'));
});

test("repeats of one fault share a signature", () => {
	const a = signatureFor(WORKFLOW, WEBHOOK_PAYLOAD);
	const b = signatureFor(WORKFLOW, {
		...WEBHOOK_PAYLOAD,
		message: 'Could not find a Notion page id in webhook payload: {"querystring":{"a":"1"}}',
		details: {
			name: "Error",
			message: 'Could not find a Notion page id in webhook payload: {"querystring":{"a":"1"}}',
		},
	});
	assert.equal(a, b);
});

test("the same fault in two durables is two signatures", () => {
	assert.notEqual(
		signatureFor(WORKFLOW, WEBHOOK_PAYLOAD),
		signatureFor(OTHER_WORKFLOW, WEBHOOK_PAYLOAD),
	);
});

test("two steps of one durable are two signatures", () => {
	const other = runError(
		"StepExhaustedError",
		'Step "mark-duplicate" exhausted all retry attempts.',
	);
	assert.notEqual(signatureFor(WORKFLOW, STEP_EXHAUSTED), signatureFor(WORKFLOW, other));
});

test("the signature ignores the journal, so a failed detail fetch cannot fork a ticket", () => {
	// The whole reason Failing Step is display-only.
	const run = failedRun("019f9e7d-f2ec-78b5-a405-542d0a8d40e1", STEP_EXHAUSTED);
	const withJournal = occurrenceFrom(run, WORKFLOW, "enrich-contact-records", {
		failingStep: "update-contact-record",
	});
	const withoutJournal = occurrenceFrom(run, WORKFLOW, "enrich-contact-records", undefined);
	assert.equal(withJournal.signature, withoutJournal.signature);
});

test("error type prefers details.name and falls back to the code", () => {
	assert.equal(errorType(STEP_EXHAUSTED), "StepExhaustedError");
	assert.equal(errorType({ code: "execution_failed", message: "boom" }), "execution_failed");
	assert.equal(errorType(undefined), "unknown");
});

function failedRun(id: string, error: RunError, at = "2026-07-26T12:54:42.151Z"): WorkflowRun {
	return {
		id,
		status: "failed",
		error,
		created_at: at,
		updated_at: at,
		durable_run_id: `${id}-durable`,
	};
}

function occurrence(runId: string, at: string, overrides: Partial<Occurrence> = {}): Occurrence {
	return {
		...occurrenceFrom(failedRun(runId, STEP_EXHAUSTED, at), WORKFLOW, "enrich-contact-records"),
		...overrides,
	};
}

test("occurrences of one signature accumulate into a single ticket", () => {
	const tickets: Record<string, TicketState> = {};
	accumulate(tickets, occurrence("run-1", "2026-07-24T00:02:08.069Z"));
	accumulate(tickets, occurrence("run-2", "2026-07-26T12:09:47.803Z"));
	accumulate(tickets, occurrence("run-3", "2026-07-26T12:54:42.151Z"));

	assert.equal(Object.keys(tickets).length, 1);
	const ticket = Object.values(tickets)[0];
	assert.equal(ticket.count, 3);
	assert.equal(ticket.firstSeen, "2026-07-24T00:02:08.069Z");
	assert.equal(ticket.lastSeen, "2026-07-26T12:54:42.151Z");
	assert.deepEqual(ticket.runIds, ["run-3", "run-2", "run-1"]);
});

test("re-seeing a run does not double count", () => {
	// The overlap re-scan is the caller's guard, but this is the backstop.
	const tickets: Record<string, TicketState> = {};
	accumulate(tickets, occurrence("run-1", "2026-07-24T00:02:08.069Z"));
	accumulate(tickets, occurrence("run-1", "2026-07-24T00:02:08.069Z"));
	assert.equal(Object.values(tickets)[0].count, 1);
});

test("an out-of-order occurrence widens the window without disturbing the newest", () => {
	const tickets: Record<string, TicketState> = {};
	accumulate(tickets, occurrence("run-2", "2026-07-26T12:54:42.151Z", { step: "newest" }));
	accumulate(tickets, occurrence("run-1", "2026-07-01T00:00:00.000Z", { step: "oldest" }));
	const ticket = Object.values(tickets)[0];
	assert.equal(ticket.firstSeen, "2026-07-01T00:00:00.000Z");
	assert.equal(ticket.lastSeen, "2026-07-26T12:54:42.151Z");
	assert.equal(ticket.step, "newest");
});

test("a journal-less occurrence never blanks a step an earlier one established", () => {
	const tickets: Record<string, TicketState> = {};
	accumulate(
		tickets,
		occurrence("run-1", "2026-07-24T00:02:08.069Z", { step: "update-contact-record" }),
	);
	accumulate(tickets, occurrence("run-2", "2026-07-26T12:54:42.151Z", { step: "" }));
	assert.equal(Object.values(tickets)[0].step, "update-contact-record");
});

test("the run relation is capped but the count keeps rising", () => {
	const tickets: Record<string, TicketState> = {};
	const total = MAX_RUNS_PER_TICKET + 10;
	for (let i = 0; i < total; i++) {
		accumulate(tickets, occurrence(`run-${i}`, `2026-07-26T12:00:${String(i).padStart(2, "0")}.000Z`));
	}
	const ticket = Object.values(tickets)[0];
	assert.equal(ticket.count, total);
	assert.equal(ticket.runIds.length, MAX_RUNS_PER_TICKET);
	// Newest first.
	assert.equal(ticket.runIds[0], `run-${total - 1}`);
});

test("eviction drops the least-recently-seen tickets", () => {
	const tickets: Record<string, TicketState> = {};
	for (let day = 1; day <= 5; day++) {
		accumulate(
			tickets,
			occurrence(`run-${day}`, `2026-07-0${day}T00:00:00.000Z`, { signature: `sig-${day}` }),
		);
	}
	const evicted = evictOldest(tickets, 3);
	assert.deepEqual(evicted, ["sig-1", "sig-2"]);
	assert.deepEqual(Object.keys(tickets).sort(), ["sig-3", "sig-4", "sig-5"]);
});

test("eviction is a no-op below the ceiling", () => {
	const tickets: Record<string, TicketState> = {};
	accumulate(tickets, occurrence("run-1", "2026-07-24T00:02:08.069Z"));
	assert.deepEqual(evictOldest(tickets, 10), []);
	assert.equal(Object.keys(tickets).length, 1);
});

test("the title names the Zap, the error and the failing step", () => {
	const tickets: Record<string, TicketState> = {};
	accumulate(
		tickets,
		occurrence("run-1", "2026-07-24T00:02:08.069Z", { step: "update-contact-record" }),
	);
	assert.equal(
		ticketTitle(Object.values(tickets)[0]),
		"enrich-contact-records · StepExhaustedError in update-contact-record",
	);
});

test("with no failing step the title falls back to the message", () => {
	// Six of the first eighteen live tickets had errorType "Error" and no step —
	// `<zap> · Error` is unusable in a triage list.
	const tickets: Record<string, TicketState> = {};
	accumulate(
		tickets,
		occurrence("run-1", "2026-07-24T00:02:08.069Z", {
			signature: "sig-webhook",
			errorType: "Error",
			message: 'Could not find a Notion page id in webhook payload: {"querystring":{}}',
			step: "",
		}),
	);
	assert.equal(
		ticketTitle(tickets["sig-webhook"]),
		"enrich-contact-records · Error: Could not find a Notion page id in webhook payload",
	);
});

test("a long message in a title is truncated visibly", () => {
	const tickets: Record<string, TicketState> = {};
	accumulate(
		tickets,
		occurrence("run-1", "2026-07-24T00:02:08.069Z", {
			signature: "sig-long",
			errorType: "execution_failed",
			message: `Dependency installation failed: exit code 1: ${"x".repeat(300)}`,
			step: "",
		}),
	);
	const title = ticketTitle(tickets["sig-long"]);
	assert.ok(title.endsWith("…"), "truncation must be visible");
	assert.ok(title.length < 130, `title too long for a table row: ${title.length}`);
});

test("the title needs neither a step nor a message", () => {
	const tickets: Record<string, TicketState> = {};
	accumulate(
		tickets,
		occurrence("run-1", "2026-07-24T00:02:08.069Z", {
			signature: "sig-bare",
			errorType: "execution_failed",
			message: "",
			step: "",
		}),
	);
	assert.equal(ticketTitle(tickets["sig-bare"]), "enrich-contact-records · execution_failed");
});
