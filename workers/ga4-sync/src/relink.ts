/**
 * Writes the relation from each Page Performance row to the Notion page that is
 * the source of that URL.
 *
 * Why this is not a `Schema.relation(...)` in the managed schema: that helper
 * requires the related database to be declared in the same worker
 * (`relatedDatabaseKey` must match a `worker.database()` key), and
 * `worker.database()` only supports `type: "managed"`. Pages List and Blog Posts
 * are human-owned content databases; making them worker-managed would mark their
 * properties read-only and put a generated schema in charge of them.
 *
 * So the two relation properties are added to the Page Performance data source by
 * hand and left *undeclared*, which keeps them writable, and this pass fills them
 * in over the REST API. The mapping is a pure function of the page path, so the
 * pass is idempotent and self-healing: re-running it repairs anything a
 * replace-mode sweep removed.
 */
import { queryDataSource, updatePage } from "@work-flowers/notion-worker-shared";
import { normalizePath } from "./paths.js";
import type { SourcePageIndex } from "./sourcePages.js";

/** Relation -> Pages List. Added by hand in Notion; see the worker's CLAUDE.md. */
export const STATIC_RELATION_PROPERTY = "Website Page";
/** Relation -> Blog Posts. Added by hand in Notion; see the worker's CLAUDE.md. */
export const BLOG_RELATION_PROPERTY = "Blog Post";

const PAGE_SIZE = 100;

export function pagePerformanceDataSourceId(): string {
	const id = process.env.PAGE_PERFORMANCE_DATA_SOURCE_ID;
	if (!id) {
		throw new Error(
			"PAGE_PERFORMANCE_DATA_SOURCE_ID is not set. After the first deploy, " +
				"copy the Page Performance data source ID from Notion and set it with " +
				"`ntn workers env set`.",
		);
	}
	return id;
}

function titleText(property: any): string {
	const parts = property?.title;
	if (!Array.isArray(parts)) return "";
	return parts.map((p: any) => p?.plain_text ?? "").join("").trim();
}

function relationIds(property: any): string[] {
	const rel = property?.relation;
	return Array.isArray(rel) ? rel.map((r: any) => r?.id).filter(Boolean) : [];
}

export interface RelinkResult {
	nextCursor: string | null;
	scanned: number;
	updated: number;
	cleared: number;
	unmatched: number;
}

/**
 * Reconcile one page of Page Performance rows against the source index.
 *
 * @param sources  path -> Notion source page, from `loadSourcePages()`
 * @param cursor   Notion pagination cursor, or undefined to start
 * @param wait     pacer gate, awaited before every Notion API call
 */
export async function relinkPage(
	sources: SourcePageIndex,
	cursor: string | undefined,
	wait: () => Promise<void>,
): Promise<RelinkResult> {
	const body: Record<string, unknown> = { page_size: PAGE_SIZE };
	if (cursor) body.start_cursor = cursor;

	await wait();
	const res = await queryDataSource(pagePerformanceDataSourceId(), body);

	let updated = 0;
	let cleared = 0;
	let unmatched = 0;

	for (const row of res.results as Array<{ id: string; properties?: Record<string, any> }>) {
		const path = normalizePath(titleText(row.properties?.Page));
		if (!path) continue;

		const source = sources.get(path);
		const target =
			source?.kind === "blog" ? BLOG_RELATION_PROPERTY : STATIC_RELATION_PROPERTY;

		// Whatever the row currently points at, on either property.
		const current: Record<string, string[]> = {
			[STATIC_RELATION_PROPERTY]: relationIds(row.properties?.[STATIC_RELATION_PROPERTY]),
			[BLOG_RELATION_PROPERTY]: relationIds(row.properties?.[BLOG_RELATION_PROPERTY]),
		};

		const desired: Record<string, string[]> = {
			[STATIC_RELATION_PROPERTY]: [],
			[BLOG_RELATION_PROPERTY]: [],
		};
		if (source) desired[target] = [source.pageId];
		else unmatched++;

		const changedProps: Record<string, unknown> = {};
		for (const property of [STATIC_RELATION_PROPERTY, BLOG_RELATION_PROPERTY]) {
			const before = current[property];
			const after = desired[property];
			const same =
				before.length === after.length &&
				before.every((id: string, i: number) => id === after[i]);
			if (same) continue;
			// A row whose relation property has not been created in Notion yet reads
			// as absent, not as an empty relation. Skip it rather than 400 on every
			// row of every run.
			if (!(property in (row.properties ?? {}))) continue;
			changedProps[property] = { relation: after.map((id) => ({ id })) };
		}

		if (Object.keys(changedProps).length === 0) continue;

		await wait();
		await updatePage(row.id, { properties: changedProps });
		if (source) updated++;
		else cleared++;
	}

	return {
		nextCursor: res.has_more ? res.next_cursor : null,
		scanned: res.results.length,
		updated,
		cleared,
		unmatched,
	};
}
