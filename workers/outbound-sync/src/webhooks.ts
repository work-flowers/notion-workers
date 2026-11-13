import { WebhookVerificationError } from "@notionhq/workers";
import {
	createPage,
	DEFAULT_CONTACTS_DATA_SOURCE_ID,
	lookupExistingContacts,
	retrievePage,
	updatePage,
} from "@work-flowers/notion-worker-shared";
import { addLead, stopLeadEverywhere } from "./smartlead.js";



type Props = Record<string, any>;
type Event = { deliveryId: string; body: unknown };

/**
 * Notion database automations post `{ source: { type: "automation" }, data: { object: "page", id } }`.
 * Anything else is not ours.
 */
function pageIdOf(body: unknown): string {
	const b = (body ?? {}) as { source?: { type?: string }; data?: { object?: string; id?: string } };
	if (b.data?.object !== "page" || typeof b.data.id !== "string") {
		throw new WebhookVerificationError("Expected a Notion automation payload with data.object = page");
	}
	return b.data.id;
}

const text = (p: any): string =>
	(p?.title ?? p?.rich_text ?? []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("").trim();
const status = (p: any): string | undefined => p?.status?.name ?? p?.select?.name;
const relationIds = (p: any): string[] => (p?.relation ?? []).map((r: any) => r.id);

async function comment(pageId: string, message: string): Promise<void> {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) throw new Error("NOTION_API_TOKEN is not configured");
	const res = await fetch("https://api.notion.com/v1/comments", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2026-03-11", "Content-Type": "application/json" },
		body: JSON.stringify({ parent: { page_id: pageId }, rich_text: [{ type: "text", text: { content: message } }] }),
	});
	if (!res.ok) throw new Error(`Notion comment failed: ${res.status} ${await res.text()}`);
}

function splitName(name: string): { first: string; last: string } {
	const [first = "", ...rest] = name.split(/\s+/);
	return { first, last: rest.join(" ") };
}

/** Handles one automation delivery, so a failure on one lead doesn't stop the batch. */
async function each(events: Event[], label: string, fn: (pageId: string) => Promise<void>): Promise<void> {
	for (const event of events) {
		const pageId = pageIdOf(event.body);
		try {
			await fn(pageId);
		} catch (err) {
			console.log(`[${label} ${event.deliveryId}] ${pageId}: ${(err as Error).message}`);
			await comment(pageId, `Blocked: ${label} failed unexpectedly (${(err as Error).message.slice(0, 300)})`).catch(
				() => {},
			);
		}
	}
}

type Campaign = { pageId: string; id: number; name: string };

/**
 * One Smartlead campaign per Apollo list (agreed with Seth, 31 Oct 2026). The
 * lead's synced "Apollo Lists" relation leads to Apollo Lists pages, and each
 * of those names its campaign in the hand-added "Smartlead Campaign" relation.
 */
async function campaignForLists(props: Props): Promise<{ campaign: Campaign } | { reason: string }> {
	const listPageIds = relationIds(props["Apollo Lists"]);
	if (listPageIds.length === 0) return { reason: "the lead isn't on any Apollo list" };
	const lists = await Promise.all(
		listPageIds.map(async (id) => {
			const p: Props = (await retrievePage(id)).properties ?? {};
			return { name: text(p.Name), campaignPageId: relationIds(p["Smartlead Campaign"])[0] };
		}),
	);
	const mapped = lists.filter((l) => l.campaignPageId);
	const campaignPageIds = [...new Set(mapped.map((l) => l.campaignPageId!))];
	const names = lists.map((l) => l.name).join(", ");
	if (campaignPageIds.length === 0) {
		return {
			reason: `none of this lead's Apollo lists (${names}) has a Smartlead Campaign set on Apollo Lists. Set one there, or set Push to campaign`,
		};
	}
	const campaigns = await Promise.all(campaignPageIds.map(campaignFromPage));
	if (campaigns.length > 1) {
		const pairs = mapped
			.map((l) => `${l.name} → ${campaigns.find((c) => c.pageId === l.campaignPageId)?.name}`)
			.join("; ");
		return { reason: `this lead's Apollo lists map to different campaigns (${pairs}). Set Push to campaign to choose one` };
	}
	return { campaign: campaigns[0] };
}

async function campaignFromPage(pageId: string): Promise<Campaign> {
	const p: Props = (await retrievePage(pageId)).properties ?? {};
	return { pageId, id: Number(text(p["Campaign ID"])), name: text(p.Name) };
}

/**
 * Status → Sequenced. Pre-flight per TKT-1051: email, name, company and Apollo
 * ID set, the email not already a Contact, and exactly one campaign: Push to
 * campaign if someone set it, otherwise the campaign mapped to the contact's
 * Apollo list. On failure the lead goes back to Backlog with a Blocked comment;
 * on success it is added with notion_page_id, apollo_id and job_title. Copy
 * lives in Smartlead (decided 30 Oct 2026), so no subject or opener is sent.
 */
export function pushToSmartlead(events: Event[]): Promise<void> {
	return each(events, "push-to-smartlead", async (pageId) => {
		const props: Props = (await retrievePage(pageId)).properties ?? {};
		// Deliveries can be retried or arrive late; act only on what the page says now.
		if (status(props.Status) !== "Sequenced") return;

		const block = async (reason: string) => {
			await updatePage(pageId, { properties: { Status: { status: { name: "Backlog" } } } });
			await comment(pageId, `Blocked: ${reason}`);
		};

		const email = props.Email?.email as string | undefined;
		const name = text(props.Lead);
		const company = text(props.Company);
		const apolloId = text(props["Apollo ID"]);
		// Exact spelling, lowercase "c". An optional override of the list mapping;
		// after a push, moves happen in Smartlead.
		const overridePageId = relationIds(props["Push to campaign"])[0];
		const missing = [
			!email && "Email",
			!name && "Lead name",
			!company && "Company",
			!apolloId && "Apollo ID (only Apollo-synced leads can be sequenced)",
		].filter(Boolean);
		if (missing.length) return block(`missing ${missing.join(", ")}`);

		const existing = await lookupExistingContacts([email!.toLowerCase()]);
		if (existing.size > 0) return block(`${email} is already in Contacts; never sequence an existing contact`);

		let campaign: Campaign;
		if (overridePageId) {
			campaign = await campaignFromPage(overridePageId);
		} else {
			const resolved = await campaignForLists(props);
			if ("reason" in resolved) return block(resolved.reason);
			campaign = resolved.campaign;
		}
		if (!campaign.id) return block(`the campaign page "${campaign.name}" has no Campaign ID`);
		const campaignName = campaign.name || String(campaign.id);

		const { first, last } = splitName(name);
		const result = await addLead(campaign.id, {
			email: email!,
			first_name: first,
			last_name: last,
			company_name: company,
			location: text(props.Location) || undefined,
			linkedin_profile: props["LinkedIn Profile URL"]?.url || undefined,
			custom_fields: {
				notion_page_id: pageId.replace(/-/g, ""),
				apollo_id: apolloId,
				job_title: text(props.Role),
			},
		});
		if (!result.ok) return block(`Smartlead didn't add the lead: ${result.reason}`);
		await comment(pageId, `Done: added to ${campaignName}${overridePageId ? " (from Push to campaign)" : ""}`);
	});
}

/**
 * Status → Interested (a human call; never set automatically on a reply).
 * Creates or links the Contact, marks the lead complete in every Smartlead
 * campaign so no further steps send, and leaves a Done comment.
 */
export function promoteToContact(events: Event[]): Promise<void> {
	return each(events, "promote-to-contact", async (pageId) => {
		const props: Props = (await retrievePage(pageId)).properties ?? {};
		if (status(props.Status) !== "Interested") return;

		const email = (props.Email?.email as string | undefined)?.toLowerCase();
		if (!email) {
			await comment(pageId, "Blocked: no Email, so no Contact can be created or matched");
			return;
		}
		const name = text(props.Lead);

		let contactId = (await lookupExistingContacts([email])).get(email);
		const created = !contactId;
		if (!contactId) {
			const { first, last } = splitName(name);
			const linkedin = props["LinkedIn Profile URL"]?.url as string | undefined;
			const page = await createPage({
				parent: { type: "data_source_id", data_source_id: DEFAULT_CONTACTS_DATA_SOURCE_ID },
				properties: {
					Name: { title: [{ text: { content: name || email } }] },
					"First Name": { rich_text: [{ text: { content: first } }] },
					"Last Name": { rich_text: [{ text: { content: last } }] },
					"Primary Email": { email },
					"Job Title": { rich_text: [{ text: { content: text(props.Role) } }] },
					Location: { rich_text: [{ text: { content: text(props.Location) } }] },
					...(linkedin ? { Linkedin: { url: linkedin } } : {}),
					// The API creates the "Outbound" option on first use.
					"Lead Source": { select: { name: "Outbound" } },
				},
			});
			contactId = page.id as string;
		}

		const linked = new Set(relationIds(props.Contacts));
		if (!linked.has(contactId!)) {
			await updatePage(pageId, {
				properties: { Contacts: { relation: [...linked, contactId!].map((id) => ({ id })) } },
			});
		}

		const { completed, paused } = await stopLeadEverywhere(email);
		const plural = (n: number) => `${n} Smartlead campaign${n > 1 ? "s" : ""}`;
		const smartleadNote = [completed && `marked complete in ${plural(completed)}`, paused && `paused in ${plural(paused)}`]
			.filter(Boolean)
			.join(", ");
		await comment(
			pageId,
			`Done: ${created ? "created" : "linked existing"} Contact for ${name || email}; ${smartleadNote || "not in Smartlead"}`,
		);
	});
}
