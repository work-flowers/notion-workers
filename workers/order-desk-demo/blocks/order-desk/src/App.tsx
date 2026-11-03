import { useState } from "react"

import { Banner } from "./components.tsx"
import { OrderList } from "./OrderList.tsx"
import { OrderSheet } from "./OrderSheet.tsx"
import type { Store } from "./store.ts"

type Route = { kind: "list" } | { kind: "order"; id: string | null; key: number }

let opened = 0

export function App({ store, mock }: { store: Store; mock: boolean }) {
	const [route, setRoute] = useState<Route>({ kind: "list" })
	const toList = () => setRoute({ kind: "list" })

	return (
		<div className="od">
			<header className="od-head">
				<div className="od-brand">
					<span className="od-brand-mark" aria-hidden>
						🧪
					</span>
					<span>
						<strong>Cauldron &amp; Co</strong>
						<span className="od-muted"> · Order Desk</span>
					</span>
					{mock ? <span className="od-badge">Mock data — writes stay in memory</span> : null}
				</div>
				{route.kind === "list" ? (
					<button
						type="button"
						className="od-button od-button--primary"
						onClick={() => setRoute({ kind: "order", id: null, key: ++opened })}
					>
						+ New order
					</button>
				) : null}
			</header>

			{store.bindingProblems.length > 0 ? (
				<Banner tone="warn">
					<strong>This block isn't fully configured.</strong>
					<ul>
						{store.bindingProblems.map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
				</Banner>
			) : null}

			{store.loading && store.orders.length === 0 ? (
				<div className="od-empty">Loading orders…</div>
			) : route.kind === "list" ? (
				<OrderList store={store} onOpen={(id) => setRoute({ kind: "order", id, key: ++opened })} />
			) : (
				<OrderSheet
					// Keyed per opening, not per id: creating an order changes its id
					// from null to the new one, and the sheet must survive that.
					key={route.key}
					store={store}
					orderId={route.id}
					onBack={toList}
					onSaved={(id) => setRoute({ ...route, id })}
				/>
			)}
		</div>
	)
}
