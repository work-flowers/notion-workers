import type { Send } from "./aggregate.ts"

/**
 * Stand-in data for `ntn customblocks dev` and for `?mock` in a plain browser,
 * so layout and chart work doesn't need a bound data source. Shaped like the
 * real Email Analytics rows, including the one delivered-but-never-opened send.
 */
export const MOCK_SENDS: Send[] = [
	row("Stop Troubleshooting your Zaps Manually. Like an Animal.", "2026-07-31", 176, 88, 18, 1),
	row("How Knoxx Foods Built the Operational Foundations for AI", "2026-07-15", 180, 101, 26, 5),
	row("How AI Coding Agents Are Redefining Automation", "2026-06-30", 169, 98, 20, 0),
	row("The teams that scale write down what lives in the founder's head.", "2026-06-17", 55, 37, 1, 0),
	row("Singapore Leads the World on AI Adoption. Most Teams Still Don't.", "2026-06-16", 54, 34, 3, 0),
	row("Singapore Leads the World on AI Adoption (resend)", "2026-06-16", 54, 35, 2, 0),
	row("Why Notion Workers + Dashboards are my New BI Stack", "2026-05-21", 54, 40, 3, 0),
	row("I'm Not Vibe-Coding the Next Salesforce", "2026-05-13", 52, 36, 5, 0),
	row("(Claude) Design is my Passion", "2026-05-04", 50, 35, 3, 0),
	row("How Claude Cowork Does My Job While I Walk the Kids to School", "2026-04-22", 51, 34, 8, 0),
	row("Your CRM's $2,500 Enrichment Feature Costs Me Half a Cent Per Contact", "2026-04-15", 51, 38, 4, 0),
	row("What I Learned Optimising a Multi-Turn AI Agent (the Hard Way)", "2026-04-07", 49, 0, 0, 0),
]

function row(
	subject: string,
	sentOn: string,
	deliveries: number,
	opens: number,
	clicks: number,
	unsubscribes: number,
): Send {
	return { id: sentOn + subject.slice(0, 8), subject, sentOn, deliveries, opens, clicks, unsubscribes }
}
