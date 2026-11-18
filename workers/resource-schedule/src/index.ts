import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

/**
 * Resourcing schedule — a Forecast-style capacity grid over four ordinary
 * Notion databases (Bookings, Jobs, Clients, Job templates).
 *
 * - **Team** tab: one row per person (plus an Overflow placeholder row), with
 *   a per-day availability heat map. Expand a person to see their jobs.
 * - **Projects** tab: one row per job, grouped by client. Expand a job to see
 *   who is on it.
 * - Search matches names, roles and teams, so typing "retouching" narrows the
 *   grid to retouchers.
 * - **New job** creates a Job from a template and drops one booking per round
 *   on the Overflow row with the template's recommended hours. A person then
 *   reassigns each booking; the picker ranks people with the role by open hours
 *   but never assigns on its own.
 *
 * People are real workspace members (a Person property). Role, Team and
 * Weekly capacity live on the Bookings rows: the block reads them from a
 * person's existing bookings and writes them onto any booking it assigns to
 * that person, so the grid works for a guest who can't see the People
 * database. (Notion automations can't reach People-record properties.)
 *
 * Property keys are the block's own vocabulary; the config panel maps them onto
 * real properties. **The declared `type` must equal the bound property's type
 * exactly** or the key silently resolves to unbound.
 */
worker.customBlock("resourceSchedule", {
	path: "./blocks/schedule",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		bookings: {
			name: "Bookings",
			description: "Written to. One row per assignment: a person (or the Overflow placeholder) on a job for a date range.",
			icon: { type: "emoji", emoji: "🗓️" },
			properties: {
				title: { name: "Booking", description: "Title.", type: "title" },
				job: { name: "Job", description: "Relation to Jobs.", type: "relation" },
				person: { name: "Person", description: "Person. Empty while the booking sits on a placeholder.", type: "people" },
				placeholder: {
					name: "Placeholder",
					description: "Select. “Overflow” for work that isn't assigned yet.",
					type: "select",
				},
				dates: { name: "Dates", description: "Date range, inclusive. Weekends are skipped.", type: "date" },
				hoursPerDay: { name: "Hours per day", description: "Number.", type: "number" },
				round: { name: "Round", description: "Number. Which template round this booking is.", type: "number" },
				role: {
					name: "Role",
					description: "Multi-select. Written by the block from the person's other bookings.",
					type: "multi_select",
				},
				team: { name: "Team", description: "Select. Written by the block from the person's other bookings.", type: "select" },
				capacity: {
					name: "Weekly capacity",
					description: "Number. Written by the block from the person's other bookings. Empty means 35.",
					type: "number",
				},
				notes: { name: "Notes", description: "Text.", type: "rich_text" },
			},
		},
		jobs: {
			name: "Jobs",
			description: "Written to by New job.",
			icon: { type: "emoji", emoji: "📁" },
			properties: {
				title: { name: "Job", description: "Title.", type: "title" },
				number: { name: "Job number", description: "Text.", type: "rich_text" },
				client: { name: "Client", description: "Relation to Clients.", type: "relation" },
				template: { name: "Template", description: "Relation to Job templates.", type: "relation" },
				label: { name: "Label", description: "Select. Colour of the job's bars.", type: "select" },
			},
		},
		clients: {
			name: "Clients",
			description: "Read-only.",
			icon: { type: "emoji", emoji: "🏢" },
			properties: {
				name: { name: "Client", description: "Title.", type: "title" },
				dedicated: { name: "Dedicated people", description: "Person. Staff dedicated to this account.", type: "people" },
			},
		},
		templates: {
			name: "Job templates",
			description: "Read-only. Recommended hours per round.",
			icon: { type: "emoji", emoji: "🧩" },
			properties: {
				name: { name: "Template", description: "Title.", type: "title" },
				round1: { name: "Round 1 hrs", description: "Number.", type: "number" },
				round2: { name: "Round 2 hrs", description: "Number.", type: "number" },
				round3: { name: "Round 3 hrs", description: "Number.", type: "number" },
				gap: {
					name: "Days between rounds",
					description: "Number. Working days of feedback time between rounds.",
					type: "number",
				},
				role: { name: "Role", description: "Select. The role that usually does this work.", type: "select" },
			},
		},
	},
})
