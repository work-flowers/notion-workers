/**
 * Fetch-and-parse module for the Lovable changelog.
 *
 * This is the fragile part of the Worker. It depends on the structure of
 * https://docs.lovable.dev/changelog.md — the machine-readable `.md` twin of
 * the changelog page (listed in https://docs.lovable.dev/llms.txt). The docs
 * are a Mintlify site, so the endpoint returns raw MDX whose entries are
 * `<Update label="…">…</Update>` blocks — the same shape as the Notion
 * developer changelog that `api-changelog-sync` parses, and far more stable
 * than scraping the JS-rendered HTML.
 *
 * Each `<Update>` block is a date. Within a block, every `### sub-heading` is a
 * distinct sub-entry → its own database row/page. A block with no heading
 * becomes a single row named by the date.
 *
 * Keep this module pure and network-free except for `fetch*`, and keep it covered
 * by src/changelog.test.ts (fixture-based) so a structure change fails loudly.
 * If parsing ever breaks, this file is the only thing that should need fixing.
 */

const SITE_ORIGIN = "https://docs.lovable.dev";

export const CHANGELOG_MD_URL = `${SITE_ORIGIN}/changelog.md`;
export const CHANGELOG_PAGE_URL = `${SITE_ORIGIN}/changelog`;

export interface ChangelogEntry {
	/** Unique, stable primary key: `<ISO date>#<ascii-section-slug>` (or just the date). */
	key: string;
	/** Verbatim `<Update label="…">` string, e.g. "Sep 25, 2026". */
	rawLabel: string;
	/** Label parsed to YYYY-MM-DD. Non-date labels are skipped, so always set. */
	entryDate: string;
	/** The `###` section heading (markdown-stripped); else the block's milestone description, else the date label. */
	name: string;
	/** Deep link to the heading's anchor on the live page, or the date's anchor. */
	url: string;
	/** Full section body as markdown (links absolutized, MDX components converted). May be empty. */
	bodyMarkdown: string;
}

const MONTH_NAMES = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
];

// Lovable writes three-letter months ("Sep 25, 2026"); full names and "Sept"
// are accepted too so a style change doesn't silently drop every entry.
const MONTHS: Record<string, string> = { sept: "09" };
MONTH_NAMES.forEach((name, i) => {
	const mm = String(i + 1).padStart(2, "0");
	MONTHS[name] = mm;
	MONTHS[name.slice(0, 3)] = mm;
});

// Non-greedy so a body can't swallow later blocks. `[^>]*` after the label
// tolerates extra attributes: milestone entries carry `description="Lovable 2.0"`.
const UPDATE_RE = /<Update\s+label="([^"]*)"([^>]*)>([\s\S]*?)<\/Update>/g;
// Sub-entries are split on `###` (h3) — the only heading level the changelog uses.
const SECTION_HEADING_RE = /^\s*###\s+(.+?)\s*$/;

/**
 * Parse a changelog label to an ISO date (YYYY-MM-DD), or null if it is not a
 * single clean "Mon D, YYYY" date. Anchored and full-string, so ranges or
 * prose labels return null and are skipped by the sync.
 */
export function parseLabelToISO(label: string): string | null {
	const m = /^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})$/.exec(label.trim());
	if (!m) return null;
	const month = MONTHS[m[1].toLowerCase()];
	if (!month) return null;
	return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

/**
 * Strip inline markdown down to readable plain text — for titles, not page
 * bodies. Unescapes markdown punctuation, turns links/inline-code into their
 * text, and removes bold/italic markers (many older headings are wrapped in
 * `**…**`). A lone `_` is kept, since it is usually part of an identifier.
 */
export function toPlainText(s: string): string {
	return s
		.replace(/\\([_*#.\-`~[\]()])/g, "$1") // unescape \_ \* \- etc.
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) / ![alt](src) -> text
		.replace(/`([^`]*)`/g, "$1") // `code` -> code
		.replace(/\*\*|__|\*/g, "") // bold / single-asterisk italic
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * ASCII slug used for the primary key: lowercase, any run of non-alphanumeric
 * characters collapsed to one hyphen. Deliberately *not* the page's anchor
 * format (see `anchorSlug`), whose smart quotes and `+`/`&`/`×` make poor keys.
 */
export function keySlug(heading: string): string {
	return toPlainText(heading)
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Mintlify's typographic quotes: `"x"` → “x”, `it's` → it’s. The rendered page
 * derives anchors from the smart-quoted text, so the slug has to as well.
 */
function smartQuotes(s: string): string {
	return s
		.replace(/(^|[\s([])"/g, "$1“")
		.replace(/"/g, "”")
		.replace(/(^|[\s([])'/g, "$1‘")
		.replace(/'/g, "’");
}

/**
 * Reproduce the anchor id Mintlify renders for a heading or date label, before
 * page-level de-duplication (see `AnchorCounter`). Lowercase, smart quotes
 * kept, `.` → `-`, other ASCII punctuation dropped, whitespace → `-`; `+`, `&`,
 * `/`, `@`, `×` and curly quotes survive.
 *
 * Derived empirically and verified against all 512 `<h3>` ids and 126 date ids
 * on the live page (2026-09-28), e.g.
 *   "App + chat connectors: Discord and …" → "app-+-chat-connectors-discord-and-…"
 *   "Redesigned \"People\" page"           → "redesigned-“people”-page"
 *   "Sep 25, 2026"                         → "sep-25-2026"
 */
export function anchorSlug(text: string): string {
	return smartQuotes(toPlainText(text))
		.toLowerCase()
		.replace(/[.,:;!?()[\]{}"'`]/g, (ch) => (ch === "." ? "-" : ""))
		.trim()
		.replace(/\s+/g, "-");
}

/**
 * Mintlify de-duplicates heading anchors across the whole page in document
 * order: the first "Improvements" is `#improvements`, the next
 * `#improvements-2`, and so on. Because the newest entry comes first, a new
 * "Improvements" section shifts every older one's anchor by one — so URLs of
 * repeated generic headings are not stable over time. That is harmless here:
 * the URL is part of the content hash, so a shifted anchor just re-upserts the
 * row with its corrected URL. The primary key never depends on it.
 */
class AnchorCounter {
	private seen = new Map<string, number>();
	next(base: string): string {
		const n = (this.seen.get(base) ?? 0) + 1;
		this.seen.set(base, n);
		return n === 1 ? base : `${base}-${n}`;
	}
}

interface Section {
	heading: string;
	content: string;
}

/** Split a block body into the preamble (before the first `###`) and its `###` sections. */
function splitSections(body: string): { preamble: string; sections: Section[] } {
	const preambleLines: string[] = [];
	const sections: Section[] = [];
	let current: { heading: string; lines: string[] } | null = null;
	for (const line of body.split("\n")) {
		const m = SECTION_HEADING_RE.exec(line);
		if (m) {
			if (current) {
				sections.push({ heading: current.heading, content: current.lines.join("\n") });
			}
			current = { heading: m[1], lines: [] };
		} else if (current) {
			current.lines.push(line);
		} else {
			preambleLines.push(line);
		}
	}
	if (current) {
		sections.push({ heading: current.heading, content: current.lines.join("\n") });
	}
	return { preamble: preambleLines.join("\n"), sections };
}

/** Read one attribute off a JSX/HTML tag string. */
function attr(tag: string, name: string): string | undefined {
	return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

/**
 * `<Note>…</Note>` and friends → a single-line blockquote. Notion turns every
 * `>` line into its own quote block, so paragraphs are joined with `<br><br>`
 * onto one line (the approach tested in packages/shared/src/markdown.ts).
 */
function admonitionToQuote(kind: string, inner: string): string {
	const paragraphs = inner
		.trim()
		.split(/\n\s*\n/)
		.map((p) =>
			p
				.split("\n")
				.map((l) => l.trim())
				.join(" "),
		)
		.filter((p) => p !== "");
	return `> **${kind}:** ${paragraphs.join("<br><br>")}`;
}

/**
 * Turn a raw `<Update>` body fragment into clean, renderable markdown for a page
 * body: strip the 2-space block indentation, convert Mintlify's MDX components
 * (`<Frame><img/></Frame>`, `<Note>`, `<Warning>`, `<br />`) to markdown, and
 * make root-relative links absolute so they resolve from inside Notion.
 * Markdown formatting (code, lists, bold, links) is deliberately preserved.
 *
 * NOT idempotent (the dedent removes two leading spaces) — call exactly once.
 */
export function cleanBodyMarkdown(raw: string): string {
	return (
		raw
			.replace(/^ {2}/gm, "") // dedent the 2-space <Update> indentation
			.replace(
				/<(Note|Warning|Tip|Info|Check)>([\s\S]*?)<\/\1>/g,
				(_m, kind: string, inner: string) => admonitionToQuote(kind, inner),
			)
			.replace(/<img\b[^>]*>/g, (tag) => {
				const src = attr(tag, "src");
				return src ? `![${attr(tag, "alt") ?? ""}](${src})` : "";
			})
			// Any other component wrapper on a line of its own (<Frame>, and
			// whatever Mintlify adds next): drop the tag, keep what it wraps.
			.replace(/^[ \t]*<\/?[A-Z][A-Za-z]*(\s[^>]*)?>[ \t]*$/gm, "")
			.replace(/<br\s*\/?>/g, "<br>")
			.replace(/\]\(\/(?!\/)/g, `](${SITE_ORIGIN}/`) // root-relative links -> absolute
			.replace(/^[ \t]+$/gm, "") // whitespace-only lines left by removed tags
			.replace(/\n{3,}/g, "\n\n") // collapse runs of blank lines
			.trim()
	);
}

const anchorUrl = (anchor: string): string => `${CHANGELOG_PAGE_URL}#${encodeURI(anchor)}`;

/**
 * Parse the raw changelog markdown into entries — one per `###` section. Pure,
 * no network. Entries whose label is not a single clean date are skipped, but
 * their headings still advance the anchor counter, as they do on the page.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
	const entries: ChangelogEntry[] = [];
	const anchors = new AnchorCounter();
	for (const match of markdown.matchAll(UPDATE_RE)) {
		const rawLabel = match[1].trim();
		const entryDate = parseLabelToISO(rawLabel);
		const dateAnchor = anchors.next(anchorSlug(rawLabel));
		const { preamble, sections } = splitSections(match[3]);
		const sectionAnchors = sections.map((s) => anchors.next(anchorSlug(s.heading)));
		if (!entryDate) continue; // skip non-date labels (ranges/prose)

		const usedKeys = new Set<string>();
		const add = (name: string, key: string, url: string, body: string): void => {
			let unique = key;
			for (let n = 2; usedKeys.has(unique); n++) unique = `${key}#${n}`;
			usedKeys.add(unique);
			entries.push({
				key: unique,
				rawLabel,
				entryDate,
				name,
				url,
				bodyMarkdown: cleanBodyMarkdown(body),
			});
		};

		// No headings, or a preamble before the first one: a date-named row —
		// titled by the milestone name when the block has one
		// (`<Update label="Dec 3, 2024" description="Lovable 1.0">`).
		if (sections.length === 0 || cleanBodyMarkdown(preamble) !== "") {
			const description = attr(match[2], "description")?.trim();
			add(description || rawLabel, entryDate, anchorUrl(dateAnchor), preamble);
		}

		sections.forEach((section, i) => {
			const slug = keySlug(section.heading) || "section";
			add(
				toPlainText(section.heading),
				`${entryDate}#${slug}`,
				anchorUrl(sectionAnchors[i]),
				section.content,
			);
		});
	}
	return entries;
}

/** Fetch the raw changelog markdown. Throws on a non-2xx response. */
export async function fetchChangelogMarkdown(): Promise<string> {
	const res = await fetch(CHANGELOG_MD_URL, {
		headers: { "user-agent": "lovable-changelog-sync-worker" },
	});
	if (!res.ok) {
		throw new Error(
			`Changelog fetch failed: ${res.status} ${res.statusText} (${CHANGELOG_MD_URL})`,
		);
	}
	return res.text();
}

/**
 * Fetch and parse the live changelog. Throws if the page yields zero entries,
 * which almost always means the page structure changed and the parser in this
 * file needs updating — surfacing it as a failed run rather than silently
 * writing nothing.
 */
export async function fetchChangelogEntries(): Promise<ChangelogEntry[]> {
	const markdown = await fetchChangelogMarkdown();
	const entries = parseChangelog(markdown);
	if (entries.length === 0) {
		throw new Error(
			`Parsed 0 changelog entries from ${markdown.length} bytes. The page ` +
				`structure likely changed — check the parser in src/changelog.ts.`,
		);
	}
	return entries;
}

/**
 * Small, dependency-free 53-bit string hash (cyrb53), returned as base36.
 * Used purely for change detection in sync state — not security-sensitive.
 */
export function hashString(str: string, seed = 0): string {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
	return n.toString(36);
}

/** A stable content hash for an entry, covering every field the sync writes. */
export function entryContentHash(e: ChangelogEntry): string {
	return hashString(
		[e.key, e.rawLabel, e.entryDate, e.name, e.url, e.bodyMarkdown].join(" "),
	);
}
