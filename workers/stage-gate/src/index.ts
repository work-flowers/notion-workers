import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

/**
 * Stage gate — a phase-by-phase checklist for one project, with an
 * "Advance phase" button that only enables once every mandatory item in the
 * current phase is Complete or N/A.
 *
 * Place it in the body of a project page (ideally the project template). The
 * block finds its project through `usePage()`; anywhere else it shows a
 * project picker instead.
 *
 * If the project has no deliverables yet, the block creates one row per
 * checklist item and links it to the project. The checklist itself is
 * hard-coded in `blocks/stage-gate/src/checklist.ts` for now.
 *
 * Neutral by design: it uses Notion's own design tokens (NDS) so it reads as
 * part of whichever workspace it is shown in. No client or agency branding.
 *
 * Property keys are the block's own vocabulary; the config panel maps them
 * onto real properties. **The declared `type` must equal the bound property's
 * type exactly** or the key silently resolves to unbound.
 */
worker.customBlock("stageGate", {
	path: "./blocks/stage-gate",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		projects: {
			name: "Projects",
			description:
				"One row per project. The block reads the current phase and writes it when a phase is advanced.",
			icon: { type: "emoji", emoji: "🛻" },
			properties: {
				name: {
					name: "Project",
					description: "Title property.",
					type: "title",
				},
				phase: {
					name: "Phase",
					description:
						"Status property. Option names must match the checklist's phases, plus a final 'Handed over'.",
					type: "status",
				},
				make: {
					name: "Make",
					description: "Text. Optional; filled in from the New vehicle platform form.",
					type: "rich_text",
				},
				model: {
					name: "Model",
					description: "Text. Optional; filled in from the New vehicle platform form.",
					type: "rich_text",
				},
				variant: {
					name: "Variant",
					description: "Text. Optional; filled in from the New vehicle platform form.",
					type: "rich_text",
				},
				deliverables: {
					name: "Deliverables",
					description:
						"Relation to the Deliverables data source. Used as a cross-check before creating checklist rows, so a project is never seeded twice.",
					type: "relation",
				},
			},
		},
		deliverables: {
			name: "Deliverables",
			description:
				"One row per checklist item per project. The block creates missing rows and updates Status and Completed date.",
			icon: { type: "emoji", emoji: "✅" },
			properties: {
				item: {
					name: "Item",
					description: "Title property.",
					type: "title",
				},
				project: {
					name: "Project",
					description: "Relation to the Projects data source.",
					type: "relation",
				},
				phase: {
					name: "Phase",
					description: "Select. Same option names as the project phases, without 'Handed over'.",
					type: "select",
				},
				category: {
					name: "Category",
					description: "Select.",
					type: "select",
				},
				description: {
					name: "Description",
					description: "Text.",
					type: "rich_text",
				},
				format: {
					name: "Format",
					description: "Select.",
					type: "select",
				},
				mandatory: {
					name: "Mandatory",
					description: "Checkbox. Only mandatory items gate a phase.",
					type: "checkbox",
				},
				status: {
					name: "Status",
					description: "Status property with Pending, Complete and N/A. Complete and N/A both count as done.",
					type: "status",
				},
				completedDate: {
					name: "Completed date",
					description: "Date. Set when an item is marked Complete, cleared otherwise.",
					type: "date",
				},
				fileLink: {
					name: "File link",
					description:
						"URL. Where the file lives (workbook tab, server folder, PDM). Required before an item can be marked Complete.",
					type: "url",
				},
				owner: {
					name: "Owner",
					description:
						"Person. Optional. Who the item is allocated to; set from the owner picker on each item.",
					type: "people",
				},
				order: {
					name: "Order",
					description: "Number. Position in the checklist.",
					type: "number",
				},
				itemKey: {
					name: "Item key",
					description: "Text. Stable key per checklist item, used to match rows and avoid duplicate seeding.",
					type: "rich_text",
				},
			},
		},
	},
})
