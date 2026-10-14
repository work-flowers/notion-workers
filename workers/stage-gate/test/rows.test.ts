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
