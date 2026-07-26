import { createHash } from "node:crypto";
import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { fetchRepoZaps, indexByWorkflowId } from "./github.js";
import { toNotionMarkdown } from "./markdown.js";
import { createUserResolver } from "./people.js";
import {
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
			Creator: Schema.people(),
			"Creator ID": Schema.richText(),
			Created: Schema.date(),
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
worker.sync("zapsSync", {
	database: zaps,
	mode: "replace",
	schedule: "12h",
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
