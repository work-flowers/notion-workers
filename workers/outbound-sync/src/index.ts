import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { type ApolloContact, contactListIds, revealedEmail, searchContacts } from "./apollo.js";
import {
	type CampaignLead,
	campaignAnalytics,
	campaignLeads,
	isInbound,
	LEADS_PAGE,
	listCampaigns,
	messageHistory,
	messageTime,
	plainText,
} from "./smartlead.js";
import { promoteToContact, pushToSmartlead } from "./webhooks.js";

const worker = new Worker();
export default worker;

/**
 * Smartlead Campaigns: managed by this worker, keyed on the Smartlead campaign
 * ID. Segment/Notes columns for humans are added by hand in Notion, outside
 * this schema, so they stay editable.
 */
const smartleadCampaigns = worker.database("smartleadCampaigns", {
	type: "managed",
	initialTitle: "Smartlead Campaigns",
	primaryKeyProperty: "Campaign ID",
	schema: {
		properties: {
			Name: Schema.title(),
			"Campaign ID": Schema.richText(),
			"Campaign Status": Schema.select([
				{ name: "DRAFTED", color: "gray" },
				{ name: "ACTIVE", color: "green" },
				{ name: "PAUSED", color: "yellow" },
				{ name: "STOPPED", color: "red" },
				{ name: "COMPLETED", color: "blue" },
				{ name: "ARCHIVED", color: "default" },
			]),
			Leads: Schema.number("number"),
			Sent: Schema.number("number"),
			Opened: Schema.number("number"),
			Replies: Schema.number("number"),
			Bounces: Schema.number("number"),
			Unsubscribes: Schema.number("number"),
			Created: Schema.date(),
		},
	},
});

/**
 * Outbound Leads (data source 61a01f87-741b-4dbd-a98e-ada01e07eb3b), attached
 * rather than managed so existing rows, views, the Contacts relation and agents
 * survive. Bind it with `ntn workers databases attach outboundLeads <data-source-id>`.
 *
 * Only Apollo and Smartlead facts are declared: declaring a property makes it
 * read-only in Notion. Status, Campaign, Subject Line, Message, Notes, Owner,
 * Contacts and Follow-up Date are human decisions and must stay out of this schema.
 *
 * Two syncs write here, each sending only its own columns (see `partial`).
 *
 * Before decommissioning, run `ntn workers databases detach outboundLeads`.
 * Deleting the worker does not release the database; it stays locked.
 */
const outboundLeads = worker.database("outboundLeads", {
	type: "attached",
	initialTitle: "Outbound Leads",
	primaryKeyProperty: "Apollo ID",
	schema: {
		properties: {
			// Apollo (apolloLeads)
			Lead: Schema.title(),
			"Apollo ID": Schema.richText(),
			Role: Schema.richText(),
			Company: Schema.richText(),
			Email: Schema.email(),
			"LinkedIn Profile URL": Schema.url(),
			Location: Schema.richText(),
			// Smartlead (smartleadLeads)
			"Smartlead Status": Schema.select([
				{ name: "In sequence", color: "blue" },
				{ name: "Replied", color: "green" },
				{ name: "Bounced", color: "red" },
				{ name: "Unsubscribed", color: "gray" },
				{ name: "Completed", color: "default" },
			]),
			"Sequence Step": Schema.number("number"),
			"Last Event": Schema.date(),
			"Latest Reply": Schema.richText(),
			"Smartlead Lead ID": Schema.richText(),
			// The database key, not the sync key (despite the scaffold guide).
			// Two-way: each Smartlead Campaigns page gets a read-only "Outbound Leads" list of
			// Smartlead's actual membership. The human "Push to campaign" relation is
			// only the push webhook's input; after a push, Smartlead is the source of truth.
			"In campaign": Schema.relation("smartleadCampaigns", { twoWay: true, relatedPropertyName: "Outbound Leads" }),
		},
	},
});

/**
 * An upsert that sends only some declared columns leaves the rest untouched
 * (verified live 2026-10-30, both directions), which is what lets the Apollo
 * and Smartlead syncs share rows. The SDK's types still demand every declared
 * column, so the cast lives here, in one place.
 */
function partial(properties: Record<string, unknown>): never {
	return properties as never;
}

// Apollo's per-minute limit varies by plan; stay well under the lowest.
const apollo = worker.pacer("apollo", { allowedRequests: 40, intervalMs: 60_000 });
// Smartlead Standard: 60/min and 1,000/hour per key, shared with the webhooks.
const smartlead = worker.pacer("smartlead", { allowedRequests: 40, intervalMs: 60_000 });

// Re-read this much before the high-water mark each cycle, so a record that
// was indexed late is not skipped. Re-upserting a few rows is harmless.
const OVERLAP_MS = 5 * 60_000;

function later(a: string | undefined, b: string | null | undefined): string | undefined {
	if (!b) return a;
	if (!a) return b;
	return Date.parse(b) > Date.parse(a) ? b : a;
}

// ---------------------------------------------------------------- Apollo

type ApolloState = {
	/** Contacts updated at or before this were synced in an earlier cycle. */
	cursor?: string;
	/** Next page of the current cycle. */
	page?: number;
	/** Latest `updated_at` seen so far in the current cycle. */
	runMax?: string;
	/** Every contact list, looked up at the start of the cycle and kept for its pages. */
	lists?: string[];
};

function toApolloUpsert(c: ApolloContact) {
	const name = c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.id;
	// Apollo repeats a city-state like Singapore or Tokyo as its state or country.
	const location = [...new Set([c.city, c.state, c.country].filter(Boolean))].join(", ");
	return {
		type: "upsert" as const,
		// Must be byte-identical to the "Apollo ID" value, or every run inserts a new row.
		key: c.id,
		// No upstreamUpdatedAt: Notion skips an upsert whose timestamp isn't newer
		// than the last one applied, so a mapping fix never lands on a contact
		// unchanged in Apollo.
		properties: partial({
			Lead: Builder.title(name),
			"Apollo ID": Builder.richText(c.id),
			Role: Builder.richText(c.title ?? ""),
			Company: Builder.richText(c.organization_name ?? ""),
			Email: Builder.email(revealedEmail(c.email) ?? ""),
			"LinkedIn Profile URL": Builder.url(c.linkedin_url ?? ""),
			Location: Builder.richText(location),
		}),
	};
}

/**
 * Apollo's contact search has no updated-since filter, so each cycle pages
 * through the lists newest-first and stops at the first contact that is not
 * newer than the cursor. Incremental only: replace mode would delete the row
 * (and its notes and status) of anyone dropped from an Apollo list.
 *
 * Covers every Apollo contact list, so a contact becomes a lead by being put
 * on any list. Adding a contact to a list bumps its updated_at (verified
 * 2026-10-30), so even older contacts on a new list come through without a reset.
 */
worker.sync("apolloLeads", {
	database: outboundLeads,
	mode: "incremental",
	schedule: "1h",
	execute: async (state: ApolloState | undefined) => {
		const cursor = state?.cursor;
		const page = state?.page ?? 1;

		let lists = state?.lists;
		if (!lists) {
			await apollo.wait();
			lists = await contactListIds();
		}
		// An empty contact_label_ids filter matches every contact in Apollo, so
		// with no lists there is nothing to sync, not everything.
		if (lists.length === 0) return { changes: [], hasMore: false, nextState: { cursor } };

		await apollo.wait();
		const { contacts, totalPages } = await searchContacts(lists, page);

		const fresh = cursor
			? contacts.filter((c) => !c.updated_at || Date.parse(c.updated_at) > Date.parse(cursor))
			: contacts;
		const runMax = fresh.reduce<string | undefined>((max, c) => later(max, c.updated_at), state?.runMax);
		const done = fresh.length < contacts.length || page >= totalPages || contacts.length === 0;

		const nextState: ApolloState = done
			? {
					cursor: runMax
						? new Date(Date.parse(runMax) - OVERLAP_MS).toISOString()
						: cursor,
				}
			: { cursor, page: page + 1, runMax, lists };

		return { changes: fresh.map(toApolloUpsert), hasMore: !done, nextState };
	},
});

// ---------------------------------------------------------------- Smartlead

const num = (s: string | number | undefined | null) => Builder.number(Number(s ?? 0));

/**
 * Replace mode is safe here: a campaign only disappears from Smartlead when it
 * is deleted there, and every lead-side fact lives in Outbound Leads.
 */
worker.sync("smartleadCampaignsSync", {
	database: smartleadCampaigns,
	mode: "replace",
	schedule: "1h",
	execute: async () => {
		await smartlead.wait();
		const campaigns = await listCampaigns();
		const changes = [];
		for (const c of campaigns) {
			await smartlead.wait();
			const a = await campaignAnalytics(c.id);
			changes.push({
				type: "upsert" as const,
				key: String(c.id),
				properties: {
					Name: Builder.title(c.name),
					"Campaign ID": Builder.richText(String(c.id)),
					"Campaign Status": c.status ? Builder.select(c.status) : [],
					Leads: num(a.campaign_lead_stats?.total),
					Sent: num(a.unique_sent_count ?? a.sent_count),
					Opened: num(a.open_count),
					Replies: num(a.reply_count),
					Bounces: num(a.bounce_count),
					Unsubscribes: num(a.unsubscribed_count),
					Created: c.created_at ? Builder.date(c.created_at.slice(0, 10)) : [],
				},
			});
		}
		return { changes, hasMore: false };
	},
});

type SmartleadState = {
	/** Leads with no activity after this were synced in an earlier cycle. */
	cursor?: string;
	/** When the current cycle started; becomes the next cursor. */
	runStart?: string;
	/** Campaign IDs to walk this cycle, and where we are in them. */
	campaigns?: number[];
	index?: number;
	offset?: number;
	/** Which listing of the current campaign we're paging: activity since the cursor, or added since it. */
	pass?: "events" | "created";
	/** Lead IDs Smartlead reports as bounced in the current campaign. */
	bounced?: number[];
};

async function toSmartleadUpsert(campaignId: number, l: CampaignLead, bounced: Set<number>) {
	// The push webhook stores the Apollo contact ID on every lead it adds.
	const apolloId = l.lead.custom_fields?.apollo_id;
	if (!apolloId) return null;

	await smartlead.wait();
	const history = await messageHistory(campaignId, l.lead.id);
	const sent = history.filter((m) => !isInbound(m));
	const replies = history.filter(isInbound);
	const lastReply = replies.at(-1);
	const lastEvent = history.reduce<string | undefined>((max, m) => later(max, messageTime(m)), undefined);

	const status = l.lead.is_unsubscribed
		? "Unsubscribed"
		: bounced.has(l.lead.id)
			? "Bounced"
			: replies.length > 0
				? "Replied"
				: l.status === "COMPLETED" || l.status === "STOPPED"
					? "Completed"
					: "In sequence";

	return {
		type: "upsert" as const,
		key: apolloId,
		properties: partial({
			"Smartlead Status": Builder.select(status),
			"Sequence Step": sent.length > 0 ? Builder.number(sent.length) : [],
			"Last Event": lastEvent ? Builder.dateTime(lastEvent) : [],
			"Latest Reply": Builder.richText(
				plainText(lastReply?.email_body ?? lastReply?.body ?? "").slice(0, 1900),
			),
			"Smartlead Lead ID": Builder.richText(String(l.lead.id)),
			"In campaign": [Builder.relation(String(campaignId))],
		}),
	};
}

/**
 * Smartlead state for leads the push webhook added. Each cycle walks every
 * campaign's leads with activity since the cursor (all leads on the first
 * run), and reads each one's message history for its step and latest reply.
 * Leads without an `apollo_id` custom field (added in Smartlead directly) are
 * skipped, because they have no Outbound Leads row to land on.
 */
worker.sync("smartleadLeads", {
	database: outboundLeads,
	mode: "incremental",
	schedule: "1h",
	execute: async (state: SmartleadState | undefined) => {
		let s: SmartleadState = state ?? {};
		if (!s.campaigns) {
			await smartlead.wait();
			const campaigns = await listCampaigns();
			s = { cursor: s.cursor, runStart: new Date().toISOString(), campaigns: campaigns.map((c) => c.id), index: 0, offset: 0 };
		}
		const campaigns = s.campaigns ?? [];
		const index = s.index ?? 0;
		const offset = s.offset ?? 0;

		if (index >= campaigns.length) {
			return { changes: [], hasMore: false, nextState: finish(s) };
		}
		const campaignId = campaigns[index];

		let bounced = s.bounced ?? [];
		if (offset === 0) {
			await smartlead.wait();
			bounced = (await campaignLeads(campaignId, 0, { emailStatus: "is_bounced", eventTimeGt: s.cursor, limit: 100 })).map(
				(l) => l.lead.id,
			);
		}

		// Two passes per campaign: leads with activity since the cursor, then leads
		// added since it. A freshly pushed lead has no activity until its first
		// send, so the activity pass alone would leave it without Smartlead state.
		// With no cursor (first run) the activity pass already returns every lead.
		const pass = s.pass ?? "events";
		await smartlead.wait();
		const leads = await campaignLeads(
			campaignId,
			offset,
			pass === "events" ? { eventTimeGt: s.cursor } : { createdAtGt: s.cursor },
		);
		const bouncedSet = new Set(bounced);
		const changes = [];
		for (const l of leads) {
			const change = await toSmartleadUpsert(campaignId, l, bouncedSet);
			if (change) changes.push(change);
		}

		const morePages = leads.length === LEADS_PAGE;
		const createdPassNext = pass === "events" && s.cursor;
		const next: SmartleadState = morePages
			? { ...s, offset: offset + LEADS_PAGE, bounced }
			: createdPassNext
				? { ...s, pass: "created", offset: 0, bounced }
				: { ...s, index: index + 1, offset: 0, pass: "events", bounced: [] };
		const done = !morePages && !createdPassNext && index + 1 >= campaigns.length;
		return { changes, hasMore: !done, nextState: done ? finish(next) : next };
	},
});

function finish(s: SmartleadState): SmartleadState {
	return { cursor: s.runStart ? new Date(Date.parse(s.runStart) - OVERLAP_MS).toISOString() : s.cursor };
}

// ---------------------------------------------------------------- Webhooks
// Fired by Notion database automations on Outbound Leads (Status → Sequenced,
// Status → Interested). Both need NOTION_API_TOKEN with access to Outbound
// Leads, Contacts and Smartlead Campaigns.

worker.webhook("pushToSmartlead", {
	title: "Push lead to Smartlead",
	description: "Status set to Sequenced: pre-flight, then add the lead to its Smartlead campaign",
	execute: (events) => pushToSmartlead(events),
});

worker.webhook("promoteToContact", {
	title: "Promote lead to Contact",
	description: "Status set to Interested: create or link the Contact and stop the lead in Smartlead",
	execute: (events) => promoteToContact(events),
});
