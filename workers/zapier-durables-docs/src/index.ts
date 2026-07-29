import { createHash } from "node:crypto";
import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import {
	accumulate,
	assessGate,
	clip,
	evictOldest,
	GATE_PAGE_SIZE,
	isFullWalkDue,
	isTriageable,
	MAX_TICKETS,
	occurrenceFrom,
	ticketTitle,
	type TicketState,
} from "./errors.js";
import { fetchRepoZaps, indexByWorkflowId } from "./github.js";
import { toNotionMarkdown } from "./markdown.js";
import { assertDeclared, SEEDED_APPS, SEEDED_CONNECTION_ALIASES } from "./options.js";
import { createUserResolver } from "./people.js";
import {
	fetchRunDetail,
	formatRunOutput,
	listDurableRunsPage,
	listRunsPage,
	normaliseStatus,
	RUN_STATUS_OPTIONS,
	runDurationSeconds,
	type RunDetail,
	runErrorText,
	type WorkflowRun,
} from "./runs.js";
import {
	connectionAliases,
	countActionCallSites,
	countSteps,
	createAppResolver,
	editorUrl,
	formatDependencies,
	getWorkflowVersion,
	listWorkflows,
	triggerAppName,
} from "./workflows.js";

const worker = new Worker();
export default worker;


// -- Managed database -------------------------------------------------------
// One row per *deployed* durable. The row set is exactly what `listWorkflows`
// returns, so non-deployed repo directories and classic Code-step Zaps never
// appear; GitHub is enrichment only.
//
// "Creator ID" sits alongside "Creator" on purpose: while the People mapping is
// still being backfilled most durables resolve to no Notion user, and keeping
// the raw Zapier id visible makes that obvious rather than silently blank.
const zaps = worker.database("zaps", {
	type: "managed",
	initialTitle: "Zapier Zaps",
	primaryKeyProperty: "Workflow ID",
	schema: {
		properties: {
			Name: Schema.title(),
			"Workflow ID": Schema.richText(),
			Status: Schema.select([
				{ name: "Enabled", color: "green" },
				{ name: "Disabled", color: "red" },
			]),
			Description: Schema.richText(),
			"Trigger App": Schema.richText(),
			"Trigger Event": Schema.richText(),
			"Editor URL": Schema.url(),
			"GitHub URL": Schema.url(),
			"Version ID": Schema.richText(),
			"Durable Version": Schema.richText(),
			// Multi-select rather than comma-separated text, so the database can
			// be filtered and grouped by them. The declared options are the whole
			// allowed set — the platform silently drops anything else — so a new
			// app or alias needs a change in src/options.ts and a deploy.
			Connections: Schema.multiSelect(SEEDED_CONNECTION_ALIASES),
			Apps: Schema.multiSelect(SEEDED_APPS),
			Dependencies: Schema.richText(),
			// Static complexity, counted off source_files (no extra API call).
			// Call sites, not executions — and they nest, so do not sum them.
			Steps: Schema.number(),
			"Action Call Sites": Schema.number(),
			Creator: Schema.people(),
			"Creator ID": Schema.richText(),
			Created: Schema.date(),
			Updated: Schema.date(),
		},
	},
});

// -- Run history ------------------------------------------------------------
// One row per workflow run, related back to its Zap. Two syncs write here:
// `runsBackfill` (manual, walks all history) and `runsDelta` (every 6h, re-scans
// the recent window). Both are incremental — see the note on runsBackfill for
// why this deliberately departs from the usual replace-mode backfill.
const runs = worker.database("runs", {
	type: "managed",
	initialTitle: "Zapier Zap Runs",
	primaryKeyProperty: "Run ID",
	schema: {
		properties: {
			Name: Schema.title(),
			"Run ID": Schema.richText(),
			// Matches on the Zaps primary key, which is "Workflow ID" — so the
			// relation sets itself with no lookup.
			Zap: Schema.relation("zaps", { twoWay: true, relatedPropertyName: "Runs" }),
			Status: Schema.select(RUN_STATUS_OPTIONS),
			"Workflow ID": Schema.richText(),
			"Version ID": Schema.richText(),
			"Trigger ID": Schema.richText(),
			"Durable Run ID": Schema.richText(),
			Error: Schema.richText(),
			Output: Schema.richText(),
			// Runtime intensity, from the operations journal. Unlike the Zaps
			// database's static call-site counts, these are what actually ran.
			Operations: Schema.number(),
			Retries: Schema.number(),
			Attempts: Schema.number(),
			"Duration (s)": Schema.number(),
			Started: Schema.date(),
			Updated: Schema.date(),
		},
	},
});

// -- Failure triage ---------------------------------------------------------
// One row per *recurring error signature*, not per failed run — see the header
// of src/errors.ts for why, and for what the signature is keyed on.
//
// **The triage workflow columns are deliberately NOT declared here.** `Status`,
// `Priority`, `Assignee`, `Resolution Notes` and `Resolved` live on the data
// source as ordinary hand-made properties instead.
//
// Declaring a property in a managed schema is what makes Notion mark it
// `readOnly: true` — verified 2026-07-29, when all five were declared here and
// nobody could set a status. Simply never emitting a value does *not* help:
// managed-ness follows the declaration, not the writes. So anything a human has
// to edit must stay out of this schema.
//
// The cost is that those five are not reproducible from code. Their intended
// shape is recorded in this worker's CLAUDE.md; if this database is ever
// recreated they have to be added back by hand.
//
// **Properties hold only metadata lifted off the run. Diagnosis goes in the page
// body, which an agent owns — so this sync must never write the body.**
// `pageContentMarkdown` replaces a page body *in its entirety*: verified
// elsewhere in this worker that it wipes appended blocks and moves child pages to
// trash. A ticket is re-upserted every time its signature recurs, so emitting a
// body here would destroy the agent's analysis on the next recurrence, silently
// and repeatedly. There is deliberately no `pageContentMarkdown` in `changes`
// below, and none may be added.
//
// This is why there is no `Root Cause` property. The root cause is available to
// whatever writes the body via `fetchRunDetail(durableRunId).rootCause`, which
// reads it out of the operations journal — see `failureDetail` in src/runs.ts.
const errorTickets = worker.database("errors", {
	type: "managed",
	initialTitle: "Zapier Error Triage",
	primaryKeyProperty: "Signature",
	schema: {
		properties: {
			Ticket: Schema.title(),
			// The grouping key. Kept as a visible column rather than hashed, so it
			// is possible to see *why* two failures landed on one ticket.
			Signature: Schema.richText(),
			Zap: Schema.relation("zaps", { twoWay: true, relatedPropertyName: "Error Tickets" }),
			// A sample of the failing runs, newest first — capped, so `Occurrences`
			// is the count, not the number of links here.
			"Zap Runs": Schema.relation("runs", {
				twoWay: true,
				relatedPropertyName: "Triage Ticket",
			}),
			"Error Type": Schema.richText(),
			"Error Message": Schema.richText(),
			// The name of the operation that did not complete, from the journal.
			// Metadata, not diagnosis — see the note below on Root Cause.
			"Failing Step": Schema.richText(),
			Occurrences: Schema.number(),
			"First Seen": Schema.date(),
			"Last Seen": Schema.date(),
		},
	},
});

// -- Pacers -----------------------------------------------------------------
// GitHub allows 5000 req/hour authenticated; a cycle uses roughly 25 (one
// listing, plus zap.json and README per directory). Zapier publishes no hard
// number for the workflows API — a cycle is one listing plus one getWorkflow
// per durable. Both budgets are deliberately conservative rather than tuned.
const githubApi = worker.pacer("githubApi", { allowedRequests: 30, intervalMs: 60_000 });
const zapierApi = worker.pacer("zapierApi", { allowedRequests: 30, intervalMs: 60_000 });
const notionApi = worker.pacer("notionApi", { allowedRequests: 30, intervalMs: 60_000 });

// Content hashes keyed by workflow id, covering the page body only — see the
// note at the point of use for why properties are deliberately excluded.
type SyncState = { hashes?: Record<string, string> };

function contentHash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// -- Sync -------------------------------------------------------------------
// Replace mode: at nine durables, mark-and-sweep is the cheapest correct way to
// handle a deleted Zap, and a full listing is one call either way. Everything
// is fetched in a single execution, so hasMore is always false.
//
// Every 6 hours. A cycle is ~3 upstream calls per durable plus a repo listing
// and the app lookups, so well inside GitHub's authenticated 5000/hour.
worker.sync("zapsSync", {
	database: zaps,
	mode: "replace",
	schedule: "6h",
	execute: async (state: SyncState | undefined) => {
		const previousHashes = state?.hashes ?? {};
		const resolveCreatorEmail = createUserResolver(notionApi);
		// Both lookups behind it are cached for the whole cycle: one
		// listConnections, and one getApp per distinct app key.
		const resolveApps = createAppResolver(zapierApi);

		// A throw fails the run without committing nextState, so the next run
		// retries from the last good state rather than half-writing.
		const workflows = await listWorkflows(zapierApi);

		// Replace mode sweeps every row the cycle does not emit. An empty list
		// is far more likely to be an upstream blip than a genuine "all Zaps
		// deleted", and acting on it would wipe the database.
		if (workflows.length === 0) {
			throw new Error("listWorkflows returned no durables — refusing to sweep every row");
		}

		const repoIndex = indexByWorkflowId(await fetchRepoZaps(githubApi));

		const nextHashes: Record<string, string> = {};
		const changes = [];

		for (const workflow of workflows) {
			const version = await getWorkflowVersion(workflow.id, zapierApi);
			const repoZap = repoIndex.get(workflow.id);
			const trigger = workflow.triggers?.[0];
			const creatorId = workflow.created_by_user_id ?? "";
			const creatorEmail = await resolveCreatorEmail(creatorId);
			const body = repoZap?.readme ? toNotionMarkdown(repoZap.readme) : undefined;

			const fields = {
				name: workflow.name,
				status: workflow.enabled ? "Enabled" : "Disabled",
				description: workflow.description ?? "",
				triggerApp: triggerAppName(trigger?.selected_api),
				triggerEvent: trigger?.action ?? "",
				githubUrl: repoZap?.htmlUrl ?? "",
				versionId: workflow.current_version_id ?? "",
				durableVersion: version?.zapier_durable_version ?? "",
				// Warns rather than filters: an undeclared value is dropped by the
				// platform either way, and the log is what makes it visible.
				connections: assertDeclared("Connections", connectionAliases(version), workflow.name),
				apps: assertDeclared(
					"Apps",
					await resolveApps(trigger?.selected_api, version),
					workflow.name,
				),
				dependencies: formatDependencies(version),
				steps: countSteps(version),
				actionCallSites: countActionCallSites(version),
				creatorId,
				creatorEmail: creatorEmail ?? "",
				created: workflow.created_at ?? "",
				updated: workflow.updated_at ?? "",
				body: body ?? "",
			};

			// Hash the **body alone**, not the whole row.
			//
			// `pageContentMarkdown` replaces the entire page body, and verified
			// 2026-07-26 that includes anything a person added by hand: an
			// appended block is wiped, and a child page is moved to trash.
			//
			// So the body must be re-sent as rarely as possible. Hashing every
			// field meant any property change re-sent it — and `Updated` moves
			// whenever the Zap is edited, `Version ID` / `Durable Version` /
			// `Dependencies` on every republish — so hand-added blocks rarely
			// survived a day. Keyed on the body, they survive until the README
			// itself changes.
			//
			// Properties are still emitted every cycle: replace mode sweeps any
			// row it does not see, so skipping one would delete it.
			const hash = contentHash(fields.body);
			nextHashes[workflow.id] = hash;
			const bodyUnchanged = previousHashes[workflow.id] === hash;

			changes.push({
				type: "upsert" as const,
				key: workflow.id,
				properties: {
					Name: Builder.title(fields.name),
					"Workflow ID": Builder.richText(workflow.id),
					Status: Builder.select(fields.status),
					Description: Builder.richText(fields.description),
					"Trigger App": Builder.richText(fields.triggerApp),
					"Trigger Event": Builder.richText(fields.triggerEvent),
					// The durables editor is safe to publish. `trigger_url` is
					// never synced — it embeds a secret token.
					"Editor URL": Builder.url(editorUrl(workflow.id)),
					"Version ID": Builder.richText(fields.versionId),
					"Durable Version": Builder.richText(fields.durableVersion),
					Connections: Builder.multiSelect(...fields.connections),
					Apps: Builder.multiSelect(...fields.apps),
					Dependencies: Builder.richText(fields.dependencies),
					Steps: Builder.number(fields.steps),
					"Action Call Sites": Builder.number(fields.actionCallSites),
					// `people` takes emails, not user ids. An unresolved creator
					// leaves this empty and "Creator ID" carries the raw id.
					Creator: Builder.people(...(creatorEmail ? [creatorEmail] : [])),
					"Creator ID": Builder.richText(fields.creatorId),
					// These builders reject null, so an absent value omits the
					// property rather than writing a blank one.
					...(fields.githubUrl ? { "GitHub URL": Builder.url(fields.githubUrl) } : {}),
					...(fields.created ? { Created: Builder.dateTime(fields.created) } : {}),
					...(fields.updated ? { Updated: Builder.dateTime(fields.updated) } : {}),
				},
				...(body && !bodyUnchanged ? { pageContentMarkdown: body } : {}),
			});
		}

		return { changes, hasMore: false, nextState: { hashes: nextHashes } };
	},
});

// -- Run history syncs ------------------------------------------------------

/** Zapier reports a run's status ~20s after creating it, and there is no
 * server-side date filter, so the delta re-scans this far back on every cycle
 * and re-upserts. Generous because the cost is a page we would fetch anyway. */
const RUN_OVERLAP_MS = 60 * 60 * 1000;

/** Newest-first pages let us stop early; this bounds one execution's work. */
const RUN_PAGE_SIZE = 100;
const MAX_PAGES_PER_EXECUTION = 20;

/**
 * The backfill fetches run detail for every row, which is one extra call and
 * ~12 KB per run. One modest page per execution keeps each execution well
 * inside its timeout and lets the sync cycle resume from the cursor; the whole
 * history is still covered, just across more executions.
 */
const BACKFILL_PAGE_SIZE = 25;
const BACKFILL_PAGES_PER_EXECUTION = 1;

/**
 * `Output`, `Operations`, `Retries` and `Attempts` all come from one
 * `getDurableRun` call per run.
 *
 * The cap is per execution, and the delta now handles one durable per
 * execution, so it bounds a single durable's newest runs rather than the whole
 * cycle's.
 *
 * When it binds, the newest rows win and the shortfall is logged rather than
 * passing silently.
 */
const MAX_DETAIL_FETCHES_PER_EXECUTION = 60;

type RunsState = { watermarks?: Record<string, string>; index?: number; cursor?: string };

function runRow(run: WorkflowRun, workflowId: string, zapName: string, detail?: RunDetail) {
	const duration = runDurationSeconds(run);
	const errorText = runErrorText(run.error);
	const outputText = formatRunOutput(detail?.output);
	return {
		type: "upsert" as const,
		key: run.id,
		properties: {
			Name: Builder.title(`${zapName} · ${run.created_at}`),
			"Run ID": Builder.richText(run.id),
			// Relates by the Zaps row's primary key value.
			Zap: [Builder.relation(workflowId)],
			Status: Builder.select(normaliseStatus(run.status)),
			"Workflow ID": Builder.richText(workflowId),
			"Version ID": Builder.richText(run.workflow_version_id ?? ""),
			"Trigger ID": Builder.richText(run.trigger_id ?? ""),
			"Durable Run ID": Builder.richText(run.durable_run_id ?? ""),
			Error: Builder.richText(errorText),
			Output: Builder.richText(outputText),
			// Omitted rather than zeroed when detail is unavailable — a real
			// zero (a run that failed before any step) must stay distinguishable
			// from "not fetched".
			...(detail
				? {
						Operations: Builder.number(detail.operations),
						Retries: Builder.number(detail.retries),
						Attempts: Builder.number(detail.attempts),
					}
				: {}),
			...(duration === undefined ? {} : { "Duration (s)": Builder.number(duration) }),
			...(run.created_at ? { Started: Builder.dateTime(run.created_at) } : {}),
			...(run.updated_at ? { Updated: Builder.dateTime(run.updated_at) } : {}),
		},
	};
}

// Backfill: walks every run of every durable, one page per execution.
//
// Unlike the delta this fetches run detail for *every* row, so a one-off
// backfill also populates Output/Operations/Retries/Attempts on historical
// runs. That is ~2 calls and ~12 KB per run, hence the small page size.
//
// Incremental, *not* replace. The usual backfill pattern uses replace mode so
// mark-and-sweep cleans up drift, but Zapier ages runs out of its own history —
// a replace-mode pass would then delete exactly the records this database
// exists to preserve. Nothing here ever emits a delete.
//
//   ntn workers sync state reset runsBackfill && ntn workers sync trigger runsBackfill
worker.sync("runsBackfill", {
	database: runs,
	mode: "incremental",
	schedule: "manual",
	execute: async (state: RunsState | undefined) => {
		const workflows = await listWorkflows(zapierApi);
		const index = state?.index ?? 0;
		const watermarks = { ...(state?.watermarks ?? {}) };

		if (index >= workflows.length) {
			return { changes: [], hasMore: false, nextState: { watermarks } };
		}

		const workflow = workflows[index];
		const changes = [];
		let cursor = state?.cursor;
		let pages = 0;
		let highest = watermarks[workflow.id] ?? "";

		do {
			const page = await listRunsPage(
				workflow.id,
				{ cursor, pageSize: BACKFILL_PAGE_SIZE },
				zapierApi,
			);
			for (const run of page.runs) {
				const detail = await fetchRunDetail(run.durable_run_id, zapierApi);
				changes.push(runRow(run, workflow.id, workflow.name, detail));
				if (run.updated_at > highest) highest = run.updated_at;
			}
			cursor = page.nextCursor;
			pages++;
		} while (cursor && pages < BACKFILL_PAGES_PER_EXECUTION);

		watermarks[workflow.id] = highest;

		// Resume mid-workflow if it paged out, otherwise advance to the next.
		return {
			changes,
			hasMore: true,
			nextState: cursor
				? { watermarks, index, cursor }
				: { watermarks, index: index + 1, cursor: undefined },
		};
	},
});

// Delta: six-hourly re-scan of the recent window for every durable.
//
// There is no server-side date filter, so this pages newest-first and stops as
// soon as it passes the watermark minus the overlap.
//
// **One durable per execution**, chaining via hasMore until all are covered.
// Doing all of them in a single execution timed out at ~300s once run volume
// grew: 81 runs in a cycle meant ~75 API calls, and the zapierApi pacer is
// shared across three syncs so each gets a fraction of its 30/min. Per durable
// an execution is ~10 calls, which stays comfortably short however much the
// volume grows — and the longer the gap between cycles, the more this matters.
worker.sync("runsDelta", {
	database: runs,
	mode: "incremental",
	schedule: "6h",
	execute: async (state: RunsState | undefined) => {
		const workflows = await listWorkflows(zapierApi);
		const watermarks = { ...(state?.watermarks ?? {}) };
		const index = state?.index ?? 0;

		// Cycle complete. Dropping `index` resets it for the next scheduled run.
		if (index >= workflows.length) {
			return { changes: [], hasMore: false, nextState: { watermarks } };
		}

		const workflow = workflows[index];
		const previous = watermarks[workflow.id];
		// No watermark yet means the backfill has not covered this durable
		// (a Zap created since). Take the first page so it is not invisible
		// until someone remembers to re-run the backfill.
		const floor = previous
			? new Date(Date.parse(previous) - RUN_OVERLAP_MS).toISOString()
			: undefined;

		const pending: WorkflowRun[] = [];
		let cursor = state?.cursor;
		let pages = 0;
		let highest = previous ?? "";
		let done = false;

		do {
			const page = await listRunsPage(workflow.id, { cursor, pageSize: RUN_PAGE_SIZE }, zapierApi);
			for (const run of page.runs) {
				if (floor && run.updated_at < floor) {
					done = true; // newest-first, so everything after this is older
					continue;
				}
				pending.push(run);
				if (run.updated_at > highest) highest = run.updated_at;
			}
			cursor = page.nextCursor;
			pages++;
			// Without a watermark, take one page only — the backfill owns history.
			if (!floor) break;
		} while (cursor && !done && pages < MAX_PAGES_PER_EXECUTION);

		if (highest) watermarks[workflow.id] = highest;

		// Newest first, so if the cap binds it keeps the runs someone is most
		// likely to be looking at.
		pending.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
		if (pending.length > MAX_DETAIL_FETCHES_PER_EXECUTION) {
			console.warn(
				`${workflow.name}: ${pending.length} runs to emit; fetching run detail for the ` +
					`newest ${MAX_DETAIL_FETCHES_PER_EXECUTION}. The remainder omit Output and the ` +
					`operation counts until they are re-emitted.`,
			);
		}

		const changes = [];
		for (const [i, run] of pending.entries()) {
			const detail =
				i < MAX_DETAIL_FETCHES_PER_EXECUTION
					? await fetchRunDetail(run.durable_run_id, zapierApi)
					: undefined;
			changes.push(runRow(run, workflow.id, workflow.name, detail));
		}

		// One durable per execution, chaining until all are done. See the header.
		return { changes, hasMore: true, nextState: { watermarks, index: index + 1 } };
	},
});

// -- Failure triage sync ----------------------------------------------------

/**
 * Journal fetches per execution. Failures are rare — 33 in the first two months
 * — so this only ever binds on the initial walk through history. When it does,
 * the newest failures win (they are what someone is looking at) and the rest are
 * still counted, just without `Failing Step` / `Root Cause` until they recur.
 */
const MAX_TRIAGE_DETAIL_FETCHES = 40;

/**
 * Pages per execution while walking a durable's whole history for the first
 * time. Deliberately far below `MAX_PAGES_PER_EXECUTION`: the initial pass also
 * fetches a journal per failure, and `runsDelta` has already been timed out once
 * at ~75 upstream calls in one execution. The walk resumes from the cursor.
 */
const INITIAL_PAGES_PER_EXECUTION = 4;

type TriageState = {
	watermarks?: Record<string, string>;
	index?: number;
	cursor?: string;
	/** Highest `updated_at` seen so far in an in-progress multi-execution walk.
	 *  Held separately because the real watermark must not move until the walk
	 *  finishes — see the note at the point of use. */
	pendingWatermark?: string;
	tickets?: Record<string, TicketState>;
	/** Highest durable-run `updated_at` the account-wide gate has seen. Separate
	 *  from `watermarks`: those are per workflow and keyed on workflow-run
	 *  timestamps, this is one account-wide baseline on durable-run timestamps. */
	gateWatermark?: string;
	/** When the last full walk started. The gate is overruled once this goes
	 *  stale, so a gate that wrongly clears costs latency, not a lost ticket. */
	lastFullWalkAt?: string;
};

/**
 * There is deliberately **one** sync here, not the repo's usual
 * backfill + delta pair.
 *
 * Sync state is per sync key, so a separate backfill would accumulate its own
 * ticket counts that the delta could not see — the delta's first cycle would
 * then overwrite `Occurrences: 14` with `Occurrences: 1`. Any aggregate column
 * forces the counting into a single state. So this sync does both jobs: with no
 * watermark for a durable it walks that durable's entire history (across as many
 * executions as it takes, resuming from the cursor), and afterwards it re-scans
 * only the recent overlap window.
 *
 * Incremental, and it never emits a delete — same reasoning as the run syncs.
 * The recovery path for a bad count or a changed signature scheme is
 * `ntn workers sync state reset errorsDelta`, which re-walks everything and
 * recomputes every count from scratch. Triage columns survive that: they are not
 * in the managed schema, so no sync can reach them.
 *
 * One durable per execution, chaining via hasMore.
 *
 * **Hourly, unlike the 6h run syncs** — a failure is worth seeing sooner than
 * the next working day.
 *
 * A walking cycle costs two Zapier calls per durable (`listWorkflows` + one
 * `listRunsPage`), because every execution re-lists the workflows to find its
 * own: ~54 at 27 durables. Hourly, most of those cycles would find nothing, so
 * the gate above short-circuits them for one call. See the note on the gate in
 * src/errors.ts for why it is advisory rather than authoritative.
 *
 * Note that `RUN_OVERLAP_MS` is also one hour, so at this cadence a walking
 * cycle re-lists the whole previous window. That is harmless: counting is gated
 * on the watermark, not on what the listing returns.
 */
worker.sync("errorsDelta", {
	database: errorTickets,
	mode: "incremental",
	schedule: "1h",
	execute: async (state: TriageState | undefined) => {
		const watermarks = { ...(state?.watermarks ?? {}) };
		const tickets = { ...(state?.tickets ?? {}) };
		const index = state?.index ?? 0;
		let gateWatermark = state?.gateWatermark;
		let lastFullWalkAt = state?.lastFullWalkAt;

		// -- The gate ---------------------------------------------------------
		// Once per cycle, and deliberately *before* `listWorkflows`, so a quiet
		// cycle costs one upstream call rather than ~54. Skipped on a resumed
		// cycle (index > 0), which is already mid-walk.
		if (index === 0) {
			const recent = await listDurableRunsPage(GATE_PAGE_SIZE, zapierApi);
			const verdict = assessGate(recent, gateWatermark);
			if (verdict.highest) gateWatermark = verdict.highest;

			// Overruled on a schedule: the gate is an optimisation, and its
			// coverage across all durables has not been proven.
			const overdue = isFullWalkDue(lastFullWalkAt);
			if (verdict.conclusive && !verdict.hasNewFailures && !overdue) {
				return {
					changes: [],
					hasMore: false,
					nextState: { watermarks, tickets, gateWatermark, lastFullWalkAt },
				};
			}

			// Stamped at the start, not the end. A cycle interrupted mid-walk
			// resumes from `index` on the next tick, so the walk still completes,
			// and stamping on completion would need another state field to
			// distinguish "resumed" from "started".
			lastFullWalkAt = new Date().toISOString();
		}

		const workflows = await listWorkflows(zapierApi);

		// Cycle complete. Dropping `index` resets it for the next scheduled run.
		if (index >= workflows.length) {
			return {
				changes: [],
				hasMore: false,
				nextState: { watermarks, tickets, gateWatermark, lastFullWalkAt },
			};
		}

		const workflow = workflows[index];
		const previous = watermarks[workflow.id];
		const initialWalk = !previous;
		const floor = previous
			? new Date(Date.parse(previous) - RUN_OVERLAP_MS).toISOString()
			: undefined;

		const failures: WorkflowRun[] = [];
		let cursor = state?.cursor;
		let pages = 0;
		let highest = state?.pendingWatermark ?? previous ?? "";
		let done = false;
		const pageBudget = initialWalk ? INITIAL_PAGES_PER_EXECUTION : MAX_PAGES_PER_EXECUTION;

		do {
			const page = await listRunsPage(workflow.id, { cursor, pageSize: RUN_PAGE_SIZE }, zapierApi);
			for (const run of page.runs) {
				if (floor && run.updated_at < floor) {
					done = true; // newest-first, so everything after this is older
					continue;
				}
				if (run.updated_at > highest) highest = run.updated_at;
				if (!isTriageable(run.status)) continue;
				// Count each failure exactly once. The overlap window re-lists runs
				// that were already counted, and only a genuine mutation pushes
				// `updated_at` past the watermark we counted them at.
				if (previous && run.updated_at <= previous) continue;
				failures.push(run);
			}
			cursor = page.nextCursor;
			pages++;
		} while (cursor && !done && pages < pageBudget);

		const walkComplete = !cursor || done;

		// The watermark must not move until the durable is fully walked. Page one
		// carries the newest run, so a partial pass already knows the eventual
		// high-water mark — committing it early would make the next execution skip
		// every older failure it has not reached yet.
		if (walkComplete) {
			if (highest) watermarks[workflow.id] = highest;
		}

		if (failures.length > MAX_TRIAGE_DETAIL_FETCHES) {
			console.warn(
				`${workflow.name}: ${failures.length} new failures; fetching the operations journal ` +
					`for the newest ${MAX_TRIAGE_DETAIL_FETCHES}. The rest are counted but omit ` +
					`Failing Step and Root Cause until they recur.`,
			);
		}

		// Newest-first from the API, and pushed in order, so the cap keeps the
		// failures someone is most likely to be looking at.
		const touched = new Set<string>();
		for (const [i, run] of failures.entries()) {
			const detail =
				i < MAX_TRIAGE_DETAIL_FETCHES
					? await fetchRunDetail(run.durable_run_id, zapierApi)
					: undefined;
			const occurrence = occurrenceFrom(run, workflow.id, workflow.name, detail);
			accumulate(tickets, occurrence);
			touched.add(occurrence.signature);
		}

		const changes = [...touched].map((signature) => {
			const ticket = tickets[signature];
			return {
				type: "upsert" as const,
				key: signature,
				icon: Builder.emojiIcon("🚨"),
				properties: {
					Ticket: Builder.title(ticketTitle(ticket)),
					Signature: Builder.richText(signature),
					// Both relations match on the related row's primary key, so they
					// set themselves with no lookup.
					Zap: [Builder.relation(ticket.workflowId)],
					"Zap Runs": ticket.runIds.map((runId) => Builder.relation(runId)),
					"Error Type": Builder.richText(ticket.errorType),
					"Error Message": Builder.richText(clip(ticket.message)),
					Occurrences: Builder.number(ticket.count),
					"First Seen": Builder.dateTime(ticket.firstSeen),
					"Last Seen": Builder.dateTime(ticket.lastSeen),
					// Omitted rather than blanked when the journal was unavailable, so
					// a transient `getDurableRun` failure cannot erase a step name an
					// earlier occurrence established.
					...(ticket.step ? { "Failing Step": Builder.richText(ticket.step) } : {}),
				},
			};
		});

		// After building changes, so an evicted ticket is still written out once
		// more before it stops accumulating.
		const evicted = evictOldest(tickets);
		if (evicted.length > 0) {
			console.warn(
				`Ticket state hit ${MAX_TICKETS} signatures; evicted the ${evicted.length} ` +
					`least-recently-seen. Their Notion rows remain but stop counting. This ` +
					`usually means normaliseMessage is not stripping something variable: ` +
					`${evicted.slice(0, 3).join(" | ")}`,
			);
		}

		// Resume mid-durable if it paged out, otherwise advance to the next.
		return {
			changes,
			hasMore: true,
			nextState: walkComplete
				? { watermarks, tickets, gateWatermark, lastFullWalkAt, index: index + 1 }
				: {
						watermarks,
						tickets,
						gateWatermark,
						lastFullWalkAt,
						index,
						cursor,
						pendingWatermark: highest,
					},
		};
	},
});
