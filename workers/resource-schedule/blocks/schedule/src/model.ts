/**
 * The schedule's arithmetic, as pure functions: no React, no SDK. Dates are
 * plain `YYYY-MM-DD` strings throughout and all day arithmetic is done in UTC,
 * so no local timezone can shift a booking by a day.
 */

export const DEFAULT_WEEKLY_CAPACITY = 35
export const WORK_DAYS_PER_WEEK = 5
export const OVERFLOW = "Overflow"

export type Booking = {
	id: string
	title: string
	jobId: string | null
	personId: string | null
	placeholder: string | null
	start: string | null
	/** Inclusive. Equal to `start` for a one-day booking. */
	end: string | null
	hoursPerDay: number
	round: number | null
	roles: string[]
	team: string | null
	capacity: number | null
	notes: string | null
}

export type Job = {
	id: string
	title: string
	number: string | null
	clientId: string | null
	templateId: string | null
	label: string | null
}

export type Client = { id: string; name: string; dedicatedIds: string[] }

export type Template = { id: string; name: string; rounds: number[]; gap: number; role: string | null }

export type Person = {
	id: string
	name: string
	roles: string[]
	team: string | null
	weeklyCapacity: number
	/** Clients this person is dedicated to. */
	dedicatedTo: string[]
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

function toUtc(iso: string): number {
	const [y, m, d] = iso.split("-").map(Number)
	return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
	return fromUtc(toUtc(iso) + n * DAY_MS)
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(iso: string): number {
	return (new Date(toUtc(iso)).getUTCDay() + 6) % 7
}

export function isWeekend(iso: string): boolean {
	return weekday(iso) >= 5
}

export function mondayOf(iso: string): string {
	return addDays(iso, -weekday(iso))
}

export function daysBetween(a: string, b: string): number {
	return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

export function dayRange(start: string, count: number): string[] {
	return Array.from({ length: count }, (_, i) => addDays(start, i))
}

/** Working days from `start` to `end` inclusive. */
export function workingDays(start: string, end: string): string[] {
	const out: string[] = []
	for (let d = start; d <= end; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d)
	return out
}

/** Moves forward to the next weekday if `iso` falls on a weekend. */
export function nextWorkingDay(iso: string): string {
	let d = iso
	while (isWeekend(d)) d = addDays(d, 1)
	return d
}

/** The working day `n` working days after `iso` (n = 0 returns `iso` rolled to a weekday). */
export function addWorkingDays(iso: string, n: number): string {
	let d = nextWorkingDay(iso)
	for (let i = 0; i < n; i++) d = nextWorkingDay(addDays(d, 1))
	return d
}

export function todayIso(now = new Date()): string {
	const y = now.getFullYear()
	const m = String(now.getMonth() + 1).padStart(2, "0")
	const d = String(now.getDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// Bookings and load
// ---------------------------------------------------------------------------

export function bookingDays(b: Booking): string[] {
	if (b.start === null) return []
	return workingDays(b.start, b.end ?? b.start)
}

export function totalHours(b: Booking): number {
	return bookingDays(b).length * b.hoursPerDay
}

export function overlaps(b: Booking, from: string, to: string): boolean {
	if (b.start === null) return false
	return b.start <= to && (b.end ?? b.start) >= from
}

/** The row a booking belongs to: a person id, or the placeholder name. */
export function rowKey(b: Booking): string | null {
	if (b.personId !== null) return b.personId
	return b.placeholder
}

/** Booked hours per working day for one row. */
export function dailyLoad(bookings: readonly Booking[], key: string, exceptId?: string): Map<string, number> {
	const load = new Map<string, number>()
	for (const b of bookings) {
		if (rowKey(b) !== key || b.id === exceptId) continue
		for (const d of bookingDays(b)) load.set(d, (load.get(d) ?? 0) + b.hoursPerDay)
	}
	return load
}

export function dailyCapacity(p: Pick<Person, "weeklyCapacity">): number {
	return p.weeklyCapacity / WORK_DAYS_PER_WEEK
}

export type Availability = "free" | "partial" | "full" | "over"

export type DayCell = { booked: number; capacity: number; open: number; state: Availability }

const EPS = 1e-6

export function dayCell(booked: number, capacity: number): DayCell {
	const open = capacity - booked
	const state: Availability =
		booked <= EPS ? "free" : open > EPS ? "partial" : Math.abs(open) <= EPS ? "full" : "over"
	return { booked, capacity, open, state }
}

/** Formats hours for a cell: 7, 4.2, 3.5 — never 4.199999. */
export function fmtHours(h: number): string {
	const r = Math.round(h * 10) / 10
	return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * Everyone who appears on a booking, with role, team and capacity taken from
 * their bookings (the automation copies them there from the People database).
 * A booking that hasn't been filled in yet just contributes nothing.
 */
export function deriveRoster(
	bookings: readonly Booking[],
	names: ReadonlyMap<string, string>,
	clients: readonly Client[],
	extraIds: readonly string[] = [],
): Person[] {
	const byId = new Map<string, Person>()
	const ensure = (id: string) => {
		let p = byId.get(id)
		if (p === undefined) {
			p = { id, name: names.get(id) ?? "Unknown person", roles: [], team: null, weeklyCapacity: NaN, dedicatedTo: [] }
			byId.set(id, p)
		}
		return p
	}
	for (const id of extraIds) ensure(id)
	for (const b of bookings) {
		if (b.personId === null) continue
		const p = ensure(b.personId)
		for (const r of b.roles) if (!p.roles.includes(r)) p.roles.push(r)
		if (p.team === null && b.team !== null) p.team = b.team
		if (Number.isNaN(p.weeklyCapacity) && b.capacity !== null) p.weeklyCapacity = b.capacity
	}
	for (const c of clients) for (const id of c.dedicatedIds) byId.get(id)?.dedicatedTo.push(c.id)
	const people = [...byId.values()].map((p) => ({
		...p,
		weeklyCapacity: Number.isNaN(p.weeklyCapacity) ? DEFAULT_WEEKLY_CAPACITY : p.weeklyCapacity,
	}))
	return people.sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function norm(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").trim()
}

function commonPrefix(a: string, b: string): number {
	let i = 0
	while (i < a.length && i < b.length && a[i] === b[i]) i++
	return i
}

/**
 * Forecast-style search: every word of the query has to match something
 * about the row. A word matches a name, role or team by substring, or by a
 * shared stem of six letters or more, so "retouching" finds "Retoucher" and
 * "designers" finds "Designer".
 */
export function matchesQuery(haystack: readonly string[], query: string): boolean {
	const words = norm(query).split(/\s+/).filter(Boolean)
	if (words.length === 0) return true
	const fields = haystack.map(norm)
	const tokens = fields.flatMap((f) => f.split(/\s+/))
	return words.every(
		(w) =>
			fields.some((f) => f.includes(w)) ||
			tokens.some((t) => t.includes(w) || commonPrefix(t, w) >= Math.min(6, Math.max(t.length, w.length))),
	)
}

export function personHaystack(p: Person): string[] {
	return [p.name, ...p.roles, ...(p.team ? [p.team] : [])]
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type PlannedRound = { round: number; start: string; end: string; hoursPerDay: number; hours: number }

/** A round longer than a working day is spread evenly across as many days as it needs. */
export const PLAN_DAY_HOURS = 7

/**
 * One booking per round with the template's recommended hours. Each round
 * starts `gap` working days after the previous one ends (feedback time).
 */
export function planFromTemplate(t: Template, start: string): PlannedRound[] {
	const out: PlannedRound[] = []
	let cursor = nextWorkingDay(start)
	t.rounds.forEach((hours, i) => {
		if (!(hours > 0)) return
		const days = Math.max(1, Math.ceil(hours / PLAN_DAY_HOURS - EPS))
		const end = addWorkingDays(cursor, days - 1)
		out.push({ round: i + 1, start: cursor, end, hoursPerDay: Math.round((hours / days) * 100) / 100, hours })
		cursor = addWorkingDays(end, Math.max(1, t.gap))
	})
	return out
}

// ---------------------------------------------------------------------------
// Suggestions (a ranking for the person doing the assigning, never an assignment)
// ---------------------------------------------------------------------------

export type Suggestion = {
	person: Person
	/** Whether the person has the role the work needs (if the work names one). */
	roleMatch: boolean
	/** True if every day of the booking fits in the person's open hours. */
	fits: boolean
	/** Smallest open hours on any day of the booking, after it is added. */
	tightestOpen: number
	/** Open hours across the booking's days, before it is added. */
	openHours: number
	dedicated: boolean
}

export function suggestFor(
	booking: Booking,
	people: readonly Person[],
	bookings: readonly Booking[],
	opts: { role?: string | null; clientId?: string | null } = {},
): Suggestion[] {
	const days = bookingDays(booking)
	const out = people.map((person) => {
		const load = dailyLoad(bookings, person.id, booking.id)
		const cap = dailyCapacity(person)
		let tightest = Infinity
		let open = 0
		for (const d of days) {
			const free = cap - (load.get(d) ?? 0)
			open += Math.max(0, free)
			tightest = Math.min(tightest, free - booking.hoursPerDay)
		}
		if (days.length === 0) tightest = 0
		return {
			person,
			roleMatch: !opts.role || person.roles.includes(opts.role),
			fits: tightest >= -EPS,
			tightestOpen: tightest,
			openHours: open,
			dedicated: opts.clientId ? person.dedicatedTo.includes(opts.clientId) : false,
		}
	})
	// Role first, then whoever it fits, then most headroom on the tightest day.
	return out.sort(
		(a, b) =>
			Number(b.roleMatch) - Number(a.roleMatch) ||
			Number(b.fits) - Number(a.fits) ||
			Number(b.dedicated) - Number(a.dedicated) ||
			b.tightestOpen - a.tightestOpen ||
			a.person.name.localeCompare(b.person.name),
	)
}

/** The role a booking's work needs: its job's template role, if any. */
export function roleForJob(job: Job | undefined, templates: readonly Template[]): string | null {
	if (!job?.templateId) return null
	return templates.find((t) => t.id === job.templateId)?.role ?? null
}
