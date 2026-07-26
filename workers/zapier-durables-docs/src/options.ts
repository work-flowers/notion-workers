import type { SelectColor } from "@notionhq/workers/types";

/**
 * Seed options for the `Apps` and `Connections` multi-selects, from the 14
 * durables live on 2026-07-26.
 *
 * These only pre-populate the property. A value outside these lists is created
 * by Notion on write, so a new app or alias needs no code change — it just gets
 * an arbitrary colour until it is added here.
 *
 * Colours are assigned per app, roughly following brand where Notion's ten-colour
 * palette allows. A connection alias takes **the colour of the app it binds**,
 * so the two columns read together: `apollo` and `Apollo` are the same purple.
 */

/** App display title -> colour. Titles are what `getApp` returns, minus the version. */
export const APP_COLOURS = {
	Apollo: "purple",
	"Buttondown (Unofficial)": "yellow",
	Contrast: "pink",
	Harvest: "orange",
	Luma: "red",
	"Ninjapear (Unofficial)": "green",
	Notion: "default",
	// A different app from "Notion" — the private work.flowers build. Grey keeps
	// it adjacent to Notion's default without colliding with it.
	"Notion (Unofficial by work.flowers)": "gray",
	Slack: "blue",
	// Both Zapier's own apps deliberately share a colour.
	"Webhooks by Zapier": "brown",
	"Zapier Manager": "brown",
} as const satisfies Record<string, SelectColor>;

/** Connection alias -> the app it binds, so it can inherit that app's colour. */
const ALIAS_TO_APP = {
	apollo: "Apollo",
	buttondown: "Buttondown (Unofficial)",
	enrichment: "Ninjapear (Unofficial)",
	notion_wf: "Notion",
} as const satisfies Record<string, keyof typeof APP_COLOURS>;

export type SelectOption = { name: string; color: SelectColor };

export const SEEDED_APPS: SelectOption[] = Object.entries(APP_COLOURS).map(([name, color]) => ({
	name,
	color,
}));

export const SEEDED_CONNECTION_ALIASES: SelectOption[] = Object.entries(ALIAS_TO_APP).map(
	([name, app]) => ({ name, color: APP_COLOURS[app] }),
);

/** The app a connection alias binds, for tests and for reasoning about colours. */
export function appForAlias(alias: string): string | undefined {
	return (ALIAS_TO_APP as Record<string, string>)[alias];
}
