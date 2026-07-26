import assert from "node:assert/strict";
import { test } from "node:test";
import {
	appKeyFromSelectedApi,
	appKeyToLabel,
	appTitleWithoutVersion,
	connectionAliases,
	connectionIds,
	countActionCallSites,
	countSteps,
	type WorkflowVersion,
} from "./workflows.js";

const version = (source: string): WorkflowVersion => ({ source_files: { "workflow.ts": source } });

// Shaped after luma-guest-registered-to-event-attendance: a step wrapping two
// actions, a step wrapping one, and a step containing a raw fetch.
const REAL_SHAPE = `
	const created = await ctx.step(\`\${stepPrefix}-create\`, async () => {
		const res = await sdk.runAction({ app: "notion" });
		const res2 = await sdk.runAction({ app: "notion" });
	});
	await ctx.step(\`\${stepPrefix}-content\`, async () =>
		sdk.runAction({ app: "notion" }),
	);
	await ctx.step("set-event-cover", async () => {
		const res = await sdk.fetch(\`\${NOTION_API}/pages/\${pageId}\`, {});
	});
`;

test("counts steps and action call sites off real-shaped source", () => {
	assert.equal(countSteps(version(REAL_SHAPE)), 3);
	assert.equal(countActionCallSites(version(REAL_SHAPE)), 3);
});

test("raw sdk.fetch is not counted as an action", () => {
	// It is a different kind of call and very likely meters differently.
	assert.equal(countActionCallSites(version(`await sdk.fetch("https://x.test", {});`)), 0);
});

test("the zapier.apps proxy form counts as an action, chained or bound", () => {
	const chained = `const { data } = await zapier.apps.notion({}).write.create_database_item({});`;
	assert.equal(countActionCallSites(version(chained)), 1);

	// The documented idiom binds the proxy first and calls it on a later line —
	// matching the `zapier.apps` chain would miss this entirely.
	const bound = `
		const notion = zapier.apps.notion({ connectionId: connections.notion });
		const { data: page } = await notion.write.create_database_item({});
		const hit = await notion.search.find_database_item({});
	`;
	assert.equal(countActionCallSites(version(bound)), 2);
});

test("call sites in comments are not counted", () => {
	const src = `
		// await ctx.step("commented-out", async () => sdk.runAction({}));
		/* ctx.step("block-commented") and runAction( too */
		await ctx.step("real", async () => sdk.runAction({}));
	`;
	assert.equal(countSteps(version(src)), 1);
	assert.equal(countActionCallSites(version(src)), 1);
});

test("call sites inside string literals are not counted", () => {
	const src = `const msg = "call ctx.step( and runAction( here"; await ctx.step("real", () => {});`;
	assert.equal(countSteps(version(src)), 1);
	assert.equal(countActionCallSites(version(src)), 0);
});

test("a url containing // does not swallow the rest of the line", () => {
	// The line-comment strip must not treat "https://" as a comment start.
	const src = `const u = 1; await ctx.step("after-url", async () => sdk.runAction({}));`;
	assert.equal(countSteps(version(`const NOTION = 1; ${src}`)), 1);
});

test("a step inside a loop is still one call site", () => {
	// The whole point: these count places in code, not executions.
	const src = `for (const g of guests) { await ctx.step("per-guest", async () => sdk.runAction({})); }`;
	assert.equal(countSteps(version(src)), 1);
	assert.equal(countActionCallSites(version(src)), 1);
});

test("counts across multiple source files", () => {
	const v: WorkflowVersion = {
		source_files: {
			"workflow.ts": `await ctx.step("a", () => {});`,
			"helpers.ts": `await ctx.step("b", async () => sdk.runAction({}));`,
		},
	};
	assert.equal(countSteps(v), 2);
	assert.equal(countActionCallSites(v), 1);
});

test("a missing version or source yields zero rather than throwing", () => {
	assert.equal(countSteps(undefined), 0);
	assert.equal(countActionCallSites(undefined), 0);
	assert.equal(countSteps({ source_files: null }), 0);
	assert.equal(countActionCallSites({}), 0);
});

test("an unbalanced quote cannot wipe out later lines", () => {
	// Regression: whole-file quote stripping let one stray quote inside a
	// multi-line template literal swallow thousands of characters, taking
	// notion-newsletter-to-buttondown from 7 steps to 0.
	const src = [
		"const md = `a stray \" quote inside a template",
		"spanning several lines`;",
		'await ctx.step("one", async () => sdk.runAction({}));',
		'await ctx.step("two", async () => sdk.runAction({}));',
	].join("\n");
	assert.equal(countSteps(version(src)), 2);
	assert.equal(countActionCallSites(version(src)), 2);
});

test("connection aliases are sorted and default to empty", () => {
	const v = { connections: { notion_wf: { connection_id: "a" }, apollo: { connection_id: "b" } } };
	assert.deepEqual(connectionAliases(v), ["apollo", "notion_wf"]);
	assert.deepEqual(connectionAliases(undefined), []);
	assert.deepEqual(connectionAliases({}), []);
});

test("connection ids skip entries with no id", () => {
	const v = { connections: { a: { connection_id: "x" }, b: {}, c: { connection_id: "y" } } };
	assert.deepEqual(connectionIds(v).sort(), ["x", "y"]);
});

test("the trigger's app key drops its version", () => {
	assert.equal(appKeyFromSelectedApi("LumaCLIAPI@6.1.0"), "LumaCLIAPI");
	assert.equal(appKeyFromSelectedApi("WebHookCLIAPI"), "WebHookCLIAPI");
	assert.equal(appKeyFromSelectedApi(undefined), undefined);
});

test("an app title loses its trailing version but keeps qualifiers", () => {
	assert.equal(appTitleWithoutVersion("Notion (2.39.1)"), "Notion");
	assert.equal(appTitleWithoutVersion("Ninjapear (Unofficial) (1.0.0)"), "Ninjapear (Unofficial)");
	// "(Unofficial)" distinguishes genuinely different apps — never strip it.
	assert.equal(appTitleWithoutVersion("Buttondown (Unofficial)"), "Buttondown (Unofficial)");
	assert.equal(appTitleWithoutVersion("Slack"), "Slack");
});

test("the fallback label strips the CLIAPI suffix", () => {
	assert.equal(appKeyToLabel("LumaCLIAPI"), "Luma");
	assert.equal(appKeyToLabel("App243984CLIAPI"), "App243984");
	assert.equal(appKeyToLabel("Weird"), "Weird");
});
