import { createHash } from "node:crypto";
import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { fetchRepoZaps, indexByWorkflowId } from "./github.js";
import { toNotionMarkdown } from "./markdown.js";
import { createUserResolver } from "./people.js";
import {
	fetchRunOutput,
	formatRunOutput,
	listRunsPage,
	normaliseStatus,
	RUN_STATUS_OPTIONS,
	runDurationSeconds,
	runErrorText,
	type WorkflowRun,
} from "./runs.js";
import {
	countActionCallSites,
	countSteps,
	editorUrl,
	formatConnections,
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
			Connections: Schema.richText(),
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
// `runsBackfill` (manual, walks all history) and `runsDelta` (hourly, re-scans
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
			Status: Schema.select(RUN_STATUS_OPTIONS.map((name) => ({ name }))),
			"Workflow ID": Schema.richText(),
			"Version ID": Schema.richText(),
			"Trigger ID": Schema.richText(),
			"Durable Run ID": Schema.richText(),
			Error: Schema.richText(),
			Output: Schema.richText(),
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

// Content hashes keyed by workflow id. The hash covers the page body and every
// synced property, so any upstream edit — including a README-only edit —
// produces a new hash.
type SyncState = { hashes?: Record<string, string> };

function contentHash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// -- Sync -------------------------------------------------------------------
// Replace mode: at nine durables, mark-and-sweep is the cheapest correct way to
// handle a deleted Zap, and a full listing is one call either way. Everything
// is fetched in a single execution, so hasMore is always false.
//
// Hourly. A cycle is ~32 upstream calls (1 workflow listing + 9 getWorkflow, 1
// repo listing + 2 files per directory, 1 cached People query), so this is well
// inside GitHub's authenticated 5000/hour even with the pacers throttling it.
worker.sync("zapsSync", {
	database: zaps,
	mode: "replace",
	schedule: "1h",
	execute: async (state: SyncState | undefined) => {
		const previousHashes = state?.hashes ?? {};
		const resolveCreatorEmail = createUserResolver(notionApi);

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
				connections: formatConnections(version),
				dependencies: formatDependencies(version),
				steps: countSteps(version),
				actionCallSites: countActionCallSites(version),
				creatorId,
				creatorEmail: creatorEmail ?? "",
				created: workflow.created_at ?? "",
				updated: workflow.updated_at ?? "",
				body: body ?? "",
			};

			const hash = contentHash(fields);
			nextHashes[workflow.id] = hash;

			// Replace mode sweeps anything not emitted, so an unchanged row must
			// still be emitted — skipping it would delete it. The hash therefore
			// only gates re-sending the page body, which is the expensive part of
			// the write and the part that replaces rather than merges.
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
					Connections: Builder.richText(fields.connections),
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
 * `Output` costs one `getWorkflowRun` call per run, so only the delta fetches
 * it — a backfill would add one call per historical run for no added value on
 * rows nobody is watching.
 *
 * In steady state the delta emits ~12 rows, so this cap never binds. It exists
 * for the cold-start case (no watermarks, ~211 rows), where fetching an output
 * for every row would run the execution into its timeout. When it binds, the
 * newest rows win and the shortfall is logged rather than passing silently.
 */
const MAX_OUTPUT_FETCHES_PER_EXECUTION = 60;

type RunsState = { watermarks?: Record<string, string>; index?: number; cursor?: string };

function runRow(run: WorkflowRun, workflowId: string, zapName: string, output?: unknown) {
	const duration = runDurationSeconds(run);
	const errorText = runErrorText(run.error);
	const outputText = formatRunOutput(output);
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
			...(duration === undefined ? {} : { "Duration (s)": Builder.number(duration) }),
			...(run.created_at ? { Started: Builder.dateTime(run.created_at) } : {}),
			...(run.updated_at ? { Updated: Builder.dateTime(run.updated_at) } : {}),
		},
	};
}

// Backfill: walks every run of every durable, one workflow per execution chain.
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
				{ cursor, pageSize: RUN_PAGE_SIZE },
				zapierApi,
			);
			for (const run of page.runs) {
				changes.push(runRow(run, workflow.id, workflow.name));
				if (run.updated_at > highest) highest = run.updated_at;
			}
			cursor = page.nextCursor;
			pages++;
		} while (cursor && pages < MAX_PAGES_PER_EXECUTION);

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

// Delta: hourly re-scan of the recent window for every durable.
//
// There is no server-side date filter, so this pages newest-first and stops as
// soon as it passes the watermark minus the overlap. At current volumes that is
// one page per durable.
worker.sync("runsDelta", {
	database: runs,
	mode: "incremental",
	schedule: "1h",
	execute: async (state: RunsState | undefined) => {
		const workflows = await listWorkflows(zapierApi);
		const watermarks = { ...(state?.watermarks ?? {}) };
		const pending: Array<{ run: WorkflowRun; workflowId: string; zapName: string }> = [];

		for (const workflow of workflows) {
			const previous = watermarks[workflow.id];
			// No watermark yet means the backfill has not covered this durable
			// (a Zap created since). Take the first page so it is not invisible
			// until someone remembers to re-run the backfill.
			const floor = previous
				? new Date(Date.parse(previous) - RUN_OVERLAP_MS).toISOString()
				: undefined;

			let cursor: string | undefined;
			let pages = 0;
			let highest = previous ?? "";
			let done = false;

			do {
				const page = await listRunsPage(
					workflow.id,
					{ cursor, pageSize: RUN_PAGE_SIZE },
					zapierApi,
				);
				for (const run of page.runs) {
					if (floor && run.updated_at < floor) {
						done = true; // newest-first, so everything after this is older
						continue;
					}
					pending.push({ run, workflowId: workflow.id, zapName: workflow.name });
					if (run.updated_at > highest) highest = run.updated_at;
				}
				cursor = page.nextCursor;
				pages++;
				// Without a watermark, take one page only — the backfill owns history.
				if (!floor) break;
			} while (cursor && !done && pages < MAX_PAGES_PER_EXECUTION);

			if (highest) watermarks[workflow.id] = highest;
		}

		// Newest first, so if the cap binds it keeps the runs someone is most
		// likely to be looking at.
		pending.sort((a, b) => b.run.updated_at.localeCompare(a.run.updated_at));
		if (pending.length > MAX_OUTPUT_FETCHES_PER_EXECUTION) {
			console.warn(
				`${pending.length} runs to emit; fetching Output for the newest ` +
					`${MAX_OUTPUT_FETCHES_PER_EXECUTION}. The remainder keep an empty Output ` +
					`until they are re-emitted.`,
			);
		}

		const changes = [];
		for (const [i, { run, workflowId, zapName }] of pending.entries()) {
			const output =
				i < MAX_OUTPUT_FETCHES_PER_EXECUTION
					? await fetchRunOutput(workflowId, run.id, zapierApi)
					: undefined;
			changes.push(runRow(run, workflowId, zapName, output));
		}

		return { changes, hasMore: false, nextState: { watermarks } };
	},
});
