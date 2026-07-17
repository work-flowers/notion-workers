import type { Client } from "@notionhq/client";

/**
 * Build a lowercase-email → Notion-user-id map for every person in the
 * workspace, via notion.users.list (paginated).
 */
export async function buildInternalUserMap(
	notion: Client,
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	let cursor: string | undefined;
	do {
		const resp = (await notion.users.list({
			start_cursor: cursor,
			page_size: 100,
		})) as any;
		for (const user of resp.results ?? []) {
			if (user.type === "person" && user.person?.email) {
				map.set(String(user.person.email).toLowerCase(), user.id);
			}
		}
		cursor = resp.has_more ? resp.next_cursor : undefined;
	} while (cursor);
	return map;
}

/**
 * Resolve raw email addresses to Notion workspace user ids using a map
 * from buildInternalUserMap. Non-matching addresses are dropped.
 */
export function resolveInternalUserIds(
	emails: string[],
	internalMap: Map<string, string>,
): string[] {
	const out = new Set<string>();
	for (const raw of emails) {
		const id = internalMap.get(raw.toLowerCase());
		if (id) out.add(id);
	}
	return [...out];
}
