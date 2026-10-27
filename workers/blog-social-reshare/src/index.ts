/**
 * Notion Worker: Blog Social Reshare
 *
 * Triggered by a Notion database automation on Blog Content (a "Send webhook"
 * action, e.g. when Publish is checked). For the triggering blog post it
 * creates one Social Content page for the workFlowers LinkedIn company page:
 *
 *   - body: the blog post's Description, verbatim
 *   - Channel: LIPAGE@work-flowers, Type: Blog Post Reshare
 *   - Publication Date: 8am SGT on the business day after the blog's Date
 *   - Status: Ready to schedule (Scheduled.so picks it up from there)
 *   - sc_title_article / sc_link_article: post title and UTM-tagged URL
 *   - Blog Post: relation back to the blog post
 *
 * Idempotent: if the post already has a company-page reshare linked, the
 * event is skipped, so re-ticking Publish or a webhook retry won't duplicate.
 *
 * Auth: webhook handlers are NOT auto-authenticated, so set a token first:
 *   ntn workers env set NOTION_API_TOKEN=ntn_...
 */

import { Worker } from "@notionhq/workers";
import {
	createPage,
	queryDataSource,
	retrievePage,
} from "@work-flowers/notion-worker-shared";
import { blogUrlFromSlug, reshareSlot, withUtm } from "./schedule.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Blog Content data source — source of the triggering page. */
const BLOG_DATA_SOURCE_ID = "1d791b07-11ac-8146-9124-000b0d6dbcc8";
/** Social Content data source — where the reshare is created. */
const SOCIAL_DATA_SOURCE_ID = "14591b07-11ac-8187-934a-000b1a3a474d";

const CHANNEL = "LIPAGE@work-flowers";
const TYPE = "Blog Post Reshare";
const STATUS = "Ready to schedule 🕑";

// ---------------------------------------------------------------------------
// Payload / property helpers
// ---------------------------------------------------------------------------

/** Notion's automation envelope puts the triggering page at `data.id`. */
function extractPageId(body: Record<string, unknown>): string | undefined {
	const data = body.data as Record<string, unknown> | undefined;
	for (const candidate of [data?.id, body.page_id, body.pageId, body.id]) {
		if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
	}
	return undefined;
}

function plainText(prop: any): string {
	const spans = prop?.title ?? prop?.rich_text ?? [];
	return spans
		.map((s: any) => s.plain_text ?? "")
		.join("")
		.trim();
}

/** Canonical URL: `Public URL` when filled in (it rarely is), else built from `Slug`. */
function blogUrl(props: Record<string, any>): string | undefined {
	const publicUrl = props["Public URL"]?.url;
	if (publicUrl) return publicUrl;
	const slug = plainText(props["Slug"]);
	return slug ? blogUrlFromSlug(slug) : undefined;
}

async function findExistingReshare(blogPageId: string): Promise<string | undefined> {
	const result = await queryDataSource(SOCIAL_DATA_SOURCE_ID, {
		filter: {
			and: [
				{ property: "Blog Post", relation: { contains: blogPageId } },
				{ property: "Channel", multi_select: { contains: CHANNEL } },
			],
		},
		page_size: 1,
	});
	return result.results[0]?.id;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const worker = new Worker();
export default worker;

worker.webhook("onBlogPublished", {
	title: "Create LinkedIn company-page reshare",
	description:
		"Fired by a Blog Content automation. Creates a Social Content page for " +
		"LIPAGE@work-flowers that reshares the post using its Description.",
	execute: async (events) => {
		for (const event of events) {
			const tag = `[${event.deliveryId}]`;
			const blogPageId = extractPageId(event.body ?? {});
			if (!blogPageId) {
				// Retrying won't help a malformed payload — skip without throwing.
				console.warn(`${tag} no page id in payload; skipping.`);
				continue;
			}

			const page = await retrievePage(blogPageId);
			if (
				page.parent?.data_source_id &&
				page.parent.data_source_id.replace(/-/g, "") !==
					BLOG_DATA_SOURCE_ID.replace(/-/g, "")
			) {
				console.warn(`${tag} ${blogPageId} is not a Blog Content page; skipping.`);
				continue;
			}

			const existing = await findExistingReshare(blogPageId);
			if (existing) {
				console.log(`${tag} reshare ${existing} already exists for ${blogPageId}; skipping.`);
				continue;
			}

			const props = page.properties ?? {};
			const title = plainText(props["Post Title"]);
			const description = plainText(props["Description"]);
			const dateStart: string | undefined = props["Date"]?.date?.start;
			const url = blogUrl(props);

			const missing = [
				!title && "Post Title",
				!description && "Description",
				!dateStart && "Date",
				!url && "Public URL/Slug",
			].filter(Boolean);
			if (missing.length) {
				// Not retryable as-is; the automation re-fires once the post is fixed.
				console.warn(`${tag} ${blogPageId} missing ${missing.join(", ")}; skipping.`);
				continue;
			}

			const slot = reshareSlot(dateStart!);
			const created = await createPage({
				parent: { type: "data_source_id", data_source_id: SOCIAL_DATA_SOURCE_ID },
				properties: {
					Name: { title: [{ text: { content: `Blog: ${title}` } }] },
					Channel: { multi_select: [{ name: CHANNEL }] },
					Type: { select: { name: TYPE } },
					Status: { status: { name: STATUS } },
					"Publication Date": { date: { start: slot } },
					"Blog Post": { relation: [{ id: blogPageId }] },
					sc_title_article: { rich_text: [{ text: { content: title } }] },
					sc_link_article: { url: withUtm(url!) },
				},
				markdown: description,
			});
			console.log(`${tag} created reshare ${created.id} for "${title}" at ${slot}.`);
		}
	},
});
