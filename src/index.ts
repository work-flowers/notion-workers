import { Worker } from "@notionhq/workers";

const worker = new Worker();
export default worker;

const COMPANIES_RELATION_PROPERTY = "Companies";

worker.webhook("syncIconFromCompany", {
	title: "Sync page icon from related Company",
	description:
		"When a Meeting Note or Email is linked to a Company, copy the Company's icon onto the source page.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			const pageId = extractPageId(event.body);
			if (!pageId) {
				console.warn("No page id in webhook payload", {
					deliveryId: event.deliveryId,
				});
				continue;
			}

			const page = await notion.pages.retrieve({ page_id: pageId });
			if (!("properties" in page)) continue;

			const companiesProp = page.properties[COMPANIES_RELATION_PROPERTY];
			if (!companiesProp || companiesProp.type !== "relation") {
				console.warn("Companies relation not found", { pageId });
				continue;
			}

			const firstCompanyId = companiesProp.relation[0]?.id;
			if (!firstCompanyId) {
				console.log("No related company", { pageId });
				continue;
			}

			const company = await notion.pages.retrieve({ page_id: firstCompanyId });
			const companyIcon = "icon" in company ? company.icon : null;
			const iconUpdate = toIconUpdate(companyIcon);
			if (!iconUpdate) {
				console.log("Company has no icon", { pageId, firstCompanyId });
				continue;
			}

			await notion.pages.update({
				page_id: pageId,
				// Cast: the response emoji type is a specific union; the update API accepts the same set of strings at runtime.
				icon: iconUpdate as Parameters<typeof notion.pages.update>[0]["icon"],
			});

			console.log("Synced icon", { pageId, firstCompanyId });
		}
	},
});

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
