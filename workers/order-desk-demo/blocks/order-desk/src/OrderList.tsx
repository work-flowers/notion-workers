import { useMemo, useState } from "react"

import { StagePill } from "./components.tsx"
import {
	blocking,
	formatGp,
	isOpen,
	lookup,
	OPEN_STAGES,
	orderProblems,
	orderTotal,
	STAGES,
	todayIso,
	type Order,
	type Stage,
} from "./rules.ts"
import type { Store } from "./store.ts"

type Tab = "open" | "attention" | "closed"

const TABS: { id: Tab; label: string }[] = [
	{ id: "open", label: "Open" },
	{ id: "attention", label: "Needs attention" },
	{ id: "closed", label: "Closed" },
]

function formatDay(day: string | null): string {
	if (day === null) return "No date"
	const [y, m, d] = day.split("-").map(Number)
	return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

export function OrderList({ store, onOpen }: { store: Store; onOpen: (id: string) => void }) {
	const [tab, setTab] = useState<Tab>("open")
	const find = lookup(store)
	const today = todayIso()

	const rows = useMemo(
		() =>
			store.orders.map((order) => {
				const lines = store.lines.filter((l) => l.orderId === order.id)
				const toFix = isOpen(order.stage) ? blocking(orderProblems(store, order, lines, today)).length : 0
				return { order, lines, toFix }
			}),
		[store, today],
	)

	const inTab = (t: Tab) =>
		rows.filter(({ order, toFix }) =>
			t === "open" ? isOpen(order.stage) : t === "closed" ? !isOpen(order.stage) : order.stage === "Draft" && toFix > 0,
		)

	const shown = inTab(tab)
	const stages: readonly Stage[] = tab === "closed" ? STAGES.filter((s) => !isOpen(s)) : OPEN_STAGES

	return (
		<div className="od-list">
			<div className="od-tabs" role="tablist">
				{TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={tab === t.id}
						className={`od-tab${tab === t.id ? " is-active" : ""}`}
						onClick={() => setTab(t.id)}
					>
						{t.label}
						<span className="od-count">{inTab(t.id).length}</span>
					</button>
				))}
			</div>

			{shown.length === 0 ? <div className="od-empty">Nothing here.</div> : null}

			{stages.map((stage) => {
				const group = shown
					.filter((r) => r.order.stage === stage)
					.sort((a, b) => (a.order.deliveryDate ?? "9").localeCompare(b.order.deliveryDate ?? "9"))
				if (group.length === 0) return null
				return (
					<section key={stage} className="od-group">
						<h3 className="od-group-title">
							<StagePill stage={stage} />
							<span className="od-count">{group.length}</span>
						</h3>
						{group.map(({ order, lines, toFix }) => (
							<OrderRow
								key={order.id}
								order={order}
								customer={find.customer(order.customerId)?.name ?? "No customer"}
								site={find.site(order.siteId)?.name ?? "No site"}
								summary={lines
									.map((l) => `${find.ingredient(l.ingredientId)?.name ?? "?"} × ${l.quantity ?? 0}`)
									.join(" · ")}
								total={orderTotal(lines)}
								toFix={toFix}
								onOpen={() => onOpen(order.id)}
							/>
						))}
					</section>
				)
			})}
		</div>
	)
}

function OrderRow(props: {
	order: Order
	customer: string
	site: string
	summary: string
	total: number
	toFix: number
	onOpen: () => void
}) {
	const { order } = props
	return (
		<button type="button" className="od-row" onClick={props.onOpen}>
			<span className="od-row-main">
				<span className="od-row-title">
					<strong>{order.title}</strong> {props.customer}
				</span>
				<span className="od-row-sub">
					{props.site} · {formatDay(order.deliveryDate)}
				</span>
				<span className="od-row-lines">{props.summary || "No lines yet"}</span>
			</span>
			<span className="od-row-side">
				<span className="od-row-total">{formatGp(props.total)}</span>
				{props.toFix > 0 ? <span className="od-badge od-badge--block">{props.toFix} to fix</span> : null}
			</span>
		</button>
	)
}
