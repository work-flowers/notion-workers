/**
 * Page-body pass: make sure every recording page holds exactly one embed block
 * playing the recording (see embed.ts), written over the REST API, and that the
 * legacy `bullet:HTML` code block is gone.
 *
 * Why not `pageContentMarkdown` on the sync upsert: it replaces the whole page
 * body every time it is emitted (verified in workers/zapier-durables-docs), so
 * anything a person adds below the video would be wiped daily. So the sync
 * never touches the body and this pass owns the embed block instead.
 *
 * The pass is idempotent and self-healing, modelled on ga4-sync's relink pass:
 * it reads what is on the page and only writes when the block is missing or
 * differs. It needs no sync state. A page that does not exist yet (a recording
 * first seen this run) is simply picked up on the next run, because the platform
 * creates rows only after `execute` returns.
 */
import { embedBlockPayload, isLegacyCodeBlock, plainText } from "./embed.js";
import { appendChildren, deleteBlock, listChildren, queryAllPages, updateBlock } from "./notion.js";
import type { Pacer } from "./supercut.js";

/** Primary-key property of the managed database; also read back by this pass. */
export const RECORDING_ID_PROPERTY = "Recording ID";

export interface EmbedTarget {
	/** Supercut `public_id`; equals the row's primary key value. */
	recordingId: string;
	/** Supercut player URL the embed block must point at. */
	url: string;
}

export interface BodyPassResult {
	/** True when RECORDINGS_DATA_SOURCE_ID is unset and nothing was attempted. */
	skipped: boolean;
	pagesFound: number;
	appended: number;
	updated: number;
	unchanged: number;
	/** Legacy `bullet:HTML` code blocks deleted. */
	removed: number;
	/** Targets with no page yet — expected right after a recording first appears. */
	missingPage: number;
}

export function recordingsDataSourceId(): string | undefined {
	return process.env.RECORDINGS_DATA_SOURCE_ID || undefined;
}

export async function syncEmbedBlocks(
	targets: EmbedTarget[],
	pacer: Pacer,
): Promise<BodyPassResult> {
	const result: BodyPassResult = {
		skipped: false,
		pagesFound: 0,
		appended: 0,
		updated: 0,
		unchanged: 0,
		removed: 0,
		missingPage: 0,
	};

	// Both are set after the first deploy, so a missing one is a setup gap, not a
	// fault: skip with a warning and let rows and covers sync regardless.
	const dataSourceId = recordingsDataSourceId();
	if (!dataSourceId) {
		console.warn(
			"RECORDINGS_DATA_SOURCE_ID is not set — skipping the embed block pass. " +
				"After the first deploy has created the database, copy its data source ID and " +
				"set it with `ntn workers env set RECORDINGS_DATA_SOURCE_ID=<id>`.",
		);
		return { ...result, skipped: true };
	}
	if (!process.env.NOTION_API_TOKEN) {
		console.warn(
			"NOTION_API_TOKEN is not set — skipping the embed block pass. Create an internal " +
				"integration, share the Supercut Recordings database with it, and set the token with " +
				"`ntn workers env set NOTION_API_TOKEN=<token>`.",
		);
		return { ...result, skipped: true };
	}

	const pages = await queryAllPages(dataSourceId, pacer);
	const pageIdByRecording = new Map<string, string>();
	for (const page of pages) {
		if (page.archived || page.in_trash) continue;
		const id = plainText(page.properties?.[RECORDING_ID_PROPERTY]?.rich_text).trim();
		if (id) pageIdByRecording.set(id, page.id);
	}
	result.pagesFound = pageIdByRecording.size;

	for (const target of targets) {
		const pageId = pageIdByRecording.get(target.recordingId);
		if (!pageId) {
			result.missingPage++;
			continue;
		}

		const children = await listChildren(pageId, pacer);

		for (const legacy of children.filter(isLegacyCodeBlock)) {
			await deleteBlock(legacy.id, pacer);
			result.removed++;
		}

		const existing = children.find((block) => block.type === "embed");
		if (!existing) {
			await appendChildren(pageId, [embedBlockPayload(target.url)], pacer);
			result.appended++;
		} else if (existing.embed?.url === target.url) {
			result.unchanged++;
		} else {
			await updateBlock(existing.id, { embed: { url: target.url } }, pacer);
			result.updated++;
		}
	}

	return result;
}
