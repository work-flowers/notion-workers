/**
 * Parser tests for the changelog module. These run against a captured fixture
 * (src/__fixtures__/changelog.md) so they're deterministic and offline — a
 * change in the live page can't make them flap, but a regression in the parser
 * (or an intentional structure change we haven't adapted to) fails loudly.
 *
 * Run with `npm test`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	CHANGELOG_PAGE_URL,
	type ChangelogEntry,
	entryContentHash,
	hashString,
	parseChangelog,
	parseLabelToISO,
	slugify,
} from "./changelog.js";

// Read the captured fixture. `npm test` runs from the project root.
const fixture = readFileSync("src/__fixtures__/changelog.md", "utf8");
const entries: ChangelogEntry[] = parseChangelog(fixture);

// The four non-date labels in the fixture that must be skipped.
const SKIPPED_LABELS = [
	"Changes for April 2024",
	"Changes for November 27 - December 10, 2023",
	"September 8 - September 21, 2023",
	"September 6 - September 7, 2023",
];

test("splits sections into entries and skips non-date labels", () => {
	// 25 clean-date <Update> blocks expand to 49 section-level entries.
	assert.equal(entries.length, 49);
	const labels = new Set(entries.map((e) => e.rawLabel));
	assert.equal(labels.size, 25, "25 distinct dates represented");
	for (const skipped of SKIPPED_LABELS) {
		assert.ok(!labels.has(skipped), `should skip "${skipped}"`);
	}
});

test("keys are unique and well-formed; required fields present", () => {
	const keys = new Set<string>();
	for (const e of entries) {
		assert.ok(!keys.has(e.key), `duplicate key "${e.key}"`);
		keys.add(e.key);
		assert.ok(e.key.startsWith(e.entryDate), `key prefixed by date for "${e.key}"`);
		assert.match(e.entryDate, /^\d{4}-\d{2}-\d{2}$/, `valid ISO date for "${e.key}"`);
		assert.ok(e.name.length > 0, `name non-empty for "${e.key}"`);
		assert.ok(
			e.url.startsWith(`${CHANGELOG_PAGE_URL}#`),
			`url is an anchor for "${e.key}"`,
		);
	}
});

test("a date with multiple sections becomes multiple pages", () => {
	const june25 = entries.filter((e) => e.rawLabel === "June 25, 2026");
	assert.equal(june25.length, 2);
	assert.deepEqual(
		june25.map((e) => e.name),
		[
			"Poll async MCP tool tasks with notion-get-async-task",
			"Get workspace and user identity with notion-fetch",
		],
	);
	assert.deepEqual(
		june25.map((e) => e.key),
		[
			"2026-06-25#poll-async-mcp-tool-tasks-with-notion-get-async-task",
			"2026-06-25#get-workspace-and-user-identity-with-notion-fetch",
		],
	);
});

test("section entry has the real anchor, full body, and preserved formatting", () => {
	const e = entries[0]; // June 25, first section
	assert.equal(
		e.url,
		`${CHANGELOG_PAGE_URL}#poll-async-mcp-tool-tasks-with-notion-get-async-task`,
	);
	// Full body, not truncated to a short summary.
	assert.ok(e.bodyMarkdown.includes("suggested backoff"), "body runs to the end");
	// Markdown formatting kept (inline code) and relative links absolutized.
	assert.ok(e.bodyMarkdown.includes("`notion-get-async-task`"), "inline code kept");
	assert.ok(
		e.bodyMarkdown.includes("https://developers.notion.com/guides/mcp/"),
		"relative link absolutized",
	);
});

test("a no-heading date is one page named by the date, with the date anchor", () => {
	const e = entries.find((x) => x.rawLabel === "April 22, 2026");
	assert.ok(e, "April 22, 2026 present");
	assert.equal(e.name, "April 22, 2026");
	assert.equal(e.url, `${CHANGELOG_PAGE_URL}#april-22-2026`);
	assert.ok(e.bodyMarkdown.length > 0, "body captured");
});

test("a lone 'What's new' heading falls back to the date; no duplicate titles", () => {
	for (const label of ["April 2, 2026", "December 20, 2024", "September 9, 2024"]) {
		const e = entries.find((x) => x.rawLabel === label);
		assert.ok(e, `${label} present`);
		assert.equal(e.name, label, `${label} named by date`);
		assert.equal(e.url, `${CHANGELOG_PAGE_URL}#${slugify(label)}`);
	}
	// Only Sept 11, 2024's genuine sub-section keeps the "What's new" title.
	const generic = entries.filter((e) => /^what'?s new!?$/i.test(e.name));
	assert.equal(generic.length, 1);
});

test("parseLabelToISO is strict: clean dates parse, ranges/prose do not", () => {
	assert.equal(parseLabelToISO("June 8, 2026"), "2026-06-08");
	assert.equal(parseLabelToISO("December 20, 2024"), "2024-12-20");
	assert.equal(parseLabelToISO("January 15, 2026"), "2026-01-15");
	for (const skipped of SKIPPED_LABELS) {
		assert.equal(parseLabelToISO(skipped), null, `"${skipped}" is not a date`);
	}
	assert.equal(parseLabelToISO("not a date"), null);
});

test("slugify matches the changelog's anchor scheme", () => {
	assert.equal(
		slugify("Poll async MCP tool tasks with `notion-get-async-task`"),
		"poll-async-mcp-tool-tasks-with-notion-get-async-task",
	);
	assert.equal(slugify("June 25, 2026"), "june-25-2026");
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
