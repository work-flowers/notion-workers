import { createHash } from "node:crypto";
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
	/** The Linear issue this signature owns, once opened. Absent means it has
	 *  never been opened — or that opening it failed, which is the same thing
	 *  as far as the next cycle is concerned. */
	issueId?: string;
	/** Linear's URL for that issue, mirrored into Notion for the link. */
	issueUrl?: string;
	/** `count` as of the last note posted to Linear. The gap between this and
	 *  `count` is what a recurrence comment reports, and keeping it means a
	 *  quiet cycle posts nothing. */
	noticedCount?: number;
	/** Whether the Notion row's URL has been attached to the Linear issue. False
	 *  until the row exists — a sync's changes land after `execute` returns, so
	 *  a brand-new ticket cannot be linked on the execution that created it. */
	notionAttached?: boolean;
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

// -- The Linear issue -------------------------------------------------------
//
// Linear owns triage; Notion keeps the machine facts. The split is not
// arbitrary — each side holds what the other cannot:
//
//   - Linear has native status, priority, assignee and comments. Notion could
//     not: declaring a property in a managed schema marks it `readOnly`, so the
//     five triage columns had to be hand-made on the data source and were not
//     reproducible from code.
//   - Notion has the two-way relations to the Zaps and Zap Runs databases, and
//     a sortable `Occurrences` number. Linear has no arbitrary custom fields, so
//     none of that survives a move into an issue body.

/** How much of the signature hash the marker carries. Eight hex characters is
 *  ~4 billion values against a ceiling of MAX_TICKETS live signatures. */
const MARKER_HASH_CHARS = 8;

/**
 * The stable handle for a signature, carried in the issue title.
 *
 * The title itself is **not** stable — `ticketTitle` tracks the newest
 * occurrence, so a later failure naming a different step rewrites it. Searching
 * on it would therefore miss, and a miss means a duplicate issue. The marker is
 * derived from the signature alone, so it survives every display change.
 *
 * Hashed rather than inlined because a signature runs to ~180 characters and
 * embeds the raw error message; the whole thing in a title would be unreadable.
 * The signature stays visible in full on the Notion row and in the issue body.
 */
export function signatureMarker(signature: string): string {
	const hash = createHash("sha256").update(signature).digest("hex");
	return `zap-err:${hash.slice(0, MARKER_HASH_CHARS)}`;
}

/** `<ticket title> [zap-err:a1b2c3d4]` — see `signatureMarker` for the suffix. */
export function linearTitle(ticket: TicketState, signature: string): string {
	return `${ticketTitle(ticket)} [${signatureMarker(signature)}]`;
}

/**
 * The issue description, written **once at creation and never rewritten**.
 *
 * This is the same rule the Notion page body follows, for the same reason: an
 * agent owns the prose below the metadata, and a ticket is touched again every
 * time its signature recurs. Rewriting would destroy that analysis silently and
 * repeatedly. Recurrences post a comment instead — see `recurrenceComment`.
 *
 * So everything here is what is knowable at first sight. Counts deliberately are
 * not: they go stale immediately and the live number is on the Notion row.
 */
export function issueDescription(ticket: TicketState, signature: string): string {
	const lines = [
		`**Zap** ${ticket.zapName}`,
		`**Error** \`${ticket.errorType}\``,
	];
	if (ticket.step) lines.push(`**Failing step** \`${ticket.step}\``);
	lines.push(`**First seen** ${ticket.firstSeen}`);
	lines.push("", "```", clip(ticket.message, 1000), "```");
	lines.push(
		"",
		`<sub>Grouped on \`${signature}\` — opened by the \`zapier-durables-docs\` worker. ` +
			"Recurrences arrive as comments; this description is not rewritten.</sub>",
	);
	return lines.join("\n");
}

/**
 * A recurrence note.
 *
 * One per **cycle**, not per failed run — `since` is the count at the last note,
 * so a fault that failed nine more times in an hour gets one comment saying so
 * rather than nine. The alternative was noise on exactly the faults that matter
 * most, which is how a triage surface gets muted.
 */
export function recurrenceComment(ticket: TicketState, since: number): string {
	const added = ticket.count - since;
	const times = added === 1 ? "once" : `${added} times`;
	const lines = [`Recurred ${times} — ${ticket.count} occurrences in total, latest ${ticket.lastSeen}.`];
	if (ticket.step) lines.push("", `Failing step: \`${ticket.step}\``);
	return lines.join("\n");
}

/**
 * Whether a ticket has anything to say to Linear this cycle.
 *
 * A brand-new signature always does. An existing one only when its count has
 * moved since the last note, which is what keeps the re-scanned overlap window
 * from generating a comment an hour for a fault nobody has fixed yet.
 */
export function needsNotice(ticket: TicketState): boolean {
	if (!ticket.issueId) return true;
	return ticket.count > (ticket.noticedCount ?? 0);
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
// `Status`, `Priority`, `Assignee`, `Resolution Notes` and `Resolved on` are
// hand-made properties on the data source, not part of the managed schema — a
// declared property is `readOnly` in Notion and cannot be edited by a person,
// which is the one thing a triage column has to be. See the note above the
// database declaration in index.ts, and CLAUDE.md for their intended shape.
