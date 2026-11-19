/**
 * The demo seed, mirrored from the Notion mock-up databases with readable ids
 * and **fictional people** (the Notion copy uses real workspace members, which
 * don't belong in a public repo). Clients and jobs are fictional in both.
 *
 * Dates are written against the seed's first Monday, `SEED_MONDAY`, and
 * shifted by `fixture(monday)` so the mock always opens on a busy week.
 */

import { addDays, daysBetween, type Booking, type Client, type Job, type Person, type Template } from "./model.ts"

export const SEED_MONDAY = "2026-11-16"

type Who = { id: string; name: string; role: string; team: string; capacity: number }

export const PEOPLE: Who[] = [
	{ id: "u-producer", name: "Robin Achebe", role: "Producer", team: "Studio", capacity: 35 },
	{ id: "u-designer-1", name: "Sam Okafor", role: "Designer", team: "Studio", capacity: 35 },
	{ id: "u-motion", name: "Lee Moretti", role: "Motion Designer", team: "Studio", capacity: 21 },
	{ id: "u-designer-2", name: "Priya Nair", role: "Designer", team: "Studio", capacity: 35 },
	{ id: "u-retoucher-1", name: "Mia Lindqvist", role: "Retoucher", team: "Studio", capacity: 35 },
	{ id: "u-retoucher-2", name: "Kate Duarte", role: "Retoucher", team: "Studio", capacity: 35 },
	{ id: "u-account", name: "Jamie Park", role: "Account Manager", team: "Agency", capacity: 28 },
	{ id: "u-editor", name: "Chris Mendes", role: "Editor", team: "Agency", capacity: 35 },
	{ id: "u-copy", name: "Noah Fischer", role: "Copywriter", team: "Agency", capacity: 35 },
	{ id: "u-designer-3", name: "Alex Romero", role: "Designer", team: "Agency", capacity: 35 },
]

const CLIENTS: Client[] = [
	{ id: "c-saltbush", name: "Saltbush Dairy" },
	{ id: "c-harbour", name: "Harbour & Pine" },
	{ id: "c-northwind", name: "Northwind Cycles" },
	{ id: "c-lumen", name: "Lumen Skincare" },
	{ id: "c-tidewater", name: "Tidewater Bank" },
	{ id: "c-kestrel", name: "Kestrel Air" },
]

const TEMPLATES: Template[] = [
	{ id: "t-edm", name: "EDM", rounds: [4, 2], gap: 2, role: "Designer" },
	{ id: "t-social", name: "Social resize set", rounds: [3], gap: 1, role: "Designer" },
	{ id: "t-kv", name: "Key visual", rounds: [8, 4, 2], gap: 2, role: "Designer" },
	{ id: "t-retouch", name: "Retouch batch", rounds: [6, 2], gap: 1, role: "Retoucher" },
	{ id: "t-video", name: "Video cut-downs", rounds: [7, 3, 1], gap: 2, role: "Editor" },
]

// [id, title, number, client, template, label]
const JOB_ROWS: [string, string, string, string | null, string | null, string][] = [
	["j1", "Summer catalogue retouch", "PA-2411", "c-saltbush", "t-retouch", "Green"],
	["j2", "Christmas EDM", "PA-2412", "c-saltbush", "t-edm", "Green"],
	["j3", "In-store POS key visual", "PA-2413", "c-saltbush", "t-kv", "Green"],
	["j4", "Spring launch key visual", "PA-2414", "c-harbour", "t-kv", "Blue"],
	["j5", "Spring launch social resizes", "PA-2415", "c-harbour", "t-social", "Blue"],
	["j6", "Launch film cut-downs", "PA-2416", "c-northwind", "t-video", "Orange"],
	["j7", "Dealer EDM", "PA-2417", "c-northwind", "t-edm", "Orange"],
	["j8", "Motion banners", "PA-2418", "c-northwind", null, "Orange"],
	["j9", "Hero product retouch", "PA-2419", "c-lumen", "t-retouch", "Pink"],
	["j10", "Holiday social set", "PA-2420", "c-lumen", "t-social", "Pink"],
	["j11", "Gift guide EDM", "PA-2421", "c-lumen", "t-edm", "Pink"],
	["j12", "Catalogue cover retouch", "PA-2422", "c-harbour", "t-retouch", "Blue"],
	["j13", "Brand campaign pitch", "HC-3101", "c-tidewater", "t-kv", "Purple"],
	["j14", "Brand campaign copy", "HC-3102", "c-tidewater", null, "Purple"],
	["j15", "Summer fares campaign", "HC-3103", "c-kestrel", "t-kv", "Yellow"],
	["j16", "Summer fares EDM", "HC-3104", "c-kestrel", "t-edm", "Yellow"],
	["j17", "Summer fares video edits", "HC-3105", "c-kestrel", "t-video", "Yellow"],
	["j18", "Q4 retainer account management", "HC-3106", null, null, "Brown"],
]

// [person id or null (Overflow), job, start, end, hours/day, round] — dates relative to SEED_MONDAY.
const BOOKING_ROWS: [string | null, string, string, string, number, number | null][] = [
	["u-producer", "j6", "11-16", "12-04", 2, null],
	["u-producer", "j1", "11-16", "11-27", 2, null],
	["u-producer", "j4", "11-23", "12-04", 2, null],
	["u-designer-1", "j4", "11-16", "11-20", 6, 1],
	["u-designer-1", "j4", "11-25", "11-27", 4, 2],
	["u-designer-1", "j5", "11-23", "11-24", 3, 1],
	["u-designer-1", "j7", "11-30", "12-01", 4, 1],
	["u-designer-1", "j7", "12-03", "12-03", 2, 2],
	["u-designer-1", "j10", "12-07", "12-09", 3, 1],
	["u-motion", "j8", "11-16", "11-27", 3, null],
	["u-motion", "j6", "11-18", "11-20", 2, null],
	["u-motion", "j8", "12-01", "12-04", 3, 2],
	["u-designer-2", "j3", "11-17", "11-19", 6, 1],
	["u-designer-2", "j2", "11-18", "11-18", 4, 1],
	["u-designer-2", "j2", "11-20", "11-20", 2, 2],
	["u-designer-2", "j3", "11-24", "11-25", 4, 2],
	["u-designer-2", "j10", "11-30", "12-02", 3, null],
	["u-retoucher-1", "j1", "11-16", "11-25", 6, 1],
	["u-retoucher-1", "j1", "11-26", "11-27", 2, 2],
	["u-retoucher-1", "j3", "11-30", "12-04", 5, null],
	["u-retoucher-2", "j9", "11-16", "11-18", 6, 1],
	["u-retoucher-2", "j9", "11-19", "11-19", 2, 2],
	["u-retoucher-2", "j1", "11-30", "12-04", 3, null],
	["u-account", "j18", "11-16", "12-11", 3, null],
	["u-account", "j13", "11-16", "11-27", 2, null],
	["u-editor", "j6", "11-16", "11-20", 7, 1],
	["u-editor", "j6", "11-25", "11-26", 3, 2],
	["u-editor", "j17", "11-30", "12-02", 7, 1],
	["u-editor", "j17", "12-07", "12-08", 3, 2],
	["u-copy", "j14", "11-17", "11-24", 4, null],
	["u-copy", "j2", "11-18", "11-18", 2, null],
	["u-copy", "j16", "11-30", "12-01", 2, null],
	["u-designer-3", "j13", "11-16", "11-20", 6, 1],
	["u-designer-3", "j13", "11-24", "11-25", 4, 2],
	["u-designer-3", "j15", "11-30", "12-04", 6, 1],
	["u-designer-3", "j16", "12-07", "12-08", 4, 1],
	[null, "j11", "11-19", "11-19", 4, 1],
	[null, "j11", "11-23", "11-23", 2, 2],
	[null, "j12", "11-19", "11-19", 6, 1],
	[null, "j12", "11-20", "11-20", 2, 2],
]

export type Fixture = { bookings: Booking[]; jobs: Job[]; clients: Client[]; templates: Template[]; people: Person[] }

/** Who is dedicated to which client, as the Team database's "Dedicated to" relation holds it. */
const DEDICATED: Record<string, string[]> = { "u-retoucher-1": ["c-saltbush"] }

/** The seed with every date moved so `SEED_MONDAY` lands on `monday`. */
export function fixture(monday: string = SEED_MONDAY): Fixture {
	const shift = daysBetween(SEED_MONDAY, monday)
	const at = (md: string) => addDays(`2026-${md}`, shift)
	const jobs: Job[] = JOB_ROWS.map(([id, title, number, clientId, templateId, label]) => ({
		id,
		title,
		number,
		clientId,
		templateId,
		label,
	}))
	const bookings: Booking[] = BOOKING_ROWS.map(([who, jobId, s, e, h, round], i) => {
		const p = PEOPLE.find((x) => x.id === who)
		const job = jobs.find((j) => j.id === jobId)
		return {
			id: `b${i + 1}`,
			title: `${job?.title ?? "Job"}${round ? ` · R${round}` : ""}`,
			jobId,
			personId: p?.id ?? null,
			placeholder: p ? null : "Overflow",
			start: at(s),
			end: at(e),
			hoursPerDay: h,
			round,
			notes: null,
		}
	})
	return {
		bookings,
		jobs,
		clients: CLIENTS,
		templates: TEMPLATES,
		people: PEOPLE.map((p) => ({
			id: p.id,
			name: p.name,
			roles: [p.role],
			team: p.team,
			weeklyCapacity: p.capacity,
			dedicatedTo: DEDICATED[p.id] ?? [],
		})),
	}
}
