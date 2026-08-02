/**
 * GA4 Data API access, routed through the Zapier "API Request (Beta)" action so
 * Zapier owns the Google OAuth credentials. No Google service-account key lives
 * in this worker.
 */
import { createZapierSdk } from "@zapier/zapier-sdk";

const GA4_APP = "google-analytics-4";
const RAW_REQUEST_ACTION = "_zap_raw_request";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

/**
 * The GA4 property reports in its own timezone, not UTC. Every `date` dimension
 * value and every relative date literal is resolved against this zone, so all
 * date arithmetic here must use it too — computing "yesterday" in UTC lands on
 * the wrong day for eight hours out of every twenty-four.
 */
export const PROPERTY_TIME_ZONE = "Asia/Singapore";

/** The property's first day of data. It was created 2026-04-12. */
export const DATA_START_DATE = "2026-04-01";

/** The site's real hostname. Everything else is CMS admin or a preview build. */
export const SITE_HOSTNAME = "www.work.flowers";

let _sdk: ReturnType<typeof createZapierSdk> | null = null;

function sdk() {
	if (_sdk) return _sdk;
	const clientId = process.env.ZAPIER_CLIENT_ID;
	const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error("ZAPIER_CLIENT_ID and ZAPIER_CLIENT_SECRET must be set");
	}
	_sdk = createZapierSdk({ credentials: { clientId, clientSecret } });
	return _sdk;
}

function connectionId(): string {
	const id = process.env.ZAPIER_GA4_CONNECTION_ID;
	if (!id) throw new Error("ZAPIER_GA4_CONNECTION_ID is not set");
	return id;
}

function propertyId(): string {
	const id = process.env.GA4_PROPERTY_ID;
	if (!id) throw new Error("GA4_PROPERTY_ID is not set");
	return id;
}

// --- Date helpers (property timezone) ---

/** Today's date in the property's timezone, as YYYY-MM-DD. */
export function todayInPropertyTz(): string {
	// en-CA formats as YYYY-MM-DD.
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: PROPERTY_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

/**
 * Shift a YYYY-MM-DD date string by whole days. Parsed as UTC midnight so the
 * arithmetic is pure calendar maths with no timezone of its own — the input is
 * already in property time and the output stays there.
 */
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/**
 * The most recent day whose data is complete. GA4 keeps collecting for the
 * current day, so reports always stop at the previous property-local day.
 */
export function latestCompleteDay(): string {
	return addDays(todayInPropertyTz(), -1);
}

export interface DateWindow {
	startDate: string;
	endDate: string;
}

/**
 * The window of `days` starting at `cursor`, clamped to `end`. Returns null once
 * the cursor has passed `end`.
 *
 * Syncs page by date window rather than by row offset. A window's rows are always
 * fetched in a single request, which means path normalisation can merge duplicate
 * rows (`/blog/x` and `/blog/x/`) with certainty — a row-offset scheme could split
 * the pair across two pages and double-count it.
 */
export function windowFrom(
	cursor: string,
	end: string,
	days: number,
): DateWindow | null {
	if (cursor > end) return null;
	const last = addDays(cursor, days - 1);
	return { startDate: cursor, endDate: last > end ? end : last };
}

// --- Report types ---

export interface GA4Row {
	dimensionValues: Array<{ value: string }>;
	metricValues: Array<{ value: string }>;
}

export interface GA4Report {
	dimensionHeaders: Array<{ name: string }>;
	metricHeaders: Array<{ name: string; type: string }>;
	rows: GA4Row[];
	rowCount: number;
	metadata?: { currencyCode?: string; timeZone?: string; subjectToThresholding?: boolean };
}

export interface ReportRequest {
	dimensions: string[];
	metrics: string[];
	startDate: string;
	endDate: string;
	/** Defaults to true. Restricts the report to the real site hostname. */
	siteOnly?: boolean;
	/** Extra `orderBys` entries. Dimensions are always sorted first, for determinism. */
	limit?: number;
}

// --- Transport ---

interface RawRequestResult {
	response?: {
		status?: number;
		data?: unknown;
		body?: string;
	};
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Issue one raw GA4 request through Zapier.
 *
 * `failOnErrors` is false by default and that is deliberate. With it true, Zapier
 * replaces the upstream response with an opaque `HTTP 503: upstream connect
 * error`, discarding GA4's actual message — a bad metric name becomes
 * undiagnosable. With it false the real status and error body come back and we
 * raise our own error. The one thing `true` buys is Zapier's automatic OAuth
 * refresh, so a 401 is retried once with it set.
 */
async function rawRequest(
	url: string,
	body: unknown,
	failOnErrors: boolean,
): Promise<{ status: number; data: unknown }> {
	const { data } = await sdk().runAction({
		app: GA4_APP,
		actionType: "write",
		action: RAW_REQUEST_ACTION,
		connection: connectionId(),
		inputs: {
			method: "POST",
			url,
			fail_on_errors: failOnErrors,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	});

	const result = (data as RawRequestResult[] | null)?.[0];
	if (!result?.response) {
		throw new Error(
			`Zapier returned no response for ${url}: ${JSON.stringify(data)?.slice(0, 500)}`,
		);
	}
	return {
		status: result.response.status ?? 0,
		data: result.response.data,
	};
}

function errorMessage(payload: unknown): string {
	const err = (payload as { error?: { message?: string } } | undefined)?.error;
	if (err?.message) return err.message;
	return JSON.stringify(payload)?.slice(0, 500) ?? "unknown error";
}

async function callDataApi(method: string, body: unknown): Promise<unknown> {
	const url = `${DATA_API}/properties/${propertyId()}:${method}`;
	let lastError = "";

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const { status, data } = await rawRequest(url, body, false);

		if (status >= 200 && status < 300) return data;

		if (status === 401) {
			// Force Zapier to refresh the Google token, then let the loop continue.
			await rawRequest(url, body, true).catch(() => undefined);
			lastError = "401 Unauthorized";
		} else if (RETRYABLE_STATUSES.has(status)) {
			lastError = `${status}: ${errorMessage(data)}`;
		} else {
			throw new Error(`GA4 ${method} failed ${status}: ${errorMessage(data)}`);
		}

		if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
	}

	throw new Error(`GA4 ${method} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}

/**
 * Run a report. Rows are ordered by every dimension ascending so results are
 * deterministic; GA4 leaves ordering unspecified otherwise.
 */
export async function runReport(req: ReportRequest): Promise<GA4Report> {
	const body: Record<string, unknown> = {
		dateRanges: [{ startDate: req.startDate, endDate: req.endDate }],
		dimensions: req.dimensions.map((name) => ({ name })),
		metrics: req.metrics.map((name) => ({ name })),
		orderBys: req.dimensions.map((name) => ({ dimension: { dimensionName: name } })),
		limit: req.limit ?? 10_000,
		keepEmptyRows: false,
	};

	if (req.siteOnly !== false) {
		body.dimensionFilter = {
			filter: {
				fieldName: "hostName",
				stringFilter: { matchType: "EXACT", value: SITE_HOSTNAME },
			},
		};
	}

	const data = (await callDataApi("runReport", body)) as Partial<GA4Report>;
	const report: GA4Report = {
		dimensionHeaders: data.dimensionHeaders ?? [],
		metricHeaders: data.metricHeaders ?? [],
		rows: data.rows ?? [],
		rowCount: data.rowCount ?? 0,
		metadata: data.metadata,
	};

	if (report.rowCount > report.rows.length) {
		// A window overflowing the row limit would silently truncate. The windows
		// are sized far below this, so it means the assumption has broken.
		throw new Error(
			`GA4 report truncated: ${report.rows.length} of ${report.rowCount} rows for ` +
				`${req.dimensions.join("+")} ${req.startDate}..${req.endDate}. Shrink the window.`,
		);
	}

	return report;
}

// --- Row access ---

/**
 * Read a dimension by position, failing loudly rather than throwing a bare
 * `undefined is not an object` from deep inside a map callback.
 */
export function dim(row: GA4Row, index: number): string {
	const value = row.dimensionValues?.[index]?.value;
	if (value === undefined) {
		throw new Error(
			`GA4 row is missing dimension ${index}: ${JSON.stringify(row).slice(0, 300)}`,
		);
	}
	return value;
}

/** Read a metric by position. GA4 sends numbers as strings; non-numeric means 0. */
export function metric(row: GA4Row, index: number): number {
	const raw = row.metricValues?.[index]?.value;
	if (raw === undefined) {
		throw new Error(
			`GA4 row is missing metric ${index}: ${JSON.stringify(row).slice(0, 300)}`,
		);
	}
	const n = Number(raw);
	return Number.isFinite(n) ? n : 0;
}

/** GA4's YYYYMMDD date dimension as an ISO YYYY-MM-DD date. */
export function isoDate(yyyymmdd: string): string {
	return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
