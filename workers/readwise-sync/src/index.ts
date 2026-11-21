import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import {
	fetchHighlightBooks,
	fetchTrackerBooks,
	type HighlightBook,
	matchBooks,
	type TrackerBook,
} from "./readwise.js";
import { relinkHighlights } from "./relink.js";

const worker = new Worker();
export default worker;

// Readwise stores reading dates as local midnight in UTC (16:00Z for
// Singapore). Converting in this zone recovers the calendar date shown in the
// Readwise app; Goodreads imports (00:00Z) land on the same date too.
const READER_TIME_ZONE = "Asia/Singapore";

const SHELVES = {
	unsorted: "Unsorted",
	want_to_read: "Want to Read",
	currently_reading: "Currently Reading",
	finished: "Finished",
	did_not_finish: "Did Not Finish",
} as const;

// Select options must be declared up front, and an undeclared value would be
// dropped, so anything outside these lists is written as "other".
const ORIGINS = [
	"goodreads",
	"kindle",
	"api",
	"bookstore_ebook",
	"uploaded_ebook",
	"bookwise",
	"other",
] as const;
const SOURCES = [
	"kindle",
	"kobo",
	"bookwise",
	"reader",
	"manual",
	"native",
	"other",
] as const;

const books = worker.database("readwiseBooks", {
	type: "managed",
	initialTitle: "Readwise Library",
	primaryKeyProperty: "Book ID",
	schema: {
		properties: {
			Title: Schema.title(),
			// Tracker book id, or "h<highlights id>" for a highlighted book
			// that isn't in the tracker.
			"Book ID": Schema.richText(),
			Author: Schema.richText(),
			// From the Readwise Books tracker.
			Shelf: Schema.select(Object.values(SHELVES).map((name) => ({ name }))),
			Started: Schema.date(),
			Finished: Schema.date(),
			Rating: Schema.number(),
			Review: Schema.richText(),
			Progress: Schema.number("percent"),
			Pages: Schema.number(),
			Published: Schema.date(),
			ISBN: Schema.richText(),
			ASIN: Schema.richText(),
			Origin: Schema.select(ORIGINS.map((name) => ({ name }))),
			Private: Schema.checkbox(),
			"Book URL": Schema.url(),
			"Updated in Readwise": Schema.date(),
			// From Readwise highlights, when the book has any.
			"Readwise ID": Schema.richText(),
			Highlights: Schema.number(),
			"Last Highlight": Schema.date(),
			Source: Schema.select(SOURCES.map((name) => ({ name }))),
			Tags: Schema.richText(),
			"Document Note": Schema.richText(),
			"Readwise URL": Schema.url(),
			"Source URL": Schema.url(),
		},
	},
});

const localDate = new Intl.DateTimeFormat("en-CA", {
	timeZone: READER_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

function dateProp(name: string, iso: string | null | undefined) {
	return iso ? { [name]: Builder.date(localDate.format(new Date(iso))) } : {};
}

function oneOf<T extends string>(list: readonly T[], value: string | null | undefined): T {
	return list.find((v) => v === value) ?? list[list.length - 1];
}

function highlightProps(h: HighlightBook) {
	return {
		"Readwise ID": Builder.richText(String(h.id)),
		Highlights: Builder.number(h.num_highlights),
		...(h.last_highlight_at
			? { "Last Highlight": Builder.dateTime(h.last_highlight_at) }
			: {}),
		Source: Builder.select(oneOf(SOURCES, h.source)),
		Tags: Builder.richText(h.tags.map((t) => t.name).join(", ")),
		"Document Note": Builder.richText(h.document_note ?? ""),
		"Readwise URL": Builder.url(h.highlights_url),
		...(h.source_url ? { "Source URL": Builder.url(h.source_url) } : {}),
	};
}

function coverAndIcon(url: string | null | undefined) {
	return url
		? { cover: Builder.imageCover(url), icon: Builder.imageIcon(url) }
		: { icon: Builder.emojiIcon("📕") };
}

function trackerChange(b: TrackerBook, h: HighlightBook | undefined) {
	const key = String(b.id);
	const p = b.product;
	const asin = h?.asin ?? p?.asin;
	const pages = p?.page_count ?? b.manual_total_pages;
	const updated = b.updated ?? h?.updated;
	return {
		type: "upsert" as const,
		key,
		...coverAndIcon(p?.cover_url ?? h?.cover_image_url),
		properties: {
			Title: Builder.title(b.title || "Untitled"),
			"Book ID": Builder.richText(key),
			Author: Builder.richText(b.author ?? p?.author ?? ""),
			...(b.status in SHELVES
				? { Shelf: Builder.select(SHELVES[b.status as keyof typeof SHELVES]) }
				: {}),
			...dateProp("Started", b.started_reading_at),
			...dateProp("Finished", b.finished_reading_at),
			...(b.rating != null ? { Rating: Builder.number(b.rating) } : {}),
			Review: Builder.richText(b.review ?? ""),
			...(b.progress != null ? { Progress: Builder.number(b.progress) } : {}),
			...(pages != null ? { Pages: Builder.number(pages) } : {}),
			...(p?.publishing_date ? { Published: Builder.date(p.publishing_date) } : {}),
			ISBN: Builder.richText(p?.isbn ?? ""),
			ASIN: Builder.richText(asin ?? ""),
			Origin: Builder.select(oneOf(ORIGINS, b.creation_origin)),
			Private: Builder.checkbox(b.is_private),
			...(p?.store_url ? { "Book URL": Builder.url(p.store_url) } : {}),
			...(updated ? { "Updated in Readwise": Builder.dateTime(updated) } : {}),
			...(h ? highlightProps(h) : {}),
		},
	};
}

function highlightOnlyChange(h: HighlightBook) {
	const key = `h${h.id}`;
	return {
		type: "upsert" as const,
		key,
		...coverAndIcon(h.cover_image_url),
		properties: {
			Title: Builder.title(h.title || "Untitled"),
			"Book ID": Builder.richText(key),
			Author: Builder.richText(h.author ?? ""),
			ASIN: Builder.richText(h.asin ?? ""),
			...(h.updated ? { "Updated in Readwise": Builder.dateTime(h.updated) } : {}),
			...highlightProps(h),
		},
	};
}

async function buildChanges() {
	const [tracker, highlights] = await Promise.all([
		fetchTrackerBooks(),
		fetchHighlightBooks(),
	]);
	const live = tracker
		.filter((b) => b.status !== "deleted")
		.sort((a, b) => a.id - b.id);
	const { byTrackerId, unmatched } = matchBooks(live, highlights);
	return [
		...live.map((b) => trackerChange(b, byTrackerId.get(b.id))),
		...unmatched.sort((a, b) => a.id - b.id).map(highlightOnlyChange),
	];
}

// Notion API allows ~3 requests/second per integration.
const notionApi = worker.pacer("notionApi", {
	allowedRequests: 3,
	intervalMs: 1_000,
});

const CHUNK = 250;

// Replace mode. Every call refetches both Readwise lists (3 requests) and
// returns the next CHUNK of changes, in a stable order, so no call carries
// the whole library in its state. Books missing from the cycle (deleted in
// Readwise, or moved to the "deleted" shelf) are removed at the end.
//
// After the last chunk the cycle continues with `relink` calls that set the
// hand-added "Highlights Page" relation (see relink.ts). A batch's upserts
// are only written after `execute` returns, so relinking has to run in a
// later call than the batch it links, never at the top of the same one.
worker.sync("readwiseBooksSync", {
	database: books,
	mode: "replace",
	schedule: "6h",
	execute: async (state: { offset?: number; relink?: boolean } | undefined) => {
		if (state?.relink) {
			const left = await relinkHighlights(notionApi.wait);
			return {
				changes: [],
				hasMore: left > 0,
				nextState: left > 0 ? { relink: true } : undefined,
			};
		}
		const offset = state?.offset ?? 0;
		const all = await buildChanges();
		const next = offset + CHUNK;
		return {
			changes: all.slice(offset, next),
			hasMore: true,
			nextState: next < all.length ? { offset: next } : { relink: true },
		};
	},
});
