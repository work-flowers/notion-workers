/**
 * The custom-blocks 0.6 adapter (`blocks/stage-gate/src/notion-rows.ts`). The file
 * is copied byte-for-byte into every block, so this suite covers all of them.
 * What matters is that 0.6's typed values come out in the 0.1 shapes the
 * readers in each block's `rows.ts` were written against.
 */

import assert from "node:assert/strict"
import { test } from "node:test"

import type { DataSourceQueryItem } from "@notionhq/custom-blocks/data-sources"
import type { NotionPagePropertyValue } from "@notionhq/custom-blocks/pages"

import { flatten, flattenDate, toRow } from "../blocks/stage-gate/src/notion-rows.ts"

const v = (value: Omit<NotionPagePropertyValue, "id"> & { id?: string }) =>
	({ id: "x", ...value }) as NotionPagePropertyValue

test("text, number, checkbox and option values flatten to plain values", () => {
	assert.equal(flatten(v({ type: "title", title: [{ plain_text: "Acme " }, { plain_text: "Ltd" }] })), "Acme Ltd")
	assert.equal(flatten(v({ type: "rich_text", rich_text: [{ text: { content: "fallback" } }] })), "fallback")
	assert.equal(flatten(v({ type: "number", number: 0 })), 0)
	assert.equal(flatten(v({ type: "number", number: null })), undefined)
	assert.equal(flatten(v({ type: "checkbox", checkbox: false })), false)
	assert.equal(flatten(v({ type: "status", status: { name: "Done" } })), "Done")
	assert.equal(flatten(v({ type: "select", select: null })), undefined)
	assert.deepEqual(flatten(v({ type: "multi_select", multi_select: [{ name: "a" }, { name: "b" }] })), ["a", "b"])
	assert.equal(flatten(v({ type: "url", url: "" })), undefined)
	assert.equal(flatten(null), undefined)
})

test("people and relations become { id, table } pointers", () => {
	assert.deepEqual(flatten(v({ type: "people", people: [{ object: "user", id: "u1" }] })), [
		{ id: "u1", table: "notion_user" },
	])
	assert.deepEqual(flatten(v({ type: "relation", relation: [{ id: "p1" }, { id: "p2" }] })), [
		{ id: "p1", table: "block" },
		{ id: "p2", table: "block" },
	])
})

test("dates keep the calendar day as written and the time with its offset", () => {
	assert.deepEqual(flattenDate({ start: "2026-11-30" }), { type: "date", start_date: "2026-11-30" })
	assert.deepEqual(flattenDate({ start: "2026-11-30", end: "2026-12-02" }), {
		type: "daterange",
		start_date: "2026-11-30",
		end_date: "2026-12-02",
	})
	// A late-evening time must not roll the day over, as slicing a UTC timestamp would.
	const late = flattenDate({ start: "2026-11-30T23:30:00.000+08:00", time_zone: "Asia/Singapore" })
	assert.deepEqual(late, {
		type: "datetime",
		start_date: "2026-11-30",
		start_time: "23:30:00.000+08:00",
		time_zone: "Asia/Singapore",
	})
	// Readers that rebuild `${start_date}T${start_time}` get the original ISO string back.
	assert.equal(late.type === "datetime" ? `${late.start_date}T${late.start_time}` : "", "2026-11-30T23:30:00.000+08:00")
})

function fakeItem(): { item: DataSourceQueryItem; calls: unknown[] } {
	const calls: unknown[] = []
	const page = {
		getKey: () => "page-1",
		updateByKey: async (args: unknown) => (calls.push(["updateByKey", args]), { status: "success" }),
		archive: async () => (calls.push(["archive"]), { status: "success" }),
		unarchive: async () => (calls.push(["unarchive"]), { status: "success" }),
	}
	const data = {
		pageKey: "page-1",
		isArchived: false,
		inTrash: false,
		createdTime: "2026-11-01T02:03:04.000Z",
		lastEditedTime: null,
		createdBy: { id: "u1", table: "notion_user" },
		lastEditedBy: null,
		properties: {
			Name: { id: "title", type: "title", title: [{ plain_text: "Platform A" }] },
			Phase: { id: "ph%3A", type: "status", status: { name: "Concept" } },
			Unmapped: { id: "zz", type: "number", number: 3 },
			Empty: null,
		},
	}
	return { item: { page, data } as unknown as DataSourceQueryItem, calls }
}

test("toRow rebuilds the 0.1 row: id, by-key and by-id values, built-ins", () => {
	const { item } = fakeItem()
	const row = toRow(item, { name: "title", phase: "ph%3A", owner: undefined })
	assert.equal(row.id, "page-1")
	assert.equal(row.is_archived, false)
	assert.deepEqual(row.propertiesByKey, { name: "Platform A", phase: "Concept" })
	assert.equal(row.propertiesById.zz, 3)
	assert.deepEqual(row.propertiesById.created_time, {
		type: "datetime",
		start_date: "2026-11-01",
		start_time: "02:03:04.000Z",
	})
	assert.deepEqual(row.propertiesById.created_by, [{ id: "u1", table: "notion_user" }])
})

test("row.update writes by key and maps is_archived to isArchived", async () => {
	const { item, calls } = fakeItem()
	const row = toRow(item, {})
	const properties = { phase: { type: "status" as const, status: { name: "Design" } } }
	await row.update({ properties })
	await row.update({ properties, is_archived: true })
	await row.archive()
	assert.deepEqual(calls, [
		["updateByKey", { properties }],
		["updateByKey", { properties, isArchived: true }],
		["archive"],
	])
})
