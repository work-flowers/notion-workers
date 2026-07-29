import type { RunError, WorkflowRun } from "./runs.js";

/**
 * Failure triage.
 *
 * One ticket per **recurring error signature**, not per failed run. The Zap Runs
 * database already keeps one row per run; a second per-run table would just
 * mirror it. What triage actually needs is the opposite — collapsing repeats so a
 * class of failure is looked at once.
 *
 * The ratio is not marginal. Of the 33 failed runs in history when this was
 * written, `Could not find a Notion page id in webhook payload` alone accounted
 * for 14, spread across six different durables; the whole set collapsed to about
 * eight signatures.
 *
 * ## What goes in a signature, and what deliberately does not
 *
 * `workflowId · errorType · normalisedMessage`.
 *
 * **Per durable**, so the same fault in two Zaps is two tickets — they are
 * usually fixed in two different places.
 *
 * **The failing step is excluded on purpose.** It comes from the operations
 * journal (`getDurableRun`), a separate call that can fail — `fetchRunDetail`
 * degrades to `undefined` rather than throwing. Keying on it would mean one
 * execution's transient journal failure splits a ticket in two and the count
 * silently forks. It is a display column instead, refreshed from the newest
 * occurrence.
 *
 * For `StepExhaustedError` this costs nothing anyway: the step name is already in
 * the message (`Step "update-contact-record" exhausted all retry attempts.`), so
 * two steps of the same durable still separate.
 *
 * The **root cause** is deliberately not carried here at all — properties hold
 * only metadata lifted off the run, and diagnosis belongs in the page body. See
 * the note above the database declaration in index.ts.
 */

// -- Which statuses are worth triaging -------------------------------------

/**
 * `failed` and `timed_out` only.
 *
 * `cancelled` is deliberate, and `halted` is a durable stopping itself on
 * purpose — neither is a fault, and ticketing them would train people to ignore
 * the table. Only `failed` has actually been observed in the wild; `timed_out`
 * is included because it is in the status enum and would be a real failure.
 */
const TRIAGE_STATUSES = new Set(["failed", "timed_out"]);

export function isTriageable(status: string | null | undefined): boolean {
	return !!status && TRIAGE_STATUSES.has(status);
}

// -- Message normalisation --------------------------------------------------

/** How much of the normalised message the signature keeps. Long enough to
 *  separate genuinely different faults, short enough to stay a readable key. */
const SIGNATURE_MESSAGE_MAX = 120;

/** Notion rich text caps at 2000 characters per value. */
const TEXT_MAX_CHARS = 1900;

export function clip(text: string, max = TEXT_MAX_CHARS): string {
	return text.length > max ? `${text.slice(0, max)}… (truncated)` : text;
}

/**
 * Strip the parts of an error message that vary between otherwise identical
 * failures. Every rule here is driven by a message actually observed:
 *
 * - `…webhook payload: {"querystring":{}}` — an appended JSON or array dump. The
 *   payload differs per run, so everything from the delimiter on is dropped.
 * - `Dependency installation failed: … @zapier/zapier-durable is "0.11.0".
 *   Published at 7/27/2026 2:58:15 PM …` — multi-line, and carries both a
 *   version and a timestamp that move on every publish.
 * - page and run ids embedded in messages.
 *
 * Quoted substrings are **kept**. They are usually the whole point —
 * `Non-deterministic API "new Date()" called in GUARDED mode` and
 * `Step "update-contact-record" exhausted…` both discriminate on the quote.
 */
export function normaliseMessage(message: string): string {
	// First, so the `.*$` below spans a multi-line message rather than stopping
	// at the first newline.
	let text = message.replace(/\s+/g, " ").trim();
	text = text.replace(/:\s*[[{].*$/, "");
	text = text.replace(
		/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
		"<id>",
	);
	text = text.replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, "<ts>");
	text = text.replace(/\b\d{1,2}\/\d{1,2}\/\d{4},? \d{1,2}:\d{2}(:\d{2})? ?[AP]M\b/g, "<ts>");
	text = text.replace(/\b\d+\.\d+\.\d+\b/g, "<version>");
	return text.trim();
}

/** `details.name` is the useful one — `StepExhaustedError`, `DeterminismViolation`,
 *  `SyntaxError`. Falls back to the outer code (`execution_failed`) when the
 *  structured detail is missing. */
export function errorType(error: RunError | null | undefined): string {
	return error?.details?.name || error?.code || "unknown";
}

/** The fullest message available, before normalisation. */
export function errorMessage(error: RunError | null | undefined): string {
	return error?.details?.message || error?.message || "";
}

export function signatureFor(workflowId: string, error: RunError | null | undefined): string {
	const normalised = normaliseMessage(errorMessage(error));
	return [
		workflowId,
		errorType(error),
		normalised.slice(0, SIGNATURE_MESSAGE_MAX) || "-",
	].join(" · ");
}

// -- Aggregate state --------------------------------------------------------

/**
 * How many failing runs a ticket links. The relation is a sample, not the
 * record — `Occurrences` is the true count and keeps rising after this binds.
 */
export const MAX_RUNS_PER_TICKET = 25;

/**
 * Ceiling on distinct signatures held in sync state.
 *
 * Normalisation is what keeps signatures bounded, so a message shape it fails to
 * strip would mint one per run and grow the state without limit. Evicting the
 * least-recently-seen ticket bounds that; the Notion row survives (nothing here
 * ever deletes), it just stops accumulating. If this ever fires, the fix is a
 * normalisation rule, not a bigger number.
 */
export const MAX_TICKETS = 200;

export type TicketState = {
	workflowId: string;
	zapName: string;
	errorType: string;
	/** Raw latest message, for display. */
	message: string;
	/** From the operations journal; empty when the journal was unavailable. */
	step: string;
	count: number;
	firstSeen: string;
	lastSeen: string;
	/** Newest first, capped at MAX_RUNS_PER_TICKET. */
	runIds: string[];
};

export type Occurrence = {
	signature: string;
	workflowId: string;
	zapName: string;
	errorType: string;
	message: string;
	step: string;
	runId: string;
	/** The run's `created_at` — when the failure happened. */
	at: string;
};

export function occurrenceFrom(
	run: WorkflowRun,
	workflowId: string,
	zapName: string,
	detail?: { failingStep?: string },
): Occurrence {
	return {
		signature: signatureFor(workflowId, run.error),
		workflowId,
		zapName,
		errorType: errorType(run.error),
		message: errorMessage(run.error),
		step: detail?.failingStep ?? "",
		runId: run.id,
		at: run.created_at,
	};
}

/**
 * Fold one occurrence into the ticket map, in place.
 *
 * Counting exactly once is the caller's job, not this function's: the delta
 * re-scans an overlap window (runs mutate ~20s after creation), so it must only
 * pass occurrences whose run is newer than the previous watermark. The
 * `runIds` check here is a second line of defence, not the mechanism.
 *
 * Display fields track the **newest** occurrence, so a ticket shows the most
 * recent root cause rather than whichever one happened to be seen first.
 */
export function accumulate(tickets: Record<string, TicketState>, occurrence: Occurrence): void {
	const existing = tickets[occurrence.signature];

	if (!existing) {
		tickets[occurrence.signature] = {
			workflowId: occurrence.workflowId,
			zapName: occurrence.zapName,
			errorType: occurrence.errorType,
			message: occurrence.message,
			step: occurrence.step,
			count: 1,
			firstSeen: occurrence.at,
			lastSeen: occurrence.at,
			runIds: [occurrence.runId],
		};
		return;
	}

	const alreadyCounted = existing.runIds.includes(occurrence.runId);
	if (!alreadyCounted) {
		existing.count += 1;
		existing.runIds = [occurrence.runId, ...existing.runIds].slice(0, MAX_RUNS_PER_TICKET);
	}

	if (occurrence.at < existing.firstSeen) existing.firstSeen = occurrence.at;
	if (occurrence.at >= existing.lastSeen) {
		existing.lastSeen = occurrence.at;
		existing.zapName = occurrence.zapName;
		existing.message = occurrence.message;
		// Only overwrite from a journal that actually resolved — a failed detail
		// fetch must not blank a step name an earlier occurrence established.
		if (occurrence.step) existing.step = occurrence.step;
	}
}

/** Drop the least-recently-seen tickets down to `max`. Returns what went. */
export function evictOldest(
	tickets: Record<string, TicketState>,
	max = MAX_TICKETS,
): string[] {
	const signatures = Object.keys(tickets);
	if (signatures.length <= max) return [];
	const byAge = signatures.sort((a, b) => tickets[a].lastSeen.localeCompare(tickets[b].lastSeen));
	const evicted = byAge.slice(0, signatures.length - max);
	for (const signature of evicted) delete tickets[signature];
	return evicted;
}

/** How much message a title carries when there is no failing step to name. */
const TITLE_MESSAGE_MAX = 70;

/**
 * `zapName · ErrorType in failing-step`, or `zapName · ErrorType: message` when
 * the journal named no step.
 *
 * The message fallback is not decoration. `errorType` comes from
 * `details.name`, and for a plain `throw new Error(...)` in durable code that is
 * literally `"Error"` — six of the first eighteen tickets were titled
 * `<zap> · Error`, which is unusable in a triage list. With no step either, the
 * message is the only thing that identifies the ticket.
 */
export function ticketTitle(ticket: TicketState): string {
	if (ticket.step) return `${ticket.zapName} · ${ticket.errorType} in ${ticket.step}`;
	const normalised = normaliseMessage(ticket.message);
	if (!normalised) return `${ticket.zapName} · ${ticket.errorType}`;
	const summary =
		normalised.length > TITLE_MESSAGE_MAX
			? `${normalised.slice(0, TITLE_MESSAGE_MAX).trimEnd()}…`
			: normalised;
	return `${ticket.zapName} · ${ticket.errorType}: ${summary}`;
}

// -- The account-wide gate --------------------------------------------------
//
// A cycle walks every durable, and every execution re-lists the workflows to
// find its own, so a cycle costs two upstream calls per durable — ~54 at 27
// durables — even when nothing has failed. Hourly, that is a lot of asking to be
// told nothing happened.
//
// `listDurableRuns` answers "did anything fail anywhere" in one call. It cannot
// replace the per-durable walk, because it carries no workflow attribution (see
// `DurableRunSummary`), but it can decide whether the walk is worth doing.
//
// **The gate is advisory, never authoritative.** A false negative would mean a
// real failure never gets a ticket, and coverage was only spot-checked across
// three of 27 durables. So the sync walks unconditionally every
// `FULL_WALK_INTERVAL_MS` regardless of what the gate says: a gate miss then
// costs latency, not a lost ticket.

/** One page is the whole gate. At ~5.5 runs/hour observed, 100 covers ~18 hours,
 *  so an hourly gate has a wide margin before it goes inconclusive. */
export const GATE_PAGE_SIZE = 100;

/** How stale the last full walk may get before the gate is overruled. */
export const FULL_WALK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type GateVerdict = {
	/** Something failed after the watermark. */
	hasNewFailures: boolean;
	/** Whether the page reached back as far as the watermark. When false, the
	 *  absence of failures proves nothing and the walk must go ahead. */
	conclusive: boolean;
	/** Highest `updated_at` in the page; empty for an empty page. */
	highest: string;
};

export function assessGate(
	runs: Array<{ status: string; updated_at: string }>,
	watermark: string | undefined,
	pageSize = GATE_PAGE_SIZE,
): GateVerdict {
	let highest = "";
	let oldest = "";
	for (const run of runs) {
		if (run.updated_at > highest) highest = run.updated_at;
		if (!oldest || run.updated_at < oldest) oldest = run.updated_at;
	}

	// No baseline to compare against — the first cycle after a deploy or a state
	// reset must walk, or it would clear itself having checked nothing.
	if (!watermark) return { hasNewFailures: true, conclusive: false, highest };

	const hasNewFailures = runs.some(
		(run) => run.updated_at > watermark && isTriageable(run.status),
	);

	// Newest-first, so a *full* page whose oldest entry is still newer than the
	// watermark never reached it, and failures may sit in the gap. Paging further
	// would work; walking is simpler and this is the rare case.
	const reachedBack = runs.length < pageSize || oldest <= watermark;

	return { hasNewFailures, conclusive: reachedBack, highest };
}

/** `now` is injectable for tests; production passes the default. */
export function isFullWalkDue(lastFullWalkAt: string | undefined, now = Date.now()): boolean {
	if (!lastFullWalkAt) return true;
	const at = Date.parse(lastFullWalkAt);
	if (!Number.isFinite(at)) return true;
	return now - at >= FULL_WALK_INTERVAL_MS;
}

// -- Triage workflow columns ------------------------------------------------
//
// There deliberately are none here.
//
// `Status`, `Priority`, `Assignee`, `Resolution Notes` and `Resolved` are
// hand-made properties on the data source, not part of the managed schema — a
// declared property is `readOnly` in Notion and cannot be edited by a person,
// which is the one thing a triage column has to be. See the note above the
// database declaration in index.ts, and CLAUDE.md for their intended shape.
