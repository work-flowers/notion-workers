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

test("bare > separators are dropped, not left as Empty quote blocks", () => {
	const input = ["> Para one.", ">", "> Para two."].join("\n");
	const out = toNotionMarkdown(input);
	assert.ok(!/^>\s*$/m.test(out), "no bare > should survive");
	assert.ok(out.includes("> Para one."));
	assert.ok(out.includes("> Para two."));
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

test("list items in a quote stay one item per line, continuations joined", () => {
	const input = [
		"> Two traps:",
		"> - It is **not** at the top level of `get-workflow` — it lives at",
		">   `triggers[0].details.webhook_url`.",
		"> - The second trap.",
	].join("\n");
	const out = toNotionMarkdown(input).split("\n");
	assert.equal(out.length, 3, "intro plus exactly two list items");
	assert.ok(out[1].includes("it lives at `triggers[0].details.webhook_url`."), "continuation joined");
	assert.ok(out[2].startsWith("> - The second trap."));
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
