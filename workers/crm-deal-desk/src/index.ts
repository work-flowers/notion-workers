import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

/**
 * CRM Desk — a three-tab CRM front end (Contacts, Companies, Deals) over the
 * Notion CRM.
 *
 * It began as the Deal Desk proof of concept and keeps its two arguments:
 *
 * 1. **Pre-filtered relation pickers.** Notion's relation cell always offers
 *    every row in the target database. Picking a Company here narrows the
 *    Contact picker to that company's people — the constraint is applied
 *    *before* the write, not by an automation that comments afterwards.
 * 2. **Conditional gating.** A deal cannot enter a stage until that stage's
 *    requirements are met, and the UI says which ones are missing. Notion can
 *    only detect the bad state after it has been saved.
 *
 * Every record — deal, contact, company — also renders its linked Meeting
 * Notes and Emails, the way the native Notion page does. Those two databases
 * are far past the 999-row query cap and cannot be filtered by relation, so
 * they are read per record through `pages.get` on the relation ids. The
 * `meetingNotes` / `emails` keys below are *optional* bindings that serve as a
 * newest-first warm cache; unbound, everything goes through `pages.get`.
 *
 * Property keys are the block's own vocabulary — the config panel maps them
 * onto real Notion properties. The `description` on each key names the live
 * workFlowers CRM property it expects, so the panel doubles as the binding
 * checklist (also tabulated in README.md). **The declared `type` must equal
 * the bound property's type exactly** or the key silently resolves to
 * unbound.
 */
worker.customBlock("dealDesk", {
	path: "./blocks/crm-desk",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		deals: {
			name: "Deals",
			description:
				"The pipeline. Written to: the block creates deals and updates their stage and fields. Live CRM: the Deals data source under Core CRM Objects.",
			icon: { type: "emoji", emoji: "💰" },
			properties: {
				name: {
					name: "Deal name",
					description: "Title property. Live: Deal Name.",
					type: "title",
				},
				stage: {
					name: "Stage",
					description:
						"Status property. Live: Status. The block gates movement between stages, so the option names must match: Lead, Proposal, Negotiation, In signing, Closed Won, Closed Lost, Declined.",
					type: "status",
				},
				dealType: {
					name: "Type",
					description:
						"Select. Live: Type. Engagement type, required from Proposal onwards.",
					type: "select",
				},
				value: {
					name: "Value",
					description:
						"Number. Live: Value. Deal value in the deal's currency; required from Proposal onwards and must be above zero to close won.",
					type: "number",
				},
				currency: {
					name: "Deal currency",
					description:
						"Relation to FX Rates (limit 1). Live: Deal Currency. Pairs with the fxRates data source to label values and convert the pipeline to SGD.",
					type: "relation",
				},
				probability: {
					name: "Probability",
					description:
						"Number (percent). Live: Probability. Win probability 0–1, optional; weights the pipeline figure.",
					type: "number",
				},
				expectedClose: {
					name: "Expected close",
					description:
						"Date. Live: Expected Close. Forecast close date, required from Negotiation onwards.",
					type: "date",
				},
				actualClose: {
					name: "Actual close",
					description:
						"Date. Live: Actual Close. Read-only here — a database automation stamps it when a deal closes, so the block never requires or writes it.",
					type: "date",
				},
				company: {
					name: "Company",
					description:
						"Relation to Companies (limit 1). Live: Company. Drives the Contact picker — pick this first.",
					type: "relation",
				},
				contact: {
					name: "Contact",
					description:
						"Relation to Contacts (limit 1). Live: Contact. The block only offers contacts belonging to the selected company.",
					type: "relation",
				},
				referredBy: {
					name: "Referred by",
					description:
						"Relation to Contacts (limit 1). Live: Referred by. Optional referrer; any contact.",
					type: "relation",
				},
				lostReason: {
					name: "Lost reason",
					description:
						"Select. Live: Lost Reason. Required by Closed Lost and Declined; cleared automatically when a deal leaves those stages.",
					type: "select",
				},
				description: {
					name: "Description",
					description: "Text. Live: Description. Free-text notes on the deal.",
					type: "rich_text",
				},
				owner: {
					name: "Owner",
					description:
						"Person. Live: Owner. Read-only — shown on the deal, never written.",
					type: "people",
				},
				meetingNotes: {
					name: "Meeting notes",
					description:
						"Relation to Meeting Notes. Live: Meeting Notes. Read-only; the linked pages are rendered on the deal.",
					type: "relation",
				},
				emails: {
					name: "Emails",
					description:
						"Relation to Emails. Live: Emails. Read-only; the linked pages are rendered on the deal.",
					type: "relation",
				},
			},
		},
		companies: {
			name: "Companies",
			description:
				"Accounts. Written to: the block creates companies and edits their core fields. Live CRM: the Companies data source under Core CRM Objects.",
			icon: { type: "emoji", emoji: "🏢" },
			properties: {
				name: {
					name: "Company name",
					description: "Title property. Live: Company Name.",
					type: "title",
				},
				website: {
					name: "Website",
					description: "URL. Live: Website.",
					type: "url",
				},
				description: {
					name: "Description",
					description: "Text. Live: Description.",
					type: "rich_text",
				},
				industry: {
					name: "Industry",
					description: "Select. Live: Industry.",
					type: "select",
				},
				size: {
					name: "Size",
					description: "Select. Live: Size (headcount band).",
					type: "select",
				},
				country: {
					name: "Country",
					description: "Select. Live: Country (ISO-2 codes).",
					type: "select",
				},
				contacts: {
					name: "Contacts",
					description:
						"Relation to Contacts. Live: Contacts. Read-only; lists the company's people.",
					type: "relation",
				},
				deals: {
					name: "Deals",
					description:
						"Relation to Deals. Live: Deals. Read-only; lists the company's deals.",
					type: "relation",
				},
				meetingNotes: {
					name: "Meeting notes",
					description:
						"Relation to Meeting Notes. Live: Meeting Notes. Read-only.",
					type: "relation",
				},
				emails: {
					name: "Emails",
					description: "Relation to Emails. Live: Emails. Read-only.",
					type: "relation",
				},
			},
		},
		contacts: {
			name: "Contacts",
			description:
				"People. Written to: the block creates contacts and edits their core fields. Live CRM: the Contacts data source under Core CRM Objects. The company relation is what makes the Contact picker pre-filterable — without it the picker falls back to offering everyone.",
			icon: { type: "emoji", emoji: "👤" },
			properties: {
				name: {
					name: "Contact name",
					description: "Title property. Live: Name.",
					type: "title",
				},
				firstName: {
					name: "First name",
					description: "Text. Live: First Name.",
					type: "rich_text",
				},
				lastName: {
					name: "Last name",
					description: "Text. Live: Last Name.",
					type: "rich_text",
				},
				jobTitle: {
					name: "Job title",
					description:
						"Text. Live: Job Title. Shown beside the name to disambiguate people.",
					type: "rich_text",
				},
				email: {
					name: "Email",
					description: "Email. Live: Primary Email.",
					type: "email",
				},
				phone: {
					name: "Phone",
					description: "Phone number. Live: Primary Phone.",
					type: "phone_number",
				},
				linkedin: {
					name: "LinkedIn",
					description: "URL. Live: Linkedin.",
					type: "url",
				},
				note: {
					name: "Note",
					description: "Text. Live: Note.",
					type: "rich_text",
				},
				leadSource: {
					name: "Lead source",
					description: "Select. Live: Lead Source.",
					type: "select",
				},
				country: {
					name: "Country",
					description: "Select. Live: Country (full names).",
					type: "select",
				},
				owner: {
					name: "Owner",
					description:
						"Person. Live: Owner. Read-only — shown on the contact, never written.",
					type: "people",
				},
				company: {
					name: "Related company",
					description:
						"Relation to Companies. Live: Related Company. The join that pre-filters the Contact picker on deals.",
					type: "relation",
				},
				deals: {
					name: "Deals",
					description:
						"Relation to Deals. Live: Deals. Read-only; lists the contact's deals.",
					type: "relation",
				},
				meetingNotes: {
					name: "Meeting notes",
					description:
						"Relation to Meeting Notes. Live: Meeting Notes. Read-only.",
					type: "relation",
				},
				emails: {
					name: "Emails",
					description:
						"Relation to Emails. Live: 📥 Emails (note the emoji prefix). Read-only.",
					type: "relation",
				},
			},
		},
		fxRates: {
			name: "FX rates",
			description:
				"Read-only. One row per currency, managed by the fx-rates worker. Labels deal values with their currency and converts the pipeline total to SGD.",
			icon: { type: "emoji", emoji: "💱" },
			properties: {
				currency: {
					name: "Currency",
					description: "Title property. Live: Currency (ISO code).",
					type: "title",
				},
				rateToSgd: {
					name: "Rate to SGD",
					description: "Number. Live: Rate to SGD.",
					type: "number",
				},
				rateDate: {
					name: "Rate date",
					description: "Date. Live: Rate Date.",
					type: "date",
				},
			},
		},
		meetingNotes: {
			name: "Meeting notes (optional cache)",
			description:
				"Optional. Read-only. Live CRM: the Meeting Notes data source. When bound, the newest 999 notes are held as a cache so a record's linked notes render instantly; anything older is fetched per record. Leave unbound to fetch everything per record.",
			icon: { type: "emoji", emoji: "📝" },
			properties: {
				title: {
					name: "Title",
					description: "Title property. Live: Title.",
					type: "title",
				},
				date: {
					name: "Date",
					description: "Date. Live: Date.",
					type: "date",
				},
				type: {
					name: "Type",
					description: "Select. Live: Type.",
					type: "select",
				},
				summary: {
					name: "Summary",
					description: "Text. Live: Summary.",
					type: "rich_text",
				},
			},
		},
		emails: {
			name: "Emails (optional cache)",
			description:
				"Optional. Read-only. Live CRM: the Emails data source. When bound, the newest 999 emails are held as a cache so a record's linked emails render instantly; anything older is fetched per record. Leave unbound to fetch everything per record.",
			icon: { type: "emoji", emoji: "📥" },
			properties: {
				title: {
					name: "Subject",
					description: "Title property. Live: Subject.",
					type: "title",
				},
				date: {
					name: "Date received",
					description: "Date. Live: Date Received.",
					type: "date",
				},
				from: {
					name: "From",
					description: "Email. Live: From.",
					type: "email",
				},
				summary: {
					name: "Thread summary",
					description: "Text. Live: Thread Summary.",
					type: "rich_text",
				},
			},
		},
	},
})
