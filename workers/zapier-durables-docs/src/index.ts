import { createHash } from "node:crypto";
import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { fetchRepoZaps, indexByWorkflowId } from "./github.js";
import { toNotionMarkdown } from "./markdown.js";
import { assertDeclared, SEEDED_APPS, SEEDED_CONNECTION_ALIASES } from "./options.js";
import { createUserResolver } from "./people.js";
import {
	fetchRunDetail,
	formatRunOutput,
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
