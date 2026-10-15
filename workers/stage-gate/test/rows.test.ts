import assert from "node:assert/strict"
import { test } from "node:test"

import { PHASES } from "../blocks/stage-gate/src/checklist.ts"
import { newProjectProperties, onlyBound } from "../blocks/stage-gate/src/rows.ts"

test("a new project starts in the first phase and omits blank details", () => {
	const p = newProjectProperties("Vehicle Platform D", { make: " Demo Motors ", model: "", variant: "Dual cab · 4x4" })
	assert.deepEqual(Object.keys(p).sort(), ["make", "name", "phase", "variant"])
	assert.deepEqual(p.phase, { type: "status", status: { name: PHASES[0].name } })
	assert.deepEqual(p.make, { type: "rich_text", rich_text: [{ type: "text", text: { content: "Demo Motors" } }] })
})

test("unmapped detail keys are dropped before writing", () => {
	const p = newProjectProperties("X", { make: "A", model: "B", variant: "C" })
	const bound = onlyBound(p, { name: "title", phase: "p1", make: "m1", model: undefined, variant: undefined })
	assert.deepEqual(Object.keys(bound).sort(), ["make", "name", "phase"])
})

import { STATUS } from "../blocks/stage-gate/src/checklist.ts"
import { applyChange, type Deliverable } from "../blocks/stage-gate/src/gate.ts"
import { itemProperties } from "../blocks/stage-gate/src/rows.ts"

const item: Deliverable = {
	id: "d1",
	key: "baseline_weights",
	item: "Baseline Weights",
	projectIds: ["p1"],
	phase: null,
	category: null,
	description: null,
	itemVi: null,
	descriptionVi: null,
	format: null,
	mandatory: true,
	status: STATUS.pending,
	completedDate: null,
	fileLink: null,
	// Two people set in Notion: a status click must not flatten them.
	ownerIds: ["u-a", "u-b"],
	order: 1,
}

test("Owner is written only when it changed", () => {
	const na = applyChange(item, { status: STATUS.na }, "2026-10-15")
	assert.ok(na.ok)
	assert.equal("owner" in itemProperties(na.next, item), false)

	const assigned = applyChange(item, { ownerIds: ["u-c"] }, "2026-10-15")
	assert.ok(assigned.ok)
	assert.deepEqual(itemProperties(assigned.next, item).owner, { type: "people", people: [{ object: "user", id: "u-c" }] })

	const cleared = applyChange(item, { ownerIds: [] }, "2026-10-15")
	assert.ok(cleared.ok)
	assert.deepEqual(itemProperties(cleared.next, item).owner, { type: "people", people: [] })
})
