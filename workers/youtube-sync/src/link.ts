/**
 * Sets each YouTube Videos row's hand-added **Supercut Recording** relation to
 * the Supercut Recordings row whose hand-added `YouTube Video ID` matches.
 *
 * Why this is a REST pass and not part of the upsert: `Schema.relation()` can
 * only point at a database declared in the same worker, and Supercut Recordings
 * belongs to `supercut-sync`. So the relation is added to the YouTube Videos
 * data source by hand (which also keeps it editable) and written here, the same
 * pattern `buttondown-sync` uses for its Newsletter Issue relation.
 *
 * Only rows that already exist can be linked; the platform creates rows after
 * `execute` returns, so a new video is linked on the run after it first syncs.
 *
 * The pass only ever **sets** a link, never clears one: a person may link a
 * video uploaded straight to YouTube by hand, and that must survive.
 */
import { queryDataSource, retrieveDataSource, updatePage } from "@work-flowers/notion-worker-shared";

/** Supercut Recordings, the `supercut-sync` worker's managed database. */
export const SUPERCUT_RECORDINGS_DATA_SOURCE = "0f3fea21-11be-4158-ba98-9bb26936db89";
/** Hand-added text column on Supercut Recordings, written by the supercut-to-youtube Zap. */
const SUPERCUT_VIDEO_ID_PROPERTY = "YouTube Video ID";
/** Hand-added relation column on YouTube Videos. */
export const RELATION_PROPERTY = "Supercut Recording";

type Pacer = { wait: () => Promise<void> };

export interface LinkResult {
	skipped?: string;
	linked: number;
	unchanged: number;
	noMatch: number;
	ambiguous: string[];
	rows: number;
}

function plainText(prop: any): string {
	const parts: any[] = prop?.rich_text ?? prop?.title ?? [];
	return parts.map((p) => p.plain_text ?? "").join("").trim();
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

export async function linkSupercutRecordings(
	videoIdProperty: string,
	pacer: Pacer,
): Promise<LinkResult> {
	const result: LinkResult = { linked: 0, unchanged: 0, noMatch: 0, ambiguous: [], rows: 0 };

	const videosDataSource = process.env.VIDEOS_DATA_SOURCE_ID;
	if (!videosDataSource) {
		// Do not throw: the id only exists after the first deploy creates the
		// database, and the first scheduled run must still sync the rows.
		return { ...result, skipped: "VIDEOS_DATA_SOURCE_ID is not set" };
	}

	await pacer.wait();
	const schema = await retrieveDataSource(videosDataSource);
	if (schema.properties?.[RELATION_PROPERTY]?.type !== "relation") {
		return {
			...result,
			skipped: `YouTube Videos has no "${RELATION_PROPERTY}" relation column — add it by hand (see CLAUDE.md)`,
		};
	}

	const supercutRows = await queryAll(
		SUPERCUT_RECORDINGS_DATA_SOURCE,
		{ filter: { property: SUPERCUT_VIDEO_ID_PROPERTY, rich_text: { is_not_empty: true } } },
		pacer,
	);
	const byVideoId = new Map<string, string[]>();
	for (const row of supercutRows) {
		const id = plainText(row.properties?.[SUPERCUT_VIDEO_ID_PROPERTY]);
		if (id) byVideoId.set(id, [...(byVideoId.get(id) ?? []), row.id]);
	}

	const videoRows = await queryAll(videosDataSource, {}, pacer);
	result.rows = videoRows.length;
	for (const row of videoRows) {
		const videoId = plainText(row.properties?.[videoIdProperty]);
		const matches = byVideoId.get(videoId) ?? [];
		if (matches.length === 0) {
			result.noMatch++;
			continue;
		}
		if (matches.length > 1) {
			// Two Supercut rows claiming one upload is a data error; don't guess.
			result.ambiguous.push(videoId);
			continue;
		}
		const current: string[] = (row.properties?.[RELATION_PROPERTY]?.relation ?? []).map((r: any) => r.id);
		if (current.length === 1 && current[0] === matches[0]) {
			result.unchanged++;
			continue;
		}
		await pacer.wait();
		await updatePage(row.id, { properties: { [RELATION_PROPERTY]: { relation: [{ id: matches[0] }] } } });
		result.linked++;
	}
	return result;
}
