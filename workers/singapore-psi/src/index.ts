import { RateLimitError, Worker } from "@notionhq/workers";
import * as Schema from "@notionhq/workers/schema";
import * as Builder from "@notionhq/workers/builder";
import type { SelectColor } from "@notionhq/workers/types";

const worker = new Worker();
export default worker;

// NEA's hourly PSI readings, published through data.gov.sg's v2 real-time API.
// Optional key: without one the limit is 6 calls / 10 s, with a dev key 12.
const PSI_URL = "https://api-open.data.gov.sg/v2/real-time/api/psi";

// How far back the manual backfill reaches. One execute per day, 120 rows a day.
const BACKFILL_DAYS = 90;

// The delta re-reads the date of (now - this) as well as today, so a reading
// published or revised just before midnight SGT is still picked up after it.
const DELTA_LOOKBACK_MS = 3 * 60 * 60 * 1000;

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

// "national" only appears in older data (it was still there in 2020).
const REGIONS = {
	north: "North",
	south: "South",
	east: "East",
	west: "West",
	central: "Central",
	national: "National",
} as const;
type RegionKey = keyof typeof REGIONS;

// Kept clear of green/yellow/red so a region never reads as a PSI band.
const REGION_COLORS: Record<RegionKey, SelectColor> = {
	north: "blue",
	south: "pink",
	east: "orange",
	west: "purple",
	central: "brown",
	national: "gray",
};

// NEA's PSI descriptor bands for the 24-hour PSI.
const BANDS = [
	{ max: 50, name: "Good", color: "green" },
	{ max: 100, name: "Moderate", color: "yellow" },
	{ max: 200, name: "Unhealthy", color: "orange" },
	{ max: 300, name: "Very unhealthy", color: "red" },
	{ max: Infinity, name: "Hazardous", color: "purple" },
] as const;

// API reading key → Notion property name.
const READINGS = {
	psi_twenty_four_hourly: "PSI (24h)",
	pm25_twenty_four_hourly: "PM2.5 (24h, µg/m³)",
	pm25_sub_index: "PM2.5 Sub-index",
	pm10_twenty_four_hourly: "PM10 (24h, µg/m³)",
	pm10_sub_index: "PM10 Sub-index",
	o3_eight_hour_max: "O₃ (8h max, µg/m³)",
	o3_sub_index: "O₃ Sub-index",
	co_eight_hour_max: "CO (8h max, mg/m³)",
	co_sub_index: "CO Sub-index",
	so2_twenty_four_hourly: "SO₂ (24h, µg/m³)",
	so2_sub_index: "SO₂ Sub-index",
	no2_one_hour_max: "NO₂ (1h max, µg/m³)",
} as const;
type ReadingKey = keyof typeof READINGS;

const psiReadings = worker.database("psiReadings", {
	type: "managed",
	initialTitle: "Singapore PSI",
	primaryKeyProperty: "Reading ID",
	schema: {
		properties: {
			Reading: Schema.title(),
			"Reading ID": Schema.richText(),
			Region: Schema.select(
				(Object.keys(REGIONS) as RegionKey[]).map((r) => ({
					name: REGIONS[r],
					color: REGION_COLORS[r],
				})),
			),
			Timestamp: Schema.date(),
			Band: Schema.select(
				BANDS.map(({ name, color }) => ({ name, color })),
			),
			...(Object.fromEntries(
				Object.values(READINGS).map((name) => [name, Schema.number()]),
			) as Record<string, ReturnType<typeof Schema.number>>),
			"Updated At": Schema.date(),
		},
	},
});

// Keyless limit is 6 calls per 10 s; stay one under it.
const dataGovSg = worker.pacer("dataGovSg", {
	allowedRequests: 5,
	intervalMs: 10_000,
});

type PsiItem = {
	date: string;
	timestamp: string; // e.g. "2026-10-15T10:00:00+08:00"
	updatedTimestamp: string;
	readings: Record<string, Record<string, number | null>>;
};

type PsiResponse = {
	code: number;
	name?: string;
	errorMsg?: string;
	data: { items: PsiItem[] } | null;
};

// Code 17 (REAL_TIME_API_DATA_NOT_FOUND) is a day with no readings, not a failure.
const DATA_NOT_FOUND = 17;
const TOO_MANY_REQUESTS = 24;

async function fetchDay(date: string): Promise<PsiItem[]> {
	await dataGovSg.wait();
	const headers: Record<string, string> = {};
	const apiKey = process.env.DATA_GOV_SG_API_KEY;
	if (apiKey) headers["x-api-key"] = apiKey;

	const res = await fetch(`${PSI_URL}?date=${date}`, { headers });
	const body = (await res.json().catch(() => null)) as PsiResponse | null;
	if (body?.code === DATA_NOT_FOUND) return [];
	if (res.status === 429 || body?.code === TOO_MANY_REQUESTS) {
		// Limits reset every 10 s; let the platform back off rather than fail the run.
		throw new RateLimitError({ retryAfter: 10 });
	}
	if (!res.ok || !body || body.code !== 0 || !body.data) {
		throw new Error(
			`data.gov.sg PSI request for ${date} failed: HTTP ${res.status}` +
				(body ? ` code ${body.code} ${body.name ?? ""} ${body.errorMsg ?? ""}` : ""),
		);
	}
	return body.data.items;
}

/** YYYY-MM-DD of an instant, in Singapore time. */
function sgtDate(ms: number): string {
	return new Date(ms + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

function bandFor(psi: number): string {
	return BANDS.find((b) => psi <= b.max)!.name;
}

function regionsIn(item: PsiItem): RegionKey[] {
	return Object.keys(item.readings.psi_twenty_four_hourly ?? {}).filter(
		(r): r is RegionKey => {
			if (r in REGIONS) return true;
			console.warn(`Skipping unknown region "${r}" at ${item.timestamp}`);
			return false;
		},
	);
}

function toChanges(items: PsiItem[]) {
	return items.flatMap((item) =>
		regionsIn(item).map((region) => {
			// The key is built exactly as "Reading ID" is written, per the repo invariant.
			const id = `${item.timestamp}|${region}`;
			const local = item.timestamp.slice(0, 16).replace("T", " ");
			type Value = ReturnType<typeof Builder.title>;
			const properties: Record<string, Value> & { "Reading ID": Value } = {
				Reading: Builder.title(`${local} · ${REGIONS[region]}`),
				"Reading ID": Builder.richText(id),
				Region: Builder.select(REGIONS[region]),
				Timestamp: Builder.dateTime(item.timestamp.slice(0, 19), "Asia/Singapore"),
				"Updated At": Builder.dateTime(
					item.updatedTimestamp.slice(0, 19),
					"Asia/Singapore",
				),
			};
			for (const [key, name] of Object.entries(READINGS) as [ReadingKey, string][]) {
				const value = item.readings[key]?.[region];
				if (typeof value === "number") properties[name] = Builder.number(value);
			}
			const psi = item.readings.psi_twenty_four_hourly?.[region];
			if (typeof psi === "number") properties.Band = Builder.select(bandFor(psi));

			return { type: "upsert" as const, key: id, properties };
		}),
	);
}

// Backfill: walks one SGT day per execute from BACKFILL_DAYS ago up to today.
// Replace mode, so a run also sweeps rows older than the window.
// Re-run: ntn workers sync state reset psiBackfill && ntn workers sync trigger psiBackfill
worker.sync("psiBackfill", {
	database: psiReadings,
	mode: "replace",
	schedule: "manual",
	execute: async (state?: { day: string }) => {
		const now = Date.now();
		const today = sgtDate(now);
		const day = state?.day ?? sgtDate(now - BACKFILL_DAYS * 86_400_000);
		const items = await fetchDay(day);

		const hasMore = day < today;
		const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
			.toISOString()
			.slice(0, 10);
		return {
			changes: toChanges(items),
			hasMore,
			nextState: hasMore ? { day: next } : undefined,
		};
	},
});

// Delta: re-reads today (and yesterday, shortly after midnight) and upserts only
// readings published or revised since the last run, judged by updatedTimestamp.
worker.sync("psiDelta", {
	database: psiReadings,
	mode: "incremental",
	schedule: "30m",
	execute: async (state?: { since?: string }) => {
		const now = Date.now();
		const dates = [...new Set([sgtDate(now - DELTA_LOOKBACK_MS), sgtDate(now)])];
		const items: PsiItem[] = [];
		for (const date of dates) items.push(...(await fetchDay(date)));

		const since = state?.since ? Date.parse(state.since) : -Infinity;
		const fresh = items.filter((i) => Date.parse(i.updatedTimestamp) > since);
		const latest = fresh.reduce(
			(max, i) => Math.max(max, Date.parse(i.updatedTimestamp)),
			since,
		);

		return {
			changes: toChanges(fresh),
			hasMore: false,
			nextState: Number.isFinite(latest)
				? { since: new Date(latest).toISOString() }
				: state,
		};
	},
});
