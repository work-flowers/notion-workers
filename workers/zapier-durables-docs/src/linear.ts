import { type Pacer, requireEnv, sdk } from "./zapier.js";

/**
 * Linear, through the **Zapier** Linear connection.
 *
 * ## Why not the Notion Linear connection
 *
 * Notion's Linear connection is a workspace connector for search and link
 * previews — it backs Notion AI's ability to read Linear, and nothing else. The
 * Workers runtime has no API for borrowing one: `@notionhq/workers` exposes
 * exactly two routes to a third-party credential, `worker.oauth()` with your own
 * OAuth app, and a Notion-managed `provider:` shorthand that is private alpha.
 * Neither reaches a connector configured in Notion's settings. So the Notion
 * Linear connection cannot create an issue, and this goes through Zapier.
 *
 * ## Why `runAction` rather than Linear's GraphQL API
 *
 * `sdk().runAction` executes a Zapier app action against a stored connection, so
 * this file names actions and fields instead of writing GraphQL, and no Linear
 * token is ever held here. The rest of this worker reaches GitHub and Notion the
 * same way, via `sdk().fetch` — `runAction` is the same trade one level up.
 *
 * The cost is that each call is a Zapier task. That is the right trade *here* and
 * would not be everywhere: triage volume is tiny (33 failed runs collapsing to
 * ~8 signatures over two months), so this is single-digit tasks per month. Do not
 * copy the pattern into a per-run path.
 */

const APP = "LinearCLIAPI";

/**
 * A Zapier connection id, not a Linear API key — it names a stored connection
 * and carries no credential, so it does not need rotating.
 */
function connectionId(): string {
	return requireEnv("ZAPIER_LINEAR_CONNECTION_ID");
}

function teamId(): string {
	return requireEnv("LINEAR_TEAM_ID");
}

/**
 * The label every triage issue carries, so they can be filtered out of — or
 * into — a team's backlog. Optional, and deliberately an id rather than a name:
 * `labels` on `create_issue` is a dynamic enum over the workspace's existing
 * labels, and Zapier resolves it by **id**. A name that does not exist is not
 * created, so hard-coding one would fail on every ticket.
 *
 * Unset means no label, which is a working configuration rather than an error —
 * a missing label must not stop a failure being reported.
 */
function labelIds(): string[] {
	const id = process.env.LINEAR_LABEL_ID;
	return id ? [id] : [];
}

export type LinearIssue = { id: string; url?: string };

/**
 * One action execution. `runAction` returns a paginated result whose `await`
 * yields the buffered first page — the same `.data` shape the workflow endpoints
 * use, so this mirrors `listRunsPage`.
 */
async function runAction(
	actionType: "write" | "search",
	action: string,
	inputs: Record<string, unknown>,
	pacer?: Pacer,
): Promise<unknown[]> {
	if (pacer) await pacer.wait();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the SDK's
	// plugin generics do not narrow usefully at the call site; the same cast is
	// used for the workflow endpoints in runs.ts.
	const page = await (sdk() as any).runAction({
		app: APP,
		actionType,
		action,
		connection: connectionId(),
		inputs,
	});
	return (page?.data ?? []) as unknown[];
}

/**
 * Pull an issue out of an action result.
 *
 * Deliberately tolerant about shape. The action's response is Zapier's
 * rendering of Linear's, not a contract we control, and the id is the one field
 * that must survive — losing it would mean a duplicate issue on the next
 * recurrence. `url` is decoration and may legitimately be absent.
 */
export function extractIssue(record: unknown): LinearIssue | undefined {
	if (!record || typeof record !== "object") return undefined;
	const row = record as Record<string, unknown>;
	const nested = (row.issue ?? row.data) as Record<string, unknown> | undefined;
	const source = typeof nested === "object" && nested !== null ? { ...row, ...nested } : row;

	const id = source.id ?? source.issue_id ?? source.identifier;
	if (typeof id !== "string" || !id) return undefined;

	const url = source.url ?? source.issue_url ?? source.link;
	return { id, ...(typeof url === "string" && url ? { url } : {}) };
}

/**
 * Find an issue whose title carries `marker`.
 *
 * `issues_by_name` is a case-insensitive **partial** match on the title, which
 * is exactly what the marker is for — see `signatureMarker` in errors.ts.
 *
 * This exists only as a retry guard: a normal recurrence is resolved from
 * `issueId` in sync state without any search. It covers the one window state
 * cannot, an execution that created an issue and then failed before returning
 * its state, which would otherwise create a second issue for the same fault on
 * the retry.
 *
 * **A resolved issue may not come back from search.** If Linear's search omits
 * completed issues, a recurrence after the state was reset would open a fresh
 * issue rather than adopting the closed one. That is the acceptable failure:
 * a duplicate is visible and fixable, a silently lost ticket is not.
 */
export async function findIssueByMarker(
	marker: string,
	pacer?: Pacer,
): Promise<LinearIssue | undefined> {
	const results = await runAction("search", "issues_by_name", {
		name: marker,
		teamId: teamId(),
	}, pacer);
	for (const record of results) {
		const issue = extractIssue(record);
		if (issue) return issue;
	}
	return undefined;
}

/**
 * Open an issue. The description is written **once, at creation, and never
 * rewritten** — see the note on recurrences in errors.ts. Status, priority and
 * assignee are deliberately left unset: they are the human's, exactly as the
 * Notion triage columns were.
 */
export async function createIssue(
	title: string,
	description: string,
	pacer?: Pacer,
): Promise<LinearIssue | undefined> {
	const labels = labelIds();
	const results = await runAction("write", "create_issue", {
		team_id: teamId(),
		title,
		description,
		...(labels.length > 0 ? { labels } : {}),
	}, pacer);
	for (const record of results) {
		const issue = extractIssue(record);
		if (issue) return issue;
	}
	return undefined;
}

/** Post a recurrence note. Comments accumulate; the description does not move. */
export async function commentOnIssue(
	issueId: string,
	body: string,
	pacer?: Pacer,
): Promise<void> {
	await runAction("write", "create_comment", { issue: issueId, body }, pacer);
}
