import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

/**
 * Deal Desk — a focused CRM front end over the Notion CRM.
 *
 * This block exists to answer a product question, not an analytics one: can a
 * custom block replace the Notion database UI for people who find it
 * overwhelming, and enforce rules Notion itself cannot express?
 *
 * Two of those rules drive the whole design:
 *
 * 1. **Pre-filtered relation pickers.** Notion's relation cell always offers
 *    every row in the target database. Picking a Company here narrows the
 *    Contact picker to that company's people — the constraint is applied
 *    *before* the write, not by an automation that comments afterwards.
 * 2. **Conditional gating.** A deal cannot enter a stage until that stage's
 *    requirements are met, and the UI says which ones are missing. Notion can
 *    only detect the bad state after it has been saved.
 *
 * Both need three data sources, because both are joins. `companies` and
 * `contacts` are read to populate and constrain the pickers; only `deals` is
 * written to.
 *
 * Bind against the CRM's `Deals`, `Companies` and `Contacts` data sources.
 * Property keys below are the block's own vocabulary — the config panel maps
 * them onto real Notion properties, so a client CRM with different names binds
 * without a code change.
 */
worker.customBlock("dealDesk", {
	path: "./blocks/deal-desk",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		deals: {
			name: "Deals",
			description:
				"The pipeline. This is the only data source the block writes to — it creates deals and updates their stage and fields.",
			icon: { type: "emoji", emoji: "💰" },
			properties: {
				name: {
					name: "Deal name",
					description: "The deal's title.",
					type: "title",
				},
				stage: {
					name: "Stage",
					description:
						"The pipeline stage. The block gates movement between stages, so the option names it knows must match: Lead, Proposal, Negotiation, In signing, Closed Won, Closed Lost, Declined.",
					type: "status",
				},
				dealType: {
					name: "Type",
					description:
						"Engagement type. Required from Proposal onwards.",
					type: "select",
				},
				value: {
					name: "Value",
					description:
						"Deal value in the deal's currency. Required from Proposal onwards, and must be greater than zero to close won.",
					type: "number",
				},
				probability: {
					name: "Probability",
					description:
						"Win probability, 0–1. Optional; shown on the pipeline for weighting.",
					type: "number",
				},
				expectedClose: {
					name: "Expected close",
					description:
						"Forecast close date. Required from Negotiation onwards.",
					type: "date",
				},
				actualClose: {
					name: "Actual close",
					description:
						"The date the deal actually closed. Required by every closed stage.",
					type: "date",
				},
				company: {
					name: "Company",
					description:
						"The account. Drives the Contact picker — pick this first.",
					type: "relation",
				},
				contact: {
					name: "Contact",
					description:
						"The primary contact. The block only offers contacts belonging to the selected company.",
					type: "relation",
				},
				lostReason: {
					name: "Lost reason",
					description:
						"Why the deal was lost or declined. Required by Closed Lost and Declined.",
					type: "select",
				},
				description: {
					name: "Description",
					description: "Free-text notes shown on the deal detail panel.",
					type: "rich_text",
				},
			},
		},
		companies: {
			name: "Companies",
			description:
				"Read-only. Populates the Company picker and labels deals in the pipeline.",
			icon: { type: "emoji", emoji: "🏢" },
			properties: {
				name: {
					name: "Company name",
					description: "The account's title.",
					type: "title",
				},
			},
		},
		contacts: {
			name: "Contacts",
			description:
				"Read-only. Populates the Contact picker. The company relation is what makes pre-filtering possible — without it the picker cannot be narrowed and the block falls back to offering everyone.",
			icon: { type: "emoji", emoji: "👤" },
			properties: {
				name: {
					name: "Contact name",
					description: "The contact's title.",
					type: "title",
				},
				company: {
					name: "Related company",
					description:
						"The company this contact belongs to. This is the join that pre-filters the Contact picker.",
					type: "relation",
				},
				jobTitle: {
					name: "Job title",
					description:
						"Optional. Shown beside the name to disambiguate people.",
					type: "rich_text",
				},
				email: {
					name: "Email",
					description: "Optional. Shown on the deal detail panel.",
					type: "email",
				},
			},
		},
	},
})
