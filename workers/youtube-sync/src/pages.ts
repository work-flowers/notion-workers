/**
 * Per-page pass over existing YouTube Videos rows. It does two things the sync
 * upsert cannot:
 *
 * 1. **Supercut Recording relation.** Sets each row's hand-added relation to the
 *    Supercut Recordings row whose hand-added `YouTube Video ID` matches.
 *    `Schema.relation()` can only point at a database declared in the same
 *    worker, and Supercut Recordings belongs to `supercut-sync`, so the column
 *    is added by hand (which also keeps it editable) and written here — the
 *    same pattern `buttondown-sync` uses. It only ever **sets** a link, never
 *    clears one, so a video uploaded straight to YouTube can be linked by hand.
 *
 * 2. **Inline player.** Makes sure each page body holds a Notion `video` block
 *    for the YouTube watch URL, which Notion renders as a playable YouTube
 *    player. Written over REST rather than `pageContentMarkdown`, which would
 *    replace the whole body on every run and wipe anything a person adds below
 *    the video (the reason `supercut-sync/src/body.ts` exists).
 *
 * Both are idempotent: they read what is there and only write when something is
 * missing or wrong. Only rows that already exist can be touched; the platform
 * creates rows after `execute` returns, so a new video gets its link and player
 * on the run after it first syncs. Notion calls go straight to the API, not
 * through Zapier, so this pass costs no Zapier tasks.
 */
import { queryDataSource, retrieveDataSource, SILENT_NOTIFICATIONS, updatePage } from "@work-flowers/notion-worker-shared";
import { watchUrl } from "./youtube.js";

/** Supercut Recordings, the `supercut-sync` worker's managed database. */
export const SUPERCUT_RECORDINGS_DATA_SOURCE = "0f3fea21-11be-4158-ba98-9bb26936db89";
/** Hand-added text column on Supercut Recordings, written by the supercut-to-youtube Zap. */
const SUPERCUT_VIDEO_ID_PROPERTY = "YouTube Video ID";
/** Hand-added relation column on YouTube Videos. */
export const RELATION_PROPERTY = "Supercut Recording";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";

type Pacer = { wait: () => Promise<void> };

export interface PagePassResult {
	skipped?: string;
	rows: number;
	links: { set: number; unchanged: number; noMatch: number; ambiguous: string[]; skipped?: string };
	players: { appended: number; updated: number; unchanged: number };
}

function plainText(prop: any): string {
	const parts: any[] = prop?.rich_text ?? prop?.title ?? [];
	return parts.map((p) => p.plain_text ?? "").join("").trim();
}

/** Block endpoints, which the shared package does not cover. */
async function notion<T>(method: "GET" | "PATCH", path: string, pacer: Pacer, body?: unknown): Promise<T> {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) throw new Error("NOTION_API_TOKEN is not set");
	await pacer.wait();
	const res = await fetch(`${NOTION_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Notion-Version": NOTION_VERSION,
			"Content-Type": "application/json",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`Notion ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
	}
	return (await res.json()) as T;
}

interface Block {
	id: string;
	type: string;
	video?: { type?: string; external?: { url?: string } };
}

async function listChildren(pageId: string, pacer: Pacer): Promise<Block[]> {
	const blocks: Block[] = [];
	let cursor: string | null = null;
	do {
		const q = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
		const page: { results: Block[]; has_more: boolean; next_cursor: string | null } = await notion(
			"GET",
			`/blocks/${pageId}/children?${q}`,
			pacer,
		);
		blocks.push(...page.results);
		cursor = page.has_more ? page.next_cursor : null;
	} while (cursor);
	return blocks;
}

async function queryAll(dataSourceId: string, body: Record<string, unknown>, pacer: Pacer): Promise<any[]> {
	const rows: any[] = [];
	let cursor: string | null = null;
	do {
		await pacer.wait();
		const page = await queryDataSource(dataSourceId, {
			...body,
			page_size: 100,
			...(cursor ? { start_cursor: cursor } : {}),
		});
		rows.push(...page.results);
		cursor = page.has_more ? page.next_cursor : null;
	} while (cursor);
	return rows;
}

/** Supercut Recordings rows keyed by their `YouTube Video ID`. */
async function supercutRowsByVideoId(pacer: Pacer): Promise<Map<string, string[]>> {
	const rows = await queryAll(
		SUPERCUT_RECORDINGS_DATA_SOURCE,
		{ filter: { property: SUPERCUT_VIDEO_ID_PROPERTY, rich_text: { is_not_empty: true } } },
		pacer,
	);
	const byVideoId = new Map<string, string[]>();
	for (const row of rows) {
		const id = plainText(row.properties?.[SUPERCUT_VIDEO_ID_PROPERTY]);
		if (id) byVideoId.set(id, [...(byVideoId.get(id) ?? []), row.id]);
	}
	return byVideoId;
}

export async function syncPages(videoIdProperty: string, pacer: Pacer): Promise<PagePassResult> {
	const result: PagePassResult = {
		rows: 0,
		links: { set: 0, unchanged: 0, noMatch: 0, ambiguous: [] },
		players: { appended: 0, updated: 0, unchanged: 0 },
	};

	const videosDataSource = process.env.VIDEOS_DATA_SOURCE_ID;
	if (!videosDataSource) {
		// Do not throw: the id only exists after the first deploy creates the
		// database, and the first scheduled run must still sync the rows.
		return { ...result, skipped: "VIDEOS_DATA_SOURCE_ID is not set" };
	}

	await pacer.wait();
	const schema = await retrieveDataSource(videosDataSource);
	const hasRelation = schema.properties?.[RELATION_PROPERTY]?.type === "relation";
	if (!hasRelation) {
		result.links.skipped = `YouTube Videos has no "${RELATION_PROPERTY}" relation column — add it by hand (see CLAUDE.md)`;
	}
	const byVideoId = hasRelation ? await supercutRowsByVideoId(pacer) : new Map<string, string[]>();

	const videoRows = await queryAll(videosDataSource, {}, pacer);
	result.rows = videoRows.length;
	for (const row of videoRows) {
		const videoId = plainText(row.properties?.[videoIdProperty]);
		if (!videoId) continue;
		const relation = hasRelation ? linkRow(row, videoId, byVideoId, result) : undefined;
		if (relation) {
			await pacer.wait();
			await updatePage(row.id, { properties: { [RELATION_PROPERTY]: relation } });
		}
		await ensurePlayer(row.id, watchUrl(videoId), pacer, result);
	}
	return result;
}

/** The relation value to write, or undefined when it is already right or can't be decided. */
function linkRow(
	row: any,
	videoId: string,
	byVideoId: Map<string, string[]>,
	result: PagePassResult,
): { relation: { id: string }[] } | undefined {
	const matches = byVideoId.get(videoId) ?? [];
	if (matches.length === 0) {
		result.links.noMatch++;
		return;
	}
	if (matches.length > 1) {
		// Two Supercut rows claiming one upload is a data error; don't guess.
		result.links.ambiguous.push(videoId);
		return;
	}
	const current: string[] = (row.properties?.[RELATION_PROPERTY]?.relation ?? []).map((r: any) => r.id);
	if (current.length === 1 && current[0] === matches[0]) {
		result.links.unchanged++;
		return;
	}
	result.links.set++;
	return { relation: [{ id: matches[0] }] };
}

/** One `video` block per page, pointing at the watch URL; others left alone. */
async function ensurePlayer(pageId: string, url: string, pacer: Pacer, result: PagePassResult) {
	const children = await listChildren(pageId, pacer);
	const existing = children.find((b) => b.type === "video" && b.video?.type === "external");
	if (!existing) {
		// Appended at the end; on a page the worker created that is the top, as
		// the body is empty until someone writes in it.
		await notion("PATCH", `/blocks/${pageId}/children`, pacer, {
			children: [{ object: "block", type: "video", video: { type: "external", external: { url } } }],
			notifications: SILENT_NOTIFICATIONS,
		});
		result.players.appended++;
	} else if (existing.video?.external?.url === url) {
		result.players.unchanged++;
	} else {
		await notion("PATCH", `/blocks/${existing.id}`, pacer, { video: { external: { url } } });
		result.players.updated++;
	}
}
