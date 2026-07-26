import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_COLOURS, appForAlias, SEEDED_APPS, SEEDED_CONNECTION_ALIASES } from "./options.js";

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

test("apps are near-distinct, and only Zapier's own apps share a colour", () => {
	const byColour = new Map<string, string[]>();
	for (const { name, color } of SEEDED_APPS) {
		byColour.set(color, [...(byColour.get(color) ?? []), name]);
	}
	for (const [colour, names] of byColour) {
		if (names.length === 1) continue;
		assert.ok(
			names.every((n) => n.includes("Zapier")),
			`${colour} is shared by unrelated apps: ${names.join(", ")}`,
		);
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
