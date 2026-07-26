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
 * One Zap directory in the repo.
 *
 * `workflowIds` is plural on purpose: `luma-event-to-notion/zap.json` uses a
 * `deployments[]` array and maps one directory onto two deployed workflows.
 * Both rows then share the same README body, which is acceptable.
 */
export type RepoZap = {
	directory: string;
	workflowIds: string[];
	readme?: string;
	htmlUrl: string;
};

type ContentEntry = { name: string; type: string };

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

/**
 * Read every Zap directory in the repo.
 *
 * Directories without a `zap.json` (or whose `zap.json` declares no workflow
 * id) are skipped — they are not deployed durables, so nothing can join to
 * them. The README is enrichment only; a directory that has a workflow id but
 * no README still yields a row with an empty body.
 */
export async function fetchRepoZaps(pacer?: Pacer): Promise<RepoZap[]> {
	const slug = repo();
	const entries = await githubJson<ContentEntry[]>(`/repos/${slug}/contents/`, pacer);
	const directories = entries.filter((e) => e.type === "dir" && !e.name.startsWith("."));

	const zaps: RepoZap[] = [];
	for (const dir of directories) {
		const rawZapJson = await githubRaw(`/repos/${slug}/contents/${dir.name}/zap.json`, pacer);
		if (!rawZapJson) continue;

		let workflowIds: string[];
		try {
			workflowIds = extractWorkflowIds(JSON.parse(rawZapJson));
		} catch {
			// A malformed zap.json is a repo problem, not a reason to fail the
			// whole sync — skip the directory and keep going.
			continue;
		}
		if (workflowIds.length === 0) continue;

		zaps.push({
			directory: dir.name,
			workflowIds,
			readme: await githubRaw(`/repos/${slug}/contents/${dir.name}/README.md`, pacer),
			htmlUrl: `https://github.com/${slug}/tree/main/${dir.name}`,
		});
	}

	return zaps;
}

/** Index repo directories by the workflow ids they declare. */
export function indexByWorkflowId(zaps: RepoZap[]): Map<string, RepoZap> {
	const index = new Map<string, RepoZap>();
	for (const zap of zaps) {
		for (const id of zap.workflowIds) index.set(id, zap);
	}
	return index;
}
