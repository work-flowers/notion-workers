/**
 * One-time historical export of subscriber counts.
 *
 * Pages through every subscriber in Buttondown, buckets by creation_date,
 * then emits one CSV row per day with cumulative counts by current type.
 *
 * Caveat: each status column reflects the subscriber's *current* type, not
 * their type on that historical date. Buttondown doesn't expose status-change
 * history, so this is the closest reconstruction available.
 *
 * Usage:
 *   BUTTONDOWN_API_KEY=ntn_... npx tsx scripts/export-subscriber-history.ts > subscriber-history.csv
 *
 * Optional: clip the output to start from a given date (subscribers with
 * earlier creation_dates still count toward the day-1 total, they just don't
 * get their own row). Useful if subscribers were imported from another
 * platform and you want the chart anchored at when you moved to Buttondown.
 *   BUTTONDOWN_API_KEY=... START_DATE=2025-06-01 npx tsx scripts/export-subscriber-history.ts > out.csv
 *
 * Then import the CSV into the "Buttondown subscriber counts" database in
 * Notion via the database menu → Merge with CSV (key column = Snapshot Date).
 */

const TOKEN = process.env.BUTTONDOWN_API_KEY;
if (!TOKEN) {
	console.error("BUTTONDOWN_API_KEY is not set");
	process.exit(1);
}

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

const HEADER_BY_TYPE: Record<SubscriberType, string> = {
	regular: "Regular",
	premium: "Premium",
	trialed: "Trialed",
	gifted: "Gifted",
	unpaid: "Unpaid",
	churning: "Churning",
	paused: "Paused",
	past_due: "Past Due",
	churned: "Churned",
	unactivated: "Unactivated",
	unsubscribed: "Unsubscribed",
	undeliverable: "Undeliverable",
	complained: "Complained",
	removed: "Removed",
};

async function bd(path: string): Promise<any> {
	const res = await fetch(`https://api.buttondown.com/v1${path}`, {
		headers: { Authorization: `Token ${TOKEN}` },
	});
	if (!res.ok) {
		throw new Error(`Buttondown ${path} → ${res.status} ${res.statusText}`);
	}
	return res.json();
}

async function main() {
	// Bucket: date (YYYY-MM-DD) → counts per type of subscribers that JOINED that day.
	const dailyJoins: Record<string, Record<SubscriberType, number>> = {};

	let page = 1;
	let fetched = 0;
	while (true) {
		const r = await bd(
			`/subscribers?page=${page}&page_size=100&ordering=creation_date`,
		);
		const results: any[] = r.results ?? [];
		for (const s of results) {
			const d = String(s.creation_date ?? "").slice(0, 10);
			const t = s.type as SubscriberType;
			if (!d || !SUBSCRIBER_TYPES.includes(t)) continue;
			if (!dailyJoins[d]) {
				dailyJoins[d] = Object.fromEntries(
					SUBSCRIBER_TYPES.map((x) => [x, 0]),
				) as Record<SubscriberType, number>;
			}
			dailyJoins[d][t] += 1;
		}
		fetched += results.length;
		process.stderr.write(`fetched ${fetched} subscribers (page ${page})\n`);
		if (!r.next) break;
		page += 1;
	}

	// Build sorted list of every date from earliest join → today.
	const allDates = Object.keys(dailyJoins).sort();
	if (allDates.length === 0) {
		console.error("No subscribers with creation_date found.");
		return;
	}
	const startEnv = process.env.START_DATE;
	const start = new Date(
		(startEnv && /^\d{4}-\d{2}-\d{2}$/.test(startEnv)
			? startEnv
			: allDates[0]) + "T00:00:00Z",
	);
	const end = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
	const earliest = new Date(allDates[0] + "T00:00:00Z");
	const walkFrom = earliest < start ? earliest : start;
	const dates: string[] = [];
	for (
		let d = new Date(walkFrom);
		d <= end;
		d.setUTCDate(d.getUTCDate() + 1)
	) {
		dates.push(d.toISOString().slice(0, 10));
	}
	const startKey = start.toISOString().slice(0, 10);

	// Cumulative counts by current type, per day.
	const running: Record<SubscriberType, number> = Object.fromEntries(
		SUBSCRIBER_TYPES.map((t) => [t, 0]),
	) as Record<SubscriberType, number>;

	const headers = [
		"Date",
		"Snapshot Date",
		"Total",
		"Active",
		...SUBSCRIBER_TYPES.map((t) => HEADER_BY_TYPE[t]),
	];

	const csvEscape = (v: string | number) => {
		const s = String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};

	console.log(headers.map(csvEscape).join(","));

	for (const d of dates) {
		const joins = dailyJoins[d];
		if (joins) {
			for (const t of SUBSCRIBER_TYPES) running[t] += joins[t];
		}
		if (d < startKey) continue;
		const total = SUBSCRIBER_TYPES.reduce((a, t) => a + running[t], 0);
		const active = ACTIVE_TYPES.reduce((a, t) => a + running[t], 0);
		const row = [
			d,
			d,
			total,
			active,
			...SUBSCRIBER_TYPES.map((t) => running[t]),
		];
		console.log(row.map(csvEscape).join(","));
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
