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
 * - Blocked (missing data, already a Contact, lists mapping to different
 *   campaigns, Smartlead refused it): one `Blocked:` comment and the reason in
 *   Push blocked, so it isn't retried every hour. Clearing Push blocked requeues it.
 */

/** Exact property names. Both are human columns, undeclared, so a rename in Notion silently breaks this. */
export const PUSH_BLOCKED = "Push blocked";
const PUSH_TO_CAMPAIGN = "Push to campaign";

export type Lead = { pageId: string; props: Props };
type Campaign = { pageId: string; id: number; name: string };

export type Outcome =
	| { kind: "enrolled"; campaign: Campaign; override: boolean }
	| { kind: "blocked"; reason: string }
	| { kind: "waiting" };

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
		if (contacts.has(email!)) {
			outcomes.set(lead.pageId, {
				kind: "blocked",
				reason: `${email} is already in Contacts; never sequence an existing contact`,
			});
			continue;
		}

		const overridePageId = relationIds(props[PUSH_TO_CAMPAIGN])[0];
		const resolved = overridePageId
			? await campaignFromPage(page, overridePageId)
			: await campaignForLists(page, props);
		if (resolved === "unmapped") {
			outcomes.set(lead.pageId, { kind: "waiting" });
			continue;
		}
		if ("reason" in resolved) {
			outcomes.set(lead.pageId, { kind: "blocked", reason: resolved.reason });
			continue;
		}
		if (!resolved.id) {
			outcomes.set(lead.pageId, { kind: "blocked", reason: `the campaign page "${resolved.name}" has no Campaign ID` });
			continue;
		}
		if (overridePageId) override.add(lead.pageId);
		const group = ready.get(resolved.id) ?? { campaign: resolved, leads: [] };
		group.leads.push(lead);
		ready.set(resolved.id, group);
	}

	for (const { campaign, leads: group } of ready.values()) {
		const enrolled = (lead: Lead): Outcome => ({ kind: "enrolled", campaign, override: override.has(lead.pageId) });
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
				r.ok ? enrolled(lead) : { kind: "blocked", reason: `Smartlead didn't add the lead to ${campaign.name}: ${r.reason}` },
			);
		}
	}
	return outcomes;
}

/** Writes one lead's outcome back: Status and a Done comment, or Push blocked and a Blocked comment. */
export async function record(pageId: string, outcome: Outcome): Promise<void> {
	if (outcome.kind === "enrolled") {
		await updatePage(pageId, { properties: { Status: { status: { name: "Sequenced" } } } });
		await comment(
			pageId,
			`Done: added to ${outcome.campaign.name}${outcome.override ? " (from Push to campaign)" : ""}`,
		);
	} else if (outcome.kind === "blocked") {
		const reason = outcome.reason.slice(0, 1900);
		await updatePage(pageId, { properties: { [PUSH_BLOCKED]: { rich_text: [{ text: { content: reason } }] } } });
		await comment(pageId, `Blocked: ${reason}`);
	}
}
