/**
 * Every rule the desk enforces, as pure functions: no React, no SDK. This is
 * the demo's whole argument — the pickers narrow *before* a write and the gates
 * say what's missing *before* a move — so it is the part with tests
 * (`test/rules.test.ts`).
 */

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export const STAGES = ["Draft", "Awaiting payment", "Brewing", "Dispatched", "Delivered", "Cancelled"] as const
export type Stage = (typeof STAGES)[number]

/** The happy path, in order. Cancelled sits outside it. */
export const PATH: readonly Stage[] = ["Draft", "Awaiting payment", "Brewing", "Dispatched", "Delivered"]
export const OPEN_STAGES: readonly Stage[] = ["Draft", "Awaiting payment", "Brewing", "Dispatched"]

export function isStage(value: string | null): value is Stage {
	return value !== null && (STAGES as readonly string[]).includes(value)
}

export function isOpen(stage: Stage): boolean {
	return OPEN_STAGES.includes(stage)
}

export const ON_ACCOUNT = "On account"
export const UNLICENSED = "Unlicensed"

export type Customer = {
	id: string
	name: string
	licence: string | null
	terms: string | null
}

export type Site = {
	id: string
	name: string
	customerId: string | null
	address: string | null
	warded: boolean
}

export type Ingredient = {
	id: string
	name: string
	sku: string | null
	unit: string | null
	hazard: string | null
	restricted: boolean
	discontinued: boolean
}

export type PriceEntry = {
	id: string
	customerId: string | null
	ingredientId: string | null
	price: number | null
}

export type Order = {
	id: string
	title: string
	stage: Stage
	customerId: string | null
	siteId: string | null
	deliveryDate: string | null
	customerRef: string | null
	paymentReceived: boolean
	sealChecked: boolean
	courier: string | null
	trackingRef: string | null
	deliveredOn: string | null
	cancellationReason: string | null
	notes: string | null
	createdTime: string | null
}

export type Line = {
	id: string
	orderId: string | null
	ingredientId: string | null
	quantity: number | null
	unitPrice: number | null
	priceEntryId: string | null
}

export type Catalogue = {
	customers: readonly Customer[]
	sites: readonly Site[]
	ingredients: readonly Ingredient[]
	priceList: readonly PriceEntry[]
}

export function isLicensed(customer: Customer | undefined): boolean {
	return customer !== undefined && customer.licence !== null && customer.licence !== UNLICENSED
}

export function isHazardous(ingredient: Ingredient | undefined): boolean {
	return ingredient !== undefined && ingredient.hazard !== null && ingredient.hazard !== "None"
}

function byId<T extends { id: string }>(items: readonly T[], id: string | null): T | undefined {
	return id === null ? undefined : items.find((item) => item.id === id)
}

export function lookup(catalogue: Catalogue) {
	return {
		customer: (id: string | null) => byId(catalogue.customers, id),
		site: (id: string | null) => byId(catalogue.sites, id),
		ingredient: (id: string | null) => byId(catalogue.ingredients, id),
		entry: (id: string | null) => byId(catalogue.priceList, id),
	}
}

/** Every price-list row for one customer × ingredient. More than one is a data problem. */
export function entriesFor(
	priceList: readonly PriceEntry[],
	customerId: string | null,
	ingredientId: string | null,
): PriceEntry[] {
	if (customerId === null || ingredientId === null) return []
	return priceList.filter((e) => e.customerId === customerId && e.ingredientId === ingredientId)
}

/** "Hollowell Herbalists'" rather than "Hollowell Herbalists's". */
export function possessive(name: string): string {
	return name.endsWith("s") ? `${name}'` : `${name}'s`
}

export function formatGp(value: number | null): string {
	if (value === null) return "—"
	return `${value.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} gp`
}

export function lineTotal(line: Pick<Line, "quantity" | "unitPrice">): number | null {
	return line.quantity === null || line.unitPrice === null ? null : line.quantity * line.unitPrice
}

export function orderTotal(lines: readonly Line[]): number {
	return lines.reduce((sum, line) => sum + (lineTotal(line) ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

/**
 * The delivery-site picker. A union rather than an array because "pick a
 * customer first" and "this customer has no sites on record" are different
 * things to tell someone.
 */
export type SiteChoices =
	| { kind: "needCustomer" }
	| { kind: "none"; customerName: string }
	| { kind: "ok"; sites: { site: Site; note: string | null }[] }

export function siteChoices(
	catalogue: Catalogue,
	customerId: string | null,
	hasHazardousLines: boolean,
): SiteChoices {
	const customer = lookup(catalogue).customer(customerId)
	if (customer === undefined) return { kind: "needCustomer" }
	const sites = catalogue.sites
		.filter((s) => s.customerId === customer.id)
		.sort((a, b) => a.name.localeCompare(b.name))
	if (sites.length === 0) return { kind: "none", customerName: customer.name }
	return {
		kind: "ok",
		sites: sites.map((site) => ({
			site,
			note: hasHazardousLines && !site.warded ? "Not warded — this order has hazardous stock" : null,
		})),
	}
}

export type IngredientChoice = {
	ingredient: Ingredient
	/** The single price-list entry, when there is exactly one. */
	entry: PriceEntry | null
	/** Why it can't be picked; null when it can. */
	disabledReason: string | null
	/** A caution that doesn't stop the pick. */
	note: string | null
}

export type IngredientChoices =
	| { kind: "needCustomer" }
	| { kind: "noPriceList"; customerName: string; choices: IngredientChoice[] }
	| { kind: "ok"; choices: IngredientChoice[]; hiddenCount: number }

/**
 * The ingredient picker: what this customer may order, and why the rest can't
 * be. With `showAll`, ingredients off their price list are listed too, greyed,
 * so the narrowing is visible rather than mysterious.
 */
export function ingredientChoices(
	catalogue: Catalogue,
	customerId: string | null,
	site: Site | undefined,
	showAll: boolean,
): IngredientChoices {
	const customer = lookup(catalogue).customer(customerId)
	if (customer === undefined) return { kind: "needCustomer" }

	const licensed = isLicensed(customer)
	const all: IngredientChoice[] = catalogue.ingredients.map((ingredient) => {
		const entries = entriesFor(catalogue.priceList, customer.id, ingredient.id)
		let disabledReason: string | null = null
		if (entries.length === 0) disabledReason = `Not on ${possessive(customer.name)} price list`
		else if (ingredient.discontinued) disabledReason = "Discontinued"
		else if (ingredient.restricted && !licensed) disabledReason = `Restricted — ${customer.name} is unlicensed`
		else if (entries.length > 1) disabledReason = `Priced ${entries.length} times on the price list — remove the duplicate`
		else if (entries[0].price === null) disabledReason = "Price list entry has no price"

		const note =
			disabledReason === null && isHazardous(ingredient) && site !== undefined && !site.warded
				? `${ingredient.hazard} — ${site.name} isn't warded`
				: null
		return { ingredient, entry: entries.length === 1 ? entries[0] : null, disabledReason, note }
	})

	const sorted = all.sort(
		(a, b) =>
			Number(a.disabledReason !== null) - Number(b.disabledReason !== null) ||
			a.ingredient.name.localeCompare(b.ingredient.name),
	)
	const onList = sorted.filter((c) => entriesFor(catalogue.priceList, customer.id, c.ingredient.id).length > 0)

	if (onList.length === 0) {
		return { kind: "noPriceList", customerName: customer.name, choices: showAll ? sorted : [] }
	}
	return {
		kind: "ok",
		choices: showAll ? sorted : onList,
		hiddenCount: sorted.length - onList.length,
	}
}

/** What picking an ingredient writes alongside it. */
export function pricedPick(choice: IngredientChoice): Pick<Line, "ingredientId" | "unitPrice" | "priceEntryId"> {
	return {
		ingredientId: choice.ingredient.id,
		unitPrice: choice.entry?.price ?? null,
		priceEntryId: choice.entry?.id ?? null,
	}
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

export type Severity = "block" | "warn"

/** Where a problem is shown: under an order field, or under a line. */
export type ProblemField = "customer" | "site" | "deliveryDate" | "lines" | `line:${string}`

export type Problem = { field: ProblemField; severity: Severity; message: string }

/**
 * Everything wrong with an order as it stands, each attached to the field it's
 * about. `block` problems stop the order being confirmed; `warn` ones don't.
 */
export function orderProblems(
	catalogue: Catalogue,
	order: Pick<Order, "customerId" | "siteId" | "deliveryDate" | "stage">,
	lines: readonly Line[],
	today: string,
): Problem[] {
	const find = lookup(catalogue)
	const customer = find.customer(order.customerId)
	const site = find.site(order.siteId)
	const problems: Problem[] = []

	if (customer === undefined) problems.push({ field: "customer", severity: "block", message: "Pick a customer." })
	else if (customer.terms === null)
		problems.push({ field: "customer", severity: "block", message: `${customer.name} has no payment terms set.` })

	if (site === undefined) problems.push({ field: "site", severity: "block", message: "Pick a delivery site." })
	else if (customer !== undefined && site.customerId !== customer.id)
		problems.push({ field: "site", severity: "block", message: `${site.name} isn't one of ${customer.name}'s sites.` })

	if (order.deliveryDate === null)
		problems.push({ field: "deliveryDate", severity: "block", message: "Set a delivery date." })
	else if (order.stage === "Draft" && order.deliveryDate < today)
		problems.push({ field: "deliveryDate", severity: "warn", message: "Delivery date is in the past." })

	if (!lines.some((l) => (l.quantity ?? 0) > 0))
		problems.push({ field: "lines", severity: "block", message: "Add at least one line." })

	for (const line of lines) {
		const field = `line:${line.id}` as const
		const ingredient = find.ingredient(line.ingredientId)
		if (ingredient === undefined) {
			problems.push({ field, severity: "block", message: "Pick an ingredient." })
			continue
		}
		if (line.quantity === null || line.quantity <= 0)
			problems.push({ field, severity: "block", message: "Quantity must be more than 0." })

		const entries = entriesFor(catalogue.priceList, order.customerId, ingredient.id)
		const listed = entries.length === 1 ? entries[0].price : null

		if (line.unitPrice === null)
			problems.push({
				field,
				severity: "block",
				message: listed === null ? "No unit price." : `No unit price — the price list says ${formatGp(listed)}.`,
			})
		else if (listed !== null && line.unitPrice !== listed)
			problems.push({ field, severity: "warn", message: `Price list says ${formatGp(listed)}.` })

		if (ingredient.discontinued)
			problems.push({ field, severity: "block", message: `${ingredient.name} is discontinued.` })
		if (ingredient.restricted && customer !== undefined && !isLicensed(customer))
			problems.push({
				field,
				severity: "block",
				message: `Restricted — ${customer.name} is unlicensed.`,
			})
		if (customer !== undefined && entries.length === 0)
			problems.push({ field, severity: "warn", message: `Not on ${possessive(customer.name)} price list.` })
		if (entries.length > 1)
			problems.push({ field, severity: "warn", message: `Priced ${entries.length} times on the price list.` })
		if (isHazardous(ingredient) && site !== undefined && !site.warded)
			problems.push({
				field,
				severity: "block",
				message: `${ingredient.hazard} — needs a warded site, and ${site.name} isn't.`,
			})
	}
	return problems
}

export function blocking(problems: readonly Problem[]): Problem[] {
	return problems.filter((p) => p.severity === "block")
}

// ---------------------------------------------------------------------------
// Stage gates
// ---------------------------------------------------------------------------

/** Something the person must supply in the confirmation step. */
export type Requirement =
	| { kind: "tick"; field: "paymentReceived" | "sealChecked"; label: string }
	| { kind: "select"; field: "courier" | "cancellationReason"; label: string }
	| { kind: "text"; field: "trackingRef"; label: string }
	| { kind: "date"; field: "deliveredOn"; label: string }

export type Move = {
	to: Stage
	/** What the menu item says. */
	label: string
	/** Empty when the move is allowed. */
	reasons: string[]
	/** Collected in the confirmation step and written with the stage. */
	requirements: Requirement[]
	/** Spelled out in the confirmation step, so nobody moves an order blind. */
	effects: string[]
}

/** Where confirming sends this customer's order. */
export function routeAfterConfirm(customer: Customer | undefined): Stage {
	return customer?.terms === ON_ACCOUNT ? "Brewing" : "Awaiting payment"
}

/**
 * Every stage ahead of the current one, each allowed or greyed with why. Stages
 * behind it are never offered: an order only moves forward.
 */
export function moves(
	catalogue: Catalogue,
	order: Order,
	lines: readonly Line[],
	problems: readonly Problem[],
): Move[] {
	const find = lookup(catalogue)
	const customer = find.customer(order.customerId)
	const hazardous = lines.some((l) => isHazardous(find.ingredient(l.ingredientId)))
	const result: Move[] = []
	const move = (to: Stage, label: string, reasons: string[], requirements: Requirement[] = [], effects: string[] = []) =>
		result.push({ to, label, reasons, requirements, effects })

	const cancel = (reasons: string[] = []) =>
		move("Cancelled", "Cancel order", reasons, [{ kind: "select", field: "cancellationReason", label: "Reason" }], [
			"Cancels the order for good. It can't be reopened.",
		])

	switch (order.stage) {
		case "Draft": {
			const blockers = blocking(problems).map((p) => p.message)
			const routed = routeAfterConfirm(customer)
			const other: Stage = routed === "Brewing" ? "Awaiting payment" : "Brewing"
			move(routed, `Confirm → ${routed}`, blockers, [], [
				"Locks the order lines.",
				routed === "Brewing"
					? `${customer?.name ?? "The customer"} is on account, so it goes straight to Brewing.`
					: `${customer?.name ?? "The customer"} pays before dispatch, so it waits for payment.`,
			])
			move(other, other, [
				customer === undefined
					? "Pick a customer first — payment terms decide this."
					: routed === "Brewing"
						? `${customer.name} is on account; confirming skips this.`
						: `${customer.name} pays before dispatch; payment comes first.`,
			])
			move("Dispatched", "Dispatched", ["Confirm the order first."])
			move("Delivered", "Delivered", ["Confirm the order first."])
			cancel()
			break
		}
		case "Awaiting payment":
			move("Brewing", "Payment received → Brewing", [], [
				{ kind: "tick", field: "paymentReceived", label: "Payment has been received" },
			], ["Starts brewing. The order can then be dispatched."])
			move("Dispatched", "Dispatched", ["Wait for payment first."])
			move("Delivered", "Delivered", ["Wait for payment first."])
			cancel()
			break
		case "Brewing":
			move(
				"Dispatched",
				"Dispatch",
				[],
				[
					{ kind: "select", field: "courier", label: "Courier" },
					{ kind: "text", field: "trackingRef", label: "Tracking ref" },
					...(hazardous
						? [{ kind: "tick" as const, field: "sealChecked" as const, label: "Hazard seals checked on volatile/cursed stock" }]
						: []),
				],
				["Hands the order to the courier. It can no longer be cancelled."],
			)
			move("Delivered", "Delivered", ["Dispatch it first."])
			cancel()
			break
		case "Dispatched":
			move("Delivered", "Mark delivered", [], [{ kind: "date", field: "deliveredOn", label: "Delivered on" }], [
				"Closes the order.",
			])
			move("Cancelled", "Cancel order", ["Already with the courier — it can't be cancelled now."])
			break
		case "Delivered":
		case "Cancelled":
			break
	}
	return result
}

/** The values the confirmation step collects. */
export type MoveInputs = {
	paymentReceived: boolean
	sealChecked: boolean
	courier: string | null
	trackingRef: string | null
	deliveredOn: string | null
	cancellationReason: string | null
}

export function initialInputs(order: Order, today: string): MoveInputs {
	return {
		paymentReceived: order.paymentReceived,
		sealChecked: order.sealChecked,
		courier: order.courier,
		trackingRef: order.trackingRef,
		deliveredOn: order.deliveredOn ?? today,
		cancellationReason: order.cancellationReason,
	}
}

/** Requirements still unmet. The confirm button stays disabled until this is empty. */
export function unmet(move: Move, inputs: MoveInputs): Requirement[] {
	return move.requirements.filter((r) => {
		const value = inputs[r.field]
		if (r.kind === "tick") return value !== true
		return typeof value !== "string" || value.trim().length === 0
	})
}

/** The order after the move, with the inputs it collected applied. */
export function applyMove(order: Order, move: Move, inputs: MoveInputs): Order {
	let next: Order = { ...order, stage: move.to }
	for (const r of move.requirements) {
		if (r.kind === "tick") next = { ...next, [r.field]: inputs[r.field] === true }
		else next = { ...next, [r.field]: inputs[r.field]?.trim() || null }
	}
	return next
}

// ---------------------------------------------------------------------------
// Drafts and editing
// ---------------------------------------------------------------------------

/** Lines can be edited only while the order is a draft. */
export function isEditable(order: Pick<Order, "stage">): boolean {
	return order.stage === "Draft"
}

/** After a customer change: keep the site only if it's still theirs, or pick their only one. */
export function siteAfterCustomerChange(catalogue: Catalogue, customerId: string | null, siteId: string | null): string | null {
	const theirs = catalogue.sites.filter((s) => customerId !== null && s.customerId === customerId)
	if (theirs.some((s) => s.id === siteId)) return siteId
	return theirs.length === 1 ? theirs[0].id : null
}

/**
 * After a customer change, re-price every line that took its price from the
 * price list: from the new customer's entry if they have exactly one, otherwise
 * blank, so the line's problems say why. Hand-typed prices are left alone.
 */
export function repriceForCustomer<L extends Pick<Line, "ingredientId" | "unitPrice" | "priceEntryId">>(
	priceList: readonly PriceEntry[],
	customerId: string | null,
	lines: readonly L[],
): { lines: L[]; changed: number } {
	let changed = 0
	const next = lines.map((line) => {
		if (line.priceEntryId === null) return line
		const entries = entriesFor(priceList, customerId, line.ingredientId)
		const entry = entries.length === 1 ? entries[0] : null
		if (entry?.id === line.priceEntryId) return line
		changed++
		return { ...line, unitPrice: entry?.price ?? null, priceEntryId: entry?.id ?? null }
	})
	return { lines: next, changed }
}

/** The next order number: one past the highest `CC-nnnn` seen. */
export function nextOrderTitle(orders: readonly Pick<Order, "title">[]): string {
	let max = 1000
	for (const o of orders) {
		const match = /^CC-(\d+)$/.exec(o.title.trim())
		if (match) max = Math.max(max, Number(match[1]))
	}
	return `CC-${max + 1}`
}

export function lineTitle(ingredient: Ingredient | undefined, quantity: number | null): string {
	return `${ingredient?.name ?? "Ingredient"} × ${quantity ?? 0}`
}

export function todayIso(now = new Date()): string {
	const y = now.getFullYear()
	const m = String(now.getMonth() + 1).padStart(2, "0")
	const d = String(now.getDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}
