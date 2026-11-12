// PartnerStack Partner API client. Shapes are what the partner-side API
// actually returned (2026-11-12), which differ from the published reference:
// rewards carry `company`, `payment_date`, `payment_status` and `payout_id` at
// the top level, and no `partnership` object.

const BASE_URL = "https://api.partnerstack.com/api/v2";
export const PAGE_SIZE = 250; // API maximum

export type Reward = {
	key: string;
	amount: number | null; // cents
	currency: string | null;
	reward_status: string | null; // hold | pending | approved | declined | paid
	description: string | null;
	decline_reason: string | null;
	created_at: number; // epoch ms
	updated_at: number;
	payment_date: number | null; // epoch ms, midnight UTC
	payment_status: string | null; // available | withdrawn
	payout_id: number | null; // PartnerStack payout batch; not a /v2/payouts key
	company: { key: string; name: string } | null;
	// sub_ids: whatever was appended to the referral link (e.g. a teammate's name).
	customer: { key: string | null; sub_ids?: string[] | null } | null;
	transaction: { product_key: string | null; category_key: string | null } | null;
};

export type Payout = {
	key: string;
	amount: number; // cents
	currency: string;
	status: string; // new | successful | …
	created_at: number;
	updated_at: number;
	sent_at: number | null;
	withdrawal_date: number | null;
	// provider.meta holds bank details; deliberately not typed or synced.
	provider: { name: string | null } | null;
};

// One per program the account belongs to. `offers` came back all-null for
// every program, and private programs (all the Notion ones) have no
// marketplace listing, so there is no program description in the API.
export type Partnership = {
	key: string; // part_…
	status: string; // active | tos-acceptance-pending | …
	is_archived: boolean | null;
	created_at: number;
	company: { key: string; name: string }; // co_… — what rewards reference
	link: { url: string | null } | null;
};

type Page<T> = { items: T[]; has_more: boolean };

export async function fetchAll<T extends { key: string }>(
	resource: "rewards" | "payouts" | "partnerships",
	wait: () => Promise<void>,
): Promise<T[]> {
	const all: T[] = [];
	let after: string | undefined;
	for (;;) {
		await wait();
		const page = await fetchPage<T>(resource, after);
		all.push(...page.items);
		const last = page.items.at(-1);
		if (!page.has_more || !last) return all;
		after = last.key;
	}
}

export async function fetchPage<T>(
	resource: "rewards" | "payouts" | "partnerships",
	startingAfter: string | undefined,
): Promise<Page<T>> {
	const apiKey = process.env.PARTNERSTACK_API_KEY;
	if (!apiKey) throw new Error("PARTNERSTACK_API_KEY is not set");

	const url = new URL(`${BASE_URL}/${resource}`);
	url.searchParams.set("limit", String(PAGE_SIZE));
	if (startingAfter) url.searchParams.set("starting_after", startingAfter);

	const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
	if (!res.ok) {
		throw new Error(`PartnerStack ${resource} request failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as { data: Page<T> };
	return body.data;
}
