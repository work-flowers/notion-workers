import assert from "node:assert/strict"
import { test } from "node:test"

import { CHECKLIST, FINAL_PHASE, PHASES, STATUS } from "../blocks/stage-gate/src/checklist.ts"
import { labels, STRINGS } from "../blocks/stage-gate/src/i18n.ts"

const vi = labels("vi")
const en = labels("en")

test("every checklist item has a Vietnamese title and description", () => {
	for (const c of CHECKLIST) {
		assert.notEqual(vi.item(c.key, c.item), c.item, `title: ${c.key}`)
		assert.notEqual(vi.description(c.key, c.description), c.description, `description: ${c.key}`)
	}
})

test("English is a pass-through", () => {
	for (const c of CHECKLIST) assert.equal(en.item(c.key, c.item), c.item)
	assert.equal(en.phase(PHASES[1].name), PHASES[1].name)
})

test("a title edited in Notion is shown as written, not replaced by the stock translation", () => {
	assert.equal(vi.item("baseline_weights", "Baseline Weights (rev B)"), "Baseline Weights (rev B)")
})

test("phases, statuses and formats translate; unknown values pass through", () => {
	assert.equal(vi.phase(PHASES[1].name), "Giai đoạn 2 · Tháo dỡ")
	assert.equal(vi.phase(FINAL_PHASE), "Đã bàn giao")
	assert.equal(vi.phase("Phase 9 · Mystery"), "Phase 9 · Mystery")
	assert.equal(vi.status(STATUS.complete), "Hoàn thành")
	assert.equal(vi.format("Spreadsheet"), "Bảng tính")
	for (const p of PHASES) assert.notEqual(vi.phaseShort(p.name), p.short)
})

test("both languages define every UI string", () => {
	assert.deepEqual(Object.keys(STRINGS.vi).sort(), Object.keys(STRINGS.en).sort())
})
