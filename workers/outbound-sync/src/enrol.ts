import { lookupExistingContacts, queryDataSource, retrievePage, updatePage } from "@work-flowers/notion-worker-shared";
import { OUTBOUND_LEADS_DATA_SOURCE_ID, comment, type Props, relationIds, splitName, text } from "./notion.js";
import { addLead, addLeads, type NewLead } from "./smartlead.js";

/**
 * Auto-enrolment (decided 20 Nov 2026 with Seth): saving a contact to an Apollo
 * list is the go/no-go, so there is no manual review in Notion. A Backlog lead
 * with an Apollo ID, no Smartlead Lead ID and nothing in Push blocked is added
 * to the campaign its Apollo list maps to, then set to Sequenced.
 *
 * - No mapped campaign: left in Backlog with no comment, and picked up on the
 *   first run after the list is mapped.
 * - Blocked (missing data, a warm / do-not-sequence / unsubscribed Contact,
 *   lists mapping to different campaigns, Smartlead refused it): one `Blocked:`
 *   comment and the reason in Push blocked, so it isn't retried every hour.
 *   Clearing Push blocked requeues it.
 * - Matching a Contact no longer blocks on its own (TKT-1073, 23 Nov 2026): a
 *   cold Contact, someone only ever cold-emailed, is enrolled like any lead.
 *   Either way, a matched Contact is linked on the lead's Contacts relation.
 */

/** Exact property names. Both are human columns, undeclared, so a rename in Notion silently breaks this. */
export const PUSH_BLOCKED = "Push blocked";
const PUSH_TO_CAMPAIGN = "Push to campaign";

export type Lead = { pageId: string; props: Props };
type Campaign = { pageId: string; id: number; name: string };

/**
 * Contacts columns read by the pre-flight. All three are human-owned (Warm is a
 * formula edited in Notion), so a rename silently changes behaviour: keep in step.
 */
const CONTACT_WARM = "Warm";
const CONTACT_DO_NOT_SEQUENCE = "Do not sequence";
const CONTACT_UNSUBSCRIBED_ON = "Unsubscribed on";

/** `contactId` is the matched Contact, linked on the lead whatever the outcome. */
export type Outcome =
	| { kind: "enrolled"; campaign: Campaign; override: boolean; contactId?: string }
	| { kind: "blocked"; reason: string; contactId?: string }
	| { kind: "waiting"; contactId?: string };

/**
 * Why a matched Contact must not be sequenced, or null if it's cold. The rule
 * itself lives in the Contacts `Warm` formula (meetings, deals, events, forms,
 * agreements, reviews, newsletter, an inbound email, or a warm Lead Source), so
 * it can be tuned in Notion without a redeploy; this only reads the result.
 * Fails closed: if Warm can't be read, the lead is blocked, not enrolled.
 */
function contactBlockReason(email: string, contact: Props): string | null {
	if (contact[CONTACT_UNSUBSCRIBED_ON]?.date?.start) {
		return `unsubscribed: ${email} is a Contact who has unsubscribed`;
	}
	if (contact[CONTACT_DO_NOT_SEQUENCE]?.checkbox === true) {
		return `do not sequence: ${email} is a Contact with Do not sequence ticked`;
	}
	const warm = contact[CONTACT_WARM]?.formula;
	if (warm?.type !== "boolean") {
		return `warm contact: couldn't read Warm on the Contact for ${email}, so it's treated as warm`;
	}
	if (warm.boolean) return `warm contact: ${email} is a warm Contact; never sequence a warm contact`;
	return null;
}

/** Every lead the hourly run should try. Status is the human column; the rest are synced. */
export async function enrolmentCandidates(): Promise<Lead[]> {
	const leads: Lead[] = [];
	let cursor: string | undefined;
	do {
		const res = await queryDataSource(OUTBOUND_LEADS_DATA_SOURCE_ID, {
			page_size: 100,
			start_cursor: cursor,
			filter: {
				and: [
					{ property: "Status", status: { equals: "Backlog" } },
					{ property: "Apollo ID", rich_text: { is_not_empty: true } },
					{ property: "Smartlead Lead ID", rich_text: { is_empty: true } },
					{ property: PUSH_BLOCKED, rich_text: { is_empty: true } },
				],
			},
		});
		for (const p of res.results) leads.push({ pageId: p.id, props: p.properties ?? {} });
		cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
	} while (cursor);
	return leads;
}

/** Per-run cache: many leads share the same Apollo list and campaign pages. */
function pageCache() {
	const pages = new Map<string, Promise<Props>>();
	return (id: string): Promise<Props> => {
		if (!pages.has(id)) pages.set(id, retrievePage(id).then((p) => p.properties ?? {}));
		return pages.get(id)!;
	};
}

async function campaignFromPage(page: (id: string) => Promise<Props>, pageId: string): Promise<Campaign> {
	const p = await page(pageId);
	return { pageId, id: Number(text(p["Campaign ID"])), name: text(p.Name) || text(p["Campaign ID"]) };
}

/**
 * One Smartlead campaign per Apollo list (agreed with Seth, 31 Oct 2026): lead →
 * Apollo Lists → the hand-added "Smartlead Campaign" relation on each list.
 */
async function campaignForLists(
	page: (id: string) => Promise<Props>,
	props: Props,
): Promise<Campaign | "unmapped" | { reason: string }> {
	const lists = await Promise.all(
		relationIds(props["Apollo Lists"]).map(async (id) => {
			const p = await page(id);
			return { name: text(p.Name), campaignPageId: relationIds(p["Smartlead Campaign"])[0] };
		}),
	);
	const mapped = lists.filter((l) => l.campaignPageId);
	const campaignPageIds = [...new Set(mapped.map((l) => l.campaignPageId!))];
	if (campaignPageIds.length === 0) return "unmapped";
	const campaigns = await Promise.all(campaignPageIds.map((id) => campaignFromPage(page, id)));
	if (campaigns.length > 1) {
		const pairs = mapped
			.map((l) => `${l.name} → ${campaigns.find((c) => c.pageId === l.campaignPageId)?.name}`)
			.join("; ");
		return {
			reason: `this lead's Apollo lists map to different campaigns (${pairs}). Set Push to campaign to choose one, then clear Push blocked`,
		};
	}
	return campaigns[0];
}

function toSmartleadLead(lead: Lead): NewLead {
	const { props } = lead;
	const { first, last } = splitName(text(props.Lead));
	return {
		email: props.Email?.email as string,
		first_name: first,
		last_name: last,
		company_name: text(props.Company),
		location: text(props.Location) || undefined,
		linkedin_profile: props["LinkedIn Profile URL"]?.url || undefined,
		// Copy lives in Smartlead (decided 30 Oct 2026); sequences personalise from these.
		custom_fields: {
			notion_page_id: lead.pageId.replace(/-/g, ""),
			apollo_id: text(props["Apollo ID"]),
			job_title: text(props.Role),
		},
	};
}

/**
 * Resolves and enrols a batch of leads. Smartlead's add-leads call takes up to
 * 400 leads but only reports totals, so each campaign gets one batched call,
 * and only a batch whose totals don't add up is retried lead by lead to find
 * out which were refused and why. Already being in the campaign counts as
 * success, so a re-run is harmless.
 */
export async function enrol(leads: Lead[], paceSmartlead: () => Promise<void>): Promise<Map<string, Outcome>> {
	const outcomes = new Map<string, Outcome>();
	const page = pageCache();

	const emails = leads.map((l) => (l.props.Email?.email as string | undefined)?.toLowerCase()).filter(Boolean) as string[];
	const contacts = await lookupExistingContacts(emails);

	const ready = new Map<number, { campaign: Campaign; leads: Lead[] }>();
	const override = new Set<string>();
	const contactOf = new Map<string, string>();
	for (const lead of leads) {
		const { props } = lead;
		const email = (props.Email?.email as string | undefined)?.toLowerCase();
		const missing = [!email && "Email", !text(props.Lead) && "Lead name", !text(props.Company) && "Company"].filter(
			Boolean,
		);
		if (missing.length) {
			outcomes.set(lead.pageId, { kind: "blocked", reason: `missing ${missing.join(", ")}` });
			continue;
		}
		const contactId = contacts.get(email!);
		if (contactId) {
			contactOf.set(lead.pageId, contactId);
			const reason = contactBlockReason(email!, await page(contactId));
			if (reason) {
				outcomes.set(lead.pageId, { kind: "blocked", reason, contactId });
				continue;
			}
		}

		const overridePageId = relationIds(props[PUSH_TO_CAMPAIGN])[0];
		const resolved = overridePageId
			? await campaignFromPage(page, overridePageId)
			: await campaignForLists(page, props);
		if (resolved === "unmapped") {
			outcomes.set(lead.pageId, { kind: "waiting", contactId });
			continue;
		}
		if ("reason" in resolved) {
			outcomes.set(lead.pageId, { kind: "blocked", reason: resolved.reason, contactId });
			continue;
		}
		if (!resolved.id) {
			outcomes.set(lead.pageId, {
				kind: "blocked",
				reason: `the campaign page "${resolved.name}" has no Campaign ID`,
				contactId,
			});
			continue;
		}
		if (overridePageId) override.add(lead.pageId);
		const group = ready.get(resolved.id) ?? { campaign: resolved, leads: [] };
		group.leads.push(lead);
		ready.set(resolved.id, group);
	}

	for (const { campaign, leads: group } of ready.values()) {
		const enrolled = (lead: Lead): Outcome => ({
			kind: "enrolled",
			campaign,
			override: override.has(lead.pageId),
			contactId: contactOf.get(lead.pageId),
		});
		await paceSmartlead();
		const totals = await addLeads(campaign.id, group.map(toSmartleadLead));
		if ((totals.upload_count ?? 0) + (totals.already_added_to_campaign ?? 0) >= group.length) {
			for (const lead of group) outcomes.set(lead.pageId, enrolled(lead));
			continue;
		}
		for (const lead of group) {
			await paceSmartlead();
			const r = await addLead(campaign.id, toSmartleadLead(lead));
			outcomes.set(
				lead.pageId,
				r.ok
					? enrolled(lead)
					: {
							kind: "blocked",
							reason: `Smartlead didn't add the lead to ${campaign.name}: ${r.reason}`,
							contactId: contactOf.get(lead.pageId),
						},
			);
		}
	}
	return outcomes;
}

/**
 * The lead's Contacts relation with the matched Contact added, or nothing if
 * there's no match or it's already linked. Contacts is a human column, so
 * existing links are kept.
 */
function contactLink(lead: Lead, contactId?: string): Props {
	if (!contactId) return {};
	const linked = relationIds(lead.props.Contacts);
	const norm = (id: string) => id.replace(/-/g, "");
	if (linked.some((id) => norm(id) === norm(contactId))) return {};
	return { Contacts: { relation: [...linked, contactId].map((id) => ({ id })) } };
}

/**
 * Writes one lead's outcome back in a single page update: Status (enrolled) or
 * Push blocked (blocked), plus the Contacts link, then a Done or Blocked comment.
 * A waiting lead with a matched Contact just gets the link.
 */
export async function record(lead: Lead, outcome: Outcome): Promise<void> {
	const { pageId } = lead;
	const link = contactLink(lead, outcome.contactId);
	if (outcome.kind === "enrolled") {
		await updatePage(pageId, { properties: { Status: { status: { name: "Sequenced" } }, ...link } });
		await comment(
			pageId,
			`Done: added to ${outcome.campaign.name}${outcome.override ? " (from Push to campaign)" : ""}`,
		);
	} else if (outcome.kind === "blocked") {
		const reason = outcome.reason.slice(0, 1900);
		await updatePage(pageId, {
			properties: { [PUSH_BLOCKED]: { rich_text: [{ text: { content: reason } }] }, ...link },
		});
		await comment(pageId, `Blocked: ${reason}`);
	} else if (Object.keys(link).length) {
		await updatePage(pageId, { properties: link });
	}
}
