import assert from "node:assert/strict";
import { test } from "node:test";
import { toNotionMarkdown } from "./markdown.js";

test("a table with an escaped pipe becomes table XML with a real pipe", () => {
	const input = [
		"| Alias | Connection |",
		"|---|---|",
		"| `notion_wf` | `work.flowers \\| Dennis` |",
	].join("\n");
	const out = toNotionMarkdown(input);

	assert.ok(out.includes('<table header-row="true">'), "converts to native table XML");
	assert.ok(out.includes("<td>`work.flowers | Dennis`</td>"), "cell keeps a real pipe, intact");
	assert.ok(!out.includes("\\|"), "no escape survives");
	assert.ok(!out.includes("&#124;"), "no entity — Notion does not decode them");

	// Header and body row, two columns each — the bug produced a third column.
	assert.equal((out.match(/<tr>/g) ?? []).length, 2);
	assert.equal((out.match(/<td>/g) ?? []).length, 4);
});

test("a clean table is left as a pipe table", () => {
	const input = ["| Name | Value |", "|---|---|", "| alpha | one |"].join("\n");
	assert.equal(toNotionMarkdown(input), input);
});

test("escaped pipe outside a table is left alone", () => {
	const input = "A sentence with a \\| escaped pipe in it.";
	assert.equal(toNotionMarkdown(input), input);
});

test("mermaid fences pass through verbatim, including <br/>", () => {
	const input = ['```mermaid', "flowchart TD", '    A["one<br/>two"] --> B["three<br>four"]', "```"].join("\n");
	assert.equal(toNotionMarkdown(input), input);
});

test("a table-looking line inside a fence is not rewritten", () => {
	const input = ["```md", "| a \\| b |", "|---|---|", "| c | d |", "```"].join("\n");
	assert.equal(toNotionMarkdown(input), input);
});

test("a table after a fence is still converted", () => {
	const input = [
		"```ts",
		"const x = 1;",
		"```",
		"",
		"| Field | Value |",
		"|---|---|",
		"| pipe | a \\| b |",
	].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(out.includes("const x = 1;"), "code survives");
	assert.ok(out.includes("<td>a | b</td>"));
});

test("bold, code spans and links survive conversion", () => {
	const input = [
		"| Kind | Content |",
		"|---|---|",
		"| bold | **strong** |",
		"| link | [Zapier](https://zapier.com) |",
		"| pipe | a \\| b |",
	].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(out.includes("<td>**strong**</td>"));
	assert.ok(out.includes("<td>[Zapier](https://zapier.com)</td>"));
});

test("a literal < in a cell is escaped so it cannot break the XML", () => {
	const input = ["| Tag | Value |", "|---|---|", "| br | <br/> a \\| b |"].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(out.includes("&lt;br/>"), "angle bracket escaped");
	assert.ok(!/<td><br\/>/.test(out), "raw tag must not survive inside a cell");
});

test("ragged rows are padded to a rectangle", () => {
	const input = ["| a | b | c |", "|---|---|---|", "| x \\| y |"].join("\n");
	const out = toNotionMarkdown(input);
	const rows = out.split("<tr>").slice(1);
	for (const row of rows) assert.equal((row.match(/<td>/g) ?? []).length, 3);
});

test("is idempotent", () => {
	const input = ["| a | b |", "|---|---|", "| x | y \\| z |"].join("\n");
	const once = toNotionMarkdown(input);
	assert.equal(toNotionMarkdown(once), once);
});

test("handles an unterminated fence without dropping content", () => {
	const input = ["text before", "```ts", "const x = 1;"].join("\n");
	assert.ok(toNotionMarkdown(input).includes("const x = 1;"));
});

test("surrounding prose is preserved around a converted table", () => {
	const input = ["## Heading", "", "| a | b |", "|---|---|", "| x \\| y | z |", "", "Trailing prose."].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(out.startsWith("## Heading"));
	assert.ok(out.trimEnd().endsWith("Trailing prose."));
});

test("a soft-wrapped quote paragraph becomes one quote line", () => {
	const input = ["> First line of a wrapped", "> paragraph that continues here."].join("\n");
	assert.equal(toNotionMarkdown(input), "> First line of a wrapped paragraph that continues here.");
});

test("paragraphs collapse into one quote block separated by a double break", () => {
	const input = ["> Para one.", ">", "> Para two."].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(!/^>\s*$/m.test(out), "no bare > should survive as an Empty quote");
	assert.equal(out, "> Para one.<br><br>Para two.");
	assert.equal(out.split("\n").length, 1, "one line means one quote block");
});

test("a fenced code block inside a quote is lifted out intact", () => {
	const input = [
		"> Before the fence.",
		">",
		"> ```",
		"> https://hooks.zapier.com/hooks/catch/123/abc/",
		"> ```",
		">",
		"> After the fence.",
	].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(out.includes("```\nhttps://hooks.zapier.com/hooks/catch/123/abc/\n```"), "fence unquoted and intact");
	assert.ok(!out.includes("> ```"), "no quoted fence marker survives");
	assert.ok(out.includes("> Before the fence."));
	assert.ok(out.includes("> After the fence."));
});

test("a quoted list becomes one block, one <br> per item", () => {
	const input = [
		"> Two traps:",
		"> - It is **not** at the top level of `get-workflow` — it lives at",
		">   `triggers[0].details.webhook_url`.",
		"> - The second trap.",
	].join("\n");
	const out = toNotionMarkdown(input);
	assert.equal(out.split("\n").length, 1, "one line means one quote block");
	assert.equal((out.match(/<br>/g) ?? []).length, 2, "one break per list item");
	assert.ok(out.includes("it lives at `triggers[0].details.webhook_url`."), "continuation joined");
	assert.ok(out.includes("<br>- The second trap."));
});

test("a single-line quote is unchanged", () => {
	assert.equal(toNotionMarkdown("> Just one line."), "> Just one line.");
});

test("blockquote handling is idempotent", () => {
	const input = ["> Para one.", ">", "> ```", "> code", "> ```", ">", "> Para two."].join("\n");
	const once = toNotionMarkdown(input);
	assert.equal(toNotionMarkdown(once), once);
});

test("a quote inside a fenced code block is untouched", () => {
	const input = ["```md", "> quoted line one", "> quoted line two", "```"].join("\n");
	assert.equal(toNotionMarkdown(input), input);
});

test("prose around a quote is preserved", () => {
	const input = ["## Heading", "", "> a", "> b", "", "After."].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(out.startsWith("## Heading"));
	assert.ok(out.includes("> a b"));
	assert.ok(out.trimEnd().endsWith("After."));
});

test("<br> is emitted bare so Notion parses it as a break", () => {
	// The serializer escapes literal markup (\<br\>) and leaves parsed markup
	// bare, so an escaped or entity-encoded break would render as visible text.
	const out = toNotionMarkdown(["> one", ">", "> two"].join("\n"));
	assert.ok(out.includes("<br><br>"));
	assert.ok(!out.includes("\\<br"), "must not be escaped");
	assert.ok(!out.includes("&lt;br"), "must not be entity-encoded");
});

test("a soft-wrapped paragraph reflows onto one line", () => {
	const input = [
		"Keeps the map in sync. One person, keyed on their",
		"work email, gets a row in the **\"User IDs\" Table**",
		"and the same IDs mirrored onto their row.",
	].join("\n");
	const out = toNotionMarkdown(input);
	assert.equal(out.split("\n").length, 1, "one line means one paragraph block");
	assert.ok(out.includes("keyed on their work email, gets a row"), "joined with a space");
});

test("a blank line still separates two paragraphs", () => {
	const input = ["Para one line a", "line b", "", "Para two line a", "line b"].join("\n");
	const out = toNotionMarkdown(input).split("\n");
	assert.equal(out.length, 3, "paragraph, blank, paragraph");
	assert.equal(out[0], "Para one line a line b");
	assert.equal(out[2], "Para two line a line b");
});

test("list continuations join onto their item, items stay separate", () => {
	const input = ["- First item that wraps onto", "  a second source line.", "- Second item."].join("\n");
	const out = toNotionMarkdown(input).split("\n");
	assert.equal(out.length, 2, "exactly two list items");
	assert.equal(out[0], "- First item that wraps onto a second source line.");
	assert.equal(out[1], "- Second item.");
});

test("numbered list continuations join, including tab-indented ones", () => {
	const input = ["1. Repoint the webhook, then disable the", "\tclassic **Add New Linear User ID**.", "2. Second step."].join("\n");
	const out = toNotionMarkdown(input).split("\n");
	assert.equal(out.length, 2);
	assert.ok(out[0].startsWith("1. Repoint the webhook, then disable the classic"));
	assert.ok(out[1].startsWith("2. Second step."));
});

test("headings and rules are never absorbed into a paragraph", () => {
	const input = ["# Title", "Body line one", "line two", "---", "After the rule"].join("\n");
	const out = toNotionMarkdown(input).split("\n");
	assert.equal(out[0], "# Title");
	assert.equal(out[1], "Body line one line two");
	assert.equal(out[2], "---");
	assert.equal(out[3], "After the rule");
});

test("table markup is not reflowed", () => {
	const input = ["| a | b |", "|---|---|", "| x | y |"].join("\n");
	assert.equal(toNotionMarkdown(input), input, "clean pipe table untouched");
	const withEscape = ["| a | b |", "|---|---|", "| x | y \\| z |"].join("\n");
	const xml = toNotionMarkdown(withEscape);
	assert.ok(xml.includes("<td>x</td>\n<td>y | z</td>"), "table XML keeps one cell per line");
});

test("an indented code block after a blank line is not reflowed", () => {
	const input = ["Intro paragraph.", "", "    indented code line one", "    indented code line two"].join("\n");
	const out = toNotionMarkdown(input).split("\n");
	assert.equal(out[2], "    indented code line one");
	assert.equal(out[3], "    indented code line two");
});

test("fenced code is still untouched by reflow", () => {
	const input = ["```ts", "const a = 1;", "const b = 2;", "```"].join("\n");
	assert.equal(toNotionMarkdown(input), input);
});

test("reflow is idempotent", () => {
	const input = ["Para line a", "line b", "", "- item wrapping", "  onto here"].join("\n");
	const once = toNotionMarkdown(input);
	assert.equal(toNotionMarkdown(once), once);
});
