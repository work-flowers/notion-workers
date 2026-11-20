import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { syncPages } from "./pages.js";
import {
	bestThumbnail,
	getAnalytics,
	getVideos,
	listUploadIds,
	parseDuration,
	uploadsPlaylistId,
	watchUrl,
	type Video,
	type VideoAnalytics,
} from "./youtube.js";

const worker = new Worker();
export default worker;

/** The workFlowers channel, @work.flowers. */
const CHANNEL_ID = "UCbrz9V64Z2x5OBveDo5ee4w";
const VIDEO_ID_PROPERTY = "Video ID";
/**
 * Page icon: the image behind the workspace's `youtube` custom emoji. The SDK's
 * `Icon` has no custom-emoji variant, and an icon set over REST is wiped by the
 * next upsert (an upsert without `icon` clears it — seen 2026-11-20), so it is
 * set here as an image icon. `public.notion-static.com` URLs are public and
 * unsigned. Re-uploading the emoji gives a new URL: `GET /v1/custom_emojis`.
 */
const PAGE_ICON_URL =
	"https://s3-us-west-2.amazonaws.com/public.notion-static.com/070e2f91-438b-4c2c-9b8c-cc2b57e9f703/image.png";

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
//
// Every property below is written by the sync and is therefore read-only in
// Notion. The **Supercut Recording** relation is deliberately absent: it points
// at another worker's database, which `Schema.relation()` cannot do, so it is a
// hand-added column written by `pages.ts`. See CLAUDE.md.

const videos = worker.database("videos", {
	type: "managed",
	initialTitle: "YouTube Videos",
	primaryKeyProperty: VIDEO_ID_PROPERTY,
	schema: {
		databaseIcon: Builder.emojiIcon("📺"),
		properties: {
			Title: Schema.title(),
			[VIDEO_ID_PROPERTY]: Schema.richText(),
			URL: Schema.url(),
			"Published At": Schema.date(),
			"Privacy Status": Schema.select([
				{ name: "public", color: "green" },
				{ name: "unlisted", color: "purple" },
				{ name: "private", color: "gray" },
			]),
			"Duration (s)": Schema.number(),
			Views: Schema.number(),
			Likes: Schema.number(),
			Comments: Schema.number(),
			// YouTube Analytics API, lifetime, lagging about two days.
			"Watch Time (min)": Schema.number(),
			"Avg View Duration (s)": Schema.number(),
			"Avg % Viewed": Schema.number(),
		},
	},
});

// Notion's public API allows ~3 req/s per integration. Only the page pass uses it.
const notionApi = worker.pacer("notionApi", { allowedRequests: 3, intervalMs: 1_000 });

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

worker.sync("videosSync", {
	database: videos,
	// Replace mode: a video deleted from YouTube is swept on the next run. The
	// channel has a few dozen videos at most, so one batch.
	mode: "replace",
	schedule: "1d",
	execute: async () => {
		// Page pass first (relation + inline player). It only touches rows created
		// by an earlier run, and a Notion outage then fails the run before any
		// rows move.
		const pages = await syncPages(VIDEO_ID_PROPERTY, notionApi);
		if (pages.skipped) {
			console.warn(`page pass: skipped — ${pages.skipped}`);
		} else {
			const { links, players } = pages;
			if (links.skipped) console.warn(`supercut links: skipped — ${links.skipped}`);
			else
				console.log(
					`supercut links: ${links.set} set, ${links.unchanged} unchanged, ` +
						`${links.noMatch} with no Supercut row (${pages.rows} rows in database)`,
				);
			if (links.ambiguous.length > 0) {
				console.warn(
					`supercut links: more than one Supercut row has YouTube Video ID ` +
						`${links.ambiguous.join(", ")} — left unlinked`,
				);
			}
			console.log(
				`players: ${players.appended} appended, ${players.updated} updated, ${players.unchanged} unchanged`,
			);
		}

		const ids = await listUploadIds(uploadsPlaylistId(CHANNEL_ID));
		// An empty batch in replace mode archives every row. A channel that
		// suddenly has no uploads is far more likely to be a connection
		// authorised to the wrong channel than a real empty channel.
		if (ids.length === 0) {
			throw new Error(
				"YouTube returned no uploads — refusing to sweep the database. Check that " +
					"ZAPIER_YOUTUBE_CONNECTION_ID is authorised to the workFlowers channel.",
			);
		}
		const found = await getVideos(ids);

		// Analytics are an enrichment: if the report fails, the row still syncs
		// and the three analytics columns are left out of the upsert, so the last
		// known values stay.
		let analytics: Map<string, VideoAnalytics> | undefined;
		try {
			const start = found.map((v) => v.snippet.publishedAt.slice(0, 10)).sort()[0];
			analytics = await getAnalytics(start, new Date().toISOString().slice(0, 10));
		} catch (err) {
			console.warn(`analytics: report failed, columns left unchanged — ${(err as Error).message}`);
		}

		const changes = found.map((v) => toChange(v, analytics));
		const counts = countBy(found.map((v) => v.status.privacyStatus));
		console.log(
			`videos: ${changes.length} upserts (${Object.entries(counts)
				.map(([k, n]) => `${n} ${k}`)
				.join(", ")}); analytics for ${analytics ? analytics.size : "none"}`,
		);
		return { changes, hasMore: false, nextState: undefined };
	},
});

function toChange(video: Video, analytics: Map<string, VideoAnalytics> | undefined) {
	const { id, snippet, statistics } = video;
	const duration = parseDuration(video.contentDetails.duration);
	const thumbnail = bestThumbnail(video);
	const count = (s: string | undefined) => (s === undefined ? undefined : Number(s));
	const stats = {
		Views: count(statistics.viewCount),
		Likes: count(statistics.likeCount),
		Comments: count(statistics.commentCount),
	};
	// A video absent from a successful report had no views in the range.
	const a = analytics ? (analytics.get(id) ?? { watchMinutes: 0, averageViewSeconds: 0, averageViewPercentage: 0 }) : undefined;

	return {
		type: "upsert" as const,
		// Must be byte-identical to the value written into VIDEO_ID_PROPERTY.
		key: id,
		properties: {
			Title: Builder.title(snippet.title || id),
			[VIDEO_ID_PROPERTY]: Builder.richText(id),
			URL: Builder.url(watchUrl(id)),
			"Published At": Builder.dateTime(snippet.publishedAt),
			"Privacy Status": Builder.select(video.status.privacyStatus),
			...(duration !== undefined ? { "Duration (s)": Builder.number(duration) } : {}),
			...Object.fromEntries(
				Object.entries(stats)
					.filter((e): e is [string, number] => e[1] !== undefined)
					.map(([k, n]) => [k, Builder.number(n)]),
			),
			...(a
				? {
						"Watch Time (min)": Builder.number(a.watchMinutes),
						"Avg View Duration (s)": Builder.number(a.averageViewSeconds),
						"Avg % Viewed": Builder.number(a.averageViewPercentage),
					}
				: {}),
		},
		icon: Builder.imageIcon(PAGE_ICON_URL),
		...(thumbnail ? { cover: Builder.imageCover(thumbnail) } : {}),
	};
}

function countBy(values: string[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const v of values) out[v] = (out[v] ?? 0) + 1;
	return out;
}
