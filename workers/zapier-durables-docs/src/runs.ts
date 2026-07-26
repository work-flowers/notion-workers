import type { SelectColor } from "@notionhq/workers/types";
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
 * Per-run detail, from `getDurableRun` — keyed on `durable_run_id`, not the
 * workflow run id.
 *
 * This is the only place Zapier exposes what a run *actually did*: an
 * operations journal, one entry per executed step or wait, each with its own
 * `retry_count`. It is the real answer to "how intense was this run", and it
 * differs from the static call-site count because of branching — e.g.
 * `enrich-contact-records` has 6 step call sites but observed runs execute 4-5.
 *
 * `getWorkflowRun` was used here previously and returns only `output`. This one
 * returns `output` *and* the journal for the same single call, so the extra
 * numbers are free.
 *
 * The response is large (~12 KB average, 26 KB observed) because each
 * operation embeds its full result. Everything except the counts and `output`
 * is discarded immediately — nothing large is stored.
 */
export type RunDetail = {
	output?: unknown;
	/** Executed operations — steps and waits. Zero is legitimate: a run can fail
	 *  before any step runs. */
	operations: number;
	/** Summed `retry_count` across operations. */
	retries: number;
	/** `execution.summary.total_attempts` — whole-execution retries, distinct
	 *  from per-operation retries, and >1 even on some successful runs. */
	attempts: number;
};

type DurableOperation = { type?: string; retry_count?: number };

/**
 * Returns undefined rather than throwing: missing detail degrades a few cells
 * and is not worth failing a cycle over. Also returns undefined when the run
 * has no `durable_run_id`, which is the documented state before the durable run
 * is created.
 */
export async function fetchRunDetail(
	durableRunId: string | null | undefined,
	pacer?: Pacer,
): Promise<RunDetail | undefined> {
	if (!durableRunId) return undefined;
	const sdk = experimentalSdk() as any;
	if (pacer) await pacer.wait();
	try {
		const response = await sdk.getDurableRun({ run: durableRunId });
		const data = response?.data;
		const execution = data?.execution;
		const operations: DurableOperation[] = execution?.operations ?? [];
		return {
			output: data?.output ?? undefined,
			operations: operations.length,
			retries: operations.reduce((sum, op) => sum + (op.retry_count ?? 0), 0),
			attempts: execution?.summary?.total_attempts ?? 0,
		};
	} catch (error) {
		console.warn(
			`getDurableRun failed for ${durableRunId}; row will omit Output and counts:`,
			error instanceof Error ? error.message : error,
		);
		return undefined;
	}
}

/** Notion rich text caps at 2000 characters per value. */
const OUTPUT_MAX_CHARS = 1900;

/** Compact JSON, truncated with a visible marker rather than silently clipped. */
export function formatRunOutput(output: unknown): string {
	if (output === undefined || output === null) return "";
	const text = typeof output === "string" ? output : JSON.stringify(output);
	if (!text || text === "{}") return "";
	return text.length > OUTPUT_MAX_CHARS ? `${text.slice(0, OUTPUT_MAX_CHARS)}… (truncated)` : text;
}

/**
 * Statuses seen in the wild are `finished` and `failed`, but the enum is not
 * documented and an unattended hourly sync must not hard-fail the first time
 * Zapier emits something new. Unknown values collapse to "unknown" and are
 * logged, rather than being passed through to a select that may reject them.
 *
 * Colours are keyed to how much attention a state deserves: green finished,
 * red failed, blue in-flight, grey inert, orange/yellow for "ended badly but
 * not an error".
 */
const STATUS_COLOURS = {
	queued: "gray",
	running: "blue",
	finished: "green",
	failed: "red",
	cancelled: "brown",
	halted: "orange",
	timed_out: "yellow",
	unknown: "default",
} as const satisfies Record<string, SelectColor>;

/** Everything except "unknown", which is this module's own fallback. */
const KNOWN_STATUSES = new Set(
	Object.keys(STATUS_COLOURS).filter((status) => status !== "unknown"),
);

export const RUN_STATUS_OPTIONS: Array<{ name: string; color: SelectColor }> = Object.entries(
	STATUS_COLOURS,
).map(([name, color]) => ({ name, color }));

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
