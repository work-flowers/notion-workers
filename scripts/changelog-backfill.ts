/**
 * One-time backfill for the Product Changelogs database
 * (data source 6d311e8f-6533-4dbe-8c86-6c7581b58942).
 *
 * Ongoing updates come from the Zapier workflow "product-changelogs-rss",
 * which only sees each feed's last 15 dates. This script fills in everything
 * older: it reads each Mintlify changelog's `.md` twin, splits it on the bold
 * date lines, and creates one page per date — skipping any Key that already
 * exists, so it is safe to re-run (and to run for a newly added feed).
 *
 * Only Mintlify feeds are backfilled here. Other feeds (one RSS item per page,
 * e.g. Notion's releases) are backfilled by the workflow itself: run it once
 * with `{ "backfill_feed_url": "<feed url>" }`, since it needs Zapier's Web
 * Parser for the page text.
 *
 *   NOTION_API_TOKEN=$(op --account work-flowers.1password.com read \
 *     "op://Private/notion-worker-automations/credential") \
 *     npx tsx scripts/changelog-backfill.ts [--dry-run] [--icons] [feed id…]
 *
 * `--icons` sets every existing page's icon to its product's logo.dev logo
 * (pages created here and by the workflow get it already), then exits.
 *
 * Keep FEEDS, the Key format and the icons in step with the Zapier workflow.
 */

const DATA_SOURCE_ID = "6d311e8f-6533-4dbe-8c86-6c7581b58942";
const NOTION_VERSION = "2026-03-11";

// Logo.dev publishable key, as in the workflow; not a secret.
const logoUrl = (domain: string): string => `https://img.logo.dev/${domain}?token=pk_MgvuyiQuRe6IT_XWNAUgrA`;

interface Feed {
	/** Key prefix: rows are keyed `<id>:<ISO date>`. Must match the Zap. */
	id: string;
	/** Product select option. */
	product: string;
	/** Changelog page URL; its `.md` twin is `<page>.md`. */
	page: string;
	/** Domain whose logo.dev logo becomes the page icon. */
	logoDomain: string;
}

const FEEDS: Feed[] = [
	{ id: "notion-api", product: "Notion API", page: "https://developers.notion.com/page/changelog", logoDomain: "notion.com" },
	{ id: "lovable", product: "Lovable", page: "https://docs.lovable.dev/changelog", logoDomain: "lovable.dev" },
];

/** Icon domain per Product option, covering workflow-only feeds too. */
const LOGO_BY_PRODUCT: Record<string, string> = {
	...Object.fromEntries(FEEDS.map((f) => [f.product, f.logoDomain])),
	Notion: "notion.com",
};

// -- Parsing -------------------------------------------------------------------
// Mintlify's `.md` twin is rendered markdown: each dated entry starts with a
// bold-only line (`**Nov 4, 2026**` / `**November 4, 2026**`) and its
// sub-entries are `###` headings. (Until late October 2026 it was raw MDX
// `<Update label="…">` blocks; that change is what broke the old workers.)

const MONTHS: Record<string, string> = { sept: "09" };
[
	"january", "february", "march", "april", "may", "june",
	"july", "august", "september", "october", "november", "december",
].forEach((name, i) => {
	const mm = String(i + 1).padStart(2, "0");
	MONTHS[name] = mm;
	MONTHS[name.slice(0, 3)] = mm;
});

/** "Nov 4, 2026" / "November 4, 2026" → "2026-11-04"; ranges and prose → null. */
export function parseLabelToISO(label: string): string | null {
	const m = /^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})$/.exec(label.trim());
	const month = m && MONTHS[m[1].toLowerCase()];
	return m && month ? `${m[3]}-${month}-${m[2].padStart(2, "0")}` : null;
}

const MONTH_WORD = new RegExp(`\\b(${Object.keys(MONTHS).join("|")})\\b`, "i");

/**
 * Bold-only lines that start an entry: clean dates, plus legacy range/prose
 * labels ("September 8 - September 21, 2023"), which end the previous entry
 * but are skipped. Bold lines inside a body carry no month + year.
 */
function isEntryLabel(text: string): boolean {
	return parseLabelToISO(text) !== null || (/\b(19|20)\d{2}\b/.test(text) && MONTH_WORD.test(text));
}

const toPlainText = (s: string): string =>
	s
		.replace(/\\([_*#.\-`~[\]()&])/g, "$1")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/\*\*|__|\*/g, "")
		.replace(/\s+/g, " ")
		.trim();

/**
 * Mintlify's anchor id for a heading or date label (before page-wide
 * de-duplication). Verified against every id on both rendered pages
 * (2026-11-06): smart quotes kept (a leading `"` becomes `”`), `.` between
 * word chars → `-`, other ASCII punctuation dropped, spaces → `-`, runs of
 * `-` collapsed; `+ & / @ ×` survive.
 */
export function anchorSlug(text: string): string {
	return toPlainText(text)
		.replace(/([\s([])"/g, "$1“")
		.replace(/"/g, "”")
		.replace(/(^|[\s([])'/g, "$1‘")
		.replace(/'/g, "’")
		.toLowerCase()
		.replace(/(?<=\w)\.(?=\w)/g, "-")
		.replace(/[.,:;!?()[\]{}"'`]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-{2,}/g, "-");
}

/**
 * GitHub-style alerts (`> [!NOTE]` + `> …` lines) → one quote line, since
 * Notion makes every `>` line its own quote block.
 */
function convertAlerts(md: string): string {
	return md.replace(/^> \[!([A-Z]+)\][ \t]*\n((?:>.*(?:\n|$))*)/gm, (_m, kind: string, rest: string) => {
		const paragraphs = rest
			.split("\n")
			.map((l) => l.replace(/^>\s?/, ""))
			.join("\n")
			.trim()
			.split(/\n\s*\n/)
			.map((p) => p.split("\n").map((l) => l.trim()).join(" "))
			.filter(Boolean);
		return `> **${kind[0]}${kind.slice(1).toLowerCase()}:** ${paragraphs.join("<br><br>")}\n`;
	});
}

/** Body cleanup: alerts, `.md` twin links → pages, root-relative links, `\&`. */
export function cleanBody(raw: string, origin: string): string {
	const host = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const twin = new RegExp(`\\]\\((${host}/[^)\\s#]*?)\\.md(#[^)\\s]*)?\\)`, "g");
	return convertAlerts(raw)
		.replace(/\\&/g, "&")
		.replace(/\]\(\/(?!\/)/g, `](${origin}/`)
		.replace(twin, (_m, path: string, hash = "") => `](${path}${hash})`)
		.replace(/^[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export interface Row {
	key: string;
	label: string;
	date: string;
	url: string;
	body: string;
}

export function parseChangelog(feed: Feed, markdown: string): Row[] {
	const origin = new URL(feed.page).origin;
	const seen = new Map<string, number>(); // Mintlify de-dupes anchors page-wide
	const anchor = (text: string): string => {
		const base = anchorSlug(text);
		const n = (seen.get(base) ?? 0) + 1;
		seen.set(base, n);
		return n === 1 ? base : `${base}-${n}`;
	};

	const rows: Row[] = [];
	let current: { label: string; anchor: string; lines: string[] } | null = null;
	const flush = (): void => {
		const date = current && parseLabelToISO(current.label);
		if (!current || !date) return;
		rows.push({
			key: `${feed.id}:${date}`,
			label: current.label,
			date,
			url: `${feed.page}#${encodeURI(current.anchor)}`,
			body: cleanBody(current.lines.join("\n"), origin),
		});
	};
	for (const line of markdown.split("\n")) {
		const bold = /^\*\*([^*]+)\*\*\s*$/.exec(line);
		if (bold && isEntryLabel(bold[1].trim())) {
			flush();
			current = { label: bold[1].trim(), anchor: anchor(bold[1].trim()), lines: [] };
			continue;
		}
		const h3 = /^###\s+(.+?)\s*$/.exec(line);
		if (h3) anchor(h3[1]); // headings advance the counter too
		current?.lines.push(line);
	}
	flush();
	return rows;
}

// -- Notion --------------------------------------------------------------------

const token = process.env.NOTION_API_TOKEN ?? "";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function notion(path: string, body: unknown, method = "POST"): Promise<any> {
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(`https://api.notion.com/v1${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				"Notion-Version": NOTION_VERSION,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
		if (res.ok) return res.json();
		if ((res.status === 429 || res.status >= 500) && attempt < 5) {
			await sleep(Number(res.headers.get("retry-after") ?? 2) * 1000 * attempt);
			continue;
		}
		throw new Error(`${path} → ${res.status}: ${await res.text()}`);
	}
}

async function allPages(): Promise<any[]> {
	const pages: any[] = [];
	let cursor: string | undefined;
	do {
		const page = await notion(`/data_sources/${DATA_SOURCE_ID}/query`, {
			page_size: 100,
			...(cursor ? { start_cursor: cursor } : {}),
		});
		pages.push(...page.results);
		cursor = page.has_more ? page.next_cursor : undefined;
	} while (cursor);
	return pages;
}

async function existingKeys(): Promise<Set<string>> {
	const keys = (await allPages()).map((r) => r.properties?.Key?.rich_text?.map((t: any) => t.plain_text).join(""));
	return new Set(keys.filter(Boolean));
}

/** Point every page's icon at its product's logo; skips pages already right. */
async function setIcons(dryRun: boolean): Promise<void> {
	let changed = 0;
	for (const p of await allPages()) {
		const domain = LOGO_BY_PRODUCT[p.properties?.Product?.select?.name ?? ""];
		if (!domain) continue;
		const url = logoUrl(domain);
		if (p.icon?.external?.url === url) continue;
		changed++;
		if (dryRun) continue;
		await notion(`/pages/${p.id}`, { icon: { type: "external", external: { url } }, notifications: { mode: "silent" } }, "PATCH");
		process.stdout.write(".");
		await sleep(350);
	}
	console.log(`\n${dryRun ? "Would set" : "Set"} ${changed} icons`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const ids = args.filter((a) => !a.startsWith("--"));
	const feeds = ids.length ? FEEDS.filter((f) => ids.includes(f.id)) : FEEDS;
	if ((!dryRun || args.includes("--icons")) && !token) throw new Error("Set NOTION_API_TOKEN (notion-worker-automations).");
	if (args.includes("--icons")) return setIcons(dryRun);

	const have = dryRun ? new Set<string>() : await existingKeys();
	for (const feed of feeds) {
		const res = await fetch(`${feed.page}.md`);
		if (!res.ok) throw new Error(`${feed.page}.md → ${res.status}`);
		const rows = parseChangelog(feed, await res.text());
		if (rows.length === 0) throw new Error(`Parsed 0 dates for ${feed.product}; the format changed.`);
		const todo = rows.filter((r) => !have.has(r.key));
		console.log(`${feed.product}: ${rows.length} dates, ${todo.length} to create`);
		if (dryRun) {
			for (const r of todo.slice(0, 3)) console.log(`  ${r.key}  ${r.url}\n    ${r.body.slice(0, 100).replace(/\n/g, " ")}…`);
			continue;
		}
		for (const r of todo) {
			await notion("/pages", {
				parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
				icon: { type: "external", external: { url: logoUrl(feed.logoDomain) } },
				properties: {
					Name: { title: [{ text: { content: r.label } }] },
					Product: { select: { name: feed.product } },
					"Entry Date": { date: { start: r.date } },
					URL: { url: r.url },
					Key: { rich_text: [{ text: { content: r.key } }] },
				},
				markdown: r.body,
				notifications: { mode: "silent" },
			});
			process.stdout.write(".");
			await sleep(350); // Notion's ~3 requests/second
		}
		process.stdout.write("\n");
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err: unknown) => {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 1;
	});
}
