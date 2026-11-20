import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { RECORDING_ID_PROPERTY, syncEmbedBlocks, type EmbedTarget } from "./body.js";
import {
	embedUrl,
	getOEmbed,
	getRecording,
	listOwnedRecordings,
	listPlaylistRecordings,
	listPlaylists,
	shareUrl,
	type Chapter,
	type OEmbed,
	type PlaylistRecording,
	type RecordingDetail,
} from "./supercut.js";

const worker = new Worker();
export default worker;

/** Notion caps a rich_text property at 2000 chars; leave headroom for the ellipsis. */
const MAX_RICH_TEXT = 1_900;

/**
 * Public Supercut topic playlists, as multi-select options. See the schema
 * note below. The Website gate playlist is deliberately not one of them.
 */
const PLAYLIST_OPTIONS = [
	"Dashboards & Custom UI",
	"Zapier Error Triage & Dev",
	"Zapier Automations",
	"Notion Workspace & CRM",
	"Notion AI Agents",
];
const PLAYLIST_COLORS = ["blue", "red", "orange", "green", "purple", "pink", "yellow", "brown", "gray"] as const;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
//
// Every property below is written by the sync and is therefore read-only in
// Notion. Anything a person needs to edit (a publish flag for Bullet, notes)
// must be added to the data source by hand and left undeclared here — see
// CLAUDE.md.

/**
 * Page icon for every row: the Supercut logo. The workspace has it as a custom
 * emoji, but the Workers SDK can only set emoji, Notion built-in or image-URL
 * icons, so this is logo.dev's image (a publishable `pk_` key, safe in source).
 */
const SUPERCUT_ICON_URL = "https://img.logo.dev/supercut.ai?token=pk_MgvuyiQuRe6IT_XWNAUgrA";

const recordings = worker.database("recordings", {
	type: "managed",
	initialTitle: "Supercut Recordings",
	primaryKeyProperty: RECORDING_ID_PROPERTY,
	schema: {
		databaseIcon: Builder.emojiIcon("🎬"),
		properties: {
			Name: Schema.title(),
			[RECORDING_ID_PROPERTY]: Schema.richText(),
			"Share URL": Schema.url(),
			"Embed URL": Schema.url(),
			"Thumbnail URL": Schema.url(),
			"Recorded At": Schema.date(),
			"Duration (s)": Schema.number(),
			Status: Schema.select([
				{ name: "pending", color: "gray" },
				{ name: "processing", color: "yellow" },
				{ name: "completed", color: "green" },
				{ name: "failed", color: "red" },
			]),
			// A multi-select value whose option is not declared here is silently
			// dropped on write (observed 2026-09-03: only the one seeded option
			// survived). Every public topic playlist must be listed; a new one needs
			// an entry here and a redeploy. `collectRecordings` warns when it
			// meets a name that is missing.
			Playlists: Schema.multiSelect(
				PLAYLIST_OPTIONS.map((name, i) => ({ name, color: PLAYLIST_COLORS[i % PLAYLIST_COLORS.length] })),
			),
			Owner: Schema.richText(),
			Summary: Schema.richText(),
			Chapters: Schema.richText(),
			// True when the recording is in the Website playlist. The database is
			// private and holds every recording; if it is ever published again,
			// filter on this or client and throwaway videos reach the site.
			"On Website": Schema.checkbox(),
			// All-time viewership from the `analytics` block on /recordings/{id}.
			Visits: Schema.number(),
			"Unique Visits": Schema.number(),
			Plays: Schema.number(),
			"Unique Plays": Schema.number(),
		},
	},
});

// ---------------------------------------------------------------------------
// Pacers
// ---------------------------------------------------------------------------

// Supercut documents no rate limit but does return 429s; stay well inside.
const supercutApi = worker.pacer("supercutApi", { allowedRequests: 60, intervalMs: 60_000 });

// Notion's public API allows ~3 req/s per integration.
const notionApi = worker.pacer("notionApi", { allowedRequests: 3, intervalMs: 1_000 });

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

interface SyncedRecording {
	listing: PlaylistRecording;
	onWebsite: boolean;
	playlists: Set<string>;
	detail?: RecordingDetail;
	oembed?: OEmbed;
}

worker.sync("recordingsSync", {
	database: recordings,
	// Replace mode: a recording deleted in Supercut is swept from Notion on the
	// next run. The whole set is a few dozen rows, so one batch.
	mode: "replace",
	schedule: "1d",
	execute: async () => {
		const found = await collectRecordings();

		// Replace mode sweeps every row absent from the batch, so an empty batch
		// would archive the whole database. No recordings at all is far more
		// likely to be a token that sees nothing (a workspace token returns 200
		// with no items for user-owned content) than a real empty library, so
		// fail loudly and leave the rows alone.
		if (found.size === 0) {
			throw new Error(
				"Supercut returned no recordings — refusing to sweep the database. Check " +
					"SUPERCUT_API_TOKEN (a personal sk_u_ token is needed to see user-owned recordings).",
			);
		}

		// Body pass first: it only ever touches pages created by an earlier run,
		// so ordering relative to the upserts below does not matter, but doing it
		// first means a Notion outage fails the run before any rows move.
		const targets: EmbedTarget[] = [...found.values()].map((rec) => ({
			recordingId: rec.listing.public_id,
			url: embedUrl(rec.listing.workspace_safename, rec.listing.public_id),
		}));
		const body = await syncEmbedBlocks(targets, notionApi);
		console.log(
			body.skipped
				? "embed blocks: skipped (see warning above)"
				: `embed blocks: ${body.appended} appended, ${body.updated} updated, ` +
						`${body.removed} old code blocks removed, ` +
						`${body.unchanged} unchanged, ${body.missingPage} awaiting page creation ` +
						`(${body.pagesFound} pages in database)`,
		);

		const changes = [...found.values()].map(toChange);
		const onWebsite = [...found.values()].filter((r) => r.onWebsite).length;
		console.log(`recordings: ${changes.length} upserts (${onWebsite} on the Website playlist)`);
		return { changes, hasMore: false, nextState: undefined };
	},
});

/**
 * Every recording the token's user owns, flagged with whether it is in the
 * Website playlist and tagged with the public topic playlists it belongs to,
 * with detail + oEmbed attached.
 *
 * The Website playlist no longer decides which rows exist (it did until
 * 2026-11-20); it only sets `On Website`, which is what Bullet filters on. The
 * topic playlists only supply the Playlists category.
 */
async function collectRecordings(): Promise<Map<string, SyncedRecording>> {
	const websiteId = websitePlaylistId();
	const all = await listPlaylists(supercutApi);

	const website = all.find((p) => p.public_id === websiteId);
	if (!website) {
		throw new Error(
			`WEBSITE_PLAYLIST_ID ${websiteId} is not among the ${all.length} playlists the token ` +
				"can see — it was deleted, or SUPERCUT_API_TOKEN is not the personal token of its owner.",
		);
	}
	if (!website.is_public) {
		console.warn(
			`playlist "${website.name}" (the Website gate) is not public — make it public in Supercut ` +
				"so its recordings' embeds and share links are viewable on the site.",
		);
	}

	const found = new Map<string, SyncedRecording>();
	for (const listing of await listOwnedRecordings(supercutApi)) {
		found.set(listing.public_id, { listing, onWebsite: false, playlists: new Set() });
	}
	const owned = found.size;

	// A Website recording someone else owns is not in the owned list; add it so
	// the site never loses a video it was publishing.
	for (const listing of await listPlaylistRecordings(website.public_id, supercutApi)) {
		const rec = found.get(listing.public_id);
		if (rec) rec.onWebsite = true;
		else found.set(listing.public_id, { listing, onWebsite: true, playlists: new Set() });
	}

	const topics = all.filter((p) => p.is_public && p.public_id !== websiteId);
	console.log(
		`recordings: ${owned} owned, ${found.size - owned} more from the Website playlist; ` +
			`${topics.length} public topic playlists — ${topics.map((p) => p.name).join(", ")}`,
	);
	for (const p of topics) {
		if (!PLAYLIST_OPTIONS.includes(p.name)) {
			console.warn(
				`playlist "${p.name}" is not a declared Playlists option — its name will be dropped ` +
					"from every row until it is added to PLAYLIST_OPTIONS and the worker is redeployed.",
			);
		}
	}
	for (const topic of topics) {
		for (const listing of await listPlaylistRecordings(topic.public_id, supercutApi)) {
			found.get(listing.public_id)?.playlists.add(topic.name);
		}
	}

	const oembedFailures: string[] = [];
	for (const rec of found.values()) {
		const id = rec.listing.public_id;
		if (rec.onWebsite && rec.playlists.size === 0) {
			console.warn(
				`recording ${id} ("${rec.listing.title}") is in the Website playlist but no public ` +
					"topic playlist — it will sync with an empty Playlists category.",
			);
		}
		const workspace = rec.listing.workspace_safename;
		// Neither enrichment is load-bearing for the row itself: a failure here
		// logs and degrades to the listing data rather than failing the run.
		try {
			rec.detail = await getRecording(id, supercutApi);
		} catch (err) {
			console.warn(`recording ${id}: detail fetch failed — ${(err as Error).message}`);
		}
		try {
			rec.oembed = await getOEmbed(workspace, id, supercutApi);
		} catch (err) {
			// oEmbed is unauthenticated, so it may fail for private recordings;
			// summarise once instead of warning per row.
			oembedFailures.push(`${id} (${(err as Error).message.slice(0, 80)})`);
		}
	}
	if (oembedFailures.length > 0) {
		console.warn(
			`oEmbed failed for ${oembedFailures.length} recordings — no thumbnail or cover for them: ` +
				oembedFailures.join("; "),
		);
	}
	return found;
}

function websitePlaylistId(): string {
	const id = process.env.WEBSITE_PLAYLIST_ID;
	if (!id) throw new Error("WEBSITE_PLAYLIST_ID environment variable is not set");
	return id;
}

function toChange(rec: SyncedRecording) {
	const { listing, detail, oembed } = rec;
	const id = listing.public_id;
	const workspace = listing.workspace_safename;
	const durationMs = detail?.duration_ms ?? listing.duration_ms;
	const thumbnail = oembed?.thumbnail_url;
	// The owned list carries analytics too, so a failed detail fetch still has counts.
	const analytics = detail?.analytics ?? listing.analytics;

	return {
		type: "upsert" as const,
		// Must be byte-identical to the value written into RECORDING_ID_PROPERTY —
		// the platform resolves `key` through that property's value.
		key: id,
		properties: {
			Name: Builder.title(detail?.title ?? listing.title ?? id),
			[RECORDING_ID_PROPERTY]: Builder.richText(id),
			"Share URL": Builder.url(shareUrl(workspace, id)),
			"Embed URL": Builder.url(embedUrl(workspace, id)),
			"Recorded At": Builder.dateTime(listing.created_at),
			Playlists: Builder.multiSelect(...[...rec.playlists].sort()),
			"On Website": Builder.checkbox(rec.onWebsite),
			...(thumbnail ? { "Thumbnail URL": Builder.url(thumbnail) } : {}),
			...(durationMs != null ? { "Duration (s)": Builder.number(Math.round(durationMs / 1000)) } : {}),
			...(detail ? { Status: Builder.select(detail.status) } : {}),
			...(detail?.owner?.name ? { Owner: Builder.richText(detail.owner.name) } : {}),
			...(detail?.summary ? { Summary: Builder.richText(truncate(detail.summary)) } : {}),
			...(detail?.chapters?.length
				? { Chapters: Builder.richText(truncate(formatChapters(detail.chapters))) }
				: {}),
			// Absent when the token lacks analytics access: leave the last known
			// counts in place rather than zeroing them.
			...(analytics
				? {
						Visits: Builder.number(analytics.visits.total),
						"Unique Visits": Builder.number(analytics.visits.unique),
						Plays: Builder.number(analytics.plays.total),
						"Unique Plays": Builder.number(analytics.plays.unique),
					}
				: {}),
		},
		icon: Builder.imageIcon(SUPERCUT_ICON_URL),
		...(thumbnail ? { cover: Builder.imageCover(thumbnail) } : {}),
		// Deliberately no `pageContentMarkdown`: it would replace the page body
		// and wipe the captioned embed block that body.ts maintains.
	};
}

function formatChapters(chapters: Chapter[]): string {
	return chapters.map((c) => `${formatTimestamp(c.start_ms)} ${c.title}`).join("\n");
}

function formatTimestamp(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	return hours > 0 ? `${hours}:${mmss}` : mmss;
}

function truncate(text: string): string {
	return text.length > MAX_RICH_TEXT ? `${text.slice(0, MAX_RICH_TEXT)}…` : text;
}
