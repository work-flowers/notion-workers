import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

/**
 * Resourcing schedule — a Forecast-style capacity grid over five ordinary
 * Notion databases (Bookings, Team, Jobs, Clients, Job templates).
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
 * People are rows of a **Team** database, not workspace members: a Person
 * property can't show names to guests, and Notion's native People database
 * can't be shared with them either. Bookings point at Team rows through a
 * relation, and the person panel edits the Team row directly.
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
				member: {
					name: "Team member",
					description: "Relation to Team. Empty while the booking sits on a placeholder.",
					type: "relation",
				},
				placeholder: {
					name: "Placeholder",
					description: "Select. “Overflow” for work that isn't assigned yet.",
					type: "select",
				},
				dates: { name: "Dates", description: "Date range, inclusive. Weekends are skipped.", type: "date" },
				hoursPerDay: { name: "Hours per day", description: "Number.", type: "number" },
				round: { name: "Round", description: "Number. Which template round this booking is.", type: "number" },
				notes: { name: "Notes", description: "Text.", type: "rich_text" },
			},
		},
		team: {
			name: "Team",
			description: "Written to by the person panel. One row per bookable person.",
			icon: { type: "emoji", emoji: "👥" },
			properties: {
				name: { name: "Name", description: "Title.", type: "title" },
				roles: { name: "Role", description: "Multi-select. What they can be booked for.", type: "multi_select" },
				team: { name: "Team", description: "Select.", type: "select" },
				capacity: { name: "Weekly capacity", description: "Number. Bookable hours a week; empty means 35.", type: "number" },
				dedicatedTo: { name: "Dedicated to", description: "Relation to Clients. Accounts they're dedicated to.", type: "relation" },
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
