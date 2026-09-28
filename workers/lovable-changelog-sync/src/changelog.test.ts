/**
 * Parser tests for the changelog module. These run against captured fixtures
 * so they're deterministic and offline — a change in the live page can't make
 * them flap, but a regression in the parser (or an intentional structure change
 * we haven't adapted to) fails loudly.
 *
 * - src/__fixtures__/changelog.md — the `.md` twin, as fetched.
 * - src/__fixtures__/anchors.txt  — every date and `<h3>` id on the rendered
 *   HTML page, in document order, captured at the same time. It is what proves
 *   the URLs the sync writes actually land on their section.
 *
 * Run with `npm test`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	CHANGELOG_PAGE_URL,
	type ChangelogEntry,
	anchorSlug,
	cleanBodyMarkdown,
	entryContentHash,
	hashString,
	keySlug,
	parseChangelog,
	parseLabelToISO,
} from "./changelog.js";

// Read the captured fixtures. `npm test` runs from the project root.
const fixture = readFileSync("src/__fixtures__/changelog.md", "utf8");
const pageAnchors = readFileSync("src/__fixtures__/anchors.txt", "utf8").trim().split("\n");
const entries: ChangelogEntry[] = parseChangelog(fixture);

const fragment = (url: string): string => decodeURI(url.slice(url.indexOf("#") + 1));
const isDateAnchor = (a: string): boolean => /^[a-z]{3}-\d{1,2}-\d{4}$/.test(a);

test("splits sections into entries", () => {
	// 126 dated <Update> blocks: 512 `###` sections, plus 16 older blocks that
	// are a bare bullet list with no heading (one date-named row each).
	assert.equal(entries.length, 528);
	assert.equal(new Set(entries.map((e) => e.rawLabel)).size, 126);
	assert.equal(entries.filter((e) => !e.key.includes("#")).length, 16);
});

test("keys are unique and well-formed; required fields present", () => {
	const keys = new Set<string>();
	for (const e of entries) {
		assert.ok(!keys.has(e.key), `duplicate key "${e.key}"`);
		keys.add(e.key);
		assert.match(e.key, /^\d{4}-\d{2}-\d{2}(#[a-z0-9_-]+)?$/, `ascii key "${e.key}"`);
		assert.ok(e.key.startsWith(e.entryDate), `key prefixed by date for "${e.key}"`);
		assert.ok(e.name.length > 0, `name non-empty for "${e.key}"`);
		assert.ok(e.url.startsWith(`${CHANGELOG_PAGE_URL}#`), `url is an anchor for "${e.key}"`);
	}
});

test("every URL lands on a real anchor of the rendered page", () => {
	const anchorSet = new Set(pageAnchors);
	for (const e of entries) {
		assert.ok(anchorSet.has(fragment(e.url)), `"${fragment(e.url)}" is on the page`);
	}
	// Section URLs reproduce the page's <h3> ids exactly, in order — including
	// Mintlify's page-wide `-2`, `-3` suffixes for repeated headings.
	assert.deepEqual(
		entries.filter((e) => e.key.includes("#")).map((e) => fragment(e.url)),
		pageAnchors.filter((a) => !isDateAnchor(a)),
	);
});

test("anchorSlug reproduces Mintlify's anchor format", () => {
	assert.equal(anchorSlug("Sep 25, 2026"), "sep-25-2026");
	assert.equal(
		anchorSlug("App + chat connectors: Discord and Google Business Profile"),
		"app-+-chat-connectors-discord-and-google-business-profile",
	);
	assert.equal(anchorSlug('Redesigned "People" page'), "redesigned-“people”-page");
	assert.equal(anchorSlug("Inspect your app's AI activity"), "inspect-your-app’s-ai-activity");
	assert.equal(anchorSlug("**Lovable Cloud**"), "lovable-cloud");
	assert.equal(anchorSlug("Lovable 2.0"), "lovable-2-0");
	assert.equal(
		anchorSlug("Type `@` or `/` to add context and skills where you type"),
		"type-@-or-/-to-add-context-and-skills-where-you-type",
	);
});

test("keySlug is plain ASCII, independent of the page's anchor quirks", () => {
	assert.equal(
		keySlug("App + chat connectors: Discord and Google Business Profile"),
		"app-chat-connectors-discord-and-google-business-profile",
	);
	assert.equal(keySlug("**Lovable × Shopify Integration**"), "lovable-shopify-integration");
});

test("a date with multiple sections becomes multiple pages", () => {
	const sep25 = entries.filter((e) => e.rawLabel === "Sep 25, 2026");
	assert.deepEqual(
		sep25.map((e) => e.name),
		[
			"App + chat connectors: Discord and Google Business Profile",
			"GPT-6 Sol and GPT-6 Luna for your app's AI features",
			"Account settings have moved to their own dialog",
			"Open cited web sources from an answer",
		],
	);
	assert.equal(sep25[0].key, "2026-09-25#app-chat-connectors-discord-and-google-business-profile");
	assert.equal(sep25[0].entryDate, "2026-09-25");
});

test("section body is full, formatted markdown with absolute links", () => {
	const e = entries[0];
	assert.ok(e.bodyMarkdown.includes("ask Lovable in a project to connect it"), "body runs to the end");
	assert.ok(e.bodyMarkdown.includes("**Connectors**"), "bold kept");
	assert.ok(
		e.bodyMarkdown.includes("](https://docs.lovable.dev/integrations/discord)"),
		"relative link absolutized",
	);
	assert.ok(!/^ {2}\S/m.test(e.bodyMarkdown), "block indentation removed");
});

test("bold-wrapped legacy headings get clean titles", () => {
	const e = entries.find((x) => x.name === "Lovable × Shopify Integration");
	assert.ok(e, "bold heading stripped to plain text");
});

test("a no-heading block is one date-named page, titled by its milestone if any", () => {
	const plain = entries.find((x) => x.rawLabel === "Apr 17, 2025");
	assert.ok(plain);
	assert.equal(plain.name, "Apr 17, 2025");
	assert.equal(plain.key, "2025-04-17");
	assert.equal(plain.url, `${CHANGELOG_PAGE_URL}#apr-17-2025`);
	assert.ok(plain.bodyMarkdown.startsWith("* Shipped github reliability"));

	const milestone = entries.find((x) => x.rawLabel === "Dec 3, 2024");
	assert.ok(milestone);
	assert.equal(milestone.name, "Lovable 1.0");
	assert.equal(milestone.url, `${CHANGELOG_PAGE_URL}#dec-3-2024`);
});

test("MDX components are converted to markdown Notion can render", () => {
	for (const e of entries) {
		const leftover = e.bodyMarkdown.replace(/`[^`]*`/g, "").match(/<\/?[A-Za-z][^>]*>/g) ?? [];
		assert.deepEqual(
			leftover.filter((t) => t !== "<br>"),
			[],
			`no stray tags in "${e.key}"`,
		);
	}
	const seo = entries.find((x) => x.key === "2026-05-18#seo-and-ai-search");
	assert.ok(seo);
	assert.match(seo.bodyMarkdown, /^!\[2026-may-18-seo-reviewl\]\(https:\/\/mintcdn\.com\/[^)]+\)\n\n/);

	const warned = entries.find((x) => x.key === "2026-02-05#test-and-live-environments-beta");
	assert.ok(warned);
	assert.ok(
		warned.bodyMarkdown.startsWith(
			"> **Warning:** As of **March 24, 2026**, this feature is no longer available for new Cloud projects.<br><br>Existing Cloud projects",
		),
	);
});

test("cleanBodyMarkdown handles attribute order and unknown wrappers", () => {
	assert.equal(
		cleanBodyMarkdown('  <Frame caption="x">\n    <img alt="Shot" src="https://e.x/a.png" />\n  </Frame>\n\n  Text'),
		"![Shot](https://e.x/a.png)\n\nText",
	);
	assert.equal(cleanBodyMarkdown("  <Note>\n    One\n    line.\n  </Note>"), "> **Note:** One line.");
});

test("parseLabelToISO: abbreviated and full months parse, prose does not", () => {
	assert.equal(parseLabelToISO("Sep 25, 2026"), "2026-09-25");
	assert.equal(parseLabelToISO("Dec 3, 2024"), "2024-12-03");
	assert.equal(parseLabelToISO("Sept 4, 2026"), "2026-09-04");
	assert.equal(parseLabelToISO("September 4, 2026"), "2026-09-04");
	assert.equal(parseLabelToISO("Changes for April 2024"), null);
	assert.equal(parseLabelToISO("Sep 8 - Sep 21, 2023"), null);
	assert.equal(parseLabelToISO("Foo 1, 2026"), null);
});

test("content hash is stable and sensitive to changes", () => {
	const a = entries[0];
	assert.equal(entryContentHash(a), entryContentHash({ ...a }));
	assert.notEqual(
		entryContentHash(a),
		entryContentHash({ ...a, bodyMarkdown: `${a.bodyMarkdown} (edited)` }),
	);
	assert.equal(hashString("abc"), hashString("abc"));
	assert.notEqual(hashString("abc"), hashString("abd"));
});
