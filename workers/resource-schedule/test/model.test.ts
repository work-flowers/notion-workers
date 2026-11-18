import assert from "node:assert/strict"
import { test } from "node:test"

import { barSpan, columnsFor, DAY_WIDTH as D, totalWidth, WEEKEND_WIDTH as W } from "../blocks/schedule/src/columns.ts"
import { fixture, PEOPLE, SEED_MONDAY } from "../blocks/schedule/src/fixture.ts"
import { bookingProperties } from "../blocks/schedule/src/rows.ts"
import {
	addWorkingDays,
	dailyLoad,
	dayCell,
	deriveRoster,
	matchesQuery,
	mondayOf,
	personHaystack,
	planFromTemplate,
	suggestFor,
	workingDays,
	type Booking,
} from "../blocks/schedule/src/model.ts"

const seed = fixture()
const roster = deriveRoster(seed.bookings, seed.names, seed.clients)
const person = (name: string) => {
	const p = roster.find((x) => x.name === name)
	assert.ok(p, name)
	return p
}

test("dates: working days skip weekends and Monday is the week start", () => {
	assert.equal(mondayOf("2026-11-22"), "2026-11-16") // Sunday
	assert.deepEqual(workingDays("2026-11-20", "2026-11-23"), ["2026-11-20", "2026-11-23"])
	assert.equal(addWorkingDays("2026-11-20", 1), "2026-11-23")
	assert.equal(addWorkingDays("2026-11-21", 0), "2026-11-23")
})

test("roster: role, team and capacity come from bookings; empty capacity is 35", () => {
	assert.equal(roster.length, PEOPLE.length)
	const motion = person("Lee Moretti")
	assert.deepEqual(motion.roles, ["Motion Designer"])
	assert.equal(motion.weeklyCapacity, 21)
	const bare = deriveRoster([{ ...seed.bookings[0], capacity: null }], seed.names, [])
	assert.equal(bare[0].weeklyCapacity, 35)
	assert.deepEqual(person("Mia Lindqvist").dedicatedTo, ["c-saltbush"])
})

test("seed: shows at least one over-capacity day and work waiting on Overflow", () => {
	const designer = person("Priya Nair")
	const load = dailyLoad(seed.bookings, designer.id)
	assert.equal(load.get("2026-11-18"), 10)
	assert.equal(dayCell(10, 7).state, "over")
	const motion = dailyLoad(seed.bookings, person("Lee Moretti").id)
	assert.equal(dayCell(motion.get("2026-11-19") ?? 0, 21 / 5).state, "over")
	assert.ok(seed.bookings.filter((b) => b.placeholder === "Overflow").length >= 2)
})

test("availability states", () => {
	assert.equal(dayCell(0, 7).state, "free")
	assert.equal(dayCell(3, 7).state, "partial")
	assert.equal(dayCell(7, 7).state, "full")
	assert.equal(dayCell(4.2, 4.2).state, "full")
	assert.equal(dayCell(9, 7).state, "over")
})

test("search: department words match role tags by stem", () => {
	const retouchers = roster.filter((p) => matchesQuery(personHaystack(p), "retouching"))
	assert.deepEqual(retouchers.map((p) => p.name).sort(), ["Kate Duarte", "Mia Lindqvist"])
	// Three designers plus the motion designer, as Forecast's search would.
	assert.equal(roster.filter((p) => matchesQuery(personHaystack(p), "designers")).length, 4)
	assert.equal(roster.filter((p) => matchesQuery(personHaystack(p), "studio design")).length, 3)
	assert.equal(roster.filter((p) => matchesQuery(personHaystack(p), "")).length, roster.length)
	assert.equal(roster.filter((p) => matchesQuery(personHaystack(p), "zzz")).length, 0)
})

test("templates: one booking per round, spread across days, with feedback gaps", () => {
	const kv = seed.templates.find((t) => t.id === "t-kv")
	assert.ok(kv)
	const plan = planFromTemplate(kv, "2026-11-19")
	assert.deepEqual(
		plan.map((r) => [r.round, r.start, r.end, r.hoursPerDay]),
		[
			[1, "2026-11-19", "2026-11-20", 4], // 8h over two days
			[2, "2026-11-24", "2026-11-24", 4], // two working days later
			[3, "2026-11-26", "2026-11-26", 2],
		],
	)
	const edm = seed.templates.find((t) => t.id === "t-edm")
	assert.ok(edm)
	assert.deepEqual(
		planFromTemplate(edm, "2026-11-21").map((r) => [r.start, r.hoursPerDay]),
		[
			["2026-11-23", 4], // a Saturday start rolls to Monday
			["2026-11-25", 2],
		],
	)
})

test("suggestions: role first, and only people who fit are marked as fitting", () => {
	const waiting = seed.bookings.find((b) => b.jobId === "j12" && b.round === 1) as Booking
	const ranked = suggestFor(waiting, roster, seed.bookings, { role: "Retoucher", clientId: "c-harbour" })
	assert.deepEqual(
		ranked.slice(0, 2).map((s) => s.person.name),
		["Kate Duarte", "Mia Lindqvist"],
	)
	// Kate has 2h booked that day, so a 6h round leaves her a little short; Mia is on the Saltbush retouch all day.
	const kate = ranked[0]
	assert.equal(kate.fits, false)
	assert.ok(kate.tightestOpen > ranked[1].tightestOpen)
})

test("columns: bars land on the right days and clip to the axis", () => {
	const cols = columnsFor("day", "2026-11-18")
	assert.equal(cols[0].from, SEED_MONDAY)
	assert.equal(cols.length, 28)
	const tue = barSpan(cols, "2026-11-17", "2026-11-17")
	assert.deepEqual(tue && [tue.left, tue.width], [D, D])
	const across = barSpan(cols, "2026-11-20", "2026-11-23") // Fri → Mon over a weekend
	assert.deepEqual(across && [across.left, across.width], [D * 4, D + W * 2 + D])
	assert.equal(barSpan(cols, "2026-10-01", "2026-10-02"), null)
	assert.equal(barSpan(cols, "2026-11-10", "2026-11-16")?.clippedLeft, true)
	assert.equal(totalWidth(cols), 4 * (5 * D + 2 * W))
})

test("writes: assigning copies the person's role, team and capacity; Overflow clears them", () => {
	const editor = person("Chris Mendes")
	const draft = { personId: editor.id, placeholder: null, start: "2026-11-23", end: "2026-11-23", hoursPerDay: 4, notes: null }
	const assigned = bookingProperties(draft, editor) as Record<string, unknown>
	assert.deepEqual(assigned.role, { type: "multi_select", multi_select: [{ name: "Editor" }] })
	assert.deepEqual(assigned.team, { type: "select", select: { name: "Agency" } })
	assert.deepEqual(assigned.capacity, { type: "number", number: 35 })
	assert.deepEqual(assigned.placeholder, { type: "select", select: null })

	const back = bookingProperties({ ...draft, personId: null, placeholder: "Overflow" }, editor) as Record<string, unknown>
	assert.deepEqual(back.person, { type: "people", people: [] })
	assert.deepEqual(back.placeholder, { type: "select", select: { name: "Overflow" } })
	assert.deepEqual(back.role, { type: "multi_select", multi_select: [] })
	assert.deepEqual(back.team, { type: "select", select: null })
	assert.deepEqual(back.capacity, { type: "number", number: null })
})
