import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
	dateDay,
	excerpt,
	LINKED_BATCH_SIZE,
	pickBatch,
	richTextOf,
	sortNewestFirst,
	toLinkedRecord,
	toLinkedRecordFromRow,
} from "../blocks/crm-desk/src/linked.ts"
import { runPool, withTimeout } from "../blocks/crm-desk/src/linked-loader.ts"
import { MOCK_COMPANIES, MOCK_CONTACTS, MOCK_DEALS } from "../blocks/crm-desk/src/mock.ts"
import {
	emailPage,
	meetingNotePage,
	MOCK_LINKED_PAGES,
	MOCK_LINKS,
} from "../blocks/crm-desk/src/mock-linked.ts"

describe("toLinkedRecord — public-API page shape", () => {
	it("reads a meeting note by the live property names", () => {
		const page = meetingNotePage("mn-1", "Discovery call", "2026-09-01T10:30:00.000+08:00", "Discovery", "Agreed next steps.")
		const record = toLinkedRecord(page, "meetingNote")
		assert.deepEqual(record, {
			id: "mn-1",
			kind: "meetingNote",
			title: "Discovery call",
			date: "2026-09-01T10:30:00.000+08:00",
			subtitle: "Discovery",
			summary: "Agreed next steps.",
		})
		assert.equal(dateDay(record.date), "2026-09-01")
	})

	it("reads an email by the live property names", () => {
		const page = emailPage("em-1", "Re: scope", "2026-08-20", "someone@client.example", null)
		const record = toLinkedRecord(page, "email")
		assert.equal(record.title, "Re: scope")
		assert.equal(record.subtitle, "someone@client.example")
		assert.equal(record.summary, null)
		assert.equal(record.date, "2026-08-20")
	})

	it("falls back to the sole title / first date / first select when names differ", () => {
		const record = toLinkedRecord(
			{
				id: "x",
				properties: {
					Name: { type: "title", title: [{ plain_text: "Renamed title" }] },
					"Meeting date": { type: "date", date: { start: "2026-01-02" } },
					Kind: { type: "select", select: { name: "Client" } },
					Notes: { type: "rich_text", rich_text: [{ plain_text: "Body" }] },
				},
			},
			"meetingNote",
		)
		assert.equal(record.title, "Renamed title")
		assert.equal(record.date, "2026-01-02")
		assert.equal(record.subtitle, "Client")
		assert.equal(record.summary, "Body")
	})

	it("treats empty rich text as null and an empty page as Untitled", () => {
		assert.equal(richTextOf({ type: "rich_text", rich_text: [] }), null)
		assert.equal(richTextOf({ type: "rich_text", rich_text: [{ plain_text: "  " }] }), null)
		const record = toLinkedRecord({ id: "e", properties: {} }, "email")
		assert.equal(record.title, "Untitled")
		assert.equal(record.date, null)
	})
})

describe("toLinkedRecordFromRow — data-source row shape", () => {
	it("maps a cached row, joining date and time", () => {
		const record = toLinkedRecordFromRow(
			{
				id: "row",
				propertiesByKey: {
					title: "Weekly sync",
					date: { type: "datetime", start_date: "2026-09-10", start_time: "09:00" },
					type: "Team",
					summary: "  Short.  ",
				},
			},
			"meetingNote",
		)
		assert.equal(record.title, "Weekly sync")
		assert.equal(record.date, "2026-09-10T09:00")
		assert.equal(record.subtitle, "Team")
		assert.equal(record.summary, "Short.")
	})

	it("uses the sender for emails", () => {
		const record = toLinkedRecordFromRow(
			{ id: "r", propertiesByKey: { title: "Hi", date: { type: "date", start_date: "2026-09-10" }, from: "a@b.example" } },
			"email",
		)
		assert.equal(record.subtitle, "a@b.example")
		assert.equal(record.date, "2026-09-10")
	})
})

describe("sortNewestFirst", () => {
	it("puts newest first and undated last", () => {
		const sorted = sortNewestFirst([
			{ title: "b", date: "2026-01-01" },
			{ title: "undated", date: null },
			{ title: "a", date: "2026-03-01T10:00" },
			{ title: "c", date: "2026-01-01" },
		])
		assert.deepEqual(sorted.map((r) => r.title), ["a", "b", "c", "undated"])
	})
})

describe("excerpt", () => {
	it("collapses whitespace and cuts on a word boundary", () => {
		const text = "word ".repeat(60)
		const cut = excerpt(text, 50)!
		assert(cut.length <= 51)
		assert(cut.endsWith("…"))
		assert(!cut.includes("  "))
		assert.equal(excerpt("short", 50), "short")
		assert.equal(excerpt(null), null)
	})
})

describe("pickBatch", () => {
	const ids = Array.from({ length: 70 }, (_, i) => `p${i}`)

	it("takes from the tail (newest) first, newest-most first within the batch", () => {
		const first = pickBatch(ids, 0)
		assert.equal(first.length, LINKED_BATCH_SIZE)
		assert.equal(first[0], "p69")
		assert.equal(first.at(-1), "p40")
	})

	it("continues backwards and stops at the head", () => {
		assert.equal(pickBatch(ids, 30)[0], "p39")
		assert.deepEqual(pickBatch(ids, 60), ["p9", "p8", "p7", "p6", "p5", "p4", "p3", "p2", "p1", "p0"])
		assert.deepEqual(pickBatch(ids, 70), [])
	})
})

describe("loader primitives", () => {
	it("withTimeout rejects a promise that never settles", async () => {
		await assert.rejects(withTimeout(new Promise(() => {}), 10, "probe"), /timed out/)
		assert.equal(await withTimeout(Promise.resolve(1), 10, "probe"), 1)
	})

	it("runPool preserves order and bounds concurrency", async () => {
		let inFlight = 0
		let peak = 0
		const out = await runPool(
			[1, 2, 3, 4, 5, 6, 7],
			async (n) => {
				inFlight += 1
				peak = Math.max(peak, inFlight)
				await new Promise((r) => setTimeout(r, 5))
				inFlight -= 1
				return n * 2
			},
			3,
		)
		assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14])
		assert(peak <= 3)
	})
})

describe("mock-linked fixture", () => {
	it("links every deal, and the linked pages exist (except the deliberate dangling one)", () => {
		for (const deal of MOCK_DEALS) {
			assert(deal.meetingNoteIds.length >= 2, deal.name)
			assert(deal.emailIds.length >= 3, deal.name)
			for (const id of [...deal.meetingNoteIds, ...deal.emailIds]) {
				assert(MOCK_LINKED_PAGES.has(id), `${deal.name} → ${id}`)
			}
		}
		const marina = MOCK_LINKS["co-marina"]!
		assert(marina.emailIds.length > LINKED_BATCH_SIZE, "Marina must cross a batch")
		assert(marina.meetingNoteIds.includes("mn-missing"))
		assert(!MOCK_LINKED_PAGES.has("mn-missing"))
	})

	it("mirrors links onto companies and contacts", () => {
		const marina = MOCK_COMPANIES.find((c) => c.id === "co-marina")!
		assert(marina.emailIds.length > LINKED_BATCH_SIZE)
		const weisheng = MOCK_CONTACTS.find((c) => c.id === "ct-weisheng-lim")!
		assert(weisheng.meetingNoteIds.length >= 3)
	})

	it("contains no live-CRM data", () => {
		const haystack = [...MOCK_LINKED_PAGES.values()]
			.flatMap((p) => Object.values(p.properties))
			.map((prop) => JSON.stringify(prop))
			.join(" ")
			.toLowerCase()
		for (const banned of ["knoxx", "terrascope", "sakana", "notion labs", "zapier.com", "work.flowers"]) {
			assert(!haystack.includes(banned), `fixture mentions ${banned}`)
		}
		// Every address is on a non-resolving TLD.
		for (const match of haystack.matchAll(/[a-z0-9.+-]+@([a-z0-9.-]+)/g)) {
			assert(match[1]!.endsWith(".example"), match[0])
		}
	})
})
