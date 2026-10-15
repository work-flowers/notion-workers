import assert from "node:assert/strict"
import { test } from "node:test"

import { CHECKLIST, FINAL_PHASE, PHASES, STATUS } from "../blocks/stage-gate/src/checklist.ts"
import {
	applyChange,
	buildPhases,
	deliverablesFor,
	gate,
	missingEvidence,
	missingItems,
	nextPhase,
	shouldSeed,
	type Deliverable,
	type Project,
} from "../blocks/stage-gate/src/gate.ts"

function rows(projectId: string, done: string[], na: string[] = []): Deliverable[] {
	return CHECKLIST.map((c) => ({
		id: `${projectId}-${c.key}`,
		key: c.key,
		item: c.item,
		projectIds: [projectId],
		phase: c.phase,
		category: c.category,
		description: c.description,
		format: c.format,
		mandatory: c.mandatory,
		status: done.includes(c.key) ? STATUS.complete : na.includes(c.key) ? STATUS.na : STATUS.pending,
		completedDate: null,
		fileLink: done.includes(c.key) ? "https://example.com/file" : null,
		ownerIds: [],
		order: c.order,
	}))
}

const project = (id: string, phase: string | null, deliverableIds: string[] = []): Project => ({
	id,
	name: id,
	phase,
	deliverableIds,
})

// Platform A in the demo workspace: Phase 2, gate 2/3, pin-out sheet pending.
const A = rows("a", ["baseline_weights", "vehicle_condition_report", "teardown_sequence_log", "sensor_location_map"])

test("the checklist has the workbook's 16 items with unique keys", () => {
	assert.equal(CHECKLIST.length, 16)
	assert.equal(new Set(CHECKLIST.map((c) => c.key)).size, 16)
	for (const c of CHECKLIST) assert.ok(PHASES.some((p) => p.name === c.phase), c.key)
})

test("Platform A: Phase 2 gate is 2/3 and closed", () => {
	const g = gate(PHASES[1].name, A)
	assert.equal(g.current?.mandatoryDone, 2)
	assert.equal(g.current?.mandatoryTotal, 3)
	assert.equal(g.canAdvance, false)
	assert.equal(g.next, PHASES[2].name)
	assert.deepEqual(g.handover, { done: 4, total: 16 })
})

test("completing the last item opens the gate; N/A counts as done", () => {
	const done = A.map((d) => (d.key === "electrical_pin_out_sheet" ? { ...d, status: STATUS.complete } : d))
	assert.equal(gate(PHASES[1].name, done).canAdvance, true)
	const na = A.map((d) => (d.key === "electrical_pin_out_sheet" ? { ...d, status: STATUS.na } : d))
	assert.equal(gate(PHASES[1].name, na).canAdvance, true)
})

test("optional items don't hold the gate", () => {
	const optional = A.map((d) => (d.key === "electrical_pin_out_sheet" ? { ...d, mandatory: false } : d))
	assert.equal(gate(PHASES[1].name, optional).canAdvance, true)
})

test("Platform B: Phase 5 gate 5/8, handover pack 13/16", () => {
	const B = rows("b", CHECKLIST.map((c) => c.key).filter((k) => !["road_test_nvh_report", "headlight_angle_confirmation", "wheel_alignment_confirmation"].includes(k)))
	const g = gate(PHASES[4].name, B)
	assert.equal(`${g.current?.mandatoryDone}/${g.current?.mandatoryTotal}`, "5/8")
	assert.deepEqual(g.handover, { done: 13, total: 16 })
	assert.equal(g.next, FINAL_PHASE)
})

test("phase states: earlier done, current, later future", () => {
	const { phases } = buildPhases(PHASES[1].name, A)
	assert.deepEqual(phases.map((p) => p.state), ["done", "current", "future", "future", "future"])
})

test("handed over: nothing current, no next, cannot advance", () => {
	const g = gate(FINAL_PHASE, A)
	assert.equal(g.current, null)
	assert.equal(g.next, null)
	assert.equal(g.canAdvance, false)
	assert.equal(nextPhase(FINAL_PHASE), null)
})

test("unknown phase: no gate applies", () => {
	assert.equal(gate("Something else", A).canAdvance, false)
	assert.equal(gate(null, A).current, null)
})

test("rows with an unknown Phase fall back to the checklist's phase for their key", () => {
	const odd = A.map((d) => (d.key === "electrical_pin_out_sheet" ? { ...d, phase: null } : d))
	assert.equal(gate(PHASES[1].name, odd).current?.mandatoryTotal, 3)
})

test("deliverablesFor matches ids with or without dashes and sorts by order", () => {
	const dashed = "3f991b07-11ac-81ee-a5bc-deab20f45c0c"
	const list = rows("3f991b0711ac81eea5bcdeab20f45c0c", []).reverse()
	const found = deliverablesFor(dashed, list)
	assert.equal(found.length, 16)
	assert.equal(found[0].key, "baseline_weights")
})

test("missingItems matches on Item key", () => {
	assert.equal(missingItems([]).length, 16)
	assert.equal(missingItems(A.slice(0, 5)).length, 11)
	assert.equal(missingItems(A).length, 0)
})

test("seeding only for a fully loaded, untruncated, genuinely empty project", () => {
	const c = project("c", PHASES[0].name)
	const base = { project: c, rows: A, loading: false, truncated: false, alreadyAttempted: false }
	assert.equal(shouldSeed(base), true)
	assert.equal(shouldSeed({ ...base, loading: true }), false)
	assert.equal(shouldSeed({ ...base, truncated: true }), false)
	assert.equal(shouldSeed({ ...base, alreadyAttempted: true }), false)
	assert.equal(shouldSeed({ ...base, project: project("c", null, ["x"]) }), false)
	assert.equal(shouldSeed({ ...base, project: project("a", null) }), false)
})

test("a project with no checklist cannot advance", () => {
	assert.equal(gate(PHASES[0].name, []).canAdvance, false)
})

const pinOut = A.find((d) => d.key === "electrical_pin_out_sheet")!

test("Complete needs a file link; N/A and Pending don't", () => {
	assert.equal(applyChange(pinOut, { status: STATUS.complete }, "2026-10-14").ok, false)
	assert.equal(applyChange(pinOut, { status: STATUS.complete, fileLink: "   " }, "2026-10-14").ok, false)
	assert.equal(applyChange(pinOut, { status: STATUS.na }, "2026-10-14").ok, true)
	const done = applyChange(pinOut, { status: STATUS.complete, fileLink: " https://x/pinout.xlsx " }, "2026-10-14")
	assert.ok(done.ok)
	assert.equal(done.next.fileLink, "https://x/pinout.xlsx")
	assert.equal(done.next.completedDate, "2026-10-14")
})

test("a Complete item can't lose its link, but can go back to Pending without one", () => {
	const complete = { ...pinOut, status: STATUS.complete, fileLink: "https://x", completedDate: "2026-10-01" }
	assert.equal(applyChange(complete, { fileLink: "" }, "2026-10-14").ok, false)
	const pending = applyChange(complete, { status: STATUS.pending, fileLink: null }, "2026-10-14")
	assert.ok(pending.ok)
	assert.equal(pending.next.completedDate, null)
	// Re-completing keeps the original date only while it is still set.
	const again = applyChange(complete, { status: STATUS.complete }, "2026-10-14")
	assert.ok(again.ok)
	assert.equal(again.next.completedDate, "2026-10-01")
})

test("legacy Complete rows without a link are flagged, not reverted", () => {
	const legacy = { ...pinOut, status: STATUS.complete, fileLink: null }
	assert.equal(missingEvidence(legacy), true)
	assert.equal(gate(PHASES[1].name, A.map((d) => (d.id === legacy.id ? legacy : d))).canAdvance, true)
})
