import {
	queryDataSource,
	updatePage,
} from "@work-flowers/notion-worker-shared";

// Readwise Library (managed by this worker) and the Readwise Highlights
// database written by Readwise's own Notion export integration.
export const LIBRARY_DATA_SOURCE_ID = "41f91b07-11ac-81d1-9128-000b796f69f2";
export const HIGHLIGHTS_DATA_SOURCE_ID = "2d791b07-11ac-814b-af18-000b6272383c";

// Hand-added two-way relation on Readwise Library (reverse column on
// Highlights: "Readwise Library"). Deliberately not in the worker schema:
// relations in a managed schema can only target worker databases, and
// declaring it would make it read-only.
export const RELATION_PROPERTY = "Highlights Page";

// Writes per execute call, so one call stays well inside the run time limit.
const MAX_WRITES_PER_CALL = 120;

type Wait = () => Promise<void>;

function plain(prop: any): string {
	const parts = prop?.title ?? prop?.rich_text ?? [];
	return parts.map((p: any) => p.plain_text).join("");
}

function norm(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function asinFromUrl(url: string | null | undefined): string | null {
	const m = url?.match(/\/(?:gp\/product|dp)\/([A-Z0-9]{10})/);
	return m ? m[1] : null;
}

async function queryAll(
	dataSourceId: string,
	body: Record<string, unknown>,
	wait: Wait,
): Promise<any[]> {
	const rows: any[] = [];
	let cursor: string | undefined;
	do {
		await wait();
		const res = await queryDataSource(dataSourceId, {
			page_size: 100,
			...body,
			...(cursor ? { start_cursor: cursor } : {}),
		});
		rows.push(...res.results);
		cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
	} while (cursor);
	return rows;
}

function push(map: Map<string, string[]>, key: string, id: string) {
	const list = map.get(key);
	if (list) list.push(id);
	else map.set(key, [id]);
}

/**
 * Points each Readwise Library book at its page(s) in Readwise Highlights.
 * Join: the ASIN in the highlight page's Amazon URL, falling back to
 * normalised title + author (Kobo and manual books have no ASIN).
 * Only writes rows whose relation differs from the match, and never clears a
 * relation when there is no match, so hand-made links on unmatched books stay.
 * Returns how many rows still differ after this call.
 */
export async function relinkHighlights(wait: Wait): Promise<number> {
	const [highlights, library] = await Promise.all([
		queryAll(
			HIGHLIGHTS_DATA_SOURCE_ID,
			{ filter: { property: "Category", select: { equals: "Books" } } },
			wait,
		),
		queryAll(LIBRARY_DATA_SOURCE_ID, {}, wait),
	]);

	const byAsin = new Map<string, string[]>();
	const byTitleAuthor = new Map<string, string[]>();
	for (const page of highlights) {
		const p = page.properties;
		const asin = asinFromUrl(p.URL?.url);
		if (asin) push(byAsin, asin, page.id);
		push(byTitleAuthor, `${norm(plain(p.Title))}|${norm(plain(p.Author))}`, page.id);
	}

	const pending: { pageId: string; ids: string[] }[] = [];
	for (const book of library) {
		const p = book.properties;
		const asin = plain(p.ASIN);
		const ids =
			(asin && byAsin.get(asin)) ||
			byTitleAuthor.get(`${norm(plain(p.Title))}|${norm(plain(p.Author))}`);
		if (!ids) continue;
		const current = (p[RELATION_PROPERTY]?.relation ?? []).map((r: any) => r.id);
		const same =
			current.length === ids.length && ids.every((id) => current.includes(id));
		if (!same) pending.push({ pageId: book.id, ids });
	}

	const batch = pending.slice(0, MAX_WRITES_PER_CALL);
	for (const { pageId, ids } of batch) {
		await wait();
		await updatePage(pageId, {
			properties: {
				[RELATION_PROPERTY]: { relation: ids.map((id) => ({ id })) },
			},
		});
	}
	console.log(
		`relink: ${highlights.length} highlight pages, ${library.length} books, wrote ${batch.length}, ${pending.length - batch.length} left`,
	);
	return pending.length - batch.length;
}
