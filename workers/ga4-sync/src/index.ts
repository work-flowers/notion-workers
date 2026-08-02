import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import {
	DATA_START_DATE,
	dim,
	isoDate,
	latestCompleteDay,
	metric,
	runReport,
	windowFrom,
	type GA4Row,
} from "./ga4.js";
import { classifyPath, normalizePath, type PageKind } from "./paths.js";
import { relinkPage } from "./relink.js";
import { loadSourcePages } from "./sourcePages.js";

const worker = new Worker();
export default worker;

// --- Pacers ---

// GA4 standard properties get 200k tokens/day and 40k/hour; a report of this
// shape costs 1–20. The binding constraint is concurrent requests (10), not
// volume, so this is set well below anything GA4 would reject.
const ga4Api = worker.pacer("ga4Api", { allowedRequests: 60, intervalMs: 60_000 });

// The Notion REST API allows roughly three requests per second.
const notionApi = worker.pacer("notionApi", { allowedRequests: 3, intervalMs: 1_000 });

// --- Windowing ---

/**
 * Days of data per `execute` call. Set wide enough that a backfill covers its
 * whole range in one call and never persists a pagination cursor — see the note
 * in `windowedSync`.
 *
 * The binding constraint is not this number but `MAX_CHANGES_PER_EXECUTE`. As of
 * 2026-08-02 the largest report (landing page) is ~1,160 rows for four months and
 * grows ~290/month, so the ceiling is roughly nine months of total history —
 * around mid-2027. Resolve the state question in `windowedSync` before then.
 */
const BACKFILL_WINDOW_DAYS = 1_500;

/**
 * How far back each delta run re-reads. GA4 keeps revising recent days as late
 * hits and attribution settle, so these days are re-upserted every run.
 */
const DELTA_LOOKBACK_DAYS = 4;

interface WindowState {
	cursor: string;
	/** The range this cursor belongs to. A cursor from a different range is stale. */
	from: string;
	end: string;
}

/**
 * A single `execute` must not emit more changes than the runtime will accept.
 * The windows below are sized so this is never reached; hitting it means the
 * property has outgrown them and `WINDOW_DAYS` needs lowering — which brings
 * multi-call cycles back, so read the note on state below before doing it.
 */
const MAX_CHANGES_PER_EXECUTE = 2_500;

/**
 * Build a sync `execute` that walks a date range one window at a time.
 *
 * Paging by date rather than by row offset is what makes path normalisation safe:
 * every row for a given day arrives in the same response, so duplicate paths
 * (`/blog/x` and `/blog/x/`) can be merged with certainty. A row-offset scheme
 * could split such a pair across two pages and write both halves.
 *
 * ## Windows are deliberately sized to complete a cycle in one call
 *
 * The runtime ignores `nextState` when `hasMore` is false, so the last cursor a
 * multi-call cycle persists is the one from its *second-to-last* call. Whether
 * the platform then hands that cursor to the next cycle or discards it is not
 * observable from the SDK, the CLI, or `sync status` — and the two behaviours
 * differ catastrophically for a replace-mode sync: resuming mid-range would
 * report a partial dataset as complete and let mark-and-sweep delete the rest.
 *
 * Rather than bet on it, every window is sized to cover its whole range, so
 * `hasMore` is false on the first call and no cursor is ever persisted. The
 * windowing below is kept because the property will eventually outgrow a single
 * call — `MAX_CHANGES_PER_EXECUTE` is the tripwire — and because the `from`/`end`
 * guard makes a resumed cursor safe for the *incremental* deltas, where a partial
 * batch deletes nothing.
 *
 * At current volume the largest report is ~1,100 rows for the full history.
 */
function windowedSync<C>(opts: {
	dimensions: string[];
	metrics: string[];
	rangeStart: () => string;
	windowDays: number;
	mapRows: (rows: GA4Row[]) => C[];
}) {
	// The runtime hands back `null` for absent state, not `undefined` — a preview
	// with no context does exactly that.
	return async (state: WindowState | undefined | null) => {
		const end = latestCompleteDay();
		const from = opts.rangeStart();

		// A cursor is only honoured when it sits strictly inside the range being
		// walked now and was recorded against the same bounds. Anything else
		// restarts from the beginning, which is always correct.
		const resumable =
			state != null &&
			state.from === from &&
			state.end === end &&
			state.cursor > from &&
			state.cursor <= end;
		const cursor = resumable ? state.cursor : from;

		const window = windowFrom(cursor, end, opts.windowDays);
		if (!window) {
			// `from` is past the last complete day: GA4 has nothing for this range
			// yet. Only reachable if the clock or DATA_START_DATE is wrong.
			throw new Error(`Empty date range: ${from} is after ${end}`);
		}

		await ga4Api.wait();
		const report = await runReport({
			dimensions: opts.dimensions,
			metrics: opts.metrics,
			startDate: window.startDate,
			endDate: window.endDate,
		});

		const changes = opts.mapRows(report.rows);
		if (changes.length > MAX_CHANGES_PER_EXECUTE) {
			throw new Error(
				`${changes.length} changes in one execution for ${opts.dimensions.join("+")} ` +
					`${window.startDate}..${window.endDate}, over the ${MAX_CHANGES_PER_EXECUTE} ` +
					`ceiling. Lower the window size — and read the state note in windowedSync first.`,
			);
		}

		const nextCursor = window.endDate < end ? addDay(window.endDate) : null;

		return {
			changes,
			hasMore: nextCursor !== null,
			nextState: nextCursor ? { cursor: nextCursor, from, end } : undefined,
		};
	};
}

function addDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function deltaStart(): string {
	const end = latestCompleteDay();
	const d = new Date(`${end}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - (DELTA_LOOKBACK_DAYS - 1));
	return d.toISOString().slice(0, 10);
}

/**
 * Sum metric arrays across rows that collapse to the same key after
 * normalisation. Without this, `/blog/x` and `/blog/x/` produce two upserts with
 * the same primary key in a single batch.
 */
function aggregate<K extends string>(
	rows: GA4Row[],
	keyOf: (row: GA4Row) => { key: K; dims: string[] },
	metricCount: number,
): Array<{ key: K; dims: string[]; metrics: number[] }> {
	const acc = new Map<K, { key: K; dims: string[]; metrics: number[] }>();

	for (const row of rows) {
		const { key, dims } = keyOf(row);
		let entry = acc.get(key);
		if (!entry) {
			entry = { key, dims, metrics: new Array(metricCount).fill(0) };
			acc.set(key, entry);
		}
		for (let i = 0; i < metricCount; i++) entry.metrics[i] += metric(row, i);
	}

	return [...acc.values()];
}

/** Rates and averages cannot be summed; recompute them as a weighted mean. */
function weightedMean(rows: GA4Row[], valueIndex: number, weightIndex: number): number {
	let weighted = 0;
	let weight = 0;
	for (const row of rows) {
		const w = metric(row, weightIndex);
		weighted += metric(row, valueIndex) * w;
		weight += w;
	}
	return weight === 0 ? 0 : weighted / weight;
}

function round(n: number, dp = 2): number {
	const f = 10 ** dp;
	return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// 1. Page performance, daily
// ---------------------------------------------------------------------------

// Metrics here are page-scoped on purpose. `newUsers` was dropped from this
// report: at page grain it counts users whose *first ever session* touched the
// page, which is not "new visitors to this page" and reads as if it were.
// Session-scoped measures live in the landing-page report instead.
const pagesDb = worker.database("pagesPathReportDb", {
	type: "managed",
	initialTitle: "Pages Path Report",
	primaryKeyProperty: "Name",
	schema: {
		databaseIcon: Builder.emojiIcon("📄"),
		properties: {
			Name: Schema.title(),
			Date: Schema.date("YYYY/MM/DD"),
			"Page Path": Schema.richText(),
			"Page Type": Schema.select(PAGE_TYPE_OPTIONS()),
			"Screen Page Views": Schema.number(),
			"Active Users": Schema.number(),
			"Total Users": Schema.number(),
			"Event Count": Schema.number(),
			"Scrolled Users": Schema.number(),
			"User Engagement Duration": Schema.number(),
		},
	},
});

const PAGE_METRICS = [
	"screenPageViews",
	"activeUsers",
	"totalUsers",
	"eventCount",
	"scrolledUsers",
	"userEngagementDuration",
];

function mapPageRows(rows: GA4Row[]) {
	const aggregated = aggregate(
		rows,
		(row) => {
			const date = dim(row, 0);
			const path = normalizePath(dim(row, 1));
			return { key: `${date}::${path}` as string, dims: [date, path] };
		},
		PAGE_METRICS.length,
	);

	return aggregated.map(({ key, dims: [date, path], metrics }) => ({
		type: "upsert" as const,
		key,
		properties: {
			Name: Builder.title(key),
			Date: Builder.date(isoDate(date)),
			"Page Path": Builder.richText(path),
			"Page Type": Builder.select(classifyPath(path)),
			"Screen Page Views": Builder.number(metrics[0]),
			"Active Users": Builder.number(metrics[1]),
			"Total Users": Builder.number(metrics[2]),
			"Event Count": Builder.number(metrics[3]),
			"Scrolled Users": Builder.number(metrics[4]),
			"User Engagement Duration": Builder.number(round(metrics[5])),
		},
	}));
}

worker.sync("pagesPathBackfill", {
	database: pagesDb,
	mode: "replace",
	schedule: "manual",
	execute: windowedSync({
		dimensions: ["date", "pagePath"],
		metrics: PAGE_METRICS,
		rangeStart: () => DATA_START_DATE,
		windowDays: BACKFILL_WINDOW_DAYS,
		mapRows: mapPageRows,
	}),
});

worker.sync("pagesPathDelta", {
	database: pagesDb,
	mode: "incremental",
	schedule: "6h",
	execute: windowedSync({
		dimensions: ["date", "pagePath"],
		metrics: PAGE_METRICS,
		rangeStart: deltaStart,
		windowDays: DELTA_LOOKBACK_DAYS,
		mapRows: mapPageRows,
	}),
});

// ---------------------------------------------------------------------------
// 2. Acquisition, daily
// ---------------------------------------------------------------------------

const acquisitionDb = worker.database("trafficSourceMediumDb", {
	type: "managed",
	initialTitle: "Traffic Session Source Medium Report",
	primaryKeyProperty: "Name",
	schema: {
		databaseIcon: Builder.emojiIcon("🚥"),
		properties: {
			Name: Schema.title(),
			Date: Schema.date("YYYY/MM/DD"),
			"Channel Group": Schema.richText(),
			"Session Source": Schema.richText(),
			"Session Medium": Schema.richText(),
			Sessions: Schema.number(),
			"Engaged Sessions": Schema.number(),
			Users: Schema.number(),
			"New Users": Schema.number(),
			"Key Events": Schema.number(),
			"User Engagement Duration": Schema.number(),
		},
	},
});

const ACQUISITION_METRICS = [
	"sessions",
	"engagedSessions",
	"totalUsers",
	"newUsers",
	"keyEvents",
	"userEngagementDuration",
];

function mapAcquisitionRows(rows: GA4Row[]) {
	return rows.map((row) => {
		const date = dim(row, 0);
		const channel = dim(row, 1);
		const source = dim(row, 2);
		const medium = dim(row, 3);
		const key = `${date}::${channel}::${source}::${medium}`;
		return {
			type: "upsert" as const,
			key,
			properties: {
				Name: Builder.title(key),
				Date: Builder.date(isoDate(date)),
				"Channel Group": Builder.richText(channel),
				"Session Source": Builder.richText(source),
				"Session Medium": Builder.richText(medium),
				Sessions: Builder.number(metric(row, 0)),
				"Engaged Sessions": Builder.number(metric(row, 1)),
				Users: Builder.number(metric(row, 2)),
				"New Users": Builder.number(metric(row, 3)),
				"Key Events": Builder.number(metric(row, 4)),
				"User Engagement Duration": Builder.number(round(metric(row, 5))),
			},
		};
	});
}

const ACQUISITION_DIMENSIONS = [
	"date",
	"sessionDefaultChannelGroup",
	"sessionSource",
	"sessionMedium",
];

worker.sync("trafficSourceMediumBackfill", {
	database: acquisitionDb,
	mode: "replace",
	schedule: "manual",
	execute: windowedSync({
		dimensions: ACQUISITION_DIMENSIONS,
		metrics: ACQUISITION_METRICS,
		rangeStart: () => DATA_START_DATE,
		windowDays: BACKFILL_WINDOW_DAYS,
		mapRows: mapAcquisitionRows,
	}),
});

worker.sync("trafficSourceMediumDelta", {
	database: acquisitionDb,
	mode: "incremental",
	schedule: "6h",
	execute: windowedSync({
		dimensions: ACQUISITION_DIMENSIONS,
		metrics: ACQUISITION_METRICS,
		rangeStart: deltaStart,
		windowDays: DELTA_LOOKBACK_DAYS,
		mapRows: mapAcquisitionRows,
	}),
});

// ---------------------------------------------------------------------------
// 3. Landing page performance, daily
// ---------------------------------------------------------------------------

// Session-scoped metrics belong here rather than on `pagePath`: a bounce rate or
// session duration attributed to every page in a session is misleading, but
// attributed to the page the session *started* on it is exactly the question
// "which post brings people in, and do they stay".
const landingDb = worker.database("landingPageDb", {
	type: "managed",
	initialTitle: "Landing Page Report",
	primaryKeyProperty: "Name",
	schema: {
		databaseIcon: Builder.emojiIcon("🛬"),
		properties: {
			Name: Schema.title(),
			Date: Schema.date("YYYY/MM/DD"),
			"Landing Page": Schema.richText(),
			"Page Type": Schema.select(PAGE_TYPE_OPTIONS()),
			"Channel Group": Schema.richText(),
			Sessions: Schema.number(),
			"Engaged Sessions": Schema.number(),
			"Bounce Rate": Schema.number("percent"),
			"Avg Session Duration": Schema.number(),
			"Key Events": Schema.number(),
		},
	},
});

const LANDING_METRICS = [
	"sessions",
	"engagedSessions",
	"bounceRate",
	"averageSessionDuration",
	"keyEvents",
];

function mapLandingRows(rows: GA4Row[]) {
	// Group first so the rate metrics can be re-weighted rather than summed.
	const groups = new Map<string, { dims: string[]; rows: GA4Row[] }>();
	for (const row of rows) {
		const date = dim(row, 0);
		const path = normalizePath(dim(row, 1));
		const channel = dim(row, 2);
		const key = `${date}::${path}::${channel}`;
		const group = groups.get(key);
		if (group) group.rows.push(row);
		else groups.set(key, { dims: [date, path, channel], rows: [row] });
	}

	return [...groups.entries()].map(([key, { dims: [date, path, channel], rows: group }]) => {
		const sessions = group.reduce((n, r) => n + metric(r, 0), 0);
		return {
			type: "upsert" as const,
			key,
			properties: {
				Name: Builder.title(key),
				Date: Builder.date(isoDate(date)),
				"Landing Page": Builder.richText(path),
				"Page Type": Builder.select(classifyPath(path)),
				"Channel Group": Builder.richText(channel),
				Sessions: Builder.number(sessions),
				"Engaged Sessions": Builder.number(group.reduce((n, r) => n + metric(r, 1), 0)),
				"Bounce Rate": Builder.number(round(weightedMean(group, 2, 0), 4)),
				"Avg Session Duration": Builder.number(round(weightedMean(group, 3, 0))),
				"Key Events": Builder.number(group.reduce((n, r) => n + metric(r, 4), 0)),
			},
		};
	});
}

const LANDING_DIMENSIONS = ["date", "landingPage", "sessionDefaultChannelGroup"];

worker.sync("landingPageBackfill", {
	database: landingDb,
	mode: "replace",
	schedule: "manual",
	execute: windowedSync({
		dimensions: LANDING_DIMENSIONS,
		metrics: LANDING_METRICS,
		rangeStart: () => DATA_START_DATE,
		windowDays: BACKFILL_WINDOW_DAYS,
		mapRows: mapLandingRows,
	}),
});

worker.sync("landingPageDelta", {
	database: landingDb,
	mode: "incremental",
	schedule: "6h",
	execute: windowedSync({
		dimensions: LANDING_DIMENSIONS,
		metrics: LANDING_METRICS,
		rangeStart: deltaStart,
		windowDays: DELTA_LOOKBACK_DAYS,
		mapRows: mapLandingRows,
	}),
});

// ---------------------------------------------------------------------------
// 4. Site daily summary
// ---------------------------------------------------------------------------

// One row per day. Charts and dashboards read this instead of rolling up
// thousands of page rows to answer "how did the site do".
const siteDailyDb = worker.database("siteDailyDb", {
	type: "managed",
	initialTitle: "Site Daily Summary",
	primaryKeyProperty: "Name",
	schema: {
		databaseIcon: Builder.emojiIcon("📈"),
		properties: {
			Name: Schema.title(),
			Date: Schema.date("YYYY/MM/DD"),
			Sessions: Schema.number(),
			"Engaged Sessions": Schema.number(),
			"Engagement Rate": Schema.number("percent"),
			"Total Users": Schema.number(),
			"New Users": Schema.number(),
			"Active Users": Schema.number(),
			"Screen Page Views": Schema.number(),
			"Key Events": Schema.number(),
			"Avg Session Duration": Schema.number(),
		},
	},
});

const SITE_METRICS = [
	"sessions",
	"engagedSessions",
	"engagementRate",
	"totalUsers",
	"newUsers",
	"activeUsers",
	"screenPageViews",
	"keyEvents",
	"averageSessionDuration",
];

function mapSiteRows(rows: GA4Row[]) {
	return rows.map((row) => {
		const date = dim(row, 0);
		return {
			type: "upsert" as const,
			key: date,
			properties: {
				Name: Builder.title(isoDate(date)),
				Date: Builder.date(isoDate(date)),
				Sessions: Builder.number(metric(row, 0)),
				"Engaged Sessions": Builder.number(metric(row, 1)),
				"Engagement Rate": Builder.number(round(metric(row, 2), 4)),
				"Total Users": Builder.number(metric(row, 3)),
				"New Users": Builder.number(metric(row, 4)),
				"Active Users": Builder.number(metric(row, 5)),
				"Screen Page Views": Builder.number(metric(row, 6)),
				"Key Events": Builder.number(metric(row, 7)),
				"Avg Session Duration": Builder.number(round(metric(row, 8))),
			},
		};
	});
}

worker.sync("siteDailyBackfill", {
	database: siteDailyDb,
	mode: "replace",
	schedule: "manual",
	execute: windowedSync({
		dimensions: ["date"],
		metrics: SITE_METRICS,
		rangeStart: () => DATA_START_DATE,
		windowDays: BACKFILL_WINDOW_DAYS,
		mapRows: mapSiteRows,
	}),
});

worker.sync("siteDailyDelta", {
	database: siteDailyDb,
	mode: "incremental",
	schedule: "6h",
	execute: windowedSync({
		dimensions: ["date"],
		metrics: SITE_METRICS,
		rangeStart: deltaStart,
		windowDays: DELTA_LOOKBACK_DAYS,
		mapRows: mapSiteRows,
	}),
});

// ---------------------------------------------------------------------------
// 5. Page performance rollup — one row per page, and where the relation lives
// ---------------------------------------------------------------------------

const pagePerformanceDb = worker.database("pagePerformanceDb", {
	type: "managed",
	initialTitle: "Page Performance",
	primaryKeyProperty: "Page",
	schema: {
		databaseIcon: Builder.emojiIcon("🗂️"),
		properties: {
			Page: Schema.title(),
			"Page Type": Schema.select(PAGE_TYPE_OPTIONS()),
			Views: Schema.number(),
			Users: Schema.number(),
			"Engagement (s)": Schema.number(),
			"Avg Engagement (s)": Schema.number(),
			"Views (28d)": Schema.number(),
			"Users (28d)": Schema.number(),
			"Engagement (28d)": Schema.number(),
			// The path resolves to a Notion source page. False flags a URL with no
			// content record — a renamed slug needing a redirect, or a 404.
			Matched: Schema.checkbox(),
			// Set by the sync from the same lookup the relink pass uses, so the
			// relation can be verified against a value the sync owns.
			"Source URL": Schema.url(),
			"Source Title": Schema.richText(),
			"Last Synced": Schema.date(),
		},
	},
	// NOTE: two relation properties — "Website Page" -> Pages List and
	// "Blog Post" -> Blog Posts — are added to this data source BY HAND and are
	// deliberately absent from this schema. Declaring them would mark them
	// read-only, and `Schema.relation` cannot target a database this worker does
	// not manage. `pagePerformanceRelink` fills them in over the REST API.
});

const ROLLUP_METRICS = ["screenPageViews", "totalUsers", "userEngagementDuration"];

worker.sync("pagePerformanceSync", {
	database: pagePerformanceDb,
	mode: "replace",
	schedule: "6h",
	execute: async () => {
		const end = latestCompleteDay();
		const syncedAt = new Date().toISOString();

		await ga4Api.wait();
		const lifetime = await runReport({
			dimensions: ["pagePath"],
			metrics: ROLLUP_METRICS,
			startDate: DATA_START_DATE,
			endDate: end,
		});

		await ga4Api.wait();
		const recent = await runReport({
			dimensions: ["pagePath"],
			metrics: ROLLUP_METRICS,
			startDate: "27daysAgo",
			endDate: end,
		});

		const sources = await loadSourcePages();

		const fold = (rows: GA4Row[]) => {
			const totals = new Map<string, number[]>();
			for (const row of rows) {
				const path = normalizePath(dim(row, 0));
				const current = totals.get(path) ?? [0, 0, 0];
				for (let i = 0; i < ROLLUP_METRICS.length; i++) current[i] += metric(row, i);
				totals.set(path, current);
			}
			return totals;
		};

		const lifetimeTotals = fold(lifetime.rows);
		const recentTotals = fold(recent.rows);

		const changes = [...lifetimeTotals.entries()].map(([path, totals]) => {
			const recentTotal = recentTotals.get(path) ?? [0, 0, 0];
			const source = sources.get(path);
			return {
				type: "upsert" as const,
				key: path,
				properties: {
					Page: Builder.title(path),
					"Page Type": Builder.select(classifyPath(path)),
					Views: Builder.number(totals[0]),
					Users: Builder.number(totals[1]),
					"Engagement (s)": Builder.number(round(totals[2])),
					"Avg Engagement (s)": Builder.number(
						totals[0] === 0 ? 0 : round(totals[2] / totals[0]),
					),
					"Views (28d)": Builder.number(recentTotal[0]),
					"Users (28d)": Builder.number(recentTotal[1]),
					"Engagement (28d)": Builder.number(round(recentTotal[2])),
					Matched: Builder.checkbox(Boolean(source)),
					"Source URL": Builder.url(source?.url ?? ""),
					"Source Title": Builder.richText(source?.title ?? ""),
					"Last Synced": Builder.dateTime(syncedAt),
				},
			};
		});

		return { changes, hasMore: false };
	},
});

// The relation pass runs separately from the rollup: a row has to exist before it
// can be linked, and a GA4 outage should not stop links from being repaired.
interface RelinkState {
	cursor?: string;
}

worker.sync("pagePerformanceRelink", {
	database: pagePerformanceDb,
	mode: "incremental",
	schedule: "6h",
	execute: async (state: RelinkState | undefined | null) => {
		const sources = await loadSourcePages();
		const result = await relinkPage(sources, state?.cursor, () => notionApi.wait());

		console.log(
			`relink: scanned ${result.scanned}, linked ${result.updated}, ` +
				`cleared ${result.cleared}, unmatched ${result.unmatched}`,
		);

		return {
			// The relation is written over the REST API, not through the sync
			// pipeline — declared properties on a managed database are read-only.
			changes: [],
			hasMore: result.nextCursor !== null,
			nextState: result.nextCursor ? { cursor: result.nextCursor } : undefined,
		};
	},
});

// --- Shared option lists ---

function PAGE_TYPE_OPTIONS() {
	const kinds: PageKind[] = [
		"Home",
		"Static Page",
		"Blog Post",
		"Blog Index",
		"Blog Tag",
		"Blog Author",
		"Other",
	];
	return kinds.map((name) => ({ name }));
}
