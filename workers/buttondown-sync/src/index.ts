import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
const worker = new Worker();
export default worker;

const buttondownApi = worker.pacer("buttondownApi", {
	allowedRequests: 2,
	intervalMs: 1000,
});

const notionApi = worker.pacer("notionApi", {
	allowedRequests: 3,
	intervalMs: 1000,
});

/**
 * `Newsletter Issue` is a hand-added relation on the analytics database pointing
 * at the human-managed `Newsletter Issues` data source, so each issue page shows
 * its own send stats.
 *
 * It cannot live in the managed schema below: declaring it would mark it
 * read-only, and `Schema.relation()` only relates two syncs — Newsletter Issues
 * is edited by hand, not synced. So the sync sets it through the API instead,
 * joining on Buttondown's email id (`Email ID` here, `Buttondown ID` there).
 *
 * Data source ids are pinned because there is no API to resolve a managed
 * database's data source id from its capability key. Re-creating either database
 * means updating these.
 */
const EMAIL_ANALYTICS_DATA_SOURCE = "c039fc57-f1f5-45d9-9c89-79dd7720eeed";
const NEWSLETTER_ISSUES_DATA_SOURCE = "0c691b07-11ac-82fa-bc1b-07d0186a095d";
const ISSUE_RELATION_PROPERTY = "Newsletter Issue";

/**
 * The engagement database gets the same treatment: a hand-added `Newsletter
 * Issue` relation (joined on `Email ID`) and a hand-added `Contact` relation to
 * the CRM's Contacts, joined on the subscriber's address against Contacts'
 * Primary/Secondary Email. Empty until the database exists — pin its data source
 * id after the first deploy creates it; linking is skipped until then.
 */
const ENGAGEMENT_DATA_SOURCE = "";
const CONTACTS_DATA_SOURCE = "21991b07-11ac-81a6-a894-000be4a09a67";
const CONTACT_RELATION_PROPERTY = "Contact";

/** Data-source endpoints need this version; 2022-06-28 only knows databases. */
const NOTION_VERSION = "2026-03-11";

async function notion(path: string, init?: RequestInit): Promise<any> {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) throw new Error("NOTION_API_TOKEN is not set");
	await notionApi.wait();
	const res = await fetch(`https://api.notion.com/v1${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			"Notion-Version": NOTION_VERSION,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
	if (!res.ok) {
		throw new Error(
			`Notion ${init?.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`,
		);
	}
	return res.json();
}

async function queryDataSource(dataSourceId: string): Promise<any[]> {
	const pages: any[] = [];
	let cursor: string | undefined;
	do {
		const body: Record<string, unknown> = { page_size: 100 };
		if (cursor) body.start_cursor = cursor;
		const result = await notion(`/data_sources/${dataSourceId}/query`, {
			method: "POST",
			body: JSON.stringify(body),
		});
		pages.push(...result.results);
		cursor = result.has_more ? result.next_cursor : undefined;
	} while (cursor);
	return pages;
}

/** Plain text out of a title or rich_text property, whichever it is. */
function plainText(property: any): string {
	const parts = property?.title ?? property?.rich_text ?? [];
	return parts
		.map((part: any) => part.plain_text ?? "")
		.join("")
		.trim();
}

/** Buttondown email id → Newsletter Issues page id. */
async function issuePagesByButtondownId(): Promise<Map<string, string>> {
	const issues = await queryDataSource(NEWSLETTER_ISSUES_DATA_SOURCE);
	const issueByButtondownId = new Map<string, string>();
	for (const issue of issues) {
		const buttondownId = plainText(issue.properties["Buttondown ID"]);
		// First wins: a duplicate id is ambiguous, and guessing differently on
		// each run would make the relation flap.
		if (buttondownId && !issueByButtondownId.has(buttondownId)) {
			issueByButtondownId.set(buttondownId, issue.id);
		}
	}
	return issueByButtondownId;
}

/**
 * Names of the hand-added relation properties among `wanted` that actually exist
 * on the data source. A missing one is "not set up" rather than an error — the
 * sync itself is unaffected either way.
 */
async function existingRelations(
	dataSourceId: string,
	wanted: string[],
): Promise<string[]> {
	const schema = await notion(`/data_sources/${dataSourceId}`);
	return wanted.filter((name) => {
		const property = schema.properties?.[name];
		if (property?.type === "relation") return true;
		console.log(
			`Skipping "${name}" linking: it is ${
				property ? `a ${property.type}` : "missing"
			}.`,
		);
		return false;
	});
}

/**
 * Write the given single-page relations on a row, skipping any already correct.
 * Returns how many properties changed.
 */
async function setRelations(
	row: any,
	targets: Record<string, string | undefined>,
): Promise<number> {
	const properties: Record<string, unknown> = {};
	for (const [name, pageId] of Object.entries(targets)) {
		if (!pageId) continue;
		if (row.properties[name]?.relation?.[0]?.id === pageId) continue;
		properties[name] = { relation: [{ id: pageId }] };
	}
	const changed = Object.keys(properties).length;
	if (changed === 0) return 0;
	await notion(`/pages/${row.id}`, {
		method: "PATCH",
		body: JSON.stringify({
			properties,
			// Silent: suppresses page-update notifications for the change.
			notifications: { mode: "silent" },
		}),
	});
	return changed;
}

/**
 * Point every analytics row at its newsletter issue.
 *
 * Only rows whose relation is missing or wrong are written, so this is cheap to
 * repeat and self-healing: if a row is ever deleted and re-created by a replace
 * cycle, losing its relation, the next pass restores it.
 */
async function linkIssueRelations(): Promise<void> {
	const relations = await existingRelations(EMAIL_ANALYTICS_DATA_SOURCE, [
		ISSUE_RELATION_PROPERTY,
	]);
	if (relations.length === 0) return;

	const [analytics, issueByButtondownId] = await Promise.all([
		queryDataSource(EMAIL_ANALYTICS_DATA_SOURCE),
		issuePagesByButtondownId(),
	]);

	let linked = 0;
	let unmatched = 0;
	for (const row of analytics) {
		const emailId = plainText(row.properties["Email ID"]);
		if (!emailId) continue;
		const issuePageId = issueByButtondownId.get(emailId);
		if (!issuePageId) {
			// Expected for resends: Buttondown gives them their own email id with
			// no corresponding issue page.
			unmatched += 1;
			continue;
		}
		if (await setRelations(row, { [ISSUE_RELATION_PROPERTY]: issuePageId })) {
			linked += 1;
		}
	}

	if (linked > 0 || unmatched > 0) {
		console.log(
			`Issue linking: ${linked} linked, ${unmatched} with no matching issue page.`,
		);
	}
}

/** Lower-cased addresses on a Contacts page: Primary Email, then Secondary Email. */
function contactEmails(page: any): string[] {
	const props = page.properties ?? {};
	const emails: string[] = [];
	const primary = props["Primary Email"]?.email;
	if (typeof primary === "string" && primary.trim()) {
		emails.push(primary.trim().toLowerCase());
	}
	// Secondary Email is a multi_select whose option names are addresses.
	for (const option of props["Secondary Email"]?.multi_select ?? []) {
		if (typeof option?.name === "string" && option.name.includes("@")) {
			emails.push(option.name.trim().toLowerCase());
		}
	}
	return emails;
}

/**
 * Email address → Contacts page id. An address on more than one contact maps to
 * `null`: linking either would be a guess, so those rows are left unlinked.
 */
async function contactPagesByEmail(): Promise<Map<string, string | null>> {
	const contacts = await queryDataSource(CONTACTS_DATA_SOURCE);
	const byEmail = new Map<string, string | null>();
	for (const contact of contacts) {
		for (const email of new Set(contactEmails(contact))) {
			byEmail.set(email, byEmail.has(email) ? null : contact.id);
		}
	}
	return byEmail;
}

/**
 * Point every engagement row at its newsletter issue and its contact. Same
 * contract as `linkIssueRelations`: only missing or wrong relations are written.
 */
async function linkEngagementRelations(): Promise<void> {
	if (!ENGAGEMENT_DATA_SOURCE) {
		console.log(
			"Skipping engagement linking: ENGAGEMENT_DATA_SOURCE is not pinned yet.",
		);
		return;
	}
	const relations = await existingRelations(ENGAGEMENT_DATA_SOURCE, [
		ISSUE_RELATION_PROPERTY,
		CONTACT_RELATION_PROPERTY,
	]);
	if (relations.length === 0) return;

	const [rows, issueByButtondownId, contactByEmail] = await Promise.all([
		queryDataSource(ENGAGEMENT_DATA_SOURCE),
		relations.includes(ISSUE_RELATION_PROPERTY)
			? issuePagesByButtondownId()
			: new Map<string, string>(),
		relations.includes(CONTACT_RELATION_PROPERTY)
			? contactPagesByEmail()
			: new Map<string, string | null>(),
	]);

	let written = 0;
	let noContact = 0;
	let ambiguousContact = 0;
	for (const row of rows) {
		const targets: Record<string, string | undefined> = {};
		if (relations.includes(ISSUE_RELATION_PROPERTY)) {
			targets[ISSUE_RELATION_PROPERTY] = issueByButtondownId.get(
				plainText(row.properties["Email ID"]),
			);
		}
		if (relations.includes(CONTACT_RELATION_PROPERTY)) {
			const email = (row.properties["Subscriber Email"]?.email ?? "")
				.trim()
				.toLowerCase();
			const contactId = email ? contactByEmail.get(email) : undefined;
			if (contactId === null) ambiguousContact += 1;
			else if (contactId === undefined) noContact += 1;
			targets[CONTACT_RELATION_PROPERTY] = contactId ?? undefined;
		}
		written += await setRelations(row, targets);
	}

	if (written > 0 || noContact > 0 || ambiguousContact > 0) {
		console.log(
			`Engagement linking: ${written} relations written, ${noContact} rows with no matching contact, ${ambiguousContact} matching more than one contact.`,
		);
	}
}

const emails = worker.database("buttondownEmails", {
	type: "managed",
	initialTitle: "Buttondown email analytics",
	primaryKeyProperty: "Email ID",
	schema: {
		properties: {
			Subject: Schema.title(),
			"Email ID": Schema.richText(),
			Slug: Schema.richText(),
			Status: Schema.select([
				{ name: "sent", color: "green" },
				{ name: "about_to_send", color: "yellow" },
				{ name: "scheduled", color: "blue" },
				{ name: "draft", color: "gray" },
			]),
			"Publish Date": Schema.date(),
			Recipients: Schema.number(),
			Deliveries: Schema.number(),
			Opens: Schema.number(),
			Clicks: Schema.number(),
			"Open Rate": Schema.number("percent"),
			"Click Rate": Schema.number("percent"),
			"Temporary Failures": Schema.number(),
			"Permanent Failures": Schema.number(),
			Unsubscriptions: Schema.number(),
			Complaints: Schema.number(),
			Replies: Schema.number(),
			"Last Synced": Schema.date(),
		},
	},
});

const SUBSCRIBER_TYPES = [
	"regular",
	"premium",
	"trialed",
	"gifted",
	"unpaid",
	"churning",
	"paused",
	"past_due",
	"churned",
	"unactivated",
	"unsubscribed",
	"undeliverable",
	"complained",
	"removed",
] as const;
type SubscriberType = (typeof SUBSCRIBER_TYPES)[number];

const subscriberCounts = worker.database("buttondownSubscriberCounts", {
	type: "managed",
	initialTitle: "Buttondown subscriber counts",
	primaryKeyProperty: "Snapshot Date",
	schema: {
		properties: {
			Date: Schema.title(),
			"Snapshot Date": Schema.date(),
			Total: Schema.number(),
			Active: Schema.number(),
			Regular: Schema.number(),
			Premium: Schema.number(),
			Trialed: Schema.number(),
			Gifted: Schema.number(),
			Unpaid: Schema.number(),
			Churning: Schema.number(),
			Paused: Schema.number(),
			"Past Due": Schema.number(),
			Churned: Schema.number(),
			Unactivated: Schema.number(),
			Unsubscribed: Schema.number(),
			Undeliverable: Schema.number(),
			Complained: Schema.number(),
			Removed: Schema.number(),
		},
	},
});

const ACTIVE_TYPES: SubscriberType[] = [
	"regular",
	"premium",
	"trialed",
	"gifted",
	"unpaid",
	"churning",
	"paused",
	"past_due",
];

async function bd(path: string): Promise<any> {
	const token = process.env.BUTTONDOWN_API_KEY;
	if (!token) throw new Error("BUTTONDOWN_API_KEY is not set");
	await buttondownApi.wait();
	const res = await fetch(`https://api.buttondown.com/v1${path}`, {
		headers: { Authorization: `Token ${token}` },
	});
	if (!res.ok) {
		throw new Error(`Buttondown ${path} → ${res.status} ${res.statusText}`);
	}
	return res.json();
}

function titleCase(s: string) {
	return s
		.split("_")
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(" ");
}

worker.sync("subscriberCountsSync", {
	database: subscriberCounts,
	mode: "incremental",
	schedule: "6h",
	execute: async () => {
		const counts: Record<SubscriberType, number> = Object.fromEntries(
			SUBSCRIBER_TYPES.map((t) => [t, 0]),
		) as Record<SubscriberType, number>;

		for (const t of SUBSCRIBER_TYPES) {
			const r = await bd(`/subscribers?type=${t}&page_size=1`);
			counts[t] = Number(r.count ?? 0);
		}

		const total = SUBSCRIBER_TYPES.reduce((acc, t) => acc + counts[t], 0);
		const active = ACTIVE_TYPES.reduce((acc, t) => acc + counts[t], 0);
		const today = new Date().toISOString().slice(0, 10);

		const properties: Record<string, ReturnType<typeof Builder.number>> = {
			Total: Builder.number(total),
			Active: Builder.number(active),
		};
		for (const t of SUBSCRIBER_TYPES) {
			properties[titleCase(t)] = Builder.number(counts[t]);
		}

		return {
			changes: [
				{
					type: "upsert" as const,
					key: today,
					properties: {
						Date: Builder.title(today),
						"Snapshot Date": Builder.date(today),
						...properties,
					},
				},
			],
			hasMore: false,
		};
	},
});

worker.sync("emailAnalyticsSync", {
	database: emails,
	mode: "replace",
	schedule: "6h",
	execute: async (state: { page?: number } | undefined) => {
		const page = state?.page ?? 1;

		// Once per cycle, at the start. The platform applies this handler's changes
		// after it returns, so a send appearing for the first time in this cycle
		// has no page to relate yet — it gets linked at the start of the next one,
		// within the 6h schedule. Failures here must not fail the analytics sync,
		// which is the capability's actual job.
		if (page === 1) {
			try {
				await linkIssueRelations();
			} catch (error) {
				console.error(
					`Issue linking failed: ${error instanceof Error ? error.message : error}`,
				);
			}
		}

		const list = await bd(`/emails?status=sent&page=${page}`);
		const items: any[] = list.results ?? [];
		const hasMore = Boolean(list.next);

		const changes = await Promise.all(
			items.map(async (e) => {
				const a = await bd(`/emails/${e.id}/analytics`);
				const deliveries = Number(a.deliveries ?? 0);
				const opens = Number(a.opens ?? 0);
				const clicks = Number(a.clicks ?? 0);
				const today = new Date().toISOString().slice(0, 10);

				return {
					type: "upsert" as const,
					key: String(e.id),
					properties: {
						Subject: Builder.title(e.subject ?? "(no subject)"),
						"Email ID": Builder.richText(String(e.id)),
						Slug: Builder.richText(e.slug ?? ""),
						Status: Builder.select(e.status ?? "sent"),
						"Publish Date": Builder.date(
							e.publish_date ? String(e.publish_date).slice(0, 10) : today,
						),
						Recipients: Builder.number(Number(a.recipients ?? 0)),
						Deliveries: Builder.number(deliveries),
						Opens: Builder.number(opens),
						Clicks: Builder.number(clicks),
						"Open Rate": Builder.number(deliveries ? opens / deliveries : 0),
						"Click Rate": Builder.number(
							deliveries ? clicks / deliveries : 0,
						),
						"Temporary Failures": Builder.number(
							Number(a.temporary_failures ?? 0),
						),
						"Permanent Failures": Builder.number(
							Number(a.permanent_failures ?? 0),
						),
						Unsubscriptions: Builder.number(Number(a.unsubscriptions ?? 0)),
						Complaints: Builder.number(Number(a.complaints ?? 0)),
						Replies: Builder.number(Number(a.replies ?? 0)),
						"Last Synced": Builder.date(today),
					},
				};
			}),
		);

		return {
			changes,
			hasMore,
			nextState: hasMore ? { page: page + 1 } : undefined,
		};
	},
});

/**
 * One row per (sent email, subscriber): when the email reached them and whether
 * they opened or clicked it. Built from Buttondown's per-subscriber `/events`,
 * aggregated here rather than stored raw so a subscriber's clicks on one email
 * stay one row.
 *
 * `Newsletter Issue` and `Contact` are hand-added relations, set through the API
 * by `linkEngagementRelations` for the same reason as on the analytics database.
 */
const engagement = worker.database("buttondownSubscriberEngagement", {
	type: "managed",
	initialTitle: "Buttondown subscriber engagement",
	primaryKeyProperty: "Engagement ID",
	schema: {
		properties: {
			Name: Schema.title(),
			"Engagement ID": Schema.richText(),
			"Email ID": Schema.richText(),
			Subject: Schema.richText(),
			"Subscriber ID": Schema.richText(),
			"Subscriber Email": Schema.email(),
			Delivered: Schema.date(),
			"First Opened": Schema.date(),
			"First Clicked": Schema.date(),
			Bounced: Schema.date(),
			Unsubscribed: Schema.date(),
			Opens: Schema.number(),
			Clicks: Schema.number(),
		},
	},
});

/**
 * Event type → the date column holding its earliest occurrence. Buttondown's
 * types (checked 2026-10-23): bounced, clicked, complained, delivered, opened,
 * rejected, replied, unsubscribed. There is no `sent` event; `rejected` (refused
 * before sending) is folded into Bounced. Anything unlisted is ignored.
 */
const ENGAGEMENT_DATE_COLUMNS: Record<string, string> = {
	delivered: "Delivered",
	opened: "First Opened",
	clicked: "First Clicked",
	bounced: "Bounced",
	rejected: "Bounced",
	unsubscribed: "Unsubscribed",
};

type Engagement = {
	subscriberId: string;
	/** Empty when the subscriber has since been deleted from Buttondown. */
	address: string;
	/** Earliest timestamp per date column. */
	first: Record<string, string>;
	opens: number;
	/** Raw click events, not unique — analytics' `clicks` counts differently. */
	clicks: number;
};

type EngagementRow = {
	key: string;
	properties: Record<string, ReturnType<typeof Builder.richText>> & {
		"Engagement ID": ReturnType<typeof Builder.richText>;
	};
};

type EngagementState = {
	/** Page of `/emails?status=sent` being walked. */
	emailPage: number;
	/** Position of the next email to process on that page. */
	emailIndex: number;
	/** Rows built for the current email but not yet returned (batches of 100). */
	pending: EngagementRow[];
};

const ENGAGEMENT_BATCH = 100;

/**
 * Every per-subscriber engagement for one email, keyed by subscriber id.
 * `expand=subscriber` inlines the subscriber, which is where the address comes
 * from; it is `null` for a subscriber deleted since.
 */
async function emailEngagement(emailId: string): Promise<Map<string, Engagement>> {
	const bySubscriber = new Map<string, Engagement>();
	let page = 1;
	let next = true;
	while (next) {
		const list = await bd(
			`/events?email_id=${encodeURIComponent(emailId)}&expand=subscriber&page=${page}&page_size=100`,
		);
		for (const event of list.results ?? []) {
			const column = ENGAGEMENT_DATE_COLUMNS[event.event_type];
			if (!column || !event.subscriber_id) continue;
			const subscriberId = String(event.subscriber_id);

			let row = bySubscriber.get(subscriberId);
			if (!row) {
				row = { subscriberId, address: "", first: {}, opens: 0, clicks: 0 };
				bySubscriber.set(subscriberId, row);
			}
			if (!row.address && event.subscriber?.email_address) {
				row.address = String(event.subscriber.email_address);
			}
			const at = event.creation_date;
			if (at && (!row.first[column] || at < row.first[column])) {
				row.first[column] = at;
			}
			if (event.event_type === "opened") row.opens += 1;
			if (event.event_type === "clicked") row.clicks += 1;
		}
		next = Boolean(list.next);
		page += 1;
	}
	return bySubscriber;
}

function engagementRows(
	email: any,
	engagements: Map<string, Engagement>,
): EngagementRow[] {
	const emailId = String(email.id);
	const subject = email.subject ?? "(no subject)";
	return [...engagements.values()].map((e) => {
		const key = `${emailId}:${e.subscriberId}`;
		const properties: EngagementRow["properties"] = {
			Name: Builder.title(`${e.address || e.subscriberId} · ${subject}`),
			"Engagement ID": Builder.richText(key),
			"Email ID": Builder.richText(emailId),
			Subject: Builder.richText(subject),
			"Subscriber ID": Builder.richText(e.subscriberId),
			Opens: Builder.number(e.opens),
			Clicks: Builder.number(e.clicks),
		};
		if (e.address) properties["Subscriber Email"] = Builder.email(e.address);
		for (const [column, at] of Object.entries(e.first)) {
			properties[column] = Builder.dateTime(at);
		}
		// `key` is byte-identical to the `Engagement ID` value — see root CLAUDE.md.
		return { key, properties };
	});
}

/**
 * Replace mode: each daily cycle walks every sent email and rebuilds its rows,
 * so a row whose subscriber was deleted upstream is swept. One email per call,
 * its rows released in batches of 100 through `pending`.
 */
worker.sync("subscriberEngagementSync", {
	database: engagement,
	mode: "replace",
	schedule: "1d",
	execute: async (state: EngagementState | undefined) => {
		const s: EngagementState = state ?? {
			emailPage: 1,
			emailIndex: 0,
			pending: [],
		};

		// Once per cycle, at the start — see the note in `emailAnalyticsSync`.
		if (!state) {
			try {
				await linkEngagementRelations();
			} catch (error) {
				console.error(
					`Engagement linking failed: ${error instanceof Error ? error.message : error}`,
				);
			}
		}

		if (s.pending.length === 0) {
			const list = await bd(`/emails?status=sent&page=${s.emailPage}`);
			const emailsOnPage: any[] = list.results ?? [];
			const email = emailsOnPage[s.emailIndex];
			if (!email) {
				// Page exhausted: move on, or finish the cycle.
				if (!list.next) return { changes: [], hasMore: false };
				return {
					changes: [],
					hasMore: true,
					nextState: { ...s, emailPage: s.emailPage + 1, emailIndex: 0 },
				};
			}
			const engagements = await emailEngagement(String(email.id));
			s.pending = engagementRows(email, engagements);
			s.emailIndex += 1;
		}

		const batch = s.pending.slice(0, ENGAGEMENT_BATCH);
		const nextState: EngagementState = {
			...s,
			pending: s.pending.slice(ENGAGEMENT_BATCH),
		};
		return {
			changes: batch.map((row) => ({ type: "upsert" as const, ...row })),
			// Always continue: the next call either drains `pending` or advances to
			// the next email, and returns `hasMore: false` once the list runs out.
			hasMore: true,
			nextState,
		};
	},
});
