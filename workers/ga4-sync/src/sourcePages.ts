/**
 * Resolution of GA4 page paths to the Notion pages that are the source of the
 * website's content.
 *
 * Two human-owned data sources feed the site:
 *   - Pages List  — parent-level static pages, keyed on a `Path` property
 *   - Blog Posts  — blog articles, keyed on a `Slug` property (no `/blog` prefix)
 *
 * Both are edited by hand and neither is worker-managed, so nothing here may
 * write to them.
 */
import { queryDataSource } from "@work-flowers/notion-worker-shared";
import { normalizePath, pathFromBlogSlug } from "./paths.js";

export const PAGES_LIST_DATA_SOURCE_ID = "1d791b07-11ac-8140-bb4e-000b76786676";
export const BLOG_POSTS_DATA_SOURCE_ID = "1d791b07-11ac-8146-9124-000b0d6dbcc8";

export interface SourcePage {
	pageId: string;
	url: string;
	title: string;
	/** Which data source it came from — decides which relation property to set. */
	kind: "static" | "blog";
}

/** Normalised GA4 path -> the Notion page that produces it. */
export type SourcePageIndex = Map<string, SourcePage>;

type NotionPage = {
	id: string;
	url?: string;
	properties?: Record<string, any>;
};

function plainText(property: any): string {
	const parts = property?.rich_text ?? property?.title;
	if (!Array.isArray(parts)) return "";
	return parts.map((p: any) => p?.plain_text ?? "").join("").trim();
}

async function queryAll(dataSourceId: string): Promise<NotionPage[]> {
	const pages: NotionPage[] = [];
	let cursor: string | undefined;

	do {
		const body: Record<string, unknown> = { page_size: 100 };
		if (cursor) body.start_cursor = cursor;
		const res = await queryDataSource(dataSourceId, body);
		pages.push(...(res.results as NotionPage[]));
		cursor = res.next_cursor ?? undefined;
	} while (cursor);

	return pages;
}

/**
 * Build the path index from both content data sources.
 *
 * Where two records claim the same path the first wins and the collision is
 * logged — silently picking one would make the relation quietly wrong for a page
 * nobody is looking at.
 */
export async function loadSourcePages(): Promise<SourcePageIndex> {
	const index: SourcePageIndex = new Map();

	const add = (path: string, page: SourcePage) => {
		const existing = index.get(path);
		if (existing) {
			console.warn(
				`Path ${path} maps to two Notion pages (${existing.url} and ${page.url}); keeping the first.`,
			);
			return;
		}
		index.set(path, page);
	};

	const [staticPages, blogPosts] = await Promise.all([
		queryAll(PAGES_LIST_DATA_SOURCE_ID),
		queryAll(BLOG_POSTS_DATA_SOURCE_ID),
	]);

	for (const page of staticPages) {
		const path = plainText(page.properties?.Path);
		if (!path) continue;
		add(normalizePath(path), {
			pageId: page.id,
			url: page.url ?? "",
			title: plainText(page.properties?.Title),
			kind: "static",
		});
	}

	for (const page of blogPosts) {
		const slug = plainText(page.properties?.Slug);
		if (!slug) continue;
		add(pathFromBlogSlug(slug), {
			pageId: page.id,
			url: page.url ?? "",
			title: plainText(page.properties?.["Post Title"]),
			kind: "blog",
		});
	}

	return index;
}
