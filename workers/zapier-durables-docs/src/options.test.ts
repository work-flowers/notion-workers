import assert from "node:assert/strict";
import { test } from "node:test";
import {
	APP_COLOURS,
	appForAlias,
	assertDeclared,
	SEEDED_APPS,
	SEEDED_CONNECTION_ALIASES,
	SHARED_COLOURS,
} from "./options.js";

// Notion's full palette. A colour outside it is silently ignored by the API,
// so the option would render in the default grey with no error.
const NOTION_COLOURS = new Set([
	"default",
	"gray",
	"brown",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
	"pink",
	"red",
]);

test("every seeded option has a colour Notion actually supports", () => {
	for (const option of [...SEEDED_APPS, ...SEEDED_CONNECTION_ALIASES]) {
		assert.ok(option.color, `${option.name} has no colour`);
		assert.ok(NOTION_COLOURS.has(option.color), `${option.name}: bad colour ${option.color}`);
	}
});

test("a connection alias takes the colour of the app it binds", () => {
	// This is the point of the scheme: `apollo` and `Apollo` read as a pair.
	for (const option of SEEDED_CONNECTION_ALIASES) {
		const app = appForAlias(option.name);
		assert.ok(app, `${option.name} maps to no app`);
		assert.equal(
			option.color,
			APP_COLOURS[app as keyof typeof APP_COLOURS],
			`${option.name} should match ${app}`,
		);
	}
});

test("every shared colour is one SHARED_COLOURS declares", () => {
	// More apps than colours means most must double up. The groups are declared
	// so a collision is a decision rather than an accident.
	const declared = SHARED_COLOURS.map((group) => [...group].sort().join("|"));
	const byColour = new Map<string, string[]>();
	for (const { name, color } of SEEDED_APPS) {
		byColour.set(color, [...(byColour.get(color) ?? []), name]);
	}
	for (const [colour, names] of byColour) {
		if (names.length === 1) continue;
		assert.ok(
			declared.includes([...names].sort().join("|")),
			`${colour} shared by an undeclared group: ${names.join(", ")}`,
		);
	}
});

test("SHARED_COLOURS does not claim a pair that is not actually shared", () => {
	const colourOf = Object.fromEntries(SEEDED_APPS.map((o) => [o.name, o.color]));
	for (const group of SHARED_COLOURS) {
		const colours = new Set(group.map((n) => colourOf[n]));
		assert.equal(colours.size, 1, `${group.join(", ")} do not actually share a colour`);
	}
});

test("the two Notion apps are visually distinct", () => {
	// They are genuinely different apps and both appear on internal-user-ids-notion.
	assert.notEqual(APP_COLOURS.Notion, APP_COLOURS["Notion (Unofficial by work.flowers)"]);
});

test("option names are unique within each property", () => {
	for (const list of [SEEDED_APPS, SEEDED_CONNECTION_ALIASES]) {
		const names = list.map((o) => o.name);
		assert.equal(new Set(names).size, names.length);
	}
});

test("assertDeclared passes declared values through without warning", () => {
	const warnings: string[] = [];
	const original = console.warn;
	console.warn = (m: string) => warnings.push(m);
	try {
		assert.deepEqual(assertDeclared("Apps", ["Notion", "Gmail"], "z"), ["Notion", "Gmail"]);
		assert.deepEqual(assertDeclared("Connections", ["gdrive"], "z"), ["gdrive"]);
	} finally {
		console.warn = original;
	}
	assert.equal(warnings.length, 0);
});

test("assertDeclared warns, but does not filter, on an undeclared value", () => {
	// The platform drops it either way; filtering would only hide the problem.
	const warnings: string[] = [];
	const original = console.warn;
	console.warn = (m: string) => warnings.push(m);
	try {
		assert.deepEqual(assertDeclared("Apps", ["Notion", "Not A Real App"], "my-zap"), [
			"Notion",
			"Not A Real App",
		]);
	} finally {
		console.warn = original;
	}
	assert.equal(warnings.length, 1);
	assert.ok(warnings[0].includes("my-zap"), "names the Zap");
	assert.ok(warnings[0].includes('"Not A Real App"'), "names the offending value");
	// Quoted form only — the message itself says "dropped by Notion".
	assert.ok(!warnings[0].includes('"Notion"'), "does not flag declared values");
});

test("the Gmail Zap's values are now declared", () => {
	// The regression that surfaced this: gdrive / Gmail / Google Drive were all
	// undeclared and silently dropped.
	const apps = new Set(SEEDED_APPS.map((o) => o.name));
	const aliases = new Set(SEEDED_CONNECTION_ALIASES.map((o) => o.name));
	for (const app of ["Gmail", "Google Drive"]) assert.ok(apps.has(app), `${app} missing`);
	assert.ok(aliases.has("gdrive"));
});

test("the values the 2026-10-03 zapsSync run dropped are now declared", () => {
	// Copied from the run logs' "are not declared options" warnings.
	const apps = new Set(SEEDED_APPS.map((o) => o.name));
	const aliases = new Set(SEEDED_CONNECTION_ALIASES.map((o) => o.name));
	for (const app of [
		"API by Zapier",
		"BetterContact",
		"Buttondown",
		"GitHub",
		"Google AI Studio (Gemini)",
		"Google Calendar",
		"Google Sheets",
		"Google Workspace Admin",
		"Harvest Project Status",
		"Linear",
		"MCP Client by Zapier",
		"Notion Agents (Unofficial)",
		"RSS by Zapier",
		"Readwise",
		"Schedule by Zapier",
		"Solution Partner Operations Tool",
		"Stripe",
		"WhatsApp Business",
		"Xero",
		"Zapier Forms",
		"eSignatures.com",
		"eSignatures.com (Unofficial)",
	]) {
		assert.ok(apps.has(app), `${app} missing`);
	}
	for (const alias of [
		"bettercontact",
		"buttondown_wf",
		"esign",
		"esign_unofficial",
		"gcal_scw",
		"gcal_wf",
		"gdrive_wf",
		"gemini_wf",
		"github_wf",
		"gmail_wf",
		"gsheets",
		"harvest_wf",
		"harvestcliapi_connection",
		"linear_wf",
		"notion_agents",
		"notion_mcp",
		"notioncliapi_connection",
		"slack_wf",
		"spot",
		"typesafe",
		"whatsapp_wf",
		"xero_wf",
		"zapier_partner",
	]) {
		assert.ok(aliases.has(alias), `${alias} missing`);
	}
});
