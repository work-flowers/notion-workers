const NOTION_VERSION = "2026-03-11";
const API_BASE = "https://api.notion.com/v1";

function token(): string {
	const t = process.env.NOTION_API_TOKEN;
	if (!t) throw new Error("NOTION_API_TOKEN is not configured");
	return t;
}

async function call<T>(
	method: "GET" | "POST" | "PATCH",
	path: string,
	body?: unknown,
): Promise<T> {
	const res = await fetch(`${API_BASE}/${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token()}`,
			"Notion-Version": NOTION_VERSION,
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		throw new Error(
			`Notion ${method} /${path} failed: ${res.status} ${await res.text()}`,
		);
	}
	return (await res.json()) as T;
}

export interface QueryDataSourceResponse {
	results: any[];
	has_more: boolean;
	next_cursor: string | null;
}

export async function retrieveDataSource(
	dataSourceId: string,
): Promise<{ properties?: Record<string, any> }> {
	return await call("GET", `data_sources/${dataSourceId}`);
}

export async function queryDataSource(
	dataSourceId: string,
	body: Record<string, unknown>,
): Promise<QueryDataSourceResponse> {
	return await call("POST", `data_sources/${dataSourceId}/query`, body);
}

/**
 * Sent on every page write so worker edits don't notify anyone: Notion skips
 * page-update, @mention and Person-property notifications for the change,
 * while database automations and webhooks still fire. The `@notionhq/client`
 * 2.x SDK strips unknown body params, so `context.notion.pages.update` can't
 * send this — page writes have to go through these raw helpers.
 */
export const SILENT_NOTIFICATIONS = { mode: "silent" } as const;

export async function createPage(body: Record<string, unknown>): Promise<any> {
	return await call("POST", "pages", {
		notifications: SILENT_NOTIFICATIONS,
		...body,
	});
}

export async function updatePage(
	pageId: string,
	body: Record<string, unknown>,
): Promise<any> {
	return await call("PATCH", `pages/${pageId}`, {
		notifications: SILENT_NOTIFICATIONS,
		...body,
	});
}
