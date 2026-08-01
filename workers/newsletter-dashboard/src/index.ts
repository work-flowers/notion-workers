import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

/**
 * Newsletter engagement dashboard.
 *
 * The block declares the *shape* of the data it needs, not a concrete
 * database: whoever inserts the block maps these keys to real properties in
 * Notion. Bind it to the `Email Analytics` data source of the `Newsletter`
 * database, which `buttondown-sync` populates.
 *
 * Every rate is recomputed from the raw counts at the aggregate level
 * (Σ clicks / Σ deliveries), which is why the block asks for the counts and
 * not for the row-level `Click Rate` / `Open Rate` numbers. Averaging
 * per-send ratios — all a native Notion chart can do — weights a 50-delivery
 * send the same as a 180-delivery one, which is not the real rate.
 */
worker.customBlock("newsletterDashboard", {
	path: "./blocks/newsletter-dashboard",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		sends: {
			name: "Newsletter sends",
			description:
				"One row per send, with the raw delivery and engagement counts. Rates are recalculated from these counts, so map the counts rather than any percentage property.",
			icon: { type: "emoji", emoji: "📈" },
			properties: {
				subject: {
					name: "Subject",
					description: "The send's title.",
					type: "title",
				},
				sentAt: {
					name: "Publish date",
					description: "The date the send went out. Drives the time buckets.",
					type: "date",
				},
				deliveries: {
					name: "Deliveries",
					description:
						"Emails actually delivered. The denominator for open, click and unsubscribe rates.",
					type: "number",
				},
				opens: {
					name: "Opens",
					description: "Opens counted for the send.",
					type: "number",
				},
				clicks: {
					name: "Clicks",
					description: "Clicks counted for the send.",
					type: "number",
				},
				unsubscribes: {
					name: "Unsubscriptions",
					description: "Unsubscribes attributed to the send.",
					type: "number",
				},
				// Deliberately no relation to Newsletter Issues. Email Analytics does
				// carry one, but a custom block cannot open a Notion page (see
				// CLAUDE.md), so reading it here would only ever produce a link that
				// doesn't go anywhere. Notion's own relation cell does that job.
			},
		},
	},
})
