import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { fetchAll, fetchPage, type Partnership, type Payout, type Reward } from "./partnerstack.js";

const worker = new Worker();
export default worker;

// Programs (= PartnerStack partnerships). "Description" is a human-owned
// column added by hand in Notion, deliberately not declared here: declaring it
// would make it read-only. See CLAUDE.md.
const programs = worker.database("partnerstackPrograms", {
	type: "managed",
	initialTitle: "PartnerStack Programs",
	primaryKeyProperty: "Program Key",
	schema: {
		properties: {
			Name: Schema.title(),
			"Program Key": Schema.richText(),
			"Partnership Key": Schema.richText(),
			Status: Schema.select([
				{ name: "active", color: "green" },
				{ name: "tos-acceptance-pending", color: "yellow" },
				{ name: "pending", color: "yellow" },
				{ name: "inactive", color: "gray" },
				{ name: "archived", color: "gray" },
			]),
			"Referral Link": Schema.url(),
			Joined: Schema.date(),
		},
	},
});

const rewards = worker.database("partnerstackRewards", {
	type: "managed",
	initialTitle: "PartnerStack Rewards",
	primaryKeyProperty: "Reward Key",
	schema: {
		properties: {
			Name: Schema.title(),
			"Reward Key": Schema.richText(),
			Program: Schema.select([
				{ name: "Notion Setup Sessions", color: "purple" },
				{ name: "Notion", color: "default" },
				{ name: "Notion Consultants", color: "blue" },
				{ name: "Xero", color: "green" },
			]),
			"Partner Program": Schema.relation("partnerstackPrograms", {
				twoWay: true,
				relatedPropertyName: "Rewards",
			}),
			Amount: Schema.number("dollar"),
			Currency: Schema.select([{ name: "USD" }]),
			Status: Schema.select([
				{ name: "hold", color: "gray" },
				{ name: "pending", color: "yellow" },
				{ name: "approved", color: "blue" },
				{ name: "declined", color: "red" },
				{ name: "paid", color: "green" },
			]),
			"Payment Status": Schema.select([
				{ name: "available", color: "yellow" },
				{ name: "withdrawn", color: "green" },
			]),
			"Payment Date": Schema.date(),
			"Payout Batch": Schema.richText(),
			"Reward Type": Schema.richText(),
			Country: Schema.richText(),
			"Customer Key": Schema.richText(),
			"Decline Reason": Schema.richText(),
			Created: Schema.date(),
			Updated: Schema.date(),
		},
	},
});

const payouts = worker.database("partnerstackPayouts", {
	type: "managed",
	initialTitle: "PartnerStack Payouts",
	primaryKeyProperty: "Payout Key",
	schema: {
		properties: {
			Name: Schema.title(),
			"Payout Key": Schema.richText(),
			Amount: Schema.number("dollar"),
			Currency: Schema.select([{ name: "USD" }]),
			Status: Schema.select([
				{ name: "new", color: "yellow" },
				{ name: "pending", color: "blue" },
				{ name: "successful", color: "green" },
				{ name: "failed", color: "red" },
				{ name: "cancelled", color: "gray" },
			]),
			Provider: Schema.richText(),
			// Both inferred by matchPayoutsToBatches(); the API has no link.
			Rewards: Schema.relation("partnerstackRewards", {
				twoWay: true,
				relatedPropertyName: "Payout",
			}),
			Programs: Schema.relation("partnerstackPrograms", {
				twoWay: true,
				relatedPropertyName: "Payouts",
			}),
			"Payout Batch": Schema.richText(),
			Fee: Schema.number("dollar"),
			Created: Schema.date(),
			Sent: Schema.date(),
			Withdrawn: Schema.date(),
		},
	},
});

// PartnerStack publishes no rate limit and sends no rate-limit headers.
// A full run is a handful of requests at today's volume, so stay modest.
const partnerstack = worker.pacer("partnerstack", { allowedRequests: 60, intervalMs: 60_000 });

// An empty property value: Builder has no "clear" helper, and an omitted
// property is reset anyway, but an empty token array is explicit.
const EMPTY = [] as unknown as ReturnType<typeof Builder.select>;
const optText = (v: string | number | null | undefined) =>
	v == null || v === "" ? EMPTY : Builder.richText(String(v));
const optSelect = (v: string | null | undefined) => (v ? Builder.select(v) : EMPTY);
const optDateTime = (ms: number | null | undefined) =>
	ms == null ? EMPTY : Builder.dateTime(new Date(ms).toISOString());
const optDate = (ms: number | null | undefined) =>
	ms == null ? EMPTY : Builder.date(new Date(ms).toISOString().slice(0, 10));
const dollars = (cents: number | null | undefined) =>
	cents == null ? EMPTY : Builder.number(cents / 100);

// Notion referral descriptions end in " - $0.00 USD purchase by <hash>@notion.internal",
// an anonymised customer id that is noise in a title.
function rewardTitle(r: Reward): string {
	const d = (r.description ?? "").replace(/ - \$[\d.,]+ \w+ purchase by \S+$/, "").trim();
	return d || r.key;
}

function toProgramUpsert(p: Partnership) {
	return {
		type: "upsert" as const,
		// Must equal the "Program Key" value, and is what rewards relate to.
		key: p.company.key,
		properties: {
			Name: Builder.title(p.company.name),
			"Program Key": Builder.richText(p.company.key),
			"Partnership Key": Builder.richText(p.key),
			Status: optSelect(p.is_archived ? "archived" : p.status),
			"Referral Link": p.link?.url ? Builder.url(p.link.url) : EMPTY,
			Joined: optDateTime(p.created_at),
		},
	};
}

function toRewardUpsert(r: Reward) {
	return {
		type: "upsert" as const,
		// Must be byte-identical to the "Reward Key" value, or every run inserts a new row.
		key: r.key,
		properties: {
			Name: Builder.title(rewardTitle(r)),
			"Reward Key": Builder.richText(r.key),
			Program: optSelect(r.company?.name),
			"Partner Program": r.company?.key ? [Builder.relation(r.company.key)] : [],
			Amount: dollars(r.amount),
			Currency: optSelect(r.currency),
			Status: optSelect(r.reward_status),
			"Payment Status": optSelect(r.payment_status),
			"Payment Date": optDate(r.payment_date),
			"Payout Batch": optText(r.payout_id),
			"Reward Type": optText(r.transaction?.product_key),
			Country: optText(r.transaction?.category_key),
			"Customer Key": optText(r.customer?.key),
			"Decline Reason": optText(r.decline_reason),
			Created: optDateTime(r.created_at),
			Updated: optDateTime(r.updated_at),
		},
	};
}

type Batch = { id: number; total: number; rewards: Reward[] };
type Match = { batch: Batch; fee: number };

// The API never links a payout (withdrawal, "pay_…") to the rewards it paid:
// a reward's integer `payout_id` is not a payout key. But each withdrawal is
// exactly one reward batch (rewards sharing a payout_id) minus a small
// withdrawal fee. So a payout is matched to the batch whose
// total exceeds it by at most MAX_FEE_CENTS, and only when that pairing is
// unique in both directions; anything ambiguous is left unlinked.
const MAX_FEE_CENTS = 500;

function matchPayoutsToBatches(ps: Payout[], rs: Reward[]): Map<string, Match> {
	const batches = new Map<number, Batch>();
	for (const r of rs) {
		if (r.payout_id == null) continue;
		const b = batches.get(r.payout_id) ?? { id: r.payout_id, total: 0, rewards: [] };
		b.total += r.amount ?? 0;
		b.rewards.push(r);
		batches.set(r.payout_id, b);
	}
	const candidates = new Map<string, Batch[]>();
	const claims = new Map<number, number>();
	for (const p of ps) {
		const c = [...batches.values()].filter((b) => {
			const fee = b.total - p.amount;
			return fee >= 0 && fee <= MAX_FEE_CENTS;
		});
		candidates.set(p.key, c);
		for (const b of c) claims.set(b.id, (claims.get(b.id) ?? 0) + 1);
	}
	const matches = new Map<string, Match>();
	for (const p of ps) {
		const c = candidates.get(p.key)!;
		if (c.length === 1 && claims.get(c[0].id) === 1) {
			matches.set(p.key, { batch: c[0], fee: c[0].total - p.amount });
		}
	}
	return matches;
}

function toPayoutUpsert(p: Payout, match: Match | undefined) {
	const day = new Date(p.created_at).toISOString().slice(0, 10);
	// Programs that actually contributed money; $0 referral events don't count.
	const programKeys = new Set(
		(match?.batch.rewards ?? [])
			.filter((r) => (r.amount ?? 0) > 0 && r.company?.key)
			.map((r) => r.company!.key),
	);
	return {
		type: "upsert" as const,
		key: p.key,
		properties: {
			Name: Builder.title(`Payout ${day} · $${(p.amount / 100).toFixed(2)}`),
			"Payout Key": Builder.richText(p.key),
			Amount: dollars(p.amount),
			Currency: optSelect(p.currency),
			Status: optSelect(p.status),
			Provider: optText(p.provider?.name),
			Rewards: (match?.batch.rewards ?? []).map((r) => Builder.relation(r.key)),
			Programs: [...programKeys].map((k) => Builder.relation(k)),
			"Payout Batch": optText(match?.batch.id),
			Fee: match ? dollars(match.fee) : EMPTY,
			Created: optDateTime(p.created_at),
			Sent: optDateTime(p.sent_at),
			Withdrawn: optDateTime(p.withdrawal_date),
		},
	};
}

type CursorState = { startingAfter?: string };

// All syncs are replace mode: the API has no updated-since filter, and rewards
// change status (pending → approved → paid) long after creation, so each run
// re-reads everything. Volumes are small (one page per source).

worker.sync("programsSync", {
	database: programs,
	mode: "replace",
	schedule: "1d",
	execute: async () => {
		const ps = await fetchAll<Partnership>("partnerships", partnerstack.wait);
		return { changes: ps.map(toProgramUpsert), hasMore: false };
	},
});

worker.sync("rewardsSync", {
	database: rewards,
	mode: "replace",
	schedule: "6h",
	execute: async (state: CursorState | undefined) => {
		await partnerstack.wait();
		const page = await fetchPage<Reward>("rewards", state?.startingAfter);
		const last = page.items.at(-1);
		const hasMore = page.has_more && !!last;
		return {
			changes: page.items.map(toRewardUpsert),
			hasMore,
			nextState: hasMore ? { startingAfter: last!.key } : undefined,
		};
	},
});

// A summary block for a program's page body: on a PartnerStack Programs row it
// shows that program's rewards and payouts; anywhere else, all programs.
// Reads through the viewer's permissions, not this worker. See
// blocks/program-summary and docs/custom-blocks.md.
worker.customBlock("programSummary", {
	path: "./blocks/program-summary",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		programs: {
			name: "PartnerStack Programs",
			description: "Used to recognise which program's page the block is on, and to name programs.",
			icon: { type: "emoji", emoji: "🤝" },
			properties: {
				name: { name: "Name", description: "Program name.", type: "title" },
			},
		},
		rewards: {
			name: "PartnerStack Rewards",
			description: "One row per reward. Filtered to the page's program through the Partner Program relation.",
			icon: { type: "emoji", emoji: "🎁" },
			properties: {
				name: { name: "Name", description: "Reward description.", type: "title" },
				program: {
					name: "Partner Program",
					description: "Relation to PartnerStack Programs. Map the relation, not the Program select.",
					type: "relation",
				},
				payout: {
					name: "Payout",
					description: "Relation to PartnerStack Payouts. Optional: without it the payouts table is empty.",
					type: "relation",
				},
				amount: { name: "Amount", description: "Reward amount in dollars.", type: "number" },
				status: { name: "Status", description: "hold, pending, approved, declined or paid.", type: "select" },
				paymentDate: { name: "Payment Date", description: "When PartnerStack pays (or paid) it.", type: "date" },
				created: { name: "Created", description: "When the reward was created.", type: "date" },
			},
		},
		payouts: {
			name: "PartnerStack Payouts",
			description: "Withdrawals to the bank, linked to rewards from the Rewards side.",
			icon: { type: "emoji", emoji: "💸" },
			properties: {
				name: { name: "Name", description: "Payout label.", type: "title" },
				amount: { name: "Amount", description: "Amount withdrawn, after the fee.", type: "number" },
				status: { name: "Status", description: "new, successful, …", type: "select" },
				fee: { name: "Fee", description: "Withdrawal fee.", type: "number" },
				withdrawn: { name: "Withdrawn", description: "Withdrawal date.", type: "date" },
				sent: { name: "Sent", description: "Sent date, used when not yet withdrawn.", type: "date" },
				created: { name: "Created", description: "Created date, the last fallback.", type: "date" },
			},
		},
	},
});

// Reads every reward too, to match payouts to their batches. Returns all
// payouts in one batch, which is fine while there are a handful a year.
worker.sync("payoutsSync", {
	database: payouts,
	mode: "replace",
	schedule: "6h",
	execute: async () => {
		const ps = await fetchAll<Payout>("payouts", partnerstack.wait);
		const rs = await fetchAll<Reward>("rewards", partnerstack.wait);
		const matches = matchPayoutsToBatches(ps, rs);
		const unmatched = ps.filter((p) => !matches.has(p.key)).map((p) => p.key);
		if (unmatched.length) console.log(`Payouts left unlinked (no unique batch): ${unmatched.join(", ")}`);
		return { changes: ps.map((p) => toPayoutUpsert(p, matches.get(p.key))), hasMore: false };
	},
});
