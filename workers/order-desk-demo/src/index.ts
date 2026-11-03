import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

/**
 * Order Desk — a demo of Custom Blocks as *UI*, not visualisation.
 *
 * A generic, fictional rebuild of the Knoxx order desk over six ordinary
 * Notion databases (Cauldron & Co, a potion-ingredient wholesaler). It argues
 * two things a database view can't do:
 *
 * 1. **Conditionally filtered pickers.** The delivery-site picker only offers
 *    the chosen customer's sites; the ingredient picker only offers what is on
 *    that customer's price list, and greys out (with the reason) anything
 *    discontinued, restricted for an unlicensed customer, or priced twice.
 *    Picking an ingredient fills in the agreed price and links the price-list
 *    entry it came from.
 * 2. **Stage gates.** An order's Stage can only move forward, and each move
 *    lists what's missing before it's allowed: confirming routes by payment
 *    terms, payment must be ticked off, dispatch needs a courier, a tracking ref
 *    and (for volatile or cursed stock) a seal check, cancelling needs a reason.
 *
 * Property keys are the block's own vocabulary; the config panel maps them onto
 * real properties. The `description` on each names the demo database property
 * it expects. **The declared `type` must equal the bound property's type
 * exactly** or the key silently resolves to unbound.
 */
worker.customBlock("orderDesk", {
	path: "./blocks/order-desk",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		orders: {
			name: "Orders",
			description: "Written to. Demo database: 📦 Orders.",
			icon: { type: "emoji", emoji: "📦" },
			properties: {
				title: { name: "Order", description: "Title. Demo: Order (e.g. CC-1001).", type: "title" },
				stage: {
					name: "Stage",
					description:
						"Status. Demo: Stage. Options must be: Draft, Awaiting payment, Brewing, Dispatched, Delivered, Cancelled.",
					type: "status",
				},
				customer: { name: "Customer", description: "Relation to Customers. Demo: Customer.", type: "relation" },
				site: {
					name: "Delivery site",
					description: "Relation to Delivery Sites. Demo: Delivery site. Filtered by the customer.",
					type: "relation",
				},
				deliveryDate: { name: "Delivery date", description: "Date. Demo: Delivery date.", type: "date" },
				customerRef: { name: "Customer ref", description: "Text. Demo: Customer ref.", type: "rich_text" },
				paymentReceived: {
					name: "Payment received",
					description: "Checkbox. Demo: Payment received. Ticked by the Awaiting payment → Brewing step.",
					type: "checkbox",
				},
				sealChecked: {
					name: "Hazard seal checked",
					description: "Checkbox. Demo: Hazard seal checked. Required to dispatch hazardous stock.",
					type: "checkbox",
				},
				courier: { name: "Courier", description: "Select. Demo: Courier.", type: "select" },
				trackingRef: { name: "Tracking ref", description: "Text. Demo: Tracking ref.", type: "rich_text" },
				deliveredOn: { name: "Delivered on", description: "Date. Demo: Delivered on.", type: "date" },
				cancellationReason: {
					name: "Cancellation reason",
					description: "Select. Demo: Cancellation reason. Required to cancel.",
					type: "select",
				},
				notes: { name: "Notes", description: "Text. Demo: Notes.", type: "rich_text" },
			},
		},
		lines: {
			name: "Order lines",
			description: "Written to. Demo database: 🧾 Order Lines.",
			icon: { type: "emoji", emoji: "🧾" },
			properties: {
				title: { name: "Line", description: "Title. Demo: Line (written as “Ingredient × qty”).", type: "title" },
				order: { name: "Order", description: "Relation to Orders. Demo: Order.", type: "relation" },
				ingredient: { name: "Ingredient", description: "Relation to Ingredients. Demo: Ingredient.", type: "relation" },
				quantity: { name: "Quantity", description: "Number. Demo: Quantity.", type: "number" },
				unitPrice: { name: "Unit price", description: "Number. Demo: Unit price.", type: "number" },
				priceEntry: {
					name: "Price list entry",
					description: "Relation to Price List. Demo: Price list entry. Empty means the price was typed by hand.",
					type: "relation",
				},
			},
		},
		customers: {
			name: "Customers",
			description: "Read-only. Demo database: 🏰 Customers.",
			icon: { type: "emoji", emoji: "🏰" },
			properties: {
				name: { name: "Customer", description: "Title. Demo: Customer.", type: "title" },
				licence: {
					name: "Licence",
					description: "Select. Demo: Licence. Anything but “Unlicensed” may buy restricted ingredients.",
					type: "select",
				},
				terms: {
					name: "Payment terms",
					description: "Select. Demo: Payment terms. “On account” skips Awaiting payment.",
					type: "select",
				},
			},
		},
		sites: {
			name: "Delivery sites",
			description: "Read-only. Demo database: 📍 Delivery Sites.",
			icon: { type: "emoji", emoji: "📍" },
			properties: {
				name: { name: "Site", description: "Title. Demo: Site.", type: "title" },
				customer: { name: "Customer", description: "Relation to Customers. Demo: Customer.", type: "relation" },
				address: { name: "Address", description: "Text. Demo: Address.", type: "rich_text" },
				warded: {
					name: "Warded for hazards",
					description: "Checkbox. Demo: Warded for hazards.",
					type: "checkbox",
				},
			},
		},
		ingredients: {
			name: "Ingredients",
			description: "Read-only. Demo database: 🧪 Ingredients.",
			icon: { type: "emoji", emoji: "🧪" },
			properties: {
				name: { name: "Ingredient", description: "Title. Demo: Ingredient.", type: "title" },
				sku: { name: "SKU", description: "Text. Demo: SKU.", type: "rich_text" },
				unit: { name: "Unit", description: "Select. Demo: Unit.", type: "select" },
				hazard: {
					name: "Hazard",
					description: "Select. Demo: Hazard. Anything but “None” needs a warded site and a seal check.",
					type: "select",
				},
				restricted: { name: "Restricted", description: "Checkbox. Demo: Restricted.", type: "checkbox" },
				status: { name: "Status", description: "Select. Demo: Status. “Discontinued” can't be ordered.", type: "select" },
			},
		},
		priceList: {
			name: "Price list",
			description: "Read-only. Demo database: 📜 Price List. One row per customer × ingredient.",
			icon: { type: "emoji", emoji: "📜" },
			properties: {
				title: { name: "Entry", description: "Title. Demo: Entry.", type: "title" },
				customer: { name: "Customer", description: "Relation to Customers. Demo: Customer.", type: "relation" },
				ingredient: { name: "Ingredient", description: "Relation to Ingredients. Demo: Ingredient.", type: "relation" },
				price: { name: "Price", description: "Number. Demo: Price.", type: "number" },
			},
		},
	},
})
