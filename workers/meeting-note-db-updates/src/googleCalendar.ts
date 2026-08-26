import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

export interface CalendarEvent {
	id: string;
	summary?: string;
	description?: string;
	hangoutLink?: string;
	iCalUID?: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
	organizer?: { email?: string; displayName?: string };
	attendees?: Array<{
		email?: string;
		displayName?: string;
		resource?: boolean;
	}>;
}

interface ServiceAccountKey {
	client_email: string;
	private_key: string;
}

let cachedKey: ServiceAccountKey | null = null;

function getServiceAccountKey(): ServiceAccountKey {
	if (cachedKey) return cachedKey;
	const b64 = process.env.GOOGLE_SA_KEY_BASE64;
	if (!b64) throw new Error("GOOGLE_SA_KEY_BASE64 is not configured");
	cachedKey = JSON.parse(
		Buffer.from(b64, "base64").toString("utf8"),
	) as ServiceAccountKey;
	return cachedKey;
}

function b64url(input: string): string {
	return Buffer.from(input).toString("base64url");
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Mint an access token for the service account impersonating `subject`
 * (a work.flowers user) via domain-wide delegation.
 */
export async function getAccessToken(subject: string): Promise<string> {
	const cached = tokenCache.get(subject);
	if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

	const key = getServiceAccountKey();
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const claims = b64url(
		JSON.stringify({
			iss: key.client_email,
			sub: subject,
			scope: SCOPE,
			aud: TOKEN_URL,
			iat: now,
			exp: now + 3600,
		}),
	);
	const signer = createSign("RSA-SHA256");
	signer.update(`${header}.${claims}`);
	const signature = signer.sign(key.private_key).toString("base64url");

	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: `${header}.${claims}.${signature}`,
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Google token exchange failed for ${subject}: ${res.status} ${await res.text()}`,
		);
	}
	const body = (await res.json()) as {
		access_token: string;
		expires_in: number;
	};
	tokenCache.set(subject, {
		token: body.access_token,
		expiresAt: Date.now() + body.expires_in * 1000,
	});
	return body.access_token;
}

/**
 * Find the event on `subject`'s primary calendar identified by the composite
 * of `startTime` and `title`. The time window catches overlapping events
 * (all-day events, still-running earlier meetings), so results are filtered
 * locally on an exact start match plus an exact title match against the
 * event's `summary`.
 *
 * Both halves of the composite are needed: two meetings can start at the same
 * minute (2026-08-26 had a webinar and a co-working session both at 12:00), and
 * a start-time-only match then picks whichever the API happened to return
 * first. `title` comes from the `meeting_notes` block, which Notion's calendar
 * integration syncs from the event's own `summary` — so this is an identity
 * check, not a fuzzy search, and matching is done here rather than through the
 * API's `q` parameter (a fuzzy AND across summary, description, location and
 * attendees, which guarantees neither exactness nor uniqueness).
 *
 * Returns null when the composite matches nothing: enriching a page from the
 * wrong event is worse than leaving it unenriched.
 */
export async function findCalendarEvent(
	subject: string,
	startTime: string,
	title: string,
): Promise<CalendarEvent | null> {
	const token = await getAccessToken(subject);
	const startMs = new Date(startTime).getTime();
	const params = new URLSearchParams({
		timeMin: new Date(startMs).toISOString(),
		timeMax: new Date(startMs + 60_000).toISOString(),
		singleEvents: "true",
	});
	const res = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
		{ headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
	);
	if (!res.ok) {
		throw new Error(
			`Google Calendar request failed for ${subject}: ${res.status} ${await res.text()}`,
		);
	}
	const body = (await res.json()) as { items?: CalendarEvent[] };
	const startMatches = (body.items ?? []).filter(
		(e) =>
			e.start?.dateTime && new Date(e.start.dateTime).getTime() === startMs,
	);
	const wanted = title.trim();
	const matches = startMatches.filter((e) => (e.summary ?? "").trim() === wanted);

	if (matches.length === 0 && startMatches.length > 0) {
		console.log(
			`${startMatches.length} calendar event(s) start at ${startTime} on ${subject}'s calendar but none is titled "${wanted}" (found: ${startMatches
				.map((e) => `"${e.summary ?? ""}"`)
				.join(", ")}); treating as no match.`,
		);
	}
	if (matches.length > 1) {
		console.log(
			`Multiple calendar events at ${startTime} on ${subject}'s calendar are titled "${wanted}"; using the first.`,
		);
	}
	return matches[0] ?? null;
}
