import { experimentalSdk, type Pacer, sdk } from "./zapier.js";

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
	/** Filename -> source. Already returned by getWorkflow, so counting call
	 *  sites off it costs no extra request. */
	source_files?: Record<string, string> | null;
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

/** The alias each connection is bound to in the workflow source, sorted. */
export function connectionAliases(version: WorkflowVersion | undefined): string[] {
	return Object.keys(version?.connections ?? {}).sort();
}

/** Connection ids the version binds, for resolving which apps it touches. */
export function connectionIds(version: WorkflowVersion | undefined): string[] {
	return Object.values(version?.connections ?? {})
		.map((c) => c?.connection_id)
		.filter((id): id is string => typeof id === "string");
}

/** `"LumaCLIAPI@6.1.0"` -> `"LumaCLIAPI"`. */
export function appKeyFromSelectedApi(selectedApi: string | undefined): string | undefined {
	return selectedApi ? selectedApi.split("@")[0] : undefined;
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

// -- Static complexity ------------------------------------------------------
//
// These count **call sites** — places in the source where a call is written —
// not executions. A `ctx.step()` inside a loop is one call site and N
// executions, so these are a complexity signal and a floor on work done, never
// a prediction of usage or billing. They also nest: a step commonly wraps one
// or more actions, so the two counts must not be added together.
//
// Derived from `current_version.source_files`, which getWorkflow already
// returns, so this costs no extra API call.

/**
 * Strip comments and string literals so a `step(` written in prose is not
 * counted.
 *
 * Quote stripping runs **per line**, deliberately. Applied across the whole
 * file, a single unbalanced quote — easily produced by a multi-line template
 * literal containing a `"` — makes the regex span thousands of characters and
 * silently delete real code. That happened: it took
 * `notion-newsletter-to-buttondown` from 7 steps to 0. Per line, an unbalanced
 * quote can only affect the rest of that one line.
 *
 * Template literals are left alone. Step names are routinely built with them
 * (`${stepPrefix}-create`), and stripping them would not change the count
 * anyway, since the match is on the call and not its argument.
 */
function stripNonCode(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
		.split("\n")
		.map((line) =>
			line
				.replace(/(^|[^:])\/\/.*$/, "$1 ") // line comment, sparing "https://"
				.replace(/'(?:\\.|[^'\\])*'/g, "''")
				.replace(/"(?:\\.|[^"\\])*"/g, '""'),
		)
		.join("\n");
}

function allSource(version: WorkflowVersion | undefined): string {
	const files = version?.source_files;
	if (!files) return "";
	return stripNonCode(Object.values(files).join("\n"));
}

/** Named durable checkpoints — `ctx.step("name", …)`. The unit Zapier itself
 *  names in failure messages. */
export function countSteps(version: WorkflowVersion | undefined): number {
	return (allSource(version).match(/\.step\s*\(/g) ?? []).length;
}

/**
 * Zapier connector invocations — `sdk.runAction({…})` plus the app-proxy form.
 *
 * The proxy is matched on its action-type accessor (`.write.x()`, `.search.x()`,
 * `.read.x()`) rather than on `zapier.apps.…`, because the proxy is normally
 * bound to a variable first and then called on a later line:
 *
 *   const notion = zapier.apps.notion({ connectionId: connections.notion });
 *   await notion.write.create_database_item({ … });
 *
 * Matching the `zapier.apps` chain would miss every call written that way.
 *
 * Raw `sdk.fetch` HTTP is deliberately *not* counted: it is a different kind of
 * call and very likely meters differently.
 */
export function countActionCallSites(version: WorkflowVersion | undefined): number {
	const source = allSource(version);
	const runActions = (source.match(/\brunAction\s*\(/g) ?? []).length;
	const proxied = (source.match(/\.(?:write|search|read)\.\w+\s*\(/g) ?? []).length;
	return runActions + proxied;
}

// -- Apps -------------------------------------------------------------------
//
// Which apps a durable actually touches. There is no single field for this:
// `current_version.app_versions` is null on every workflow observed, so it is
// assembled from two places —
//
//   1. the trigger's `selected_api` (`LumaCLIAPI@6.1.0`), and
//   2. the `app_key` of every connection the version binds, which requires
//      resolving connection ids through `listConnections`.
//
// App keys are then resolved to display titles via `getApp`, because private
// apps have keys like `App243984CLIAPI` that mean nothing to a reader — that
// one is "Ninjapear (Unofficial)".

/** `"Ninjapear (Unofficial) (1.0.0)"` -> `"Ninjapear (Unofficial)"`. */
export function appTitleWithoutVersion(title: string): string {
	return title.replace(/\s*\(\d+(?:\.\d+)*\)\s*$/, "").trim();
}

/** Last-resort label when an app cannot be resolved: `"LumaCLIAPI"` -> `"Luma"`. */
export function appKeyToLabel(appKey: string): string {
	return appKey.replace(/CLIAPI$/, "") || appKey;
}

/**
 * Resolves the apps a workflow touches, caching both lookups for the whole
 * sync cycle: one `listConnections` call total, and one `getApp` per distinct
 * app key. Failures degrade to the stripped key rather than failing the cycle.
 */
export function createAppResolver(pacer?: Pacer) {
	let connectionApps: Map<string, string> | undefined;
	const titles = new Map<string, string>();

	async function connectionAppKeys(): Promise<Map<string, string>> {
		if (connectionApps) return connectionApps;
		connectionApps = new Map();
		try {
			if (pacer) await pacer.wait();
			const response: any = await (sdk() as any).listConnections();
			for (const connection of response?.data ?? []) {
				if (connection?.id && connection?.app_key) {
					connectionApps.set(connection.id, connection.app_key);
				}
			}
		} catch (error) {
			console.warn(
				"listConnections failed; Apps will cover the trigger only:",
				error instanceof Error ? error.message : error,
			);
		}
		return connectionApps;
	}

	async function label(appKey: string): Promise<string> {
		const cached = titles.get(appKey);
		if (cached) return cached;
		let resolved = appKeyToLabel(appKey);
		try {
			if (pacer) await pacer.wait();
			const response: any = await (sdk() as any).getApp({ app: appKey });
			const title = response?.data?.title;
			if (typeof title === "string" && title.trim()) resolved = appTitleWithoutVersion(title);
		} catch {
			// Keep the stripped key — a missing title is cosmetic.
		}
		titles.set(appKey, resolved);
		return resolved;
	}

	return async function appsFor(
		selectedApi: string | undefined,
		version: WorkflowVersion | undefined,
	): Promise<string[]> {
		const keys = new Set<string>();
		const triggerKey = appKeyFromSelectedApi(selectedApi);
		if (triggerKey) keys.add(triggerKey);

		const byConnection = await connectionAppKeys();
		for (const id of connectionIds(version)) {
			const appKey = byConnection.get(id);
			if (appKey) keys.add(appKey);
		}

		const labels = await Promise.all([...keys].map(label));
		return [...new Set(labels)].sort();
	};
}
