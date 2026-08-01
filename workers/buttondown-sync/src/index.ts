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

/**
 * Point every analytics row at its newsletter issue.
 *
 * Only rows whose relation is missing or wrong are written, so this is cheap to
 * repeat and self-healing: if a row is ever deleted and re-created by a replace
 * cycle, losing its relation, the next pass restores it.
 */
async function linkIssueRelations(): Promise<void> {
	const schema = await notion(`/data_sources/${EMAIL_ANALYTICS_DATA_SOURCE}`);
	const property = schema.properties?.[ISSUE_RELATION_PROPERTY];
	if (property?.type !== "relation") {
		// The property is hand-added, so treat its absence as "not set up" rather
		// than an error — the analytics sync itself is unaffected either way.
		console.log(
			`Skipping issue linking: "${ISSUE_RELATION_PROPERTY}" is ${
				property ? `a ${property.type}` : "missing"
			}.`,
		);
		return;
	}

	const [analytics, issues] = await Promise.all([
		queryDataSource(EMAIL_ANALYTICS_DATA_SOURCE),
		queryDataSource(NEWSLETTER_ISSUES_DATA_SOURCE),
	]);

	const issueByButtondownId = new Map<string, string>();
	for (const issue of issues) {
		const buttondownId = plainText(issue.properties["Buttondown ID"]);
		// First wins: a duplicate id is ambiguous, and guessing differently on
		// each run would make the relation flap.
		if (buttondownId && !issueByButtondownId.has(buttondownId)) {
			issueByButtondownId.set(buttondownId, issue.id);
		}
	}

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
		const current = row.properties[ISSUE_RELATION_PROPERTY]?.relation?.[0]?.id;
		if (current === issuePageId) continue;
		await notion(`/pages/${row.id}`, {
			method: "PATCH",
			body: JSON.stringify({
				properties: {
					[ISSUE_RELATION_PROPERTY]: { relation: [{ id: issuePageId }] },
				},
			}),
		});
		linked += 1;
	}

	if (linked > 0 || unmatched > 0) {
		console.log(
			`Issue linking: ${linked} linked, ${unmatched} with no matching issue page.`,
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
