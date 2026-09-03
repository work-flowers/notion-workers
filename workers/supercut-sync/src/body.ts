/**
 * Page-body pass: make sure every recording page holds exactly the embed code
 * block Bullet.so expects (see embed.ts), written over the REST API.
 *
 * Why not `pageContentMarkdown` on the sync upsert: it cannot express a code
 * block caption, and it replaces the whole page body every time it is emitted
 * (verified in workers/zapier-durables-docs). So the sync never touches the body
 * and this pass owns it instead.
 *
 * The pass is idempotent and self-healing, modelled on ga4-sync's relink pass:
 * it reads what is on the page and only writes when the block is missing or
 * differs. It needs no sync state. A page that does not exist yet (a recording
 * first seen this run) is simply picked up on the next run, because the platform
 * creates rows only after `execute` returns.
 */
import { codeBlockPayload, codeBlockMatches, codeValue, plainText } from "./embed.js";
import { appendChildren, listChildren, queryAllPages, updateBlock } from "./notion.js";
import type { Pacer } from "./supercut.js";

/** Primary-key property of the managed database; also read back by this pass. */
export const RECORDING_ID_PROPERTY = "Recording ID";

export interface EmbedTarget {
	/** Supercut `public_id`; equals the row's primary key value. */
	recordingId: string;
	/** Exact embed snippet that must be the code block's content. */
	html: string;
}

export interface BodyPassResult {
	/** True when RECORDINGS_DATA_SOURCE_ID is unset and nothing was attempted. */
	skipped: boolean;
	pagesFound: number;
	appended: number;
	updated: number;
	unchanged: number;
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
		missingPage: 0,
	};

	// Both are set after the first deploy, so a missing one is a setup gap, not a
	// fault: skip with a warning and let rows and covers sync regardless.
	const dataSourceId = recordingsDataSourceId();
	if (!dataSourceId) {
		console.warn(
			"RECORDINGS_DATA_SOURCE_ID is not set — skipping the embed code block pass. " +
				"After the first deploy has created the database, copy its data source ID and " +
				"set it with `ntn workers env set RECORDINGS_DATA_SOURCE_ID=<id>`.",
		);
		return { ...result, skipped: true };
	}
	if (!process.env.NOTION_API_TOKEN) {
		console.warn(
			"NOTION_API_TOKEN is not set — skipping the embed code block pass. Create an internal " +
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
		const existing = children.find((block) => block.type === "code");

		if (!existing) {
			await appendChildren(pageId, [codeBlockPayload(target.html)], pacer);
			result.appended++;
		} else if (codeBlockMatches(existing, target.html)) {
			result.unchanged++;
		} else {
			await updateBlock(existing.id, { code: codeValue(target.html) }, pacer);
			result.updated++;
		}
	}

	return result;
}
