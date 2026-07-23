import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
const worker = new Worker();
export default worker;

const buttondownApi = worker.pacer("buttondownApi", {
	allowedRequests: 2,
	intervalMs: 1000,
});

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
