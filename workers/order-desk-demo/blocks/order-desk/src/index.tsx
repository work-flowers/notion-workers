import "@notionhq/custom-blocks/nds.css"

import { pages, type NotionDataSourcePage } from "@notionhq/custom-blocks"
import { NotionCustomBlock, NotionTokenScope, useDataSource, useTheme } from "@notionhq/custom-blocks/react"
import { StrictMode, useMemo, type ReactNode } from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App.tsx"
import { useMockStore } from "./mock.ts"
import {
	bindingProblems,
	lineProperties,
	moveProperties,
	onlyBound,
	optionNames,
	orderProperties,
	sameLine,
	toCustomer,
	toIngredient,
	toLine,
	toOrder,
	toPriceEntry,
	toSite,
} from "./rows.ts"
import { lineTitle, type Order } from "./rules.ts"
import { isNewId, type SaveOrderResult, type Store } from "./store.ts"
import "./order-desk.css"

/**
 * One window per data source at the per-subscription cap. The demo databases
 * are tiny; a production desk would filter Orders to open stages and window the
 * rest (see docs/custom-blocks.md and the Knoxx original).
 */
const QUERY = { limit: 999 }

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

function Shell({ theme, children }: { theme: "light" | "dark"; children: ReactNode }) {
	return (
		<div className="nds od-root" data-display-mode={theme}>
			{children}
		</div>
	)
}

/**
 * Every write goes through this. The bridge has no timeout, and it drops any
 * host result the SDK's strict parse rejects — a page carrying a property type
 * its schema lacks (created_time, formula, rollup, unique_id) never settles
 * even though the write landed. Better a clear error than "Saving…" forever.
 */
const WRITE_TIMEOUT_MS = 15_000

type WriteResult<T> = { status: "success"; page?: T } | { status: "error"; error: { message: string } }

function settle<T>(write: Promise<WriteResult<T>>): Promise<WriteResult<T>> {
	return Promise.race([
		write,
		new Promise<WriteResult<T>>((resolve) =>
			setTimeout(
				() =>
					resolve({
						status: "error",
						error: {
							message:
								"Notion didn't confirm the write within 15s. It may still have landed — reload the block before retrying. (A created_time, formula, rollup or unique ID property on the bound database causes this.)",
						},
					}),
				WRITE_TIMEOUT_MS,
			),
		),
	])
}

const live = (rows: readonly NotionDataSourcePage[]) => rows.filter((r) => r.is_archived !== true)

function useNotionStore(): Store {
	const orders = useDataSource("orders", QUERY)
	const lines = useDataSource("lines", QUERY)
	const customers = useDataSource("customers", QUERY)
	const sites = useDataSource("sites", QUERY)
	const ingredients = useDataSource("ingredients", QUERY)
	const priceList = useDataSource("priceList", QUERY)

	return useMemo<Store>(() => {
		const orderRows = new Map<string, NotionDataSourcePage>(orders.items.map((r) => [r.id, r]))
		const lineRows = new Map<string, NotionDataSourcePage>(lines.items.map((r) => [r.id, r]))
		const ingredientList = live(ingredients.items).map(toIngredient)
		const loading = [orders, lines, customers, sites, ingredients, priceList].some((s) => s.isLoading)

		return {
			orders: live(orders.items)
				.map(toOrder)
				.filter((o): o is Order => o !== null),
			lines: live(lines.items).map(toLine),
			customers: live(customers.items).map(toCustomer),
			sites: live(sites.items).map(toSite),
			ingredients: ingredientList,
			priceList: live(priceList.items).map(toPriceEntry),
			courierOptions: optionNames(orders.propertySchemasByKey.courier),
			cancellationOptions: optionNames(orders.propertySchemasByKey.cancellationReason),
			loading,
			bindingProblems: loading
				? []
				: bindingProblems(
						{ Orders: orders, "Order lines": lines, Customers: customers, Sites: sites, Ingredients: ingredients, "Price list": priceList },
						orders.propertySchemasByKey.stage,
					),

			async saveOrder(orderId, draft, drafts): Promise<SaveOrderResult> {
				let id = orderId
				if (id === null) {
					const created = await settle(
						pages.create({
							parent: { type: "data_source_key", key: "orders" },
							properties: onlyBound(orderProperties(draft, true), orders.propertyIdsByKey),
						}),
					)
					if (created.status === "error") return { ok: false, message: created.error.message }
					if (created.page === undefined) return { ok: false, message: "Notion created the order but returned no id." }
					id = created.page.id
				} else {
					const row = orderRows.get(id)
					if (row === undefined) return { ok: false, message: "That order is no longer loaded. Reload the block." }
					const updated = await settle(
						row.update({ properties: onlyBound(orderProperties(draft, false), orders.propertyIdsByKey) }),
					)
					if (updated.status === "error") return { ok: false, message: updated.error.message }
				}

				// One write per changed line. A failure part-way stops and says how far it got.
				const lineIds: Record<string, string> = {}
				for (const d of drafts) {
					const title = lineTitle(
						ingredientList.find((i) => i.id === d.ingredientId),
						d.quantity,
					)
					const properties = onlyBound(lineProperties(d, id, title), lines.propertyIdsByKey)
					if (isNewId(d.id)) {
						if (d.removed) continue
						const created = await settle(pages.create({ parent: { type: "data_source_key", key: "lines" }, properties }))
						if (created.status === "error") return { ok: false, message: `Order saved, but a line failed: ${created.error.message}` }
						if (created.page !== undefined) lineIds[d.id] = created.page.id
						continue
					}
					const row = lineRows.get(d.id)
					if (row === undefined) continue
					if (d.removed) {
						const archived = await settle(row.archive())
						if (archived.status === "error") return { ok: false, message: `Couldn't remove a line: ${archived.error.message}` }
					} else if (!sameLine(toLine(row), d)) {
						const updated = await settle(row.update({ properties }))
						if (updated.status === "error") return { ok: false, message: `Order saved, but a line failed: ${updated.error.message}` }
					}
				}
				return { ok: true, id, lineIds }
			},

			async moveOrder(next) {
				const row = orderRows.get(next.id)
				if (row === undefined) return { ok: false, message: "That order is no longer loaded. Reload the block." }
				const result = await settle(row.update({ properties: onlyBound(moveProperties(next), orders.propertyIdsByKey) }))
				return result.status === "success" ? { ok: true } : { ok: false, message: result.error.message }
			},
		}
	}, [orders, lines, customers, sites, ingredients, priceList])
}

function NotionDesk() {
	const theme = useTheme()
	const store = useNotionStore()
	return (
		<Shell theme={theme}>
			<App store={store} mock={false} />
		</Shell>
	)
}

function MockDesk() {
	const store = useMockStore()
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	return (
		<Shell theme={theme}>
			<App store={store} mock />
		</Shell>
	)
}

function NotionRoot() {
	const fallbackTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
	return (
		<NotionCustomBlock
			autoResize
			fallback={
				<Shell theme={fallbackTheme}>
					<div className="od-empty">Loading…</div>
				</Shell>
			}
			errorFallback={(error) => (
				<Shell theme={fallbackTheme}>
					<div className="od-banner od-banner--error">{error.message}</div>
				</Shell>
			)}
		>
			<NotionTokenScope>
				<NotionDesk />
			</NotionTokenScope>
		</NotionCustomBlock>
	)
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

ReactDOM.createRoot(root).render(<StrictMode>{isMock ? <MockDesk /> : <NotionRoot />}</StrictMode>)
