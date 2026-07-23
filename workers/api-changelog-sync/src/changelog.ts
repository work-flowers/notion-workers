/**
 * Fetch-and-parse module for the Notion developer changelog.
 *
 * This is the fragile part of the Worker. It depends on the structure of
 * https://developers.notion.com/page/changelog.md — the machine-readable `.md`
 * twin of the changelog page (listed in https://developers.notion.com/llms.txt).
 * That endpoint returns raw MDX whose entries are `<Update label="…">…</Update>`
 * blocks, which is far more stable to parse than the JS-rendered HTML page.
 *
 * Each `<Update>` block is a date. Within a block, every `### sub-heading` is a
 * distinct sub-entry → its own database row/page. Blocks with no heading (or only
 * a generic "What's new" heading) become a single row named by the date.
 *
 * Keep this module pure and network-free except for `fetch*`, and keep it covered
 * by src/changelog.test.ts (fixture-based) so a structure change fails loudly.
 * If parsing ever breaks, this file is the only thing that should need fixing.
 */

const SITE_ORIGIN = "https://developers.notion.com";

export const CHANGELOG_MD_URL = `${SITE_ORIGIN}/page/changelog.md`;
export const CHANGELOG_PAGE_URL = `${SITE_ORIGIN}/page/changelog`;

export interface ChangelogEntry {
	/** Unique primary key: `<ISO date>#<section-slug>` (or just the date). */
	key: string;
	/** Verbatim `<Update label="…">` string, e.g. "June 25, 2026". */
	rawLabel: string;
	/** Label parsed to YYYY-MM-DD. Non-date labels are skipped, so always set. */
	entryDate: string;
	/** The `###` section heading (markdown-stripped); the date label when there's none. */
	name: string;
	/** Deep link: `…/changelog#<section-slug>`, or the date anchor `#<date-slug>`. */
	url: string;
	/** Full section body as markdown (links absolutized, formatting preserved). May be empty. */
	bodyMarkdown: string;
}

const MONTHS: Record<string, string> = {
	january: "01",
	february: "02",
	march: "03",
	april: "04",
	may: "05",
	june: "06",
	july: "07",
	august: "08",
	september: "09",
	october: "10",
	november: "11",
	december: "12",
};

// Non-greedy so a body containing fenced code / lists can't swallow later blocks.
const UPDATE_RE = /<Update\s+label="([^"]*)">([\s\S]*?)<\/Update>/g;
// Sub-entries are split on `###` (h3) — the only heading level the changelog uses.
const SECTION_HEADING_RE = /^\s*###\s+(.+?)\s*$/;

/**
 * Parse a changelog label to an ISO date (YYYY-MM-DD), or null if it is not a
 * single clean "Month D, YYYY" date. The match is intentionally strict
 * (anchored, full-string) so ranges like "September 8 - September 21, 2023" and
 * prose like "Changes for April 2024" return null and are skipped by the sync.
 */
export function parseLabelToISO(label: string): string | null {
	const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(label.trim());
	if (!m) return null;
	const month = MONTHS[m[1].toLowerCase()];
	if (!month) return null;
	return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

/**
 * Strip inline markdown down to readable plain text — for titles, not page
 * bodies. Unescapes markdown punctuation, turns links/inline-code into their
 * text, and removes bold/italic markers. A lone `_` is kept: in this content
 * underscores are almost always part of API identifiers (`allow_async`,
 * `task_id`, `agent_id`), not italics, and eating them mangles names.
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
 * Slugify a heading the way the changelog page anchors it: lowercase, drop
 * markdown/backticks, collapse any run of non-alphanumeric characters to a
 * single hyphen (keeping `_`, which anchors preserve), trim hyphens.
 *
 * Verified against the real anchor for the heading
 * "Poll async MCP tool tasks with `notion-get-async-task`" →
 * "#poll-async-mcp-tool-tasks-with-notion-get-async-task".
 */
export function slugify(heading: string): string {
	return toPlainText(heading)
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Boilerplate headings that don't make a useful row title and whose anchors
 * collide across entries (several older entries lead with "### What's new").
 * When such a heading is an entry's *only* content it's treated as no heading.
 */
function isGenericHeading(headingText: string): boolean {
	return /^what'?s\s+new!?$/i.test(headingText.trim());
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

/**
 * Turn a raw `<Update>` body fragment into clean, renderable markdown for a page
 * body: strip the 2-space block indentation, drop ReadMe code-fence attributes,
 * and make root-relative links absolute so they resolve from inside Notion.
 * Markdown formatting (code, lists, bold, links) is deliberately preserved.
 *
 * NOT idempotent (the dedent removes two leading spaces) — call exactly once.
 */
function cleanBodyMarkdown(raw: string): string {
	return raw
		.replace(/^ {2}/gm, "") // dedent the 2-space <Update> indentation
		.replace(/\s*theme=\{null\}/g, "") // drop ReadMe code-fence attribute
		.replace(/\]\(\/(?!\/)/g, `](${SITE_ORIGIN}/`) // root-relative links -> absolute
		.replace(/\n{3,}/g, "\n\n") // collapse runs of blank lines
		.trim();
}

const dateUrl = (rawLabel: string): string =>
	`${CHANGELOG_PAGE_URL}#${slugify(rawLabel)}`;
const sectionUrl = (heading: string): string =>
	`${CHANGELOG_PAGE_URL}#${slugify(heading)}`;

/**
 * Parse the raw changelog markdown into entries — one per `###` section. Pure,
 * no network. Entries whose label is not a single clean date are skipped.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
	const entries: ChangelogEntry[] = [];
	for (const match of markdown.matchAll(UPDATE_RE)) {
		const rawLabel = match[1].trim();
		const entryDate = parseLabelToISO(rawLabel);
		if (!entryDate) continue; // skip non-date labels (ranges/prose)

		const { preamble, sections } = splitSections(match[2]);
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

		const preambleText = cleanBodyMarkdown(preamble);

		// No headings: the whole block is one date-named row.
		if (sections.length === 0) {
			add(rawLabel, entryDate, dateUrl(rawLabel), preamble);
			continue;
		}

		// Preamble before the first heading becomes its own date-named row.
		if (preambleText !== "") {
			add(rawLabel, entryDate, dateUrl(rawLabel), preamble);
		}

		// A lone generic "What's new" heading isn't a useful title → name by date.
		const soleGeneric =
			sections.length === 1 &&
			preambleText === "" &&
			isGenericHeading(toPlainText(sections[0].heading));

		for (const section of sections) {
			if (soleGeneric) {
				add(rawLabel, entryDate, dateUrl(rawLabel), section.content);
			} else {
				add(
					toPlainText(section.heading),
					`${entryDate}#${slugify(section.heading)}`,
					sectionUrl(section.heading),
					section.content,
				);
			}
		}
	}
	return entries;
}

/** Fetch the raw changelog markdown. Throws on a non-2xx response. */
export async function fetchChangelogMarkdown(): Promise<string> {
	const res = await fetch(CHANGELOG_MD_URL, {
		headers: { "user-agent": "notion-changelog-sync-worker" },
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
		[e.key, e.rawLabel, e.entryDate, e.name, e.url, e.bodyMarkdown].join(" "),
	);
}
