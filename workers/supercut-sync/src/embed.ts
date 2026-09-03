/**
 * The embed code block that goes into every recording page.
 *
 * Bullet.so renders a Notion code block as raw HTML only when its caption is
 * exactly `bullet:HTML`, which is the whole reason this block cannot be written
 * through the sync's `pageContentMarkdown` — Notion-flavored Markdown has no
 * caption syntax for code blocks. See body.ts for how it is written instead.
 */

export const EMBED_CAPTION = "bullet:HTML";
export const EMBED_LANGUAGE = "html";

/** Notion caps each rich_text item at 2000 characters. */
const RICH_TEXT_LIMIT = 2000;

export interface RichTextItem {
	type: "text";
	text: { content: string; link?: { url: string } | null };
	plain_text?: string;
}

export interface CodeBlockPayload {
	object: "block";
	type: "code";
	code: {
		language: string;
		rich_text: RichTextItem[];
		caption: RichTextItem[];
	};
}

/** Partial shape of a block as returned by GET /v1/blocks/{id}/children. */
export interface NotionBlock {
	id: string;
	type: string;
	code?: {
		language?: string;
		rich_text?: Array<{ plain_text?: string; text?: { content?: string } }>;
		caption?: Array<{ plain_text?: string; text?: { content?: string } }>;
	};
}

export function toRichText(content: string): RichTextItem[] {
	const items: RichTextItem[] = [];
	for (let i = 0; i < content.length; i += RICH_TEXT_LIMIT) {
		items.push({ type: "text", text: { content: content.slice(i, i + RICH_TEXT_LIMIT) } });
	}
	return items;
}

/** The `code` object shared by "append child" and "update block" requests. */
export function codeValue(html: string): CodeBlockPayload["code"] {
	return {
		language: EMBED_LANGUAGE,
		rich_text: toRichText(html),
		caption: toRichText(EMBED_CAPTION),
	};
}

export function codeBlockPayload(html: string): CodeBlockPayload {
	return { object: "block", type: "code", code: codeValue(html) };
}

export function plainText(
	items: Array<{ plain_text?: string; text?: { content?: string } }> | undefined,
): string {
	if (!Array.isArray(items)) return "";
	return items.map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}

/** True when an existing code block already carries exactly this embed. */
export function codeBlockMatches(block: NotionBlock, html: string): boolean {
	if (block.type !== "code" || !block.code) return false;
	return (
		block.code.language === EMBED_LANGUAGE &&
		plainText(block.code.rich_text) === html &&
		plainText(block.code.caption) === EMBED_CAPTION
	);
}
