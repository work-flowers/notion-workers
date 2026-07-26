import { experimentalSdk, type Pacer } from "./zapier.js";

/**
 * Run history for a deployed durable.
 *
 * Probed against the live API on 2026-07-26. Three properties of
 * `listWorkflowRuns` shape everything below:
 *
 * 1. **`workflow` is required.** There is no account-wide listing, so a cycle
 *    is at least one call per durable.
 * 2. **Only `pageSize` is honoured.** `limit`, `status`, `since` and
 *    `updatedAfter` are all accepted and then silently ignored — each returned
 *    the full unfiltered set. There is *no* server-side date filter, so a delta
 *    has to page from the newest end and stop client-side.
 * 3. **Rows come back newest-first**, which is what makes (2) workable.
 *
 * A run also mutates after creation: `updated_at != created_at` on every row
 * observed, typically ~20s later as it moves to `finished`. So a delta cannot
 * simply take rows strictly newer than last time — it must re-scan a short
 * overlap window and re-upsert, or it will freeze runs at whatever status they
 * happened to hold mid-flight.
 */

export type RunError = {
	code?: string | null;
	message?: string | null;
	details?: { name?: string | null; message?: string | null } | null;
};

export type WorkflowRun = {
	id: string;
	trigger_id?: string | null;
	durable_run_id?: string | null;
	workflow_version_id?: string | null;
	status: string;
	error?: RunError | null;
	created_at: string;
	updated_at: string;
	// `input` is deliberately not modelled. It carries the entire trigger
	// payload — up to ~10.6 KB, and for the Notion-webhook durables it is full
	// page objects including property values. Mirroring that into Notion would
	// duplicate CRM content into a second place for no documentation value.
};

export type RunPage = { runs: WorkflowRun[]; nextCursor?: string };

/** Newest-first page of runs for one workflow. */
export async function listRunsPage(
	workflowId: string,
	options: { cursor?: string; pageSize?: number },
	pacer?: Pacer,
): Promise<RunPage> {
	const sdk = experimentalSdk() as any;
	if (pacer) await pacer.wait();
	const response = await sdk.listWorkflowRuns({
		workflow: workflowId,
		...(options.cursor ? { cursor: options.cursor } : {}),
		...(options.pageSize ? { pageSize: options.pageSize } : {}),
	});
	return {
		runs: (response?.data ?? []) as WorkflowRun[],
		nextCursor: response?.nextCursor ?? undefined,
	};
}

/**
 * Statuses seen in the wild are `finished` and `failed`, but the enum is not
 * documented and an unattended hourly sync must not hard-fail the first time
 * Zapier emits something new. Unknown values collapse to "unknown" and are
 * logged, rather than being passed through to a select that may reject them.
 */
const KNOWN_STATUSES = new Set([
	"queued",
	"running",
	"finished",
	"failed",
	"cancelled",
	"halted",
	"timed_out",
]);

export const RUN_STATUS_OPTIONS = [...KNOWN_STATUSES, "unknown"];

export function normaliseStatus(status: string | undefined | null): string {
	if (!status) return "unknown";
	if (KNOWN_STATUSES.has(status)) return status;
	console.warn(`Unrecognised run status ${JSON.stringify(status)} — recording as "unknown"`);
	return "unknown";
}

/** Flatten the structured error into one readable line. Empty when the run succeeded. */
export function runErrorText(error: RunError | null | undefined): string {
	if (!error) return "";
	const name = error.details?.name;
	const message = error.details?.message ?? error.message;
	const parts = [name, message].filter(Boolean);
	const summary = parts.length ? parts.join(": ") : (error.code ?? "");
	return error.code && !parts.length ? summary : [error.code, summary].filter(Boolean).join(" — ");
}

/**
 * Seconds from creation to the last update. For a finished or failed run this
 * is effectively the execution time; for one still in flight it is elapsed time
 * so far, and it will be rewritten on the next cycle that re-scans the overlap.
 */
export function runDurationSeconds(run: WorkflowRun): number | undefined {
	const start = Date.parse(run.created_at);
	const end = Date.parse(run.updated_at);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
	return Math.round((end - start) / 1000);
}
