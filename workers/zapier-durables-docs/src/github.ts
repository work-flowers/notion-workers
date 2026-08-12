import { type Pacer, requireEnv, sdk } from "./zapier.js";

/**
 * READMEs from the Zap source-of-truth repo, read through the Zapier GitHub
 * connection rather than a PAT.
 *
 * The connection carries the `repo` scope, so this keeps working if the repo is
 * made private, and it runs at the authenticated 5000 req/hour rather than the
 * anonymous 60/hour — which matters because workers share egress IPs.
 */

const GITHUB_API = "https://api.github.com";

function connectionId(): string {
	return requireEnv("ZAPIER_GITHUB_CONNECTION_ID");
}

function repo(): string {
	return process.env.ZAP_DOCS_REPO ?? "work-flowers/zapier-sdk";
}

async function githubFetch(path: string, accept: string, pacer?: Pacer): Promise<Response> {
	if (pacer) await pacer.wait();
	return sdk().fetch(`${GITHUB_API}${path}`, {
		method: "GET",
		connection: connectionId(),
		headers: { Accept: accept },
	});
}

async function githubJson<T>(path: string, pacer?: Pacer): Promise<T> {
	const res = await githubFetch(path, "application/vnd.github+json", pacer);
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`GitHub ${res.status} on ${path}: ${body.slice(0, 300)}`);
	}
	return (await res.json()) as T;
}

/** Raw file contents, or undefined if the file does not exist (404). */
async function githubRaw(path: string, pacer?: Pacer): Promise<string | undefined> {
	const res = await githubFetch(path, "application/vnd.github.raw+json", pacer);
	if (res.status === 404) return undefined;
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`GitHub ${res.status} on ${path}: ${body.slice(0, 300)}`);
	}
	return await res.text();
}

/**
 * What is remembered about one directory between cycles, keyed by directory name.
 *
 * `sha` is the directory's tree sha from the repo listing, which changes whenever
 * anything inside it changes — so it is an exact "has this Zap's docs moved"
 * signal, obtained from a call we make anyway.
 *
 * `workflowIds` has to be cached alongside it because it is the join key onto the
 * deployed durables and is only readable from `zap.json`. It is small; READMEs
 * deliberately are not cached, which is why an unchanged directory reports
 * `unchanged` rather than replaying its body.
 */
export type RepoDirState = {
	sha: string;
	/** Empty means "not a deployed Zap directory" — cached too, so a docs-only
	 *  directory stops costing a `zap.json` fetch every cycle. */
	workflowIds: string[];
};

type ContentEntry = { name: string; type: string; sha?: string };

/**
 * Whether a directory can be taken from the cache instead of re-read.
 *
 * Pulled out as a pure function because the rest of this module needs live
 * credentials to exercise, and this is the part with edges: a listing entry
 * carrying no `sha` must force a re-read rather than matching an
 * `undefined === undefined` cache entry, which would pin the directory to
 * whatever was cached forever.
 */
export function isDirCached(
	entry: { name: string; sha?: string },
	cached: Record<string, RepoDirState> | undefined,
): boolean {
	if (!entry.sha) return false;
	const previous = cached?.[entry.name];
	return previous !== undefined && previous.sha === entry.sha;
}

/** Every `workflow_id` a zap.json declares, across both known shapes. */
function extractWorkflowIds(zapJson: unknown): string[] {
	if (typeof zapJson !== "object" || zapJson === null) return [];
	const record = zapJson as Record<string, unknown>;
	const ids: string[] = [];

	if (typeof record.workflow_id === "string") ids.push(record.workflow_id);

	if (Array.isArray(record.deployments)) {
		for (const deployment of record.deployments) {
			if (typeof deployment === "object" && deployment !== null) {
				const id = (deployment as Record<string, unknown>).workflow_id;
				if (typeof id === "string") ids.push(id);
			}
		}
	}

	return [...new Set(ids)];
}

/** A directory entry from the repo listing: its name and its current tree sha. */
export type RepoDirEntry = { name: string; sha?: string };

/**
 * List the Zap directories, one call, no contents.
 *
 * Split from reading them so `zapsSync` can spread a cold cycle over several
 * executions — reading all 48 directories in one execution is ~97 GitHub calls,
 * which is what put the sync past its timeout. See `readRepoDir`.
 */
export async function listRepoDirs(pacer?: Pacer): Promise<RepoDirEntry[]> {
	const slug = repo();
	const entries = await githubJson<ContentEntry[]>(`/repos/${slug}/contents/`, pacer);
	return entries
		.filter((e) => e.type === "dir" && !e.name.startsWith("."))
		.map((e) => ({ name: e.name, sha: e.sha }));
}

/** The repo URL for a directory. Derived, so it needs no call. */
export function dirHtmlUrl(directory: string): string {
	return `https://github.com/${repo()}/tree/main/${directory}`;
}

/**
 * Read one Zap directory: its `zap.json`, and its `README.md` if it declares any
 * workflow id. One or two calls.
 *
 * A directory without a `zap.json`, or whose `zap.json` declares no workflow id,
 * yields `workflowIds: []` — it is not a deployed durable, so nothing can join to
 * it. That empty result is still worth caching, so a docs-only directory stops
 * costing a call every cycle. The README is enrichment only; a directory with a
 * workflow id but no README still yields a row with an empty body.
 *
 * Returns `undefined` when `zap.json` is malformed, which must *not* be cached —
 * the next cycle should retry rather than remember a parse failure until someone
 * happens to touch the directory again.
 */
export async function readRepoDir(
	directory: string,
	pacer?: Pacer,
): Promise<{ workflowIds: string[]; readme?: string } | undefined> {
	const slug = repo();
	const rawZapJson = await githubRaw(`/repos/${slug}/contents/${directory}/zap.json`, pacer);

	let workflowIds: string[] = [];
	if (rawZapJson) {
		try {
			workflowIds = extractWorkflowIds(JSON.parse(rawZapJson));
		} catch {
			return undefined;
		}
	}

	if (workflowIds.length === 0) return { workflowIds };
	return {
		workflowIds,
		readme: await githubRaw(`/repos/${slug}/contents/${directory}/README.md`, pacer),
	};
}

/**
 * `workflowIds` is plural throughout because `luma-event-to-notion/zap.json` uses
 * a `deployments[]` array and maps one directory onto two deployed workflows. Both
 * rows then share the same README body, which is acceptable.
 */
