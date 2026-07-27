import { Worker } from "@notionhq/workers";

const worker = new Worker();
export default worker;

// On Meeting Notes and Emails: the relation to Companies is called "Companies".
const COMPANIES_RELATION_PROPERTY = "Companies";
// On Meeting Notes and Emails: the relation to Contacts is called "Contacts".
const CONTACTS_RELATION_PROPERTY = "Contacts";
// On Contact pages: the relation to Companies is called "Related Company" (singular).
const CONTACT_TO_COMPANY_RELATION_PROPERTY = "Related Company";

// Notion's API rate limit is ~3 requests/sec average; this webhook can receive
// bursts of dozens of near-simultaneous deliveries (e.g. a bulk relation edit),
// so every call must be paced to avoid tripping Notion's rate limiter.
const notionApi = worker.pacer("notionApi", { allowedRequests: 3, intervalMs: 1000 });

worker.webhook("syncIconFromCompany", {
	title: "Sync page icon from related Company",
	description:
		"When a Meeting Note or Email is linked to a Company (directly or via a Contact), copy the Company's icon onto the source page.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			try {
				await syncOne(event, notion);
			} catch (error) {
				// One bad delivery must not take down the rest of the batch.
				console.error("Failed to sync icon", { deliveryId: event.deliveryId, error });
			}
		}
	},
});

async function syncOne(
	event: { body: Record<string, unknown>; deliveryId: string },
	notion: import("@notionhq/client").Client,
): Promise<void> {
	const pageId = extractPageId(event.body);
	if (!pageId) {
		console.warn("No page id in webhook payload", { deliveryId: event.deliveryId });
		return;
	}

	await notionApi.wait();
	const page = await notion.pages.retrieve({ page_id: pageId });
	if (!("properties" in page)) return;

	const companyId = await resolveCompanyId(page.properties, notion);
	if (!companyId) {
		console.log("No related company found (direct or via contact)", { pageId });
		return;
	}

	await notionApi.wait();
	const company = await notion.pages.retrieve({ page_id: companyId });
	const companyIcon = "icon" in company ? company.icon : null;
	const iconUpdate = toIconUpdate(companyIcon);
	if (!iconUpdate) {
		console.log("Company has no icon", { pageId, companyId });
		return;
	}

	await notionApi.wait();
	await notion.pages.update({
		page_id: pageId,
		// Cast: the response emoji type is a specific union; the update API accepts the same set of strings at runtime.
		icon: iconUpdate as Parameters<typeof notion.pages.update>[0]["icon"],
	});

	console.log("Synced icon", { pageId, companyId });
}

/**
 * Resolve the Company page ID to copy the icon from.
 *
 * 1. First, try the direct `Companies` relation on the source page.
 * 2. If empty, walk through `Contacts` on the source page and take the first
 *    Contact whose `Related Company` relation is set. This handles the case
 *    where a Notion automation will eventually set `Companies` from Contacts,
 *    but hasn't yet (Notion automations don't cascade-trigger each other, so
 *    our webhook on `Contacts edited` may fire before — or instead of — the
 *    native "set Companies from Contacts" automation completes).
 */
async function resolveCompanyId(
	properties: Record<string, unknown>,
	notion: import("@notionhq/client").Client,
): Promise<string | null> {
	const direct = relationFirstId(properties, COMPANIES_RELATION_PROPERTY);
	if (direct) return direct;

	const contactIds = relationAllIds(properties, CONTACTS_RELATION_PROPERTY);
	for (const contactId of contactIds) {
		await notionApi.wait();
		const contact = await notion.pages.retrieve({ page_id: contactId });
		if (!("properties" in contact)) continue;
		const companyId = relationFirstId(contact.properties, CONTACT_TO_COMPANY_RELATION_PROPERTY);
		if (companyId) return companyId;
	}

	return null;
}

function relationFirstId(
	properties: Record<string, unknown>,
	propertyName: string,
): string | null {
	const prop = properties[propertyName] as
		| { type: string; relation?: Array<{ id: string }> }
		| undefined;
	if (!prop || prop.type !== "relation") return null;
	return prop.relation?.[0]?.id ?? null;
}

function relationAllIds(
	properties: Record<string, unknown>,
	propertyName: string,
): string[] {
	const prop = properties[propertyName] as
		| { type: string; relation?: Array<{ id: string }> }
		| undefined;
	if (!prop || prop.type !== "relation") return [];
	return prop.relation?.map((r) => r.id) ?? [];
}

type IconResponse =
	| { type: "emoji"; emoji: string }
	| { type: "external"; external: { url: string } }
	| { type: "file"; file: { url: string; expiry_time: string } }
	| { type: "custom_emoji"; custom_emoji: { id: string; name?: string; url?: string } }
	| null;

type IconUpdate =
	| { type: "emoji"; emoji: string }
	| { type: "external"; external: { url: string } }
	| { type: "custom_emoji"; custom_emoji: { id: string; name?: string; url?: string } };

function toIconUpdate(icon: IconResponse | unknown): IconUpdate | null {
	if (!icon || typeof icon !== "object" || !("type" in icon)) return null;
	const i = icon as IconResponse;
	if (!i) return null;
	if (i.type === "emoji") return { type: "emoji", emoji: i.emoji };
	if (i.type === "external") return { type: "external", external: i.external };
	if (i.type === "custom_emoji") return { type: "custom_emoji", custom_emoji: i.custom_emoji };
	// `file` icons (uploaded to Notion) have expiring URLs; copy as external URL.
	if (i.type === "file") return { type: "external", external: { url: i.file.url } };
	return null;
}

function extractPageId(body: Record<string, unknown>): string | null {
	const data = body.data as Record<string, unknown> | undefined;
	if (data && typeof data.id === "string") return data.id;
	if (typeof body.page_id === "string") return body.page_id;
	if (typeof body.id === "string") return body.id;
	return null;
}
