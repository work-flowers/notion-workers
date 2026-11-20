/**
 * The video embed that goes into every recording page: a Notion `embed` block
 * pointing at Supercut's player (`https://supercut.ai/embed/{ws}/{id}`), so the
 * video plays inline in Notion.
 *
 * Until 2026-11-20 the body was an `html` code block holding Supercut's iframe
 * snippet, captioned `bullet:HTML` (Bullet.so's signal to render raw HTML). Those
 * blocks are recognised by that caption and removed by the body pass.
 */

export const LEGACY_CODE_CAPTION = "bullet:HTML";

/** Partial shape of a block as returned by GET /v1/blocks/{id}/children. */
export interface NotionBlock {
	id: string;
	type: string;
	embed?: { url?: string };
	code?: {
		caption?: Array<{ plain_text?: string; text?: { content?: string } }>;
	};
}

export function embedBlockPayload(url: string) {
	return { object: "block" as const, type: "embed" as const, embed: { url } };
}

export function plainText(
	items: Array<{ plain_text?: string; text?: { content?: string } }> | undefined,
): string {
	if (!Array.isArray(items)) return "";
	return items.map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}

/** The embed code block this worker used to write (see the header). */
export function isLegacyCodeBlock(block: NotionBlock): boolean {
	return block.type === "code" && plainText(block.code?.caption) === LEGACY_CODE_CAPTION;
}
