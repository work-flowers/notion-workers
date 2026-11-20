/** Small helpers for reading Outbound Leads pages and leaving audit comments. */

export type Props = Record<string, any>;

export const OUTBOUND_LEADS_DATA_SOURCE_ID = "61a01f87-741b-4dbd-a98e-ada01e07eb3b";

export const text = (p: any): string =>
	(p?.title ?? p?.rich_text ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("").trim();
export const status = (p: any): string | undefined => p?.status?.name ?? p?.select?.name;
export const relationIds = (p: any): string[] => (p?.relation ?? []).map((r: any) => r.id);

export function splitName(name: string): { first: string; last: string } {
	const [first = "", ...rest] = name.split(/\s+/);
	return { first, last: rest.join(" ") };
}

/**
 * Page comments are the audit trail (`Done:` / `Blocked:`). The shared package
 * has no comment helper, and comments take no `notifications` param.
 */
export async function comment(pageId: string, message: string): Promise<void> {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) throw new Error("NOTION_API_TOKEN is not configured");
	const res = await fetch("https://api.notion.com/v1/comments", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2026-03-11", "Content-Type": "application/json" },
		body: JSON.stringify({ parent: { page_id: pageId }, rich_text: [{ type: "text", text: { content: message } }] }),
	});
	if (!res.ok) throw new Error(`Notion comment failed: ${res.status} ${await res.text()}`);
}
