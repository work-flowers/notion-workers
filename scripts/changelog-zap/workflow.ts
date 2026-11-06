import { defineDurable } from "@zapier/zapier-durable";
import { createZapierSdk } from "@zapier/zapier-sdk";
import { z } from "zod";

// Product Changelogs: one page per changelog entry per product. Source copy and
// docs: scripts/changelog-zap in work-flowers/notion-workers. Keep the Mintlify
// FEEDS and Key format in step with scripts/changelog-backfill.ts there.
const DATA_SOURCE_ID = "6d311e8f-6533-4dbe-8c86-6c7581b58942";
const NOTION = "notion_workflowers";
const NOTION_VERSION = "2026-03-11";

// Logo.dev Brand API through the `logo_dev` connection (an API by Zapier
// connection holding the secret key, scoped to api.logo.dev; shared with
// deal-to-client-drive-folder). The publish analyzer rejects any key in source,
// even logo.dev's publishable one, so icons are uploaded files, not img.logo.dev URLs.
const LOGO_DEV = "logo_dev";
const ICON_PX = 256;

/**
 * How a feed's page body is obtained:
 * - "mintlify": Mintlify changelogs, one RSS item per date. The body is that
 *   date's section of the page's `.md` twin. Key `<id>:<ISO date>`.
 * - "page": anything else, one RSS item per page. The body is the item's link
 *   run through Zapier's Web Parser as markdown, minus lines matching `strip`.
 *   Key `<id>:<link path>`.
 */
type Feed = {
	id: string;
	product: string;
	logoDomain: string;
	body: { kind: "mintlify"; page: string } | { kind: "page"; strip?: RegExp[] };
};

// To add a feed: add its URL to the trigger and an entry here (plus a Product
// option in Notion), republish, then run once with { backfill_feed_url }.
const FEEDS: Record<string, Feed> = {
	"https://developers.notion.com/page/changelog/rss.xml": {
		id: "notion-api",
		product: "Notion API",
		logoDomain: "notion.com",
		body: { kind: "mintlify", page: "https://developers.notion.com/page/changelog" },
	},
	"https://docs.lovable.dev/changelog/rss.xml": {
		id: "lovable",
		product: "Lovable",
		logoDomain: "lovable.dev",
		body: { kind: "mintlify", page: "https://docs.lovable.dev/changelog" },
	},
	"https://www.notion.com/releases/rss.xml": {
		id: "notion",
		product: "Notion",
		logoDomain: "notion.com",
		body: {
			kind: "page",
			strip: [
				/^\[Releases\]\(\/releases\) \/ /, // breadcrumb
				/ad blocker is preventing the video/, // video fallback notice
				/illustrated-icons/, // decorative illustration after each video
			],
		},
	},
};

const InputSchema = z
	.object({
		title: z.string().nullable().optional(),
		link: z.string().nullable().optional(),
		pubDate: z.string().nullable().optional(),
		feed_url: z.string().nullable().optional(),
		// Manual runs only: replay every item currently in this feed.
		backfill_feed_url: z.string().nullable().optional(),
		backfill_limit: z.number().nullable().optional(),
	})
	.loose();

type Item = { title: string; link: string; pubDate: string };

const MONTHS: Record<string, string> = { sept: "09" };
[
	"january", "february", "march", "april", "may", "june",
	"july", "august", "september", "october", "november", "december",
].forEach((name, i) => {
	const mm = String(i + 1).padStart(2, "0");
	MONTHS[name] = mm;
	MONTHS[name.slice(0, 3)] = mm;
});
const MONTH_WORD = new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\b`, "i");
const iso = (y: string, mon: string, d: string): string | null => {
	const mm = MONTHS[mon.toLowerCase()];
	return mm ? `${y}-${mm}-${d.padStart(2, "0")}` : null;
};

/** "Nov 4, 2026" / "November 4, 2026" → "2026-11-04"; anything else → null. */
function parseLabelToISO(label: string): string | null {
	const m = /^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})$/.exec(label.trim());
	return m ? iso(m[3], m[1], m[2]) : null;
}

/** RSS pubDate → ISO date, without `Date` (the durable runtime forbids it).
 *  Handles RFC 822 ("Wed, 04 Nov 2026 …") and JS-style ("Mon Oct 19 2026 …"). */
function pubDateToISO(s: string): string | null {
	const rfc = /(\d{1,2}) ([A-Za-z]{3,}) (\d{4})/.exec(s);
	if (rfc) return iso(rfc[3], rfc[2], rfc[1]);
	const js = /([A-Za-z]{3,}) (\d{1,2}) (\d{4})/.exec(s);
	return js ? iso(js[3], js[1], js[2]) : null;
}

/** Bold-only date (or legacy range) line that starts an entry in Mintlify's `.md`. */
function isEntryLabel(line: string): boolean {
	const m = /^\*\*([^*]+)\*\*\s*$/.exec(line);
	if (!m) return false;
	const text = m[1].trim();
	return parseLabelToISO(text) !== null || (/\b(19|20)\d{2}\b/.test(text) && MONTH_WORD.test(text));
}

/** The markdown between `**<label>**` and the next date line; null if absent. */
function sliceEntry(markdown: string, label: string): string | null {
	const lines = markdown.split("\n");
	const start = lines.findIndex((l) => l.trim() === `**${label}**`);
	if (start === -1) return null;
	let end = start + 1;
	while (end < lines.length && !isEntryLabel(lines[end])) end++;
	return lines.slice(start + 1, end).join("\n");
}

/** Shared cleanup: alerts, `.md` twin links, relative links, `\&`, stray lines. */
function cleanBody(raw: string, origin: string, strip: RegExp[] = []): string {
	const host = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const twin = new RegExp(`\\]\\((${host}/[^)\\s#]*?)\\.md(#[^)\\s]*)?\\)`, "g");
	return raw
		.split("\n")
		.filter((line) => !strip.some((re) => re.test(line)))
		.join("\n")
		.replace(/^> \[!([A-Z]+)\][ \t]*\n((?:>.*(?:\n|$))*)/gm, (_m, kind: string, rest: string) => {
			const paragraphs = rest
				.split("\n")
				.map((l) => l.replace(/^>\s?/, ""))
				.join("\n")
				.trim()
				.split(/\n\s*\n/)
				.map((p) => p.split("\n").map((l) => l.trim()).join(" "))
				.filter(Boolean);
			return `> **${kind[0]}${kind.slice(1).toLowerCase()}:** ${paragraphs.join("<br><br>")}\n`;
		})
		.replace(/\\&/g, "&")
		.replace(/\]\(\/(?!\/)/g, `](${origin}/`)
		.replace(twin, (_m, path: string, hash = "") => `](${path}${hash})`)
		.replace(/^[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** `<item>`s of an RSS 2.0 feed (title, link, pubDate), CDATA unwrapped. */
function parseRssItems(xml: string): Item[] {
	const text = (block: string, tag: string): string => {
		const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
		return (m?.[1] ?? "")
			.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
			.replace(/&amp;/g, "&")
			.trim();
	};
	return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
		title: text(m[1], "title"),
		link: text(m[1], "link"),
		pubDate: text(m[1], "pubDate"),
	}));
}

const sdk = createZapierSdk();

/**
 * Call Notion through `sdk.fetch` with the work.flowers connection. Not the
 * Notion app's "API Request" action: it drops a JSON string body, so a query
 * filter is silently ignored and returns arbitrary rows (seen 2026-11-06).
 */
async function notion(method: string, path: string, body: unknown): Promise<any> {
	const res = await sdk.fetch(`https://api.notion.com/v1${path}`, {
		connection: NOTION,
		method,
		headers: { "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const json: any = await res.json();
	if (!res.ok) throw new Error(`Notion ${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
	return json;
}

const keyOf = (page: any): string =>
	(page?.properties?.Key?.rich_text ?? []).map((t: any) => t.plain_text).join("");

/**
 * The domain's logo from logo.dev, uploaded to Notion; returns the file upload
 * id for an `icon`, or null when logo.dev has no logo yet (not in its index, or
 * a first crawl still pending). A missing icon never fails the entry.
 */
async function uploadBrandIcon(domain: string): Promise<string | null> {
	const brandRes = await sdk.fetch(
		`https://api.logo.dev/v2/brands?domain=${encodeURIComponent(domain)}&nosubscribe=true`,
		{ connection: LOGO_DEV },
	);
	if (brandRes.status === 404 || brandRes.status === 202) return null;
	if (!brandRes.ok) throw new Error(`logo.dev brand lookup for ${domain} → ${brandRes.status}: ${(await brandRes.text()).slice(0, 300)}`);
	const brand: any = (await brandRes.json())?.data;
	const src: string = brand?.logo?.url ?? brand?.brandmark?.url ?? "";
	if (!src || brand?.status === "not_found") return null;

	// The bare URL serves a small JPEG; ask for a PNG at icon size.
	const img = await sdk.fetch(`${src}${src.includes("?") ? "&" : "?"}format=png&size=${ICON_PX}`, { method: "GET" });
	if (!img.ok) throw new Error(`logo download for ${domain} → ${img.status}`);
	const bytes = new Uint8Array(await img.arrayBuffer());
	const filename = `${domain.replace(/[^a-z0-9.-]/gi, "")}-logo.png`;

	const upload = await notion("POST", "/file_uploads", { filename, content_type: "image/png" });
	// Multipart built by hand, as in esignatures-status-to-notion: the byte layout
	// verified against Notion. The part's type must match the upload's.
	const boundary = `----changelogIcon${String(upload.id).replace(/-/g, "")}`;
	const enc = new TextEncoder();
	const head = enc.encode(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
	);
	const tail = enc.encode(`\r\n--${boundary}--\r\n`);
	const multipart = new Uint8Array(head.length + bytes.length + tail.length);
	multipart.set(head, 0);
	multipart.set(bytes, head.length);
	multipart.set(tail, head.length + bytes.length);
	const sendRes = await sdk.fetch(`https://api.notion.com/v1/file_uploads/${upload.id}/send`, {
		connection: NOTION,
		method: "POST",
		headers: { "Notion-Version": NOTION_VERSION, "Content-Type": `multipart/form-data; boundary=${boundary}` },
		body: multipart,
	});
	const sent: any = await sendRes.json();
	if (!sendRes.ok || sent?.status !== "uploaded") throw new Error(`icon upload → ${sendRes.status}: ${JSON.stringify(sent).slice(0, 300)}`);
	return upload.id as string;
}

const iconFrom = (uploadId: string) => ({ type: "file_upload", file_upload: { id: uploadId } });

/** Write one RSS item to Notion. `prefix` keeps step names unique in a backfill. */
async function processItem(ctx: any, feed: Feed, item: Item, prefix = ""): Promise<Record<string, unknown>> {
	const title = item.title.trim();
	let key: string;
	let date: string | null;
	if (feed.body.kind === "mintlify") {
		date = parseLabelToISO(title);
		if (!date) return { skipped: true, reason: `not a single date: "${title}"` };
		key = `${feed.id}:${date}`;
	} else {
		date = pubDateToISO(item.pubDate);
		const path = item.link.replace(/^https?:\/\/[^/]+\/?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
		if (!date || !path) return { skipped: true, reason: `no date or link: ${item.pubDate} ${item.link}` };
		key = `${feed.id}:${path}`;
	}
	const source = feed.body;

	// `sdk.fetch` (no connection) rather than global `fetch`: the durable
	// sandbox has no DNS of its own, so requests go out through Zapier's Relay.
	// Retried, since a CDN can briefly serve a page older than the feed.
	const body: string = await ctx.step({
		name: `${prefix}fetch-entry-content`,
		maxAttempts: 3,
		retryDelaySeconds: 300,
		run: async () => {
			if (source.kind === "mintlify") {
				const res = await sdk.fetch(`${source.page}.md`, { method: "GET" });
				if (!res.ok) throw new Error(`${source.page}.md → ${res.status}`);
				const entry = sliceEntry(await res.text(), title);
				if (entry === null) throw new Error(`"**${title}**" not found in ${source.page}.md`);
				const cleaned = cleanBody(entry, new URL(source.page).origin);
				if (!cleaned) throw new Error(`Entry "${title}" in ${source.page}.md is empty`);
				return cleaned;
			}
			const parsed = await sdk.runAction({
				appKey: "WebParserByZapierCLIAPI",
				actionType: "write",
				actionKey: "create_web_parse",
				inputs: { url: item.link, contentType: "markdown", continueOnFailure: "false" },
			});
			const page = parsed.data[0] as { content?: string; url?: string; lead_image_url?: string } | undefined;
			const content = page?.content ?? "";
			const origin = new URL(page?.url || item.link).origin;
			const lead = page?.lead_image_url && !content.includes(page.lead_image_url) ? `![](${page.lead_image_url})\n\n` : "";
			const cleaned = cleanBody(lead + content, origin, source.strip);
			if (!cleaned) throw new Error(`Web Parser returned no content for ${item.link}`);
			return cleaned;
		},
	});

	const existing = await ctx.step(`${prefix}find-existing-page`, async () => {
		const found = await notion("POST", `/data_sources/${DATA_SOURCE_ID}/query`, {
			filter: { property: "Key", rich_text: { equals: key } },
			page_size: 2,
		});
		const pages: any[] = found.results ?? [];
		// Never trust the filter blindly: only a page carrying this exact Key
		// may be overwritten.
		const matches = pages.filter((p) => keyOf(p) === key);
		if (matches.length !== pages.length) throw new Error(`Key filter for ${key} returned other rows`);
		if (matches.length > 1) throw new Error(`Duplicate pages for ${key}`);
		const page = matches[0];
		return page ? { id: page.id as string, hasIcon: Boolean(page.icon) } : null;
	});

	if (existing) {
		// The entry changed since it was written (a date gained sections): replace the body.
		await ctx.step(`${prefix}replace-page-content`, async () =>
			notion("PATCH", `/pages/${existing.id}/markdown`, {
				type: "replace_content",
				replace_content: { new_str: body },
			}),
		);
		if (!existing.hasIcon) {
			const iconId = await ctx.step(`${prefix}upload-brand-icon`, async () => uploadBrandIcon(feed.logoDomain));
			if (iconId) {
				await ctx.step(`${prefix}set-page-icon`, async () =>
					notion("PATCH", `/pages/${existing.id}`, { icon: iconFrom(iconId), notifications: { mode: "silent" } }),
				);
			}
		}
		return { action: "updated", key, pageId: existing.id };
	}

	const iconId = await ctx.step(`${prefix}upload-brand-icon`, async () => uploadBrandIcon(feed.logoDomain));
	const created = await ctx.step(`${prefix}create-changelog-page`, async () =>
		notion("POST", "/pages", {
			parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
			...(iconId ? { icon: iconFrom(iconId) } : {}),
			properties: {
				Name: { title: [{ text: { content: title } }] },
				Product: { select: { name: feed.product } },
				"Entry Date": { date: { start: date } },
				URL: { url: item.link || null },
				Key: { rich_text: [{ text: { content: key } }] },
			},
			markdown: body,
			notifications: { mode: "silent" },
		}),
	);
	return { action: "created", key, pageId: created.id as string };
}

const workflow = defineDurable({
	name: "product-changelogs-rss",
	inputSchema: InputSchema,
	run: async (ctx, rawInput) => {
		const input = InputSchema.parse(rawInput);

		if (input.backfill_feed_url) {
			const feedUrl = input.backfill_feed_url;
			const feed = FEEDS[feedUrl];
			if (!feed) throw new Error(`unknown feed ${feedUrl}`);
			const items: Item[] = await ctx.step("read-feed", async () => {
				const res = await sdk.fetch(feedUrl, { method: "GET" });
				if (!res.ok) throw new Error(`${feedUrl} → ${res.status}`);
				return parseRssItems(await res.text());
			});
			const todo = items.slice(0, input.backfill_limit ?? items.length);
			const results: Record<string, unknown>[] = [];
			for (const [i, item] of todo.entries()) {
				results.push(await processItem(ctx, feed, item, `${i}-`));
			}
			const count = (a: string) => results.filter((r) => r.action === a).length;
			return {
				backfill: feedUrl,
				items: todo.length,
				created: count("created"),
				updated: count("updated"),
				skipped: todo.length - count("created") - count("updated"),
			};
		}

		const feed = FEEDS[input.feed_url ?? ""];
		if (!feed) return { skipped: true, reason: `unknown feed ${input.feed_url}` };
		return processItem(ctx, feed, {
			title: input.title ?? "",
			link: input.link ?? "",
			pubDate: input.pubDate ?? "",
		});
	},
});

export default workflow;
