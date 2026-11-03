import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
	MOCK_CUSTOMERS,
	MOCK_INGREDIENTS,
	MOCK_LINES,
	MOCK_ORDERS,
	MOCK_PRICE_LIST,
	MOCK_SITES,
} from "../blocks/order-desk/src/mock.ts"
import {
	applyMove,
	blocking,
	ingredientChoices,
	initialInputs,
	moves,
	nextOrderTitle,
	orderProblems,
	repriceForCustomer,
	siteAfterCustomerChange,
	siteChoices,
	unmet,
	type Catalogue,
	type Order,
} from "../blocks/order-desk/src/rules.ts"

const catalogue: Catalogue = {
	customers: MOCK_CUSTOMERS,
	sites: MOCK_SITES,
	ingredients: MOCK_INGREDIENTS,
	priceList: MOCK_PRICE_LIST,
}
const TODAY = "2026-11-03"

const order = (id: string) => {
	const o = MOCK_ORDERS.find((x) => x.id === id)
	assert.ok(o, id)
	return o
}
const linesOf = (id: string) => MOCK_LINES.filter((l) => l.orderId === id)
const problemsOf = (id: string) => orderProblems(catalogue, order(id), linesOf(id), TODAY)
const movesOf = (id: string) => moves(catalogue, order(id), linesOf(id), problemsOf(id))
const messages = (id: string) => blocking(problemsOf(id)).map((p) => p.message)

describe("site picker", () => {
	it("asks for a customer first", () => {
		assert.equal(siteChoices(catalogue, null, false).kind, "needCustomer")
	})

	it("offers only the customer's own sites", () => {
		const choices = siteChoices(catalogue, "ravenmoor", false)
		assert.equal(choices.kind, "ok")
		if (choices.kind !== "ok") return
		assert.deepEqual(
			choices.sites.map((s) => s.site.id).sort(),
			["rm-class", "rm-green", "rm-kitchen"],
		)
	})

	it("flags unwarded sites only when the order has hazardous stock", () => {
		const calm = siteChoices(catalogue, "ravenmoor", false)
		const risky = siteChoices(catalogue, "ravenmoor", true)
		assert.ok(calm.kind === "ok" && calm.sites.every((s) => s.note === null))
		assert.ok(risky.kind === "ok" && risky.sites.find((s) => s.site.id === "rm-kitchen")?.note)
		assert.ok(risky.kind === "ok" && risky.sites.find((s) => s.site.id === "rm-class")?.note === null)
	})

	it("keeps the site on a customer change only if it's theirs, or picks their only one", () => {
		assert.equal(siteAfterCustomerChange(catalogue, "thornbury", "th-shop"), "th-shop")
		assert.equal(siteAfterCustomerChange(catalogue, "thornbury", "rm-class"), null)
		assert.equal(siteAfterCustomerChange(catalogue, "vesper", "rm-class"), "vesper-shop")
	})
})

describe("ingredient picker", () => {
	it("offers only what's on the customer's price list", () => {
		const choices = ingredientChoices(catalogue, "hollowell", undefined, false)
		assert.equal(choices.kind, "ok")
		if (choices.kind !== "ok") return
		assert.equal(choices.choices.length, 7)
		assert.equal(choices.hiddenCount, MOCK_INGREDIENTS.length - 7)
	})

	it("shows the rest greyed with a reason when asked", () => {
		const choices = ingredientChoices(catalogue, "hollowell", undefined, true)
		assert.ok(choices.kind === "ok")
		const kraken = choices.choices.find((c) => c.ingredient.id === "kraken")
		assert.equal(kraken?.disabledReason, "Not on Hollowell Herbalists' price list")
	})

	it("greys restricted stock for an unlicensed customer even when it's priced", () => {
		const choices = ingredientChoices(catalogue, "newt", undefined, false)
		assert.ok(choices.kind === "ok")
		assert.match(choices.choices.find((c) => c.ingredient.id === "dragon")?.disabledReason ?? "", /unlicensed/)
	})

	it("greys discontinued and duplicate-priced stock", () => {
		const th = ingredientChoices(catalogue, "thornbury", undefined, false)
		assert.ok(th.kind === "ok")
		assert.equal(th.choices.find((c) => c.ingredient.id === "gloom")?.disabledReason, "Discontinued")
		assert.match(th.choices.find((c) => c.ingredient.id === "moonpetal")?.disabledReason ?? "", /Priced 2 times/)
	})

	it("carries the agreed price and entry for a pickable ingredient", () => {
		const th = ingredientChoices(catalogue, "thornbury", undefined, false)
		assert.ok(th.kind === "ok")
		const mandrake = th.choices.find((c) => c.ingredient.id === "mandrake")
		assert.equal(mandrake?.disabledReason, null)
		assert.equal(mandrake?.entry?.price, 40)
	})

	it("says when a customer has no price list at all", () => {
		assert.equal(ingredientChoices(catalogue, "brindle", undefined, false).kind, "noPriceList")
	})

	it("notes hazardous stock headed for an unwarded site", () => {
		const stall = MOCK_SITES.find((s) => s.id === "th-stall")
		const th = ingredientChoices(catalogue, "thornbury", stall, false)
		assert.ok(th.kind === "ok")
		assert.match(th.choices.find((c) => c.ingredient.id === "mandrake")?.note ?? "", /isn't warded/)
	})
})

describe("order problems", () => {
	it("passes a clean draft", () => {
		assert.deepEqual(messages("cc-1001"), [])
	})

	it("catches restricted stock, unwarded delivery and a missing price", () => {
		const found = messages("cc-1002")
		assert.ok(found.some((m) => /unlicensed/.test(m)))
		assert.ok(found.some((m) => /warded/.test(m)))
		assert.ok(found.some((m) => /No unit price — the price list says 16 gp/.test(m)))
	})

	it("warns, without blocking, on a hand-typed price that differs from the list", () => {
		const warn = problemsOf("cc-1003").filter((p) => p.severity === "warn").map((p) => p.message)
		assert.ok(warn.includes("Price list says 140 gp."))
	})

	it("blocks discontinued stock and a missing delivery date", () => {
		assert.ok(messages("cc-1012").some((m) => /discontinued/.test(m)))
		assert.ok(messages("cc-1003").includes("Set a delivery date."))
	})

	it("blocks an order with no lines", () => {
		assert.ok(messages("cc-1014").includes("Add at least one line."))
	})
})

describe("stage gates", () => {
	it("routes an on-account customer straight to Brewing", () => {
		const confirm = movesOf("cc-1001").find((m) => m.label.startsWith("Confirm"))
		assert.equal(confirm?.to, "Brewing")
		assert.deepEqual(confirm?.reasons, [])
	})

	it("refuses to confirm while anything blocks, listing every blocker", () => {
		const confirm = movesOf("cc-1002").find((m) => m.label.startsWith("Confirm"))
		assert.equal(confirm?.to, "Awaiting payment")
		assert.equal(confirm?.reasons.length, messages("cc-1002").length)
	})

	it("never offers a stage behind the current one", () => {
		const offered = movesOf("cc-1006").map((m) => m.to)
		assert.ok(!offered.includes("Draft"))
		assert.ok(!offered.includes("Awaiting payment"))
	})

	it("needs payment ticked to leave Awaiting payment", () => {
		const m = movesOf("cc-1004").find((x) => x.to === "Brewing")
		assert.ok(m)
		const inputs = initialInputs(order("cc-1004"), TODAY)
		assert.equal(unmet(m, inputs).length, 1)
		assert.equal(unmet(m, { ...inputs, paymentReceived: true }).length, 0)
	})

	it("asks for a seal check only when hazardous stock is dispatched", () => {
		const hazardous = movesOf("cc-1006").find((m) => m.to === "Dispatched")
		const calm = moves(
			catalogue,
			order("cc-1006"),
			linesOf("cc-1006").filter((l) => l.ingredientId === "moonpetal"),
			[],
		).find((m) => m.to === "Dispatched")
		assert.ok(hazardous?.requirements.some((r) => r.field === "sealChecked"))
		assert.ok(!calm?.requirements.some((r) => r.field === "sealChecked"))
	})

	it("won't cancel once dispatched", () => {
		const cancel = movesOf("cc-1008").find((m) => m.to === "Cancelled")
		assert.ok(cancel && cancel.reasons.length > 0)
	})

	it("applies the collected inputs with the stage", () => {
		const m = movesOf("cc-1007").find((x) => x.to === "Dispatched")
		assert.ok(m)
		const next: Order = applyMove(order("cc-1007"), m, {
			...initialInputs(order("cc-1007"), TODAY),
			trackingRef: "  OP-2001 ",
		})
		assert.equal(next.stage, "Dispatched")
		assert.equal(next.trackingRef, "OP-2001")
		assert.equal(next.courier, "Owl post")
	})
})

describe("helpers", () => {
	it("re-prices list-priced lines for a new customer and leaves manual prices alone", () => {
		const { lines, changed } = repriceForCustomer(MOCK_PRICE_LIST, "saltmarsh", linesOf("cc-1003"))
		assert.equal(changed, 2)
		assert.equal(lines.find((l) => l.ingredientId === "fairy")?.unitPrice, null)
		assert.equal(lines.find((l) => l.ingredientId === "unicorn")?.unitPrice, 160)
	})

	it("numbers the next order past the highest", () => {
		assert.equal(nextOrderTitle(MOCK_ORDERS), "CC-1015")
	})
})
