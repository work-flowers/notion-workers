import type { SelectColor } from "@notionhq/workers/types";

/**
 * Declared options for the `Apps` and `Connections` multi-selects.
 *
 * **These lists are not seeds — they are the whole allowed set.** Verified
 * 2026-07-26: the platform *silently drops* a multi-select value that is not a
 * declared option. It does not error and it does not create the option; the
 * cell is simply written empty. `gmail-attachments-to-drive-by-type` synced
 * with blank `Connections` and `Apps` for exactly this reason — it computed
 * `["gdrive"]` and `["Gmail", "Google Drive"]`, none of which were declared.
 *
 * So a new app or connection alias **does** need a code change here plus a
 * deploy. `assertDeclared` logs loudly when a value is about to be dropped, so
 * the next one shows up in the run logs rather than as a mystery blank cell.
 *
 * Colours are per app, roughly following brand. A connection alias takes the
 * colour of the app it binds, so `apollo` and `Apollo` read as a pair.
 */

/** App display title -> colour. Titles are what `getApp` returns, minus the version. */
export const APP_COLOURS = {
	Apollo: "purple",
	"Buttondown (Unofficial)": "yellow",
	Contrast: "pink",
	Gmail: "red",
	"Google Drive": "red",
	Harvest: "orange",
	Luma: "pink",
	"Ninjapear (Unofficial)": "green",
	Notion: "default",
	// A different app from "Notion" — the private work.flowers build. Grey keeps
	// it adjacent to Notion's default without colliding with it.
	"Notion (Unofficial by work.flowers)": "gray",
	Slack: "blue",
	"Webhooks by Zapier": "brown",
	"Zapier Manager": "brown",
} as const satisfies Record<string, SelectColor>;

/**
 * Apps that deliberately share a colour. Thirteen apps against Notion's ten
 * colours means some must double up; these are the pairs chosen.
 *
 * Same-vendor pairs are grouped on purpose. Luma and Contrast collide out of
 * necessity rather than meaning — they are both event tools and never appear
 * on the same Zap, so the clash is invisible in practice.
 */
export const SHARED_COLOURS: readonly (readonly string[])[] = [
	["Webhooks by Zapier", "Zapier Manager"],
	["Gmail", "Google Drive"],
	["Contrast", "Luma"],
];

/** Connection alias -> the app it binds, so it can inherit that app's colour. */
const ALIAS_TO_APP = {
	apollo: "Apollo",
	buttondown: "Buttondown (Unofficial)",
	enrichment: "Ninjapear (Unofficial)",
	gdrive: "Google Drive",
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

const DECLARED_APPS = new Set(Object.keys(APP_COLOURS));
const DECLARED_ALIASES = new Set(Object.keys(ALIAS_TO_APP));

/**
 * Warn about values the platform will silently discard.
 *
 * Returns the values unchanged — this only makes the drop visible. Filtering
 * them out would be worse: an empty cell and a warning is the same outcome, and
 * passing them through keeps the behaviour honest if the platform ever starts
 * creating options.
 */
export function assertDeclared(
	kind: "Apps" | "Connections",
	values: string[],
	zapName: string,
): string[] {
	const declared = kind === "Apps" ? DECLARED_APPS : DECLARED_ALIASES;
	const missing = values.filter((v) => !declared.has(v));
	if (missing.length) {
		console.warn(
			`${zapName}: ${kind} value(s) ${missing.map((m) => JSON.stringify(m)).join(", ")} are not ` +
				`declared options and will be silently dropped by Notion. Add them to ` +
				`src/options.ts and redeploy.`,
		);
	}
	return values;
}
