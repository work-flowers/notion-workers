/**
 * Raw Notion REST calls for the page-body pass.
 *
 * `context.notion` (the bundled `@notionhq/client` 2.x) pins `Notion-Version`
 * to 2022-06-28 and cannot override it per request, so it has no
 * `/data_sources/{id}/query`. The repo convention is to hit the REST API
 * directly at 2026-03-11 instead, with `NOTION_API_TOKEN`.
 */
import type { NotionBlock } from "./embed.js";
import type { Pacer } from "./supercut.js";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const PAGE_SIZE = 100;

export interface NotionPage {
	id: string;
	archived?: boolean;
	in_trash?: boolean;
	properties: Record<string, any>;
}

interface Paginated<T> {
	results: T[];
	has_more: boolean;
	next_cursor: string | null;
}

function notionToken(): string {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) throw new Error("NOTION_API_TOKEN environment variable is not set");
	return token;
}

export async function notionRequest<T>(
	path: string,
	init: { method: "GET" | "POST" | "PATCH"; body?: unknown },
	pacer: Pacer,
): Promise<T> {
	await pacer.wait();
	const res = await fetch(`${NOTION_API_BASE}${path}`, {
		method: init.method,
		headers: {
			Authorization: `Bearer ${notionToken()}`,
			"Notion-Version": NOTION_VERSION,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	if (!res.ok) {
		const body = (await res.text().catch(() => "")).slice(0, 500);
		throw new Error(`Notion ${init.method} ${path} → ${res.status}: ${body}`);
	}
	return (await res.json()) as T;
}

/** Every live page in a data source (Notion omits trashed pages by default). */
export async function queryAllPages(dataSourceId: string, pacer: Pacer): Promise<NotionPage[]> {
	const pages: NotionPage[] = [];
	let cursor: string | null = null;
	do {
		const body: Record<string, unknown> = { page_size: PAGE_SIZE };
		if (cursor) body.start_cursor = cursor;
		const page: Paginated<NotionPage> = await notionRequest(
			`/data_sources/${dataSourceId}/query`,
			{ method: "POST", body },
			pacer,
		);
		pages.push(...page.results);
		cursor = page.has_more ? page.next_cursor : null;
	} while (cursor);
	return pages;
}

export async function listChildren(blockId: string, pacer: Pacer): Promise<NotionBlock[]> {
	const blocks: NotionBlock[] = [];
	let cursor: string | null = null;
	do {
		const query = new URLSearchParams({ page_size: String(PAGE_SIZE) });
		if (cursor) query.set("start_cursor", cursor);
		const page: Paginated<NotionBlock> = await notionRequest(
			`/blocks/${blockId}/children?${query}`,
			{ method: "GET" },
			pacer,
		);
		blocks.push(...page.results);
		cursor = page.has_more ? page.next_cursor : null;
	} while (cursor);
	return blocks;
}

export function appendChildren(blockId: string, children: unknown[], pacer: Pacer): Promise<unknown> {
	// Silent: suppresses page-update notifications for the change.
	return notionRequest(
		`/blocks/${blockId}/children`,
		{ method: "PATCH", body: { children, notifications: { mode: "silent" } } },
		pacer,
	);
}

export function updateBlock(blockId: string, body: Record<string, unknown>, pacer: Pacer): Promise<unknown> {
	return notionRequest(`/blocks/${blockId}`, { method: "PATCH", body }, pacer);
}
