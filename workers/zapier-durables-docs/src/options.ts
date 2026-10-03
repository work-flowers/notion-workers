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
	"API by Zapier": "brown",
	BetterContact: "blue",
	Buttondown: "yellow",
	"Buttondown (Unofficial)": "yellow",
	Contrast: "pink",
	"eSignatures.com": "green",
	"eSignatures.com (Unofficial)": "green",
	GitHub: "gray",
	Gmail: "red",
	"Google AI Studio (Gemini)": "red",
	"Google Calendar": "red",
	"Google Drive": "red",
	"Google Sheets": "red",
	"Google Workspace Admin": "red",
	Harvest: "orange",
	"Harvest Project Status": "orange",
	Linear: "purple",
	Luma: "pink",
	"MCP Client by Zapier": "brown",
	"Ninjapear (Unofficial)": "green",
	Notion: "default",
	// A different app from "Notion" — the private work.flowers build. Grey keeps
	// it adjacent to Notion's default without colliding with it.
	"Notion (Unofficial by work.flowers)": "gray",
	"Notion Agents (Unofficial)": "gray",
	Readwise: "yellow",
	"RSS by Zapier": "brown",
	"Schedule by Zapier": "brown",
	Slack: "blue",
	// Zapier's partner portal (SPOT), so it sits with the Zapier apps.
	"Solution Partner Operations Tool": "brown",
	Stripe: "purple",
	"Webhooks by Zapier": "brown",
	"WhatsApp Business": "green",
	Xero: "blue",
	"Zapier Forms": "brown",
	"Zapier Manager": "brown",
} as const satisfies Record<string, SelectColor>;

/**
 * Apps that deliberately share a colour. Thirty-six apps against Notion's ten
 * colours means most colours are shared; each group here is the complete set
 * of apps on that colour.
 *
 * Same-vendor apps are grouped on purpose (Zapier, Google, Harvest, Buttondown,
 * eSignatures, the unofficial Notion builds). The rest are brand-adjacent
 * collisions of necessity rather than meaning — Luma and Contrast are both
 * event tools and never appear on the same Zap, so that clash is invisible.
 */
export const SHARED_COLOURS: readonly (readonly string[])[] = [
	[
		"API by Zapier",
		"MCP Client by Zapier",
		"RSS by Zapier",
		"Schedule by Zapier",
		"Solution Partner Operations Tool",
		"Webhooks by Zapier",
		"Zapier Forms",
		"Zapier Manager",
	],
	[
		"Gmail",
		"Google AI Studio (Gemini)",
		"Google Calendar",
		"Google Drive",
		"Google Sheets",
		"Google Workspace Admin",
	],
	["Contrast", "Luma"],
	["Harvest", "Harvest Project Status"],
	["Buttondown", "Buttondown (Unofficial)", "Readwise"],
	["eSignatures.com", "eSignatures.com (Unofficial)", "Ninjapear (Unofficial)", "WhatsApp Business"],
	["BetterContact", "Slack", "Xero"],
	["Apollo", "Linear", "Stripe"],
	["GitHub", "Notion (Unofficial by work.flowers)", "Notion Agents (Unofficial)"],
];

/** Connection alias -> the app it binds, so it can inherit that app's colour. */
const ALIAS_TO_APP = {
	apollo: "Apollo",
	bettercontact: "BetterContact",
	buttondown: "Buttondown (Unofficial)",
	buttondown_wf: "Buttondown",
	enrichment: "Ninjapear (Unofficial)",
	esign: "eSignatures.com",
	esign_unofficial: "eSignatures.com (Unofficial)",
	gcal_scw: "Google Calendar",
	gcal_wf: "Google Calendar",
	gdrive: "Google Drive",
	gdrive_wf: "Google Drive",
	gemini_wf: "Google AI Studio (Gemini)",
	github_wf: "GitHub",
	gmail_wf: "Gmail",
	gsheets: "Google Sheets",
	harvest_wf: "Harvest",
	harvestcliapi_connection: "Harvest",
	linear_wf: "Linear",
	notion_agents: "Notion Agents (Unofficial)",
	// The Notion MCP connection is bound through Zapier's MCP Client app.
	notion_mcp: "MCP Client by Zapier",
	notion_wf: "Notion",
	notioncliapi_connection: "Notion",
	slack_wf: "Slack",
	spot: "Solution Partner Operations Tool",
	// TypeSafe (Jev) is called through an API by Zapier connection.
	typesafe: "API by Zapier",
	whatsapp_wf: "WhatsApp Business",
	xero_wf: "Xero",
	zapier_partner: "Solution Partner Operations Tool",
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
