/**
 * YouTube Data API v3 and YouTube Analytics API v2, called through the Zapier
 * SDK's `fetch` so Zapier injects the OAuth token of the YouTube connection.
 *
 * **Every `sdk.fetch` is one Zapier task** (billed from 2026-12-01), so the
 * request count per run is the cost: one `playlistItems` page and one
 * `videos.list` call per 50 videos, plus one Analytics report — three calls for
 * the 14 videos the channel had in November 2026. Keep it that way: no
 * per-video requests, and never `search.list` (100 quota units a call, and it
 * misses unlisted videos).
 */
import { createZapierSdk } from "@zapier/zapier-sdk";

const DATA_API = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";
/** Data API maximum for both `playlistItems.list` and `videos.list?id=`. */
const PAGE_SIZE = 50;
/** Analytics API maximum for a `dimensions=video` report. */
const ANALYTICS_PAGE_SIZE = 200;

let sdk: ReturnType<typeof createZapierSdk> | undefined;

/**
 * A Worker runs headless, so there is no browser for the usual Zapier login: it
 * authenticates with client credentials (`npx zapier-sdk create-client-credentials`)
 * stored as Worker env vars.
 */
function zapier(): ReturnType<typeof createZapierSdk> {
	if (sdk) return sdk;
	const clientId = process.env.ZAPIER_CLIENT_ID;
	const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error("ZAPIER_CLIENT_ID and ZAPIER_CLIENT_SECRET must be set");
	}
	sdk = createZapierSdk({ credentials: { clientId, clientSecret } });
	return sdk;
}

function connectionId(): string {
	const id = process.env.ZAPIER_YOUTUBE_CONNECTION_ID;
	if (!id) throw new Error("ZAPIER_YOUTUBE_CONNECTION_ID must be set");
	return id;
}

/** One Zapier task. Throws with the upstream body on any non-2xx. */
async function youtubeGet<T>(url: URL): Promise<T> {
	const res = await zapier().fetch(url.toString(), {
		method: "GET",
		connection: connectionId(),
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		const body = (await res.text().catch(() => "")).slice(0, 500);
		throw new Error(`YouTube GET ${url.host}${url.pathname} → ${res.status}: ${body}`);
	}
	return (await res.json()) as T;
}

/**
 * A channel's uploads playlist is its id with the `UC` prefix swapped for `UU`.
 * Deriving it saves the `channels.list` call (one task a day). Google has kept
 * this mapping stable for over a decade; if it ever changes, `playlistItems`
 * answers 404 and the run fails loudly rather than syncing nothing.
 */
export function uploadsPlaylistId(channelId: string): string {
	if (!channelId.startsWith("UC")) throw new Error(`unexpected channel id ${channelId}`);
	return `UU${channelId.slice(2)}`;
}

/**
 * Every video id in the uploads playlist. Through the authenticated owner's
 * connection this includes unlisted and private videos, which a public listing
 * or `search.list` would not.
 */
export async function listUploadIds(playlistId: string): Promise<string[]> {
	const ids: string[] = [];
	let pageToken: string | undefined;
	do {
		const url = new URL(`${DATA_API}/playlistItems`);
		url.searchParams.set("part", "contentDetails");
		url.searchParams.set("playlistId", playlistId);
		url.searchParams.set("maxResults", String(PAGE_SIZE));
		if (pageToken) url.searchParams.set("pageToken", pageToken);
		const page = await youtubeGet<{
			items: { contentDetails: { videoId: string } }[];
			nextPageToken?: string | null;
		}>(url);
		ids.push(...page.items.map((i) => i.contentDetails.videoId));
		pageToken = page.nextPageToken ?? undefined;
	} while (pageToken);
	return ids;
}

export interface Video {
	id: string;
	snippet: {
		publishedAt: string;
		title: string;
		thumbnails?: Record<string, { url: string; width?: number; height?: number }>;
	};
	contentDetails: { duration: string };
	status: { privacyStatus: "public" | "unlisted" | "private"; uploadStatus?: string };
	/** Counts arrive as strings. `likeCount` is absent when likes are hidden. */
	statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
}

/** Details and statistics for the given ids, 50 per call. */
export async function getVideos(ids: string[]): Promise<Video[]> {
	const videos: Video[] = [];
	for (let i = 0; i < ids.length; i += PAGE_SIZE) {
		const url = new URL(`${DATA_API}/videos`);
		url.searchParams.set("part", "snippet,contentDetails,statistics,status");
		url.searchParams.set("id", ids.slice(i, i + PAGE_SIZE).join(","));
		url.searchParams.set("maxResults", String(PAGE_SIZE));
		const page = await youtubeGet<{ items: Video[] }>(url);
		videos.push(...page.items);
	}
	return videos;
}

export interface VideoAnalytics {
	/** `estimatedMinutesWatched`, all time. */
	watchMinutes: number;
	/** `averageViewDuration`, seconds. */
	averageViewSeconds: number;
	/** `averageViewPercentage`, 0–100. */
	averageViewPercentage: number;
}

/**
 * Lifetime analytics for every video on the channel, in one report (one task
 * per 200 videos). A video with no views in the range is simply absent from
 * the rows. Figures lag by about two days.
 */
export async function getAnalytics(startDate: string, endDate: string): Promise<Map<string, VideoAnalytics>> {
	const result = new Map<string, VideoAnalytics>();
	for (let startIndex = 1; ; startIndex += ANALYTICS_PAGE_SIZE) {
		const url = new URL(`${ANALYTICS_API}/reports`);
		url.searchParams.set("ids", "channel==MINE");
		url.searchParams.set("startDate", startDate);
		url.searchParams.set("endDate", endDate);
		url.searchParams.set("metrics", "estimatedMinutesWatched,averageViewDuration,averageViewPercentage");
		url.searchParams.set("dimensions", "video");
		// A `video` dimension report must be sorted and capped at 200 rows.
		url.searchParams.set("sort", "-estimatedMinutesWatched");
		url.searchParams.set("maxResults", String(ANALYTICS_PAGE_SIZE));
		url.searchParams.set("startIndex", String(startIndex));
		const report = await youtubeGet<{
			columnHeaders: { name: string }[];
			rows?: (string | number)[][];
		}>(url);

		const col = (name: string) => {
			const i = report.columnHeaders.findIndex((h) => h.name === name);
			if (i < 0) throw new Error(`Analytics report has no ${name} column`);
			return i;
		};
		const [video, minutes, avgDuration, avgPercent] = [
			col("video"),
			col("estimatedMinutesWatched"),
			col("averageViewDuration"),
			col("averageViewPercentage"),
		];
		const rows = report.rows ?? [];
		for (const row of rows) {
			result.set(String(row[video]), {
				watchMinutes: Number(row[minutes]),
				averageViewSeconds: Number(row[avgDuration]),
				averageViewPercentage: Number(row[avgPercent]),
			});
		}
		if (rows.length < ANALYTICS_PAGE_SIZE) return result;
	}
}

/** ISO 8601 duration (`PT1H2M3S`, `P1DT2H`) to whole seconds. */
export function parseDuration(iso: string): number | undefined {
	const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
	if (!m) return undefined;
	const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
	return ((d * 24 + h) * 60 + min) * 60 + s;
}

export function watchUrl(id: string): string {
	return `https://www.youtube.com/watch?v=${id}`;
}

/** Largest thumbnail available; `maxres` only exists for HD uploads. */
export function bestThumbnail(video: Video): string | undefined {
	const t = video.snippet.thumbnails ?? {};
	return (t.maxres ?? t.standard ?? t.high ?? t.medium ?? t.default)?.url;
}
