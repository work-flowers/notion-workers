import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { RECORDING_ID_PROPERTY, syncEmbedBlocks, type EmbedTarget } from "./body.js";
import {
	embedUrl,
	getOEmbed,
	getRecording,
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

/** Public Supercut playlists, as multi-select options. See the schema note below. */
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
			// survived). Every public playlist must be listed; a new playlist needs
			// an entry here and a redeploy. `collectPublicRecordings` warns when it
			// meets a name that is missing.
			Playlists: Schema.multiSelect(
				PLAYLIST_OPTIONS.map((name, i) => ({ name, color: PLAYLIST_COLORS[i % PLAYLIST_COLORS.length] })),
			),
			Owner: Schema.richText(),
			Summary: Schema.richText(),
			Chapters: Schema.richText(),
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

interface PublicRecording {
	listing: PlaylistRecording;
	playlists: Set<string>;
	detail?: RecordingDetail;
	oembed?: OEmbed;
}

worker.sync("recordingsSync", {
	database: recordings,
	// Replace mode: a recording that leaves every public playlist is swept from
	// Notion on the next run. The whole set is a handful of rows, so one batch.
	mode: "replace",
	schedule: "1h",
	execute: async () => {
		const found = await collectPublicRecordings();

		// Replace mode sweeps every row absent from the batch, so an empty batch
		// would archive the whole database. Zero public recordings is far more
		// likely to be a token that sees nothing (a workspace token returns 200
		// with no playlists for user-owned content) than a real empty set, so
		// fail loudly and leave the rows alone. If the set is ever legitimately
		// empty, pause the sync instead of relaxing this.
		if (found.size === 0) {
			throw new Error(
				"Supercut returned no recordings in public playlists — refusing to sweep the " +
					"database. Check SUPERCUT_API_TOKEN (a personal sk_u_ token is needed to see " +
					"user-owned playlists) and that at least one playlist is public.",
			);
		}

		// Body pass first: it only ever touches pages created by an earlier run,
		// so ordering relative to the upserts below does not matter, but doing it
		// first means a Notion outage fails the run before any rows move.
		const targets: EmbedTarget[] = [];
		for (const rec of found.values()) {
			if (rec.oembed?.html) targets.push({ recordingId: rec.listing.public_id, html: rec.oembed.html });
		}
		const body = await syncEmbedBlocks(targets, notionApi);
		console.log(
			body.skipped
				? "embed blocks: skipped (see warning above)"
				: `embed blocks: ${body.appended} appended, ${body.updated} updated, ` +
						`${body.unchanged} unchanged, ${body.missingPage} awaiting page creation ` +
						`(${body.pagesFound} pages in database)`,
		);

		const changes = [...found.values()].map(toChange);
		console.log(`recordings: ${changes.length} upserts from ${found.size} public recordings`);
		return { changes, hasMore: false, nextState: undefined };
	},
});

/** Every recording in at least one public playlist, with detail + oEmbed attached. */
async function collectPublicRecordings(): Promise<Map<string, PublicRecording>> {
	const playlists = (await listPlaylists(supercutApi)).filter((p) => p.is_public);
	console.log(`playlists: ${playlists.length} public — ${playlists.map((p) => p.name).join(", ")}`);
	for (const p of playlists) {
		if (!PLAYLIST_OPTIONS.includes(p.name)) {
			console.warn(
				`playlist "${p.name}" is not a declared Playlists option — its name will be dropped ` +
					"from every row until it is added to PLAYLIST_OPTIONS and the worker is redeployed.",
			);
		}
	}

	const found = new Map<string, PublicRecording>();
	for (const playlist of playlists) {
		for (const listing of await listPlaylistRecordings(playlist.public_id, supercutApi)) {
			const existing = found.get(listing.public_id);
			if (existing) existing.playlists.add(playlist.name);
			else found.set(listing.public_id, { listing, playlists: new Set([playlist.name]) });
		}
	}

	for (const rec of found.values()) {
		const id = rec.listing.public_id;
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
			console.warn(`recording ${id}: oEmbed fetch failed — ${(err as Error).message}`);
		}
	}
	return found;
}

function toChange(rec: PublicRecording) {
	const { listing, detail, oembed } = rec;
	const id = listing.public_id;
	const workspace = listing.workspace_safename;
	const durationMs = detail?.duration_ms ?? listing.duration_ms;
	const thumbnail = oembed?.thumbnail_url;

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
			...(thumbnail ? { "Thumbnail URL": Builder.url(thumbnail) } : {}),
			...(durationMs != null ? { "Duration (s)": Builder.number(Math.round(durationMs / 1000)) } : {}),
			...(detail ? { Status: Builder.select(detail.status) } : {}),
			...(detail?.owner?.name ? { Owner: Builder.richText(detail.owner.name) } : {}),
			...(detail?.summary ? { Summary: Builder.richText(truncate(detail.summary)) } : {}),
			...(detail?.chapters?.length
				? { Chapters: Builder.richText(truncate(formatChapters(detail.chapters))) }
				: {}),
		},
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
