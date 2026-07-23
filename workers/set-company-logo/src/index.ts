import { Worker } from "@notionhq/workers";

const worker = new Worker();
export default worker;

/**
 * Webhook fired by a Notion database automation ("Send webhook" action).
 *
 * On each trigger it:
 *   1. Reads the triggering page id from the automation payload (`body.data`).
 *   2. Retrieves the page's `Website` property and cleans it down to a bare
 *      domain (no scheme, no `www.`, no path/query).
 *   3. Sets the page icon to the matching logo.dev company logo.
 *
 * Required secrets (set with `ntn workers env set`):
 *   NOTION_API_TOKEN  – token the Notion client acts as (PAT or internal integration).
 *   LOGO_DEV_TOKEN    – logo.dev publishable token (the `pk_...` value).
 *
 * Optional:
 *   WEBSITE_PROPERTY  – name of the URL property to read. Defaults to "Website".
 */

const LOGO_DEV_BASE = "https://img.logo.dev";

worker.webhook("setCompanyLogo", {
	title: "Set Company Logo",
	description:
		"On a Notion automation trigger, reads the page's Website property and sets the page icon to the matching logo.dev company logo.",
	execute: async (events, { notion }) => {
		const logoToken = process.env.LOGO_DEV_TOKEN;
		if (!logoToken) throw new Error("LOGO_DEV_TOKEN is not configured");

		const websiteProperty = process.env.WEBSITE_PROPERTY ?? "Website";

		for (const event of events) {
			const pageId = extractPageId(event.body);
			if (!pageId) {
				console.warn("No page id found in webhook payload; skipping.", {
					deliveryId: event.deliveryId,
				});
				continue;
			}

			// Read the page fresh from the API so we don't depend on how the
			// automation serialised the property in the webhook body.
			const page = await notion.pages.retrieve({ page_id: pageId });
			const properties =
				"properties" in page
					? (page.properties as Record<string, unknown>)
					: undefined;

			const websiteRaw = extractPropertyString(properties?.[websiteProperty]);
			if (!websiteRaw) {
				console.warn(
					`Page ${pageId} has no usable "${websiteProperty}" value; skipping.`,
				);
				continue;
			}

			const domain = cleanDomain(websiteRaw);
			if (!domain) {
				console.warn(
					`Could not extract a domain from "${websiteRaw}" on page ${pageId}; skipping.`,
				);
				continue;
			}

			const logoUrl = `${LOGO_DEV_BASE}/${encodeURIComponent(
				domain,
			)}?token=${encodeURIComponent(logoToken)}`;

			await notion.pages.update({
				page_id: pageId,
				icon: { type: "external", external: { url: logoUrl } },
			});

			console.log(`Set icon for page ${pageId} to logo for ${domain}.`);
		}
	},
});

/**
 * Pull the triggering page id out of an automation "Send webhook" payload.
 * The page object is delivered under `data`; we also tolerate a top-level id.
 */
function extractPageId(body: Record<string, unknown>): string | undefined {
	const data = body?.data;
	if (data && typeof data === "object") {
		const id = (data as Record<string, unknown>).id;
		if (typeof id === "string" && id) return id;
	}
	if (typeof body?.id === "string" && body.id) return body.id;
	return undefined;
}

/**
 * Extract a plain string from a Notion property value, covering the property
 * types a "Website" column is likely to use.
 */
function extractPropertyString(property: unknown): string | undefined {
	if (!property || typeof property !== "object") return undefined;
	const prop = property as Record<string, unknown>;

	switch (prop.type) {
		case "url":
			return typeof prop.url === "string" ? prop.url : undefined;
		case "email":
			return typeof prop.email === "string" ? prop.email : undefined;
		case "phone_number":
			return typeof prop.phone_number === "string"
				? prop.phone_number
				: undefined;
		case "rich_text":
			return joinRichText(prop.rich_text);
		case "title":
			return joinRichText(prop.title);
		case "formula": {
			const formula = prop.formula as Record<string, unknown> | undefined;
			return typeof formula?.string === "string" ? formula.string : undefined;
		}
		default:
			return undefined;
	}
}

function joinRichText(value: unknown): string | undefined {
	if (!Array.isArray(value)) return undefined;
	const text = value
		.map((item) =>
			item && typeof item === "object" &&
			typeof (item as Record<string, unknown>).plain_text === "string"
				? ((item as Record<string, unknown>).plain_text as string)
				: "",
		)
		.join("")
		.trim();
	return text || undefined;
}

/**
 * Normalise a website value to a bare domain: strip the scheme, any `www.`
 * prefix, and any path/query/fragment/port. Returns null if nothing usable.
 */
export function cleanDomain(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	let hostname: string;
	try {
		const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
		hostname = new URL(hasScheme ? trimmed : `https://${trimmed}`).hostname;
	} catch {
		hostname = trimmed
			.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
			.split(/[/?#]/)[0]
			.split("@")
			.pop()!
			.split(":")[0];
	}

	hostname = hostname.replace(/^www\./i, "").toLowerCase().trim();
	return hostname || null;
}
