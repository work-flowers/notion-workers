/**
 * The `?mock` fixture: the same fictional Cauldron & Co data seeded into the
 * demo databases in Notion, with readable ids. Every guardrail has an order
 * that trips it — see the table in README.md.
 *
 * Writes go to React state, so the mock runs every real flow (create, edit,
 * every stage move) with nothing written anywhere. `?mock&slow` adds latency.
 */

import { useMemo, useState } from "react"

import { type Customer, type Ingredient, type Line, type Order, type PriceEntry, type Site } from "./rules.ts"
import { isNewId, type Store } from "./store.ts"

const C = (id: string, name: string, licence: string, terms: string): Customer => ({ id, name, licence, terms })

export const MOCK_CUSTOMERS: Customer[] = [
	C("thornbury", "Thornbury Apothecary", "Licensed apothecary", "On account"),
	C("newt", "The Gilded Newt", "Unlicensed", "Pay before dispatch"),
	C("ravenmoor", "Ravenmoor Academy", "Guild-certified", "On account"),
	C("vesper", "Madam Vesper's Curiosities", "Licensed apothecary", "Pay before dispatch"),
	C("hollowell", "Hollowell Herbalists", "Unlicensed", "On account"),
	C("saltmarsh", "Saltmarsh Coven", "Guild-certified", "Pay before dispatch"),
	C("brindle", "Brindle & Daughters", "Unlicensed", "Pay before dispatch"),
]

const I = (
	id: string,
	name: string,
	sku: string,
	unit: string,
	hazard: string,
	restricted: boolean,
	discontinued = false,
): Ingredient => ({ id, name, sku, unit, hazard, restricted, discontinued })

export const MOCK_INGREDIENTS: Ingredient[] = [
	I("moonpetal", "Moonpetal Essence", "CC-101", "vial", "None", false),
	I("newteye", "Powdered Newt Eye", "CC-102", "jar", "None", false),
	I("mandrake", "Mandrake Root", "CC-201", "bundle", "Volatile", true),
	I("dragon", "Dragon's Blood Resin", "CC-202", "phial", "Volatile", true),
	I("phoenix", "Phoenix Ash", "CC-203", "jar", "None", true),
	I("nightshade", "Nightshade Tincture", "CC-301", "vial", "Cursed", true),
	I("bogwater", "Bogwater Moss", "CC-103", "bundle", "None", false),
	I("glowcap", "Glowcap Mushrooms", "CC-104", "crate", "None", false),
	I("unicorn", "Unicorn Hair (shed)", "CC-204", "bundle", "None", true),
	I("basilisk", "Basilisk Scale", "CC-302", "jar", "Cursed", true),
	I("fairy", "Fairy Wing Dust", "CC-105", "vial", "None", false),
	I("salamander", "Salamander Oil", "CC-205", "phial", "Volatile", false),
	I("wolfsbane", "Wolfsbane Sprigs", "CC-206", "bundle", "Volatile", false),
	I("salt", "Starlight Sea Salt", "CC-106", "jar", "None", false),
	I("kraken", "Kraken Ink", "CC-107", "phial", "None", false),
	I("gloom", "Gloom Beetle Shells", "CC-108", "crate", "None", false, true),
	I("hag", "Hag's Tooth Powder", "CC-303", "jar", "Cursed", true, true),
	I("frostfire", "Frostfire Pepper", "CC-207", "jar", "Volatile", false),
]

const S = (id: string, name: string, customerId: string, address: string, warded: boolean): Site => ({
	id,
	name,
	customerId,
	address,
	warded,
})

export const MOCK_SITES: Site[] = [
	S("th-shop", "Thornbury — High Street Shop", "thornbury", "3 High Street, Thornbury Market", true),
	S("th-cellar", "Thornbury — Cellar Store", "thornbury", "Under 3 High Street (use the hatch)", true),
	S("th-stall", "Thornbury — Market Stall", "thornbury", "Stall 14, Thornbury Square", false),
	S("newt-back", "The Gilded Newt — Back Door", "newt", "Cobbler's Lane, behind the tavern", false),
	S("rm-class", "Ravenmoor — Potions Classroom", "ravenmoor", "Ravenmoor Academy, East Wing, basement", true),
	S("rm-kitchen", "Ravenmoor — North Tower Kitchens", "ravenmoor", "Ravenmoor Academy, North Tower, ground floor", false),
	S("rm-green", "Ravenmoor — Greenhouse 3", "ravenmoor", "Ravenmoor Academy grounds, past the lake", false),
	S("vesper-shop", "Vesper's — Shopfront", "vesper", "13½ Crooked Row, Duskwater", true),
	S("hw-shed", "Hollowell — Garden Shed", "hollowell", "Hollowell Farm, Lower Field", false),
	S("hw-barn", "Hollowell — Drying Barn", "hollowell", "Hollowell Farm, by the millpond", false),
	S("sm-stones", "Saltmarsh — Standing Stones", "saltmarsh", "Saltmarsh Heath, the ring of nine", true),
	S("sm-cottage", "Saltmarsh — Cottage", "saltmarsh", "Tidewrack Cottage, Saltmarsh", false),
	S("brindle-farm", "Brindle — Farmhouse", "brindle", "Brindle Farm, Upper Wychdale", false),
]

const PRICES: [customer: string, ingredient: string, price: number][] = [
	["thornbury", "moonpetal", 11],
	["thornbury", "moonpetal", 10.5], // the duplicate
	["thornbury", "newteye", 7],
	["thornbury", "mandrake", 40],
	["thornbury", "dragon", 110],
	["thornbury", "phoenix", 195],
	["thornbury", "nightshade", 60],
	["thornbury", "bogwater", 5],
	["thornbury", "glowcap", 27],
	["thornbury", "fairy", 20],
	["thornbury", "salamander", 36],
	["thornbury", "wolfsbane", 16],
	["thornbury", "salt", 8],
	["thornbury", "kraken", 50],
	["thornbury", "gloom", 12],
	["thornbury", "frostfire", 14],
	["newt", "moonpetal", 12],
	["newt", "bogwater", 6],
	["newt", "glowcap", 30],
	["newt", "salt", 9],
	["newt", "frostfire", 16],
	["newt", "dragon", 125], // restricted, and they're unlicensed
	["ravenmoor", "moonpetal", 10],
	["ravenmoor", "newteye", 6.5],
	["ravenmoor", "mandrake", 38],
	["ravenmoor", "phoenix", 190],
	["ravenmoor", "unicorn", 140],
	["ravenmoor", "basilisk", 170],
	["ravenmoor", "fairy", 19],
	["ravenmoor", "wolfsbane", 15],
	["ravenmoor", "salt", 7.5],
	["ravenmoor", "kraken", 48],
	["ravenmoor", "hag", 85],
	["ravenmoor", "nightshade", 58],
	["vesper", "nightshade", 62],
	["vesper", "basilisk", 175],
	["vesper", "dragon", 115],
	["vesper", "kraken", 52],
	["vesper", "moonpetal", 11.5],
	["vesper", "fairy", 21],
	["hollowell", "bogwater", 5.5],
	["hollowell", "glowcap", 28],
	["hollowell", "salt", 8.5],
	["hollowell", "wolfsbane", 17],
	["hollowell", "newteye", 7.5],
	["hollowell", "frostfire", 15],
	["hollowell", "salamander", 38],
	["saltmarsh", "moonpetal", 11],
	["saltmarsh", "mandrake", 41],
	["saltmarsh", "nightshade", 61],
	["saltmarsh", "unicorn", 145],
	["saltmarsh", "kraken", 51],
	["saltmarsh", "wolfsbane", 15.5],
	["saltmarsh", "salt", 8],
]

export const MOCK_PRICE_LIST: PriceEntry[] = PRICES.map(([customerId, ingredientId, price], i) => ({
	id: `pl-${customerId}-${ingredientId}${i === 1 ? "-old" : ""}`,
	customerId,
	ingredientId,
	price,
}))

const entry = (customer: string, ingredient: string) => `pl-${customer}-${ingredient}`

function O(
	id: string,
	customerId: string,
	siteId: string,
	stage: Order["stage"],
	deliveryDate: string | null,
	extra: Partial<Order> = {},
): Order {
	return {
		id,
		title: id.toUpperCase(),
		stage,
		customerId,
		siteId,
		deliveryDate,
		customerRef: null,
		paymentReceived: false,
		sealChecked: false,
		courier: null,
		trackingRef: null,
		deliveredOn: null,
		cancellationReason: null,
		notes: null,
		createdTime: null,
		...extra,
	}
}

export const MOCK_ORDERS: Order[] = [
	O("cc-1001", "thornbury", "th-shop", "Draft", "2026-11-06", { customerRef: "TH-PO-5521" }),
	O("cc-1002", "newt", "newt-back", "Draft", "2026-11-05", { notes: "For the Samhain cocktail menu." }),
	O("cc-1003", "ravenmoor", "rm-kitchen", "Draft", null, { customerRef: "RA-Y5-POTIONS" }),
	O("cc-1004", "vesper", "vesper-shop", "Awaiting payment", "2026-11-07"),
	O("cc-1005", "hollowell", "hw-shed", "Draft", "2026-11-10"),
	O("cc-1006", "saltmarsh", "sm-stones", "Brewing", "2026-11-04", { paymentReceived: true }),
	O("cc-1007", "thornbury", "th-cellar", "Brewing", "2026-11-04", {
		sealChecked: true,
		courier: "Owl post",
		customerRef: "TH-PO-5519",
	}),
	O("cc-1008", "ravenmoor", "rm-class", "Dispatched", "2026-11-03", {
		sealChecked: true,
		courier: "Wyvern freight",
		trackingRef: "WF-88213",
	}),
	O("cc-1009", "vesper", "vesper-shop", "Delivered", "2026-10-28", {
		deliveredOn: "2026-10-28",
		paymentReceived: true,
		sealChecked: true,
		courier: "Broom courier",
		trackingRef: "BC-4471",
	}),
	O("cc-1010", "newt", "newt-back", "Cancelled", "2026-10-25", { cancellationReason: "Payment not received" }),
	O("cc-1011", "hollowell", "hw-barn", "Delivered", "2026-10-30", {
		deliveredOn: "2026-10-30",
		courier: "Owl post",
		trackingRef: "OP-1180",
	}),
	O("cc-1012", "thornbury", "th-stall", "Draft", "2026-11-08"),
	O("cc-1013", "saltmarsh", "sm-cottage", "Awaiting payment", "2026-11-09"),
	O("cc-1014", "brindle", "brindle-farm", "Draft", null, { notes: "First order — waiting on a price list." }),
]

let lineSeq = 0
function L(orderId: string, ingredientId: string, quantity: number, unitPrice: number | null, priced = true): Line {
	const customerId = MOCK_ORDERS.find((o) => o.id === orderId)?.customerId ?? ""
	return {
		id: `line-${++lineSeq}`,
		orderId,
		ingredientId,
		quantity,
		unitPrice,
		priceEntryId: priced && unitPrice !== null ? entry(customerId, ingredientId) : null,
	}
}

export const MOCK_LINES: Line[] = [
	L("cc-1001", "mandrake", 4, 40),
	L("cc-1001", "glowcap", 2, 27),
	L("cc-1001", "salt", 10, 8),
	L("cc-1002", "bogwater", 3, 6),
	L("cc-1002", "dragon", 1, 125),
	L("cc-1002", "frostfire", 2, null),
	L("cc-1003", "basilisk", 2, 170),
	L("cc-1003", "fairy", 5, 19),
	L("cc-1003", "unicorn", 1, 160, false),
	L("cc-1004", "nightshade", 3, 62),
	L("cc-1004", "kraken", 2, 52),
	L("cc-1005", "salamander", 4, 38),
	L("cc-1005", "wolfsbane", 6, 17),
	L("cc-1006", "mandrake", 6, 41),
	L("cc-1006", "unicorn", 2, 145),
	L("cc-1006", "moonpetal", 12, 11),
	L("cc-1007", "wolfsbane", 10, 16),
	L("cc-1007", "salt", 20, 8),
	L("cc-1007", "kraken", 1, 50),
	L("cc-1008", "phoenix", 1, 190),
	L("cc-1008", "newteye", 12, 6.5),
	L("cc-1008", "mandrake", 3, 38),
	L("cc-1009", "basilisk", 1, 175),
	L("cc-1009", "dragon", 2, 115),
	L("cc-1010", "glowcap", 5, 30),
	L("cc-1011", "bogwater", 10, 5.5),
	L("cc-1011", "glowcap", 3, 28),
	L("cc-1012", "gloom", 2, 12),
	L("cc-1012", "fairy", 4, 20),
	L("cc-1013", "moonpetal", 6, 11),
	L("cc-1013", "salt", 4, 8),
]

export const MOCK_COURIERS = ["Owl post", "Broom courier", "Wyvern freight"]
export const MOCK_CANCELLATION_REASONS = [
	"Customer changed mind",
	"Ingredient unavailable",
	"Payment not received",
	"Duplicate order",
]

export function useMockStore(): Store {
	// Read here, not at module scope, so the fixture imports cleanly into Node tests.
	const latency = new URLSearchParams(window.location.search).has("slow") ? 1500 : 250
	const wait = () => new Promise((r) => setTimeout(r, latency))
	const [orders, setOrders] = useState(MOCK_ORDERS)
	const [lines, setLines] = useState(MOCK_LINES)

	return useMemo<Store>(
		() => ({
			customers: MOCK_CUSTOMERS,
			sites: MOCK_SITES,
			ingredients: MOCK_INGREDIENTS,
			priceList: MOCK_PRICE_LIST,
			orders,
			lines,
			courierOptions: MOCK_COURIERS,
			cancellationOptions: MOCK_CANCELLATION_REASONS,
			loading: false,
			bindingProblems: [],

			async saveOrder(orderId, draft, drafts) {
				await wait()
				const id = orderId ?? `local-${Date.now()}`
				if (orderId === null) {
					setOrders((os) => [
						...os,
						{ ...MOCK_ORDERS[0], ...draft, id, stage: "Draft", paymentReceived: false, sealChecked: false, courier: null, trackingRef: null, deliveredOn: null, cancellationReason: null },
					])
				} else {
					setOrders((os) => os.map((o) => (o.id === id ? { ...o, ...draft } : o)))
				}
				const lineIds: Record<string, string> = {}
				const kept: Line[] = drafts
					.filter((d) => !d.removed)
					.map(({ removed: _removed, ...d }) => {
						const lineId = isNewId(d.id) ? `local-line-${++lineSeq}` : d.id
						if (lineId !== d.id) lineIds[d.id] = lineId
						return { ...d, id: lineId, orderId: id }
					})
				setLines((ls) => [...ls.filter((l) => l.orderId !== id), ...kept])
				return { ok: true, id, lineIds }
			},

			async moveOrder(next) {
				await wait()
				setOrders((os) => os.map((o) => (o.id === next.id ? next : o)))
				return { ok: true }
			},
		}),
		[orders, lines],
	)
}
