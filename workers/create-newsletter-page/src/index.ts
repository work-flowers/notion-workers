/**
 * Notion Worker: Create Newsletter Page
 *
 * Triggered by a webhook fired from the Blog data source (the "Create
 * Newsletter" button / automation). The payload carries the triggering blog
 * page's id. For each event the worker:
 *
 *   1. Retrieves the blog page's full content as enhanced (Notion-flavored)
 *      Markdown via `GET /v1/pages/{id}/markdown`.
 *   2. Creates a page in the Newsletter Issues data source, sets its content
 *      from that Markdown, and relates it back to the triggering blog page.
 *   3. Copies the blog page's cover onto the new Newsletter page (re-hosting
 *      Notion-hosted file covers so the URL doesn't expire).
 *   4. Re-hosts the body images (Markdown import drops them) and patches each
 *      onto the matching image block on the new page.
 *   5. Appends the Newsletter data source's default template blocks after the
 *      blog content (the API does not run data-source templates on create).
 *
 * All calls use the latest data APIs at Notion-Version 2026-03-11 via raw
 * fetch, because the bundled SDK defaults to an older version that doesn't
 * expose the Markdown or data-source endpoints.
 *
 * Auth: webhook handlers are NOT auto-authenticated, so set a token first:
 *   ntn workers env set NOTION_API_TOKEN=ntn_...
 */

import { Worker } from "@notionhq/workers";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Blog data source — source of the triggering page. */
const BLOG_DATA_SOURCE_ID = "1d791b07-11ac-8146-9124-000b0d6dbcc8";
/** Newsletter Issues data source — where the new page is created. */
const NEWSLETTER_DATA_SOURCE_ID = "0c691b07-11ac-82fa-bc1b-07d0186a095d";

/** Title property on the Blog data source. */
const BLOG_TITLE_PROP = "Post Title";
/** Title property on the Newsletter Issues data source. */
const NEWSLETTER_TITLE_PROP = "Name";
/** Relation (Newsletter Issues -> Blog) used to link the two pages. */
const BLOG_RELATION_PROP = "Blog post";

/**
 * Default page template for the Newsletter Issues data source. The Notion API
 * does not run data-source templates on create, so we copy this template's
 * blocks onto the new page (after the blog content). Update this id if the data
 * source's default template changes.
 */
const NEWSLETTER_TEMPLATE_PAGE_ID = "33791b07-11ac-809f-be48-f78827e4f8ca";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";

// ---------------------------------------------------------------------------
// Minimal response types (only the fields we read)
// ---------------------------------------------------------------------------

type NotionCover =
	| { type: "external"; external: { url: string } }
	| { type: "file"; file: { url: string; expiry_time?: string } }
	| { type: "file_upload"; file_upload: { id: string } }
	| null;

interface TitleSpan {
	plain_text?: string;
	text?: { content?: string };
}

interface NotionPage {
	id: string;
	url?: string;
	cover?: NotionCover;
	parent?: { type?: string; data_source_id?: string; database_id?: string };
	properties?: Record<string, unknown>;
}

interface PageMarkdown {
	object?: string;
	markdown?: string;
	truncated?: boolean;
}

interface FileUpload {
	id: string;
	upload_url: string;
	status?: string;
}

interface QueryResult {
	results: Array<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Notion API helpers
// ---------------------------------------------------------------------------

function authHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		"Notion-Version": NOTION_VERSION,
	};
}

/** JSON request against the Notion API. Throws (with body text) on non-2xx. */
async function notionRequest<T>(
	token: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const res = await fetch(`${NOTION_API}${path}`, {
		method,
		headers: {
			...authHeaders(token),
			"Content-Type": "application/json",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});

	const text = await res.text();
	if (!res.ok) {
		throw new Error(
			`Notion ${method} ${path} -> ${res.status} ${res.statusText}: ${text}`,
		);
	}
	return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Pull the triggering page id out of the webhook payload. Notion automation /
 * button webhooks place the page object under `data`, but we check the common
 * locations so the worker is resilient to payload shape.
 */
function extractPageId(body: Record<string, unknown>): string | undefined {
	const data = body.data as Record<string, unknown> | undefined;
	const entity = body.entity as Record<string, unknown> | undefined;
	const source = body.source as Record<string, unknown> | undefined;

	const candidates: unknown[] = [
		body.page_id,
		data?.id,
		data?.page_id,
		entity?.id,
		source?.page_id,
		body.id,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return undefined;
}

/** Flatten a Notion title property into plain text. */
function plainTitle(page: NotionPage, propName: string): string {
	const prop = page.properties?.[propName] as
		| { title?: TitleSpan[] }
		| undefined;
	return (prop?.title ?? [])
		.map((span) => span.plain_text ?? span.text?.content ?? "")
		.join("")
		.trim();
}

/**
 * Idempotency guard: returns an existing Newsletter page already linked to the
 * given blog page, if any. Prevents duplicate creates on webhook/Notion retries.
 */
async function findExistingNewsletter(
	token: string,
	blogPageId: string,
): Promise<string | undefined> {
	const result = await notionRequest<QueryResult>(
		token,
		"POST",
		`/data_sources/${NEWSLETTER_DATA_SOURCE_ID}/query`,
		{
			filter: {
				property: BLOG_RELATION_PROP,
				relation: { contains: blogPageId },
			},
			page_size: 1,
		},
	);
	return result.results[0]?.id;
}

/** Best-effort content type for a downloaded cover image. */
function guessContentType(url: string, headerType: string | null): string {
	if (headerType && headerType !== "application/octet-stream") {
		return headerType.split(";")[0].trim();
	}
	let ext = "";
	try {
		ext = (new URL(url).pathname.split(".").pop() ?? "").toLowerCase();
	} catch {
		/* ignore malformed URL */
	}
	const map: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		bmp: "image/bmp",
		tiff: "image/tiff",
		heic: "image/heic",
	};
	return map[ext] ?? "image/png";
}

function filenameFor(url: string, contentType: string): string {
	try {
		const base = new URL(url).pathname.split("/").pop();
		if (base && /\.[a-zA-Z0-9]+$/.test(base)) return decodeURIComponent(base);
	} catch {
		/* ignore malformed URL */
	}
	const ext = contentType.split("/")[1]?.split("+")[0] ?? "png";
	return `cover.${ext}`;
}

/**
 * Download a (Notion-hosted) file and re-upload it via the File Upload API so
 * it can be referenced permanently. Returns the file_upload id.
 */
async function rehostFile(token: string, sourceUrl: string): Promise<string> {
	// 1. Download the bytes.
	const download = await fetch(sourceUrl);
	if (!download.ok) {
		throw new Error(`download cover failed: ${download.status}`);
	}
	const contentType = guessContentType(
		sourceUrl,
		download.headers.get("content-type"),
	);
	const bytes = new Uint8Array(await download.arrayBuffer());
	const filename = filenameFor(sourceUrl, contentType);

	// 2. Create the file upload.
	const upload = await notionRequest<FileUpload>(token, "POST", "/file_uploads", {
		mode: "single_part",
		filename,
		content_type: contentType,
	});

	// 3. Send the bytes to the returned upload URL as multipart/form-data.
	//    Don't set Content-Type manually — FormData sets the boundary.
	const form = new FormData();
	form.append("file", new Blob([bytes], { type: contentType }), filename);

	const send = await fetch(upload.upload_url, {
		method: "POST",
		headers: authHeaders(token),
		body: form,
	});
	if (!send.ok) {
		throw new Error(`send file upload failed: ${send.status} ${await send.text()}`);
	}
	return upload.id;
}

/**
 * Build the `cover` object for the new page from the source page's cover.
 * - external covers are copied as-is.
 * - Notion-hosted file covers are re-hosted (their signed URLs expire);
 *   on failure we fall back to the (temporary) external URL.
 */
async function buildCover(
	token: string,
	source: NotionCover,
): Promise<Record<string, unknown> | undefined> {
	if (!source) return undefined;

	if (source.type === "external") {
		return { type: "external", external: { url: source.external.url } };
	}
	if (source.type === "file_upload") {
		return { type: "file_upload", file_upload: { id: source.file_upload.id } };
	}
	if (source.type === "file") {
		try {
			const id = await rehostFile(token, source.file.url);
			return { type: "file_upload", file_upload: { id } };
		} catch (err) {
			console.warn(
				`Cover re-host failed (${String(err)}); using expiring source URL.`,
			);
			return { type: "external", external: { url: source.file.url } };
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Body images
//
// Creating a page from Markdown does NOT carry over images: Notion discards the
// source's expiring S3 URLs, leaving empty image blocks. We fix that by walking
// the source and the new page's block trees in parallel, re-hosting each source
// image via the File Upload API and patching it onto the matching image block on
// the new page — which preserves position, even inside columns.
// ---------------------------------------------------------------------------

interface NotionBlock {
	id: string;
	type: string;
	has_children?: boolean;
	image?: {
		type?: "file" | "external" | "file_upload";
		file?: { url: string };
		external?: { url: string };
	};
	[key: string]: unknown;
}

interface SourceImage {
	kind: "file" | "external";
	url: string;
}

/** All direct children of a block/page, following pagination. */
async function listChildren(
	token: string,
	blockId: string,
): Promise<NotionBlock[]> {
	const blocks: NotionBlock[] = [];
	let cursor: string | undefined;
	do {
		const qs = new URLSearchParams({ page_size: "100" });
		if (cursor) qs.set("start_cursor", cursor);
		const res = await notionRequest<{
			results: NotionBlock[];
			has_more: boolean;
			next_cursor: string | null;
		}>(token, "GET", `/blocks/${blockId}/children?${qs.toString()}`);
		blocks.push(...res.results);
		cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
	} while (cursor);
	return blocks;
}

/** Image blocks under a block, in document order (descends into children). */
async function collectSourceImages(
	token: string,
	blockId: string,
): Promise<SourceImage[]> {
	const out: SourceImage[] = [];
	for (const block of await listChildren(token, blockId)) {
		if (block.type === "image") {
			const img = block.image;
			if (img?.type === "external" && img.external?.url) {
				out.push({ kind: "external", url: img.external.url });
			} else {
				out.push({ kind: "file", url: img?.file?.url ?? "" });
			}
		} else if (block.has_children) {
			out.push(...(await collectSourceImages(token, block.id)));
		}
	}
	return out;
}

/** Image block ids under a block, in the same document order. */
async function collectImageBlockIds(
	token: string,
	blockId: string,
): Promise<string[]> {
	const out: string[] = [];
	for (const block of await listChildren(token, blockId)) {
		if (block.type === "image") {
			out.push(block.id);
		} else if (block.has_children) {
			out.push(...(await collectImageBlockIds(token, block.id)));
		}
	}
	return out;
}

/**
 * Copy the source page's body images onto the freshly created page by matching
 * them positionally and re-hosting Notion-hosted files. Best-effort: per-image
 * failures are logged, not thrown (the page itself already exists).
 */
async function copyBodyImages(
	token: string,
	sourcePageId: string,
	newPageId: string,
): Promise<void> {
	const sources = await collectSourceImages(token, sourcePageId);
	if (sources.length === 0) return;

	const targetIds = await collectImageBlockIds(token, newPageId);
	const count = Math.min(sources.length, targetIds.length);
	if (sources.length !== targetIds.length) {
		console.warn(
			`Body image count mismatch (source ${sources.length}, created ${targetIds.length}); copying first ${count}.`,
		);
	}

	for (let i = 0; i < count; i++) {
		const src = sources[i];
		const blockId = targetIds[i];
		if (!src.url) continue;
		try {
			const media =
				src.kind === "external"
					? { external: { url: src.url } }
					: { file_upload: { id: await rehostFile(token, src.url) } };
			await notionRequest(token, "PATCH", `/blocks/${blockId}`, {
				image: media,
			});
		} catch (err) {
			console.warn(
				`Failed to copy body image ${i} -> block ${blockId}: ${String(err)}`,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Template
//
// The Notion API does not run data-source page templates on create, so we copy
// the default template's blocks onto the new page after the blog content. This
// is a generic block clone: it strips read-only fields, re-hosts Notion-hosted
// media, and preserves nesting (e.g. column layouts).
// ---------------------------------------------------------------------------

/** Block types we can't faithfully recreate via the API — skipped on copy. */
const UNSUPPORTED_BLOCKS = new Set([
	"child_page",
	"child_database",
	"unsupported",
	"ai_block",
	"link_to_page",
	"synced_block",
	"template",
]);

/** File-backed block types whose Notion-hosted media must be re-hosted. */
const MEDIA_BLOCKS = new Set(["image", "file", "video", "pdf"]);

/** Drop read-only fields (`plain_text`, `href`) from a rich_text array. */
function stripReadOnlyRichText(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return value.map((item) => {
		if (item && typeof item === "object") {
			const { plain_text, href, ...rest } = item as Record<string, unknown>;
			return rest;
		}
		return item;
	});
}

/**
 * Turn a fetched block into a create payload: keep the type-specific data, strip
 * read-only fields, re-host Notion-hosted media, and recurse into children.
 * Returns null for block types we skip.
 */
async function cloneBlock(
	token: string,
	block: NotionBlock,
): Promise<Record<string, unknown> | null> {
	const type = block.type;
	if (UNSUPPORTED_BLOCKS.has(type)) return null;

	const data: Record<string, unknown> = {
		...((block[type] as Record<string, unknown> | undefined) ?? {}),
	};
	if ("rich_text" in data) data.rich_text = stripReadOnlyRichText(data.rich_text);
	if ("caption" in data) data.caption = stripReadOnlyRichText(data.caption);

	// Re-host Notion-hosted media so the copy doesn't point at an expiring URL.
	if (MEDIA_BLOCKS.has(type) && data.type === "file") {
		const url = (data.file as { url?: string } | undefined)?.url;
		if (url) {
			try {
				const id = await rehostFile(token, url);
				delete data.file;
				data.type = "file_upload";
				data.file_upload = { id };
			} catch (err) {
				console.warn(`Template media re-host failed: ${String(err)}`);
				delete data.file;
				data.type = "external";
				data.external = { url };
			}
		}
	}

	if (block.has_children) {
		const cloned: Record<string, unknown>[] = [];
		for (const child of await listChildren(token, block.id)) {
			const c = await cloneBlock(token, child);
			if (c) cloned.push(c);
		}
		if (cloned.length > 0) data.children = cloned;
	}

	return { object: "block", type, [type]: data };
}

/**
 * Copy the template page's blocks onto the new page. Appends at the end, so the
 * blog content (already the page body) stays before the template blocks.
 */
async function applyTemplate(
	token: string,
	templatePageId: string,
	newPageId: string,
): Promise<void> {
	const children: Record<string, unknown>[] = [];
	for (const block of await listChildren(token, templatePageId)) {
		const c = await cloneBlock(token, block);
		if (c) children.push(c);
	}
	if (children.length === 0) return;

	for (let i = 0; i < children.length; i += 100) {
		await notionRequest(token, "PATCH", `/blocks/${newPageId}/children`, {
			children: children.slice(i, i + 100),
		});
	}
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const worker = new Worker();
export default worker;

worker.webhook("onCreateNewsletter", {
	title: "Create Newsletter Page",
	description:
		"Fired by the Blog data source. Creates a linked Newsletter Issues page " +
		"that mirrors the triggering blog page's content (as enhanced Markdown) " +
		"and cover image.",
	execute: async (events) => {
		const token = process.env.NOTION_API_TOKEN;
		if (!token) {
			throw new Error(
				"NOTION_API_TOKEN is not configured. Run: ntn workers env set NOTION_API_TOKEN=ntn_...",
			);
		}

		for (const event of events) {
			const blogPageId = extractPageId(event.body);
			if (!blogPageId) {
				// Retrying won't help a malformed payload — skip without throwing.
				console.warn(
					`No page id in payload (delivery ${event.deliveryId}); skipping.`,
				);
				continue;
			}

			// Skip if a Newsletter page is already linked to this blog post.
			const existing = await findExistingNewsletter(token, blogPageId);
			if (existing) {
				console.log(
					`Newsletter page ${existing} already linked to blog ${blogPageId}; skipping.`,
				);
				continue;
			}

			// 1. Retrieve the blog page (for title + cover).
			const page = await notionRequest<NotionPage>(
				token,
				"GET",
				`/pages/${blogPageId}`,
			);

			// Only act on pages from the Blog data source. If the parent is
			// known and doesn't match, ignore the trigger.
			if (
				page.parent?.data_source_id &&
				page.parent.data_source_id.replace(/-/g, "") !==
					BLOG_DATA_SOURCE_ID.replace(/-/g, "")
			) {
				console.warn(
					`Page ${blogPageId} is not in the Blog data source; skipping.`,
				);
				continue;
			}

			// 2. Retrieve the blog content as enhanced Markdown.
			const md = await notionRequest<PageMarkdown>(
				token,
				"GET",
				`/pages/${blogPageId}/markdown`,
			);
			if (md.truncated) {
				console.warn(`Markdown for blog ${blogPageId} was truncated by the API.`);
			}

			// 3. Mirror the cover (re-hosting Notion-hosted files).
			const cover = await buildCover(token, page.cover ?? null);

			// 4. Create the linked Newsletter Issues page with the Markdown content.
			const title = plainTitle(page, BLOG_TITLE_PROP) || "Untitled";
			const createBody: Record<string, unknown> = {
				parent: {
					type: "data_source_id",
					data_source_id: NEWSLETTER_DATA_SOURCE_ID,
				},
				properties: {
					[NEWSLETTER_TITLE_PROP]: {
						title: [{ text: { content: title } }],
					},
					[BLOG_RELATION_PROP]: {
						relation: [{ id: blogPageId }],
					},
				},
			};
			if (cover) createBody.cover = cover;
			if (md.markdown && md.markdown.trim().length > 0) {
				createBody.markdown = md.markdown;
			}

			const created = await notionRequest<NotionPage>(
				token,
				"POST",
				"/pages",
				createBody,
			);
			console.log(
				`Created Newsletter page ${created.id} for blog ${blogPageId} ("${title}").`,
			);

			// 5. Copy body images. The Markdown import drops them, so re-host
			//    each source image and patch it onto the matching image block.
			//    Best-effort: never fail the run over images (the page exists,
			//    and a retry would be skipped by the idempotency guard).
			try {
				await copyBodyImages(token, blogPageId, created.id);
			} catch (err) {
				console.warn(
					`Body image copy failed for ${created.id}: ${String(err)}`,
				);
			}

			// 6. Append the Newsletter template's blocks after the blog content.
			//    The API can't run data-source templates, so we copy them in.
			try {
				await applyTemplate(token, NEWSLETTER_TEMPLATE_PAGE_ID, created.id);
			} catch (err) {
				console.warn(
					`Applying template to ${created.id} failed: ${String(err)}`,
				);
			}
		}
	},
});
