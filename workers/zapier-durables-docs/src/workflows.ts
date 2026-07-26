import { experimentalSdk, type Pacer } from "./zapier.js";

/**
 * Deployed Zapier Durables, via the experimental Code Workflows surface.
 *
 * Requires `@zapier/zapier-sdk@^0.91.0` — these methods do not exist in 0.53.x,
 * and 1.x removes the `./experimental` export entirely.
 */

export type WorkflowTrigger = {
	selected_api?: string;
	action?: string;
	status?: string;
};

export type WorkflowSummary = {
	id: string;
	name: string;
	description?: string | null;
	enabled: boolean;
	disabled_reason?: string | null;
	is_private?: boolean;
	created_by_user_id?: string | null;
	current_version_id?: string | null;
	triggers?: WorkflowTrigger[];
	created_at?: string | null;
	updated_at?: string | null;
	// `trigger_url` is deliberately not modelled — it embeds a secret token and
	// must never be written to Notion.
};

export type WorkflowVersion = {
	zapier_durable_version?: string | null;
	dependencies?: Record<string, string> | null;
	connections?: Record<string, { connection_id?: string }> | null;
};

export type WorkflowDetail = WorkflowSummary & { current_version?: WorkflowVersion | null };

/** Every deployed durable, enabled or not. Paginates until the cursor runs out. */
export async function listWorkflows(pacer?: Pacer): Promise<WorkflowSummary[]> {
	const sdk = experimentalSdk() as any;
	const all: WorkflowSummary[] = [];
	let cursor: string | undefined;

	do {
		if (pacer) await pacer.wait();
		const page = await sdk.listWorkflows(cursor ? { cursor } : {});
		all.push(...((page?.data ?? []) as WorkflowSummary[]));
		cursor = page?.nextCursor ?? undefined;
	} while (cursor);

	return all;
}

/**
 * Fetch `current_version` for one workflow — the only place `connections`,
 * `dependencies` and `zapier_durable_version` are exposed.
 *
 * A failure here degrades one row rather than failing the cycle: the summary
 * fields are already in hand and are the ones that matter most.
 */
export async function getWorkflowVersion(
	workflowId: string,
	pacer?: Pacer,
): Promise<WorkflowVersion | undefined> {
	const sdk = experimentalSdk() as any;
	if (pacer) await pacer.wait();
	try {
		const detail = (await sdk.getWorkflow({ workflow: workflowId })) as { data?: WorkflowDetail };
		return detail?.data?.current_version ?? undefined;
	} catch (error) {
		console.warn(
			`getWorkflow failed for ${workflowId}; row will omit connections/dependencies:`,
			error instanceof Error ? error.message : error,
		);
		return undefined;
	}
}

/** `"WebHookCLIAPI@1.1.1"` -> `"WebHook"`. Falls back to the raw value. */
export function triggerAppName(selectedApi: string | undefined): string {
	if (!selectedApi) return "";
	return selectedApi.split("@")[0].replace(/CLIAPI$/, "") || selectedApi;
}

/** Stable, human-readable summary of a version's connection aliases. */
export function formatConnections(version: WorkflowVersion | undefined): string {
	const connections = version?.connections;
	if (!connections) return "";
	return Object.keys(connections).sort().join(", ");
}

/** `"zod@4.4.3, @zapier/zapier-sdk@0.79.0"`, sorted for a stable content hash. */
export function formatDependencies(version: WorkflowVersion | undefined): string {
	const dependencies = version?.dependencies;
	if (!dependencies) return "";
	return Object.entries(dependencies)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, range]) => `${name}@${range}`)
		.join(", ");
}

/** The durables editor, which is safe to publish. Never the trigger URL. */
export function editorUrl(workflowId: string): string {
	return `https://zapier.com/durables-editor/${workflowId}`;
}
