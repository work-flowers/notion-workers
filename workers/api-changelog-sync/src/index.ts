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
	initialTitle: "Notion API Changelog",
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

// Per-entry content hashes keyed by rawLabel, persisted in sync state so that
// unchanged entries are skipped (no reprocessing) while edits to a past entry
// are still picked up (the hash changes).
type SyncState = { hashes: Record<string, string> };

// -- Sync -------------------------------------------------------------------
// Incremental, every 12 hours. Never emits deletes: historical changelog entries
// don't disappear. The whole changelog (~49 sections) is fetched and parsed in a
// single batch — well within the per-execution timeout — so hasMore is always
// false. The changelog page itself is public, so no upstream auth is needed,
// and the platform writes the rows itself — the worker needs no secrets.
worker.sync("changelogSync", {
	database: changelog,
	mode: "incremental",
	schedule: "12h",
	execute: async (state: SyncState | undefined) => {
		const previousHashes = state?.hashes ?? {};

		// Throws on fetch failure or a parser break (0 entries). A thrown error
		// fails the run without committing nextState, so the next run safely
		// resumes from the last good state — no partial writes, no lost data.
		const entries: ChangelogEntry[] = await fetchChangelogEntries();

		const nextHashes: Record<string, string> = { ...previousHashes };
		const changes = entries.flatMap((entry) => {
			const hash = entryContentHash(entry);
			nextHashes[entry.key] = hash;
			if (previousHashes[entry.key] === hash) return []; // unchanged
			return [
				{
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
				},
			];
		});

		return {
			changes,
			hasMore: false,
			nextState: { hashes: nextHashes },
		};
	},
});
