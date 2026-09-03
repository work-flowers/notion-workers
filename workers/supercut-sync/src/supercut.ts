/**
 * Minimal Supercut Platform API client.
 *
 * REST base is `https://api.supercut.ai/v1`, bearer-token auth. The spec lives at
 * https://api.supercut.ai/api/platform/v1/docs/openapi.json. Playlists are still
 * called "stacks" on the REST surface — `/stacks` is the playlist endpoint set.
 *
 * The REST API exposes no thumbnail and no embed snippet for a recording; both
 * come from the unauthenticated oEmbed endpoint on supercut.ai, see `getOEmbed`.
 */

const SUPERCUT_API_BASE = "https://api.supercut.ai/v1";
const SUPERCUT_SITE = "https://supercut.ai";
const PAGE_SIZE = 50; // API maximum
const MAX_ATTEMPTS = 3;

/** Anything with an awaitable `wait()` — satisfied by `worker.pacer(...)`. */
export type Pacer = { wait: () => Promise<void> };

export interface Playlist {
	public_id: string;
	name: string;
	description: string | null;
	created_at: string;
	updated_at: string;
	is_public: boolean;
	workspace_safename: string;
	recording_count: number;
}

export interface PlaylistRecording {
	public_id: string;
	title: string;
	created_at: string;
	duration_ms: number | null;
	workspace_safename: string;
	position?: number;
}

export type RecordingStatus = "pending" | "processing" | "completed" | "failed";

export interface Chapter {
	title: string;
	summary: string;
	start_ms: number;
}

export interface RecordingDetail {
	public_id: string;
	title: string;
	status: RecordingStatus;
	duration_ms: number | null;
	created_at: string;
	owner: { name: string; avatar_url: string | null };
	summary: string | null;
	chapters: Chapter[];
}

export interface OEmbed {
	version: string;
	type: string;
	url: string;
	title?: string;
	html?: string;
	duration?: number;
	thumbnail_url?: string;
	thumbnail_width?: number;
	thumbnail_height?: number;
}

function apiToken(): string {
	const token = process.env.SUPERCUT_API_TOKEN;
	if (!token) throw new Error("SUPERCUT_API_TOKEN environment variable is not set");
	return token;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET with the pacer gate, a JSON parse, and a short retry on 429 / 5xx. Any
 * other non-2xx is thrown with the response body so the run log shows the
 * upstream error verbatim.
 */
async function getJson<T>(
	url: URL,
	pacer: Pacer,
	headers: Record<string, string>,
): Promise<T> {
	let lastError: Error | undefined;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		await pacer.wait();
		const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
		if (res.ok) return (await res.json()) as T;

		const body = (await res.text().catch(() => "")).slice(0, 500);
		lastError = new Error(`Supercut GET ${url.pathname} → ${res.status}: ${body}`);
		const retryable = res.status === 429 || res.status >= 500;
		if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;

		const retryAfter = Number(res.headers.get("retry-after"));
		await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt);
	}
	throw lastError ?? new Error(`Supercut GET ${url.pathname} failed`);
}

function apiGet<T>(path: string, params: Record<string, string>, pacer: Pacer): Promise<T> {
	const url = new URL(path, SUPERCUT_API_BASE);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return getJson<T>(url, pacer, { Authorization: `Bearer ${apiToken()}` });
}

/** Every playlist visible to the token, public or not. Callers filter on `is_public`. */
export async function listPlaylists(pacer: Pacer): Promise<Playlist[]> {
	const items: Playlist[] = [];
	let cursor: string | null = null;
	do {
		const params: Record<string, string> = { limit: String(PAGE_SIZE) };
		if (cursor) params.cursor = cursor;
		const page: { data: { items: Playlist[]; next_cursor: string | null } } = await apiGet(
			"/v1/stacks",
			params,
			pacer,
		);
		items.push(...page.data.items);
		cursor = page.data.next_cursor;
	} while (cursor);
	return items;
}

/**
 * Recordings in one playlist. Note the cursor here is a *number* (an offset),
 * unlike the string cursors on the other list endpoints.
 */
export async function listPlaylistRecordings(
	playlistId: string,
	pacer: Pacer,
): Promise<PlaylistRecording[]> {
	const items: PlaylistRecording[] = [];
	let cursor: number | null = null;
	do {
		const params: Record<string, string> = { limit: String(PAGE_SIZE) };
		if (cursor !== null) params.cursor = String(cursor);
		const page: { data: { items: PlaylistRecording[]; next_cursor: number | null } } =
			await apiGet(`/v1/stacks/${encodeURIComponent(playlistId)}/recordings`, params, pacer);
		items.push(...page.data.items);
		cursor = page.data.next_cursor;
	} while (cursor !== null);
	return items;
}

export async function getRecording(publicId: string, pacer: Pacer): Promise<RecordingDetail> {
	const res: { data: RecordingDetail } = await apiGet(
		`/v1/recordings/${encodeURIComponent(publicId)}`,
		{},
		pacer,
	);
	return res.data;
}

export function shareUrl(workspace: string, publicId: string): string {
	return `${SUPERCUT_SITE}/share/${workspace}/${publicId}`;
}

export function embedUrl(workspace: string, publicId: string): string {
	return `${SUPERCUT_SITE}/embed/${workspace}/${publicId}`;
}

/**
 * Supercut's public oEmbed document for a share URL. Needs no auth. Returns the
 * embed snippet (`html`) and a durable, publicly cacheable thumbnail
 * (`thumbnail_url` on meta.supercut.ai) — the REST API offers neither; its
 * `/frame` endpoint only returns signed, expiring URLs.
 *
 * Share URLs may 302 to a newer version id, but oEmbed resolves the API
 * `public_id` directly, so always pass that one.
 */
export async function getOEmbed(
	workspace: string,
	publicId: string,
	pacer: Pacer,
): Promise<OEmbed> {
	const url = new URL("/oembed", SUPERCUT_SITE);
	url.searchParams.set("url", shareUrl(workspace, publicId));
	url.searchParams.set("format", "json");
	return getJson<OEmbed>(url, pacer, {});
}
