import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import {
	type ChangelogEntry,
	entryContentHash,
	fetchChangelogEntries,
} from "./changelog.js";

const worker = new Worker();
export default worker;

// -- Managed database -------------------------------------------------------
// One row per changelog sub-entry (each `###` section becomes its own page).
// "Key" (`<ISO date>#<section-slug>`) is the primary key, so re-running the sync
// dedupes on it. "Raw Label" keeps the human date label for grouping/display.
const changelog = worker.database("changelog", {
	type: "managed",
	initialTitle: "Lovable Changelog",
	primaryKeyProperty: "Key",
	schema: {
		properties: {
			Name: Schema.title(),
			"Entry Date": Schema.date(),
			URL: Schema.url(),
			"Raw Label": Schema.richText(),
			Key: Schema.richText(),
		},
	},
});

// One request per execute() call against a public docs site; be polite.
const lovableDocs = worker.pacer("lovableDocs", {
	allowedRequests: 1,
	intervalMs: 1000,
});

// The changelog has ~500 sections, and returning too many changes from one
// execute() fails, so changed entries are emitted in batches of this size.
const BATCH_SIZE = 100;

// Per-entry content hashes keyed by entry key, persisted in sync state so that
// unchanged entries are skipped (no reprocessing) while edits to a past entry
// are still picked up (the hash changes).
type SyncState = { hashes: Record<string, string> };

// -- Sync -------------------------------------------------------------------
// Incremental, every 12 hours. Never emits deletes: historical changelog entries
// don't disappear. Each execute() re-fetches the whole page (one request, ~300 KB)
// and emits the first BATCH_SIZE entries that are new or changed, recording only
// *their* hashes; hasMore stays true until nothing is pending, so a cycle drains
// the backlog in batches (the first run is ~6 calls, later runs usually one).
// The page is public, so there is no upstream auth and no secret.
worker.sync("changelogSync", {
	database: changelog,
	mode: "incremental",
	schedule: "12h",
	execute: async (state: SyncState | undefined) => {
		const previousHashes = state?.hashes ?? {};

		// Throws on fetch failure or a parser break (0 entries). A thrown error
		// fails the run without committing nextState, so the next run safely
		// resumes from the last good state — no partial writes, no lost data.
		await lovableDocs.wait();
		const entries: ChangelogEntry[] = await fetchChangelogEntries();

		const pending = entries
			.map((entry) => ({ entry, hash: entryContentHash(entry) }))
			.filter(({ entry, hash }) => previousHashes[entry.key] !== hash);
		const batch = pending.slice(0, BATCH_SIZE);

		const nextHashes: Record<string, string> = { ...previousHashes };
		for (const { entry, hash } of batch) nextHashes[entry.key] = hash;

		const changes = batch.map(({ entry }) => ({
			type: "upsert" as const,
			key: entry.key,
			properties: {
				Name: Builder.title(entry.name),
				"Entry Date": Builder.date(entry.entryDate),
				URL: Builder.url(entry.url),
				"Raw Label": Builder.richText(entry.rawLabel),
				Key: Builder.richText(entry.key),
			},
			// Full entry body (markdown) goes in the page body, not a
			// property. Empty -> omit (undefined) so no blank block is written.
			pageContentMarkdown: entry.bodyMarkdown || undefined,
		}));

		return {
			changes,
			hasMore: pending.length > batch.length,
			nextState: { hashes: nextHashes },
		};
	},
});
