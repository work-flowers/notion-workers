import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { relinkHighlights } from "./relink.js";

const worker = new Worker();
export default worker;

// Readwise sources seen in the library. A source outside this list is written
// as "other": select options must be declared up front, and an undeclared
// value would be dropped.
const SOURCES = [
	"kindle",
	"kobo",
	"bookwise",
	"reader",
	"manual",
	"native",
	"other",
] as const;

interface ReadwiseBook {
	id: number;
	title: string;
	author: string | null;
	category: string;
	source: string | null;
	num_highlights: number;
	last_highlight_at: string | null;
	updated: string | null;
	cover_image_url: string | null;
	highlights_url: string;
	source_url: string | null;
	asin: string | null;
	tags: { name: string }[];
	document_note: string | null;
}

interface ReadwiseBooksPage {
	count: number;
	next: string | null;
	results: ReadwiseBook[];
}

const books = worker.database("readwiseBooks", {
	type: "managed",
	initialTitle: "Readwise Library",
	primaryKeyProperty: "Readwise ID",
	schema: {
		properties: {
			Title: Schema.title(),
			"Readwise ID": Schema.richText(),
			Author: Schema.richText(),
			Source: Schema.select(SOURCES.map((name) => ({ name }))),
			Highlights: Schema.number(),
			"Last Highlight": Schema.date(),
			"Updated in Readwise": Schema.date(),
			Tags: Schema.richText(),
			"Document Note": Schema.richText(),
			ASIN: Schema.richText(),
			"Readwise URL": Schema.url(),
			"Source URL": Schema.url(),
		},
	},
});

function readwiseToken(): string {
	const token = process.env.READWISE_API_TOKEN;
	if (!token) {
		throw new Error(
			"READWISE_API_TOKEN is not set. Run `ntn workers env set READWISE_API_TOKEN=…`.",
		);
	}
	return token;
}

async function fetchPage(url: string): Promise<ReadwiseBooksPage> {
	const res = await fetch(url, {
		headers: { Authorization: `Token ${readwiseToken()}` },
	});
	if (!res.ok) {
		throw new Error(
			`Readwise ${url} failed: ${res.status} ${await res.text()}`,
		);
	}
	return (await res.json()) as ReadwiseBooksPage;
}

function toChange(book: ReadwiseBook) {
	const key = String(book.id);
	const source = SOURCES.find((s) => s === book.source) ?? "other";
	return {
		type: "upsert" as const,
		key,
		...(book.cover_image_url
			? {
					cover: Builder.imageCover(book.cover_image_url),
					icon: Builder.imageIcon(book.cover_image_url),
				}
			: { icon: Builder.emojiIcon("📕") }),
		properties: {
			Title: Builder.title(book.title || "Untitled"),
			"Readwise ID": Builder.richText(key),
			Author: Builder.richText(book.author ?? ""),
			Source: Builder.select(source),
			Highlights: Builder.number(book.num_highlights),
			...(book.last_highlight_at
				? { "Last Highlight": Builder.dateTime(book.last_highlight_at) }
				: {}),
			...(book.updated
				? { "Updated in Readwise": Builder.dateTime(book.updated) }
				: {}),
			Tags: Builder.richText(book.tags.map((t) => t.name).join(", ")),
			"Document Note": Builder.richText(book.document_note ?? ""),
			ASIN: Builder.richText(book.asin ?? ""),
			"Readwise URL": Builder.url(book.highlights_url),
			...(book.source_url
				? { "Source URL": Builder.url(book.source_url) }
				: {}),
		},
	};
}

// Notion API allows ~3 requests/second per integration.
const notionApi = worker.pacer("notionApi", {
	allowedRequests: 3,
	intervalMs: 1_000,
});

// Replace mode: each cycle pages through the whole books list (one page of
// 1000 covers the library today), and books missing from the cycle, e.g.
// deleted in Readwise, are removed from Notion at the end.
//
// After the last Readwise page the cycle continues with `relink` calls that
// set the hand-added "Highlights Page" relation (see relink.ts). A batch's
// upserts are only written after `execute` returns, so relinking has to run in
// a later call than the batch it links, never at the top of the same one.
worker.sync("readwiseBooksSync", {
	database: books,
	mode: "replace",
	schedule: "6h",
	execute: async (state: { next?: string; relink?: boolean } | undefined) => {
		if (state?.relink) {
			const left = await relinkHighlights(notionApi.wait);
			return {
				changes: [],
				hasMore: left > 0,
				nextState: left > 0 ? { relink: true } : undefined,
			};
		}
		const url =
			state?.next ??
			"https://readwise.io/api/v2/books/?category=books&page_size=1000";
		const page = await fetchPage(url);
		return {
			changes: page.results.map(toChange),
			hasMore: true,
			nextState: page.next ? { next: page.next } : { relink: true },
		};
	},
});
