// Two Readwise APIs, two book lists:
//  - Readwise Books (the reading tracker, /books/api/v1/books/): every book on
//    a shelf, with reading dates, rating and progress. Includes want-to-read
//    and Goodreads imports, most of which have no highlights.
//  - Readwise highlights (/api/v2/books/?category=books): only books that have
//    highlights, with counts and the highlights page link.

export interface TrackerBook {
	id: number;
	title: string;
	author: string | null;
	status:
		| "unsorted"
		| "want_to_read"
		| "currently_reading"
		| "finished"
		| "did_not_finish"
		| "deleted";
	is_private: boolean;
	creation_origin: string | null;
	progress: number | null;
	started_reading_at: string | null;
	finished_reading_at: string | null;
	status_changed_at: string | null;
	rating: number | null;
	review: string | null;
	manual_total_pages: number | null;
	product: {
		isbn: string | null;
		asin: string | null;
		author: string | null;
		publishing_date: string | null;
		page_count: number | null;
		cover_url: string | null;
		store_url: string | null;
	} | null;
	updated: string | null;
}

export interface HighlightBook {
	id: number;
	title: string;
	author: string | null;
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

function token(): string {
	const t = process.env.READWISE_API_TOKEN;
	if (!t) {
		throw new Error(
			"READWISE_API_TOKEN is not set. Run `ntn workers env set READWISE_API_TOKEN=…`.",
		);
	}
	return t;
}

async function getAll<T>(firstUrl: string): Promise<T[]> {
	const out: T[] = [];
	let url: string | null = firstUrl;
	while (url) {
		const res = await fetch(url, {
			headers: { Authorization: `Token ${token()}` },
		});
		if (!res.ok) {
			throw new Error(`Readwise ${url} failed: ${res.status} ${await res.text()}`);
		}
		const page = (await res.json()) as { next: string | null; results: T[] };
		out.push(...page.results);
		url = page.next;
	}
	return out;
}

export function fetchTrackerBooks(): Promise<TrackerBook[]> {
	return getAll<TrackerBook>("https://readwise.io/books/api/v1/books/?limit=1000");
}

export function fetchHighlightBooks(): Promise<HighlightBook[]> {
	return getAll<HighlightBook>(
		"https://readwise.io/api/v2/books/?category=books&page_size=1000",
	);
}

/** Lowercased title without subtitle, punctuation or a leading article. */
export function normTitle(s: string | null | undefined): string {
	return decodeEntities(s ?? "")
		.toLowerCase()
		.replace(/’/g, "'")
		.split(/[:(\[]/)[0]
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/^(the|a|an) /, "");
}

/** Surname of the first listed author: lists and name order differ between the two APIs. */
export function firstSurname(s: string | null | undefined): string {
	const first = decodeEntities(s ?? "").toLowerCase().split(/,| and /)[0];
	const words = first.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ");
	return words[words.length - 1] ?? "";
}

function decodeEntities(s: string): string {
	return s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"');
}

/**
 * Pairs each highlights book with at most one tracker book: by ASIN, then
 * title + first author's surname, then title alone when exactly one tracker
 * book has it. On ties a finished book wins. Returns tracker id → highlights
 * book, plus the highlights books that matched nothing.
 */
export function matchBooks(
	tracker: TrackerBook[],
	highlights: HighlightBook[],
): { byTrackerId: Map<number, HighlightBook>; unmatched: HighlightBook[] } {
	const byAsin = new Map<string, TrackerBook[]>();
	const byTitleAuthor = new Map<string, TrackerBook[]>();
	const byTitle = new Map<string, TrackerBook[]>();
	const add = (m: Map<string, TrackerBook[]>, k: string, b: TrackerBook) => {
		const list = m.get(k);
		if (list) list.push(b);
		else m.set(k, [b]);
	};
	for (const b of tracker) {
		if (b.product?.asin) add(byAsin, b.product.asin, b);
		add(byTitleAuthor, `${normTitle(b.title)}|${firstSurname(b.author)}`, b);
		add(byTitle, normTitle(b.title), b);
	}

	const byTrackerId = new Map<number, HighlightBook>();
	const unmatched: HighlightBook[] = [];
	for (const h of highlights) {
		let candidates =
			(h.asin && byAsin.get(h.asin)) ||
			byTitleAuthor.get(`${normTitle(h.title)}|${firstSurname(h.author)}`);
		if (!candidates) {
			const sameTitle = byTitle.get(normTitle(h.title));
			if (sameTitle?.length === 1) candidates = sameTitle;
		}
		const pick = candidates
			?.filter((b) => !byTrackerId.has(b.id))
			.sort((a, b) => Number(b.status === "finished") - Number(a.status === "finished"))[0];
		if (pick) byTrackerId.set(pick.id, h);
		else unmatched.push(h);
	}
	return { byTrackerId, unmatched };
}
