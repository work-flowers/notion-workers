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
import { createBudget } from "./budget.js";
import {
	dirHtmlUrl,
	isDirCached,
	listRepoDirs,
	readRepoDir,
	type RepoDirState,
} from "./github.js";
import { toNotionMarkdown } from "@work-flowers/notion-worker-shared";
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
	listWorkflowRefs,
	listWorkflows,
	triggerAppName,
	type WorkflowRef,
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
// `runsBackfill` (manual, walks all history) and `runsDelta` (daily, re-scans
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
// `Priority`, `Assignee`, `Resolution Notes` and `Resolved on` live on the data
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
// GitHub allows 5000 req/hour authenticated. A `zapsSync` cycle is now one
// listing plus two reads per *edited* directory rather than per directory, so a
// quiet cycle is a single call; the ceiling only matters on the first cycle after
// a state reset, when every directory is read. Zapier publishes no hard number
// for the workflows API — a cycle is one listing plus one getWorkflow per
// republished durable.
//
// The zapierApi budget is shared across three syncs, which is why the run syncs
// meter themselves against it per execution (see src/budget.ts).
//
// **These were 30/min each and that broke zapsSync.** A pacer's ceiling is also a
// floor on elapsed time, and at 48 repo directories a cold cycle needs ~97 GitHub
// and ~66 Zapier calls: at 30/min that is ~194s + ~132s of pure waiting, past the
// ~300s execution timeout. zapsSync then failed 325 consecutive times over 57
// hours (2026-08-10 to -12), each attempt running to the ceiling and committing
// nothing, because a timed-out handler never returns its `nextState`. Growth
// caused it — the last code change was two days earlier — so the lesson is that a
// conservative pacer is not a free choice, and a per-durable cost multiplied by a
// growing durable count eventually crosses the timeout.
//
// githubApi is now 80/min, comfortably inside GitHub's documented authenticated
// 5000/hour (~83/min), verified against `gh api rate_limit`. zapierApi publishes
// no limit, so 60/min is a doubling rather than a tuned figure — if Zapier starts
// returning 429s, this is the first place to look.
const githubApi = worker.pacer("githubApi", { allowedRequests: 80, intervalMs: 60_000 });
const zapierApi = worker.pacer("zapierApi", { allowedRequests: 60, intervalMs: 60_000 });
const notionApi = worker.pacer("notionApi", { allowedRequests: 30, intervalMs: 60_000 });

/**
 * Everything `zapsSync` derives from one `getWorkflow` call, remembered between
 * cycles and keyed by the workflow id.
 *
 * Valid exactly while `current_version_id` still matches `versionId` — a
 * republish moves that id, which is what invalidates the entry. The summary
 * carries the id for free, so validating the cache costs nothing.
 */
type VersionState = {
	versionId: string;
	durableVersion: string;
	connections: string[];
	apps: string[];
	dependencies: string;
	steps: number;
	actionCallSites: number;
};

/**
 * Progress through one in-flight `zapsSync` cycle. Absent means "start fresh".
 *
 * The walk is over **repo directories first**, not workflows, which is what lets
 * the cycle be spread over executions at all: a directory's README is only in
 * memory in the execution that read it, so the rows it belongs to have to be
 * emitted there and then. Caching 48 READMEs in state to decouple the two would
 * be far heavier than caching this.
 *
 * Workflows that no directory claims are emitted afterwards, from `restIndex` —
 * they need no GitHub read, so they can go last.
 */
type ZapsCycle = {
	/** Directory names to walk, fixed at cycle start. */
	dirOrder: string[];
	/** Progress through `dirOrder`. */
	dirIndex: number;
	/** Workflow ids already emitted this cycle. Guards the leftover pass, and a
	 *  duplicate `workflow_id` across two zap.json files, from double-emitting. */
	emitted: string[];
	/** Progress through the leftover workflows, once `dirOrder` is exhausted. */
	restIndex?: number;
	/** Workflow ids in a fixed order for the leftover pass. Pinned at cycle start
	 *  so a durable deployed mid-cycle cannot shift the index and cause a row to
	 *  be skipped — which, in replace mode, would sweep it. */
	order: string[];
};

type SyncState = {
	// Content hashes keyed by workflow id, covering the page body only — see the
	// note at the point of use for why properties are deliberately excluded.
	hashes?: Record<string, string>;
	/** Per-workflow version data, skipping `getWorkflow` until a republish. */
	versions?: Record<string, VersionState>;
	/** Per-directory repo state, skipping the GitHub reads until an edit. */
	dirs?: Record<string, RepoDirState>;
	cycle?: ZapsCycle;
};

function contentHash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// -- Sync -------------------------------------------------------------------
// Replace mode: mark-and-sweep is the cheapest correct way to handle a deleted
// Zap, and a full listing is one call either way.
//
// Daily, memoised, and **spread across executions**.
//
// A naive gate — bail out early with no changes when nothing looks different —
// is **not available here**, because replace mode sweeps any row a completed
// cycle does not emit. So every row is still emitted every cycle, and the saving
// comes from not re-deriving what has not changed. Two caches, each keyed on an
// identity that only moves when the content does:
//
//   - `versions`, keyed on `current_version_id`, skips `getWorkflow` (and with
//     it the `listConnections` / `getApp` lookups) until a republish.
//   - `dirs`, keyed on each directory's tree sha, skips the `zap.json` and
//     `README.md` reads until someone edits the repo.
//
// Both are validated against values the cheap listing calls already return, so
// the check itself is free. A quiet cycle is one `listWorkflows` and one repo
// listing; a cycle after one Zap was republished pays for that one Zap.
//
// **The pagination is not optional, and memoising alone would not have fixed
// this sync.** It used to do everything in one execution, and at 48 directories
// that is ~97 GitHub plus ~66 Zapier calls, which crossed the ~300s execution
// timeout in August 2026 and failed 325 times in a row. A timed-out handler never
// returns, so `nextState` is never committed — the caches would have stayed empty
// and every retry would have been another cold start. Progress has to be
// committable in bounded slices for the memoisation to ever take hold.
worker.sync("zapsSync", {
	database: zaps,
	mode: "replace",
	schedule: "1d",
	execute: async (state: SyncState | undefined) => {
		const budget = createBudget();
		const github = budget.meter(githubApi);
		const zapier = budget.meter(zapierApi);

		// Accumulated *over* the previous cycle's values, not from empty. A cycle
		// now commits state several times, and a fresh map would drop the hashes and
		// version data of every workflow this execution has not reached — re-sending
		// their page bodies next time and destroying hand-added blocks. Stale entries
		// are pruned when the cycle completes instead.
		const nextHashes: Record<string, string> = { ...(state?.hashes ?? {}) };
		const nextVersions: Record<string, VersionState> = { ...(state?.versions ?? {}) };
		const nextDirs: Record<string, RepoDirState> = { ...(state?.dirs ?? {}) };
		const previousHashes = state?.hashes ?? {};
		const previousVersions = state?.versions ?? {};

		const resolveCreatorEmail = createUserResolver(notionApi);
		// Both lookups behind it are cached for this execution: one listConnections,
		// and one getApp per distinct app key.
		const resolveApps = createAppResolver(zapier);

		// A throw fails the run without committing nextState, so the next run
		// retries from the last good state rather than half-writing.
		const workflows = await listWorkflows(zapier);

		// Replace mode sweeps every row the cycle does not emit. An empty list
		// is far more likely to be an upstream blip than a genuine "all Zaps
		// deleted", and acting on it would wipe the database.
		if (workflows.length === 0) {
			throw new Error("listWorkflows returned no durables — refusing to sweep every row");
		}
		const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]));

		const entries = await listRepoDirs(github);
		const entryByName = new Map(entries.map((entry) => [entry.name, entry]));

		const cycle: ZapsCycle = state?.cycle ?? {
			dirOrder: entries.map((entry) => entry.name),
			dirIndex: 0,
			emitted: [],
			order: workflows.map((workflow) => workflow.id),
		};
		const emitted = new Set(cycle.emitted);
		const changes = [];

		/**
		 * Build one row, and record it as emitted.
		 *
		 * Returns the change rather than pushing it, so the pushes stay in the same
		 * scope as `changes` — TypeScript only infers an evolving array type from
		 * pushes it can see there, not from ones inside this closure.
		 *
		 * `repoDir` is the directory that claims this workflow, if any: `readme`
		 * absent with `unchanged: true` means the directory was skipped on its sha
		 * and the body must be left exactly as it is.
		 */
		const buildRow = async (
			workflow: (typeof workflows)[number],
			repoDir?: { directory: string; readme?: string; unchanged?: boolean },
		) => {
			const trigger = workflow.triggers?.[0];
			const creatorId = workflow.created_by_user_id ?? "";
			const creatorEmail = await resolveCreatorEmail(creatorId);
			const body = repoDir?.readme ? toNotionMarkdown(repoDir.readme) : undefined;

			// -- Version data, from cache when the version has not moved ---------
			const versionId = workflow.current_version_id ?? "";
			const cachedVersion = previousVersions[workflow.id];
			let derived: VersionState;
			if (versionId && cachedVersion?.versionId === versionId) {
				derived = cachedVersion;
				nextVersions[workflow.id] = derived;
			} else {
				const version = await getWorkflowVersion(workflow.id, zapier);
				derived = {
					versionId,
					durableVersion: version?.zapier_durable_version ?? "",
					connections: connectionAliases(version),
					apps: await resolveApps(trigger?.selected_api, version),
					dependencies: formatDependencies(version),
					steps: countSteps(version),
					actionCallSites: countActionCallSites(version),
				};
				// Only cache a *successful* read. `getWorkflowVersion` degrades to
				// `undefined` on failure rather than throwing, so caching that would
				// freeze this row's version columns empty until the next republish
				// happened to move `current_version_id`.
				if (versionId && version) nextVersions[workflow.id] = derived;
			}

			const fields = {
				name: workflow.name,
				status: workflow.enabled ? "Enabled" : "Disabled",
				description: workflow.description ?? "",
				triggerApp: triggerAppName(trigger?.selected_api),
				triggerEvent: trigger?.action ?? "",
				githubUrl: repoDir ? dirHtmlUrl(repoDir.directory) : "",
				versionId,
				durableVersion: derived.durableVersion,
				// Warns rather than filters: an undeclared value is dropped by the
				// platform either way, and the log is what makes it visible. Applied
				// to the cached values too, so a deploy that changes src/options.ts
				// still surfaces every row it would drop, not just republished ones.
				connections: assertDeclared("Connections", derived.connections, workflow.name),
				apps: assertDeclared("Apps", derived.apps, workflow.name),
				dependencies: derived.dependencies,
				steps: derived.steps,
				actionCallSites: derived.actionCallSites,
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
			//
			// When the repo directory was skipped on its sha the README was never
			// fetched, so there is nothing to hash: carry the previous hash forward
			// untouched. Hashing the absent body instead would record a hash of
			// `undefined` and make the next *changed* cycle look like a body change.
			let bodyUnchanged: boolean;
			if (repoDir?.unchanged) {
				const carried = previousHashes[workflow.id];
				if (carried === undefined) {
					// Skipped on the strength of the sha, but the hash it pairs with is
					// gone — fresh state, or a workflow newly pointed at this directory.
					// Drop the cache entry so the next cycle reads the README and
					// re-establishes the hash, rather than skipping it forever.
					delete nextDirs[repoDir.directory];
				} else {
					nextHashes[workflow.id] = carried;
				}
				bodyUnchanged = true;
			} else {
				const hash = contentHash(fields.body);
				nextHashes[workflow.id] = hash;
				bodyUnchanged = previousHashes[workflow.id] === hash;
			}

			emitted.add(workflow.id);
			return {
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
			};
		};

		// -- Phase 1: walk repo directories ----------------------------------
		// Each directory's rows are emitted in the same execution that reads it,
		// because that is the only execution holding its README.
		let dirIndex = cycle.dirIndex;
		while (dirIndex < cycle.dirOrder.length) {
			const name = cycle.dirOrder[dirIndex];
			const entry = entryByName.get(name);
			dirIndex++;

			// Vanished mid-cycle. Drop it from the cache and move on; any workflow it
			// claimed falls through to phase 2 and keeps its row.
			if (!entry) {
				delete nextDirs[name];
				continue;
			}

			let workflowIds: string[];
			let readme: string | undefined;
			let unchanged = false;

			const cached = nextDirs[name];
			if (cached && isDirCached(entry, nextDirs)) {
				workflowIds = cached.workflowIds;
				unchanged = true;
			} else {
				const read = await readRepoDir(name, github);
				// Malformed zap.json — deliberately not cached, so the next cycle
				// retries rather than remembering the parse failure.
				if (!read) {
					delete nextDirs[name];
					continue;
				}
				workflowIds = read.workflowIds;
				readme = read.readme;
				if (entry.sha) nextDirs[name] = { sha: entry.sha, workflowIds };
			}

			for (const workflowId of workflowIds) {
				if (emitted.has(workflowId)) continue;
				const workflow = byId.get(workflowId);
				// A directory can name a workflow that is no longer deployed. It gets
				// no row, which is correct — the row set is exactly what listWorkflows
				// returns.
				if (!workflow) continue;
				changes.push(await buildRow(workflow, { directory: name, readme, unchanged }));
			}

			if (budget.exhausted()) break;
		}

		if (dirIndex < cycle.dirOrder.length) {
			return {
				changes,
				hasMore: true,
				nextState: {
					hashes: nextHashes,
					versions: nextVersions,
					dirs: nextDirs,
					cycle: { ...cycle, dirIndex, emitted: [...emitted] },
				},
			};
		}

		// -- Phase 2: workflows no directory claimed -------------------------
		// No GitHub read needed, so these go last. Walked over the order pinned at
		// cycle start, so a durable deployed mid-cycle cannot shift the index.
		let restIndex = cycle.restIndex ?? 0;
		while (restIndex < cycle.order.length) {
			const workflowId = cycle.order[restIndex];
			restIndex++;
			if (emitted.has(workflowId)) continue;
			const workflow = byId.get(workflowId);
			// Deleted mid-cycle: emitting nothing lets the sweep remove its row,
			// which is what a deletion should do.
			if (!workflow) continue;
			changes.push(await buildRow(workflow));
			if (budget.exhausted()) break;
		}

		if (restIndex < cycle.order.length) {
			return {
				changes,
				hasMore: true,
				nextState: {
					hashes: nextHashes,
					versions: nextVersions,
					dirs: nextDirs,
					cycle: { ...cycle, dirIndex, restIndex, emitted: [...emitted] },
				},
			};
		}

		// -- Cycle complete --------------------------------------------------
		// Prune what the accumulate-over-previous approach leaves behind: entries
		// for workflows and directories that no longer exist. Safe only here, at the
		// point where every one of them has been seen.
		const liveDirs = new Set(entries.map((entry) => entry.name));
		return {
			changes,
			hasMore: false,
			nextState: {
				hashes: Object.fromEntries(
					Object.entries(nextHashes).filter(([id]) => byId.has(id)),
				),
				versions: Object.fromEntries(
					Object.entries(nextVersions).filter(([id]) => byId.has(id)),
				),
				dirs: Object.fromEntries(
					Object.entries(nextDirs).filter(([name]) => liveDirs.has(name)),
				),
			},
		};
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
 * **Per durable, not per execution** — an execution now takes on as many
 * durables as its budget allows (see src/budget.ts). This bounds how expensive
 * a single durable can get, which is the case that caused the original timeout;
 * the budget bounds how many durables are attempted. Both are needed, and this
 * one must not be relaxed on the strength of the budget existing: the budget is
 * only checked *between* durables.
 *
 * When it binds, the newest rows win and the shortfall is logged rather than
 * passing silently.
 */
const MAX_DETAIL_FETCHES_PER_DURABLE = 60;

/**
 * Rows one execution may accumulate before it stops taking new durables.
 *
 * Needed because the budget cannot see this: a run past
 * `MAX_DETAIL_FETCHES_PER_DURABLE` is still emitted but costs no upstream call,
 * so a very busy window could return tens of thousands of changes having spent
 * almost nothing. One durable's worth was the implicit ceiling when an execution
 * handled exactly one durable; this restores it across the budgeted walk.
 *
 * Not a cap on what is synced — the walk resumes at the next durable, so nothing
 * is dropped, it just lands in the next execution.
 */
const MAX_CHANGES_PER_EXECUTION = 2_000;

type RunsState = {
	watermarks?: Record<string, string>;
	index?: number;
	cursor?: string;
	/** The durable list for this cycle, fetched once at `index === 0`. */
	workflows?: WorkflowRef[];
};

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
// One page per execution is deliberate here and is *not* replaced by the
// budgeted fan-out the delta uses: every row costs a detail fetch, so a page is
// already a full execution's work. It does take the cycle-scoped workflow list,
// because a backfill chains across hundreds of executions and re-listing the
// durables in each one was pure overhead.
//
//   ntn workers sync state reset runsBackfill && ntn workers sync trigger runsBackfill
worker.sync("runsBackfill", {
	database: runs,
	mode: "incremental",
	schedule: "manual",
	execute: async (state: RunsState | undefined) => {
		const index = state?.index ?? 0;
		const workflows = await listWorkflowRefs(index === 0 ? undefined : state?.workflows, zapierApi);
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
				? { watermarks, index, cursor, workflows }
				: { watermarks, index: index + 1, cursor: undefined, workflows },
		};
	},
});

// Delta: daily re-scan of the recent window for every durable.
//
// There is no server-side date filter, so this pages newest-first and stops as
// soon as it passes the watermark minus the overlap.
//
// **Daily, not six-hourly.** This database is intensity and analytics data —
// nothing is alerted off it, and `errorsDelta` owns failure latency at an hourly
// cadence. Lengthening the gap is safe by construction: `RUN_OVERLAP_MS` only
// has to cover the ~20s mutation lag, not the schedule gap, because anything
// newer than the watermark is picked up however long it has been. A day of runs
// at observed volume is ~130, comfortably inside one durable's page budget, so
// nothing ages out of Zapier's history unseen.
//
// **Budgeted fan-out**, chaining via hasMore until every durable is covered.
// This used to be one durable per execution, which cost 50 executions a cycle at
// 57 durables — almost all of them finding nothing. See src/budget.ts for why
// that limit was set and why a spend budget replaces it safely. The per-durable
// caps below still bound the expensive single durable that caused the original
// timeout.
worker.sync("runsDelta", {
	database: runs,
	mode: "incremental",
	schedule: "1d",
	execute: async (state: RunsState | undefined) => {
		const budget = createBudget();
		const zapier = budget.meter(zapierApi);
		const startIndex = state?.index ?? 0;
		const workflows = await listWorkflowRefs(
			startIndex === 0 ? undefined : state?.workflows,
			zapier,
		);
		const watermarks = { ...(state?.watermarks ?? {}) };

		// Cycle complete. Dropping `index` resets it for the next scheduled run.
		if (startIndex >= workflows.length) {
			return { changes: [], hasMore: false, nextState: { watermarks } };
		}

		const changes = [];
		let index = startIndex;
		let cursor = state?.cursor;

		while (index < workflows.length) {
			const workflow = workflows[index];
			const previous = watermarks[workflow.id];
			// No watermark yet means the backfill has not covered this durable
			// (a Zap created since). Take the first page so it is not invisible
			// until someone remembers to re-run the backfill.
			const floor = previous
				? new Date(Date.parse(previous) - RUN_OVERLAP_MS).toISOString()
				: undefined;

			// A durable with no watermark yields its newest page and nothing more —
			// the backfill owns history here. That has to be tracked explicitly:
			// the page it took can still return a cursor, and treating that cursor as
			// "paused mid-durable" would walk the durable's entire history one
			// execution at a time, which is the backfill's job and not this sync's.
			const firstPageOnly = !floor;

			const pending: WorkflowRun[] = [];
			let pages = 0;
			let highest = previous ?? "";
			let done = false;

			do {
				const page = await listRunsPage(
					workflow.id,
					{ cursor, pageSize: RUN_PAGE_SIZE },
					zapier,
				);
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
				if (firstPageOnly) break;
			} while (cursor && !done && pages < MAX_PAGES_PER_EXECUTION);

			if (highest) watermarks[workflow.id] = highest;

			// Newest first, so if the cap binds it keeps the runs someone is most
			// likely to be looking at.
			pending.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
			if (pending.length > MAX_DETAIL_FETCHES_PER_DURABLE) {
				console.warn(
					`${workflow.name}: ${pending.length} runs to emit; fetching run detail for the ` +
						`newest ${MAX_DETAIL_FETCHES_PER_DURABLE}. The remainder omit Output and the ` +
						`operation counts until they are re-emitted.`,
				);
			}

			for (const [i, run] of pending.entries()) {
				const detail =
					i < MAX_DETAIL_FETCHES_PER_DURABLE
						? await fetchRunDetail(run.durable_run_id, zapier)
						: undefined;
				changes.push(runRow(run, workflow.id, workflow.name, detail));
			}

			// Paged out mid-durable: resume from this same index and cursor, exactly
			// as the one-per-execution version did. Never break mid-durable for any
			// other reason — the budget is checked below, after the durable is done.
			const walkComplete = firstPageOnly || !cursor || done;
			if (!walkComplete) break;

			// `cursor` is scoped to the durable just finished, so it must be cleared
			// before the next one. Leaving it set would page a fresh durable from
			// another durable's cursor.
			cursor = undefined;
			index++;
			if (budget.exhausted() || changes.length >= MAX_CHANGES_PER_EXECUTION) break;
		}

		const cycleComplete = index >= workflows.length && !cursor;
		return {
			changes,
			hasMore: !cycleComplete,
			nextState: cycleComplete
				? { watermarks }
				: { watermarks, index, cursor, workflows },
		};
	},
});

// -- Failure triage sync ----------------------------------------------------

/**
 * Journal fetches per durable, per execution. Failures are rare — 33 in the
 * first two months — so this only ever binds on the initial walk through
 * history. When it does, the newest failures win (they are what someone is
 * looking at) and the rest are still counted, just without `Failing Step` /
 * `Root Cause` until they recur.
 *
 * No `MAX_CHANGES_PER_EXECUTION` equivalent is needed here: a change is one
 * distinct signature, which `MAX_TICKETS` already bounds, and many failures
 * collapse onto one ticket rather than one row each.
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
	/** The durable list for this cycle, fetched once after the gate clears. */
	workflows?: WorkflowRef[];
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
 * Budgeted fan-out across durables, chaining via hasMore — see src/budget.ts.
 *
 * **Hourly, unlike the daily run syncs** — a failure is worth seeing sooner than
 * the next working day. `FULL_WALK_INTERVAL_MS` stays at 6h for the same reason:
 * with a budgeted walk the forced walk is a handful of executions, so the
 * insurance against a gate blind spot is cheap enough to keep buying four times
 * a day.
 *
 * A walking cycle costs one `listWorkflows` plus one `listRunsPage` per durable.
 * It used to cost a `listWorkflows` *per execution* as well, because every
 * execution re-listed the durables just to find its own — the list is now
 * carried in state for the cycle. Hourly, most cycles find nothing, so the gate
 * short-circuits them for one call. See the note on the gate in src/errors.ts
 * for why it is advisory rather than authoritative.
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
		const budget = createBudget();
		const zapier = budget.meter(zapierApi);
		const watermarks = { ...(state?.watermarks ?? {}) };
		const tickets = { ...(state?.tickets ?? {}) };
		const startIndex = state?.index ?? 0;
		let gateWatermark = state?.gateWatermark;
		let lastFullWalkAt = state?.lastFullWalkAt;

		// -- The gate ---------------------------------------------------------
		// Once per cycle, and deliberately *before* `listWorkflows`, so a quiet
		// cycle costs one upstream call rather than ~54. Skipped on a resumed
		// cycle (index > 0), which is already mid-walk.
		if (startIndex === 0) {
			const recent = await listDurableRunsPage(GATE_PAGE_SIZE, zapier);
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

		const workflows = await listWorkflowRefs(
			startIndex === 0 ? undefined : state?.workflows,
			zapier,
		);

		// Cycle complete. Dropping `index` resets it for the next scheduled run.
		if (startIndex >= workflows.length) {
			return {
				changes: [],
				hasMore: false,
				nextState: { watermarks, tickets, gateWatermark, lastFullWalkAt },
			};
		}

		// Signatures touched across every durable this execution covered. They
		// cannot collide between durables — a signature is prefixed with its
		// workflow id — so one set spanning the whole execution is safe.
		const touched = new Set<string>();
		let index = startIndex;
		let cursor = state?.cursor;
		let pendingWatermark = state?.pendingWatermark;
		// Set only when the loop breaks mid-durable, to be carried in nextState.
		let resumeWatermark: string | undefined;

		while (index < workflows.length) {
			const workflow = workflows[index];
			const previous = watermarks[workflow.id];
			const initialWalk = !previous;
			const floor = previous
				? new Date(Date.parse(previous) - RUN_OVERLAP_MS).toISOString()
				: undefined;

			const failures: WorkflowRun[] = [];
			let pages = 0;
			let highest = pendingWatermark ?? previous ?? "";
			let done = false;
			const pageBudget = initialWalk ? INITIAL_PAGES_PER_EXECUTION : MAX_PAGES_PER_EXECUTION;

			do {
				const page = await listRunsPage(
					workflow.id,
					{ cursor, pageSize: RUN_PAGE_SIZE },
					zapier,
				);
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
			for (const [i, run] of failures.entries()) {
				const detail =
					i < MAX_TRIAGE_DETAIL_FETCHES
						? await fetchRunDetail(run.durable_run_id, zapier)
						: undefined;
				const occurrence = occurrenceFrom(run, workflow.id, workflow.name, detail);
				accumulate(tickets, occurrence);
				touched.add(occurrence.signature);
			}

			// Paged out mid-durable: resume from this index, cursor and in-progress
			// high-water mark, exactly as the one-per-execution version did.
			if (!walkComplete) {
				resumeWatermark = highest;
				break;
			}

			// Both are scoped to the durable just finished and must not leak into the
			// next one: a fresh durable starts from its own committed watermark, with
			// no cursor.
			cursor = undefined;
			pendingWatermark = undefined;
			index++;
			if (budget.exhausted()) break;
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

		// The cycle ends only once every durable is covered and nothing is mid-walk.
		// A cleared cycle still returns hasMore: false from the gate above; this
		// path is the walking one.
		const cycleComplete = index >= workflows.length && !cursor;
		return {
			changes,
			hasMore: !cycleComplete,
			nextState: cycleComplete
				? { watermarks, tickets, gateWatermark, lastFullWalkAt }
				: {
						watermarks,
						tickets,
						gateWatermark,
						lastFullWalkAt,
						index,
						cursor,
						pendingWatermark: resumeWatermark,
						workflows,
					},
		};
	},
});
