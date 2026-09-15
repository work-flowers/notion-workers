/**
 * The CRM Desk shell: header, the three tabs, and the notices that apply to
 * all of them. Each tab is its own module; this file is layout.
 *
 * All persistence goes through the `Store` interface (`store.ts`), which has
 * two implementations: one backed by Notion and one held in memory for `?mock`.
 */

import { useState } from "react"

import { CompaniesTab } from "./CompaniesTab.tsx"
import { Money, TruncationBanner } from "./components.tsx"
import { ContactsTab } from "./ContactsTab.tsx"
import { DealsTab } from "./DealsTab.tsx"
import { HOME, type Tab, type View } from "./nav.ts"
import { isClosed, REPORTING_CURRENCY, sgdConverter, weightedPipeline } from "./rules.ts"
import type { AppState, Store } from "./store.ts"

export type { AppState, SaveResult, Store } from "./store.ts"

const TABS: { tab: Tab; label: string; home: View }[] = [
	{ tab: "deals", label: "Deals", home: HOME },
	{ tab: "contacts", label: "Contacts", home: { tab: "contacts", id: null } },
	{ tab: "companies", label: "Companies", home: { tab: "companies", id: null } },
]

export function App(state: AppState) {
	const [view, setView] = useState<View>(HOME)

	if (state.status === "loading") {
		return <div className="dd-placeholder">Loading the CRM…</div>
	}
	if (state.status === "error") {
		return (
			<div className="dd-placeholder dd-error" role="alert">
				<p>Couldn’t load the CRM.</p>
				<p className="dd-muted">{state.message}</p>
			</div>
		)
	}

	const { store } = state

	return (
		<div className="dd-app" data-stale={state.stale ? "true" : undefined}>
			<Header store={store} view={view} onNavigate={setView} />

			<TruncationBanner store={store} />

			{store.filtersApplied === false ? (
				<p className="dd-notice dd-notice-warn" role="status">
					Notion ignored this block’s server-side filters, so the pipeline is
					being filtered in the browser instead. Updating the Notion app fixes
					it and lets the lists reach past the 999-row cap.
				</p>
			) : null}

			{state.unknownStages ? (
				<p className="dd-notice" role="status">
					{state.unknownStages} deal{state.unknownStages === 1 ? "" : "s"} hidden:
					their Stage value isn’t one this block knows how to govern. Check that
					the Stage property is mapped to the pipeline status.
				</p>
			) : null}

			<div
				role="tabpanel"
				id={`dd-panel-${view.tab}`}
				aria-labelledby={`dd-tab-${view.tab}`}
				className="dd-panel"
			>
				{view.tab === "deals" ? (
					<DealsTab store={store} view={view} onNavigate={setView} />
				) : view.tab === "contacts" ? (
					<ContactsTab store={store} view={view} onNavigate={setView} />
				) : (
					<CompaniesTab store={store} view={view} onNavigate={setView} />
				)}
			</div>
		</div>
	)
}

function Header({
	store,
	view,
	onNavigate,
}: {
	store: Store
	view: View
	onNavigate: (v: View) => void
}) {
	const toSgd = sgdConverter(store.fxRates)
	const { total, weighted, missingValue } = weightedPipeline(store.deals, toSgd)
	const openCount = store.deals.filter((d) => !isClosed(d.stage)).length

	return (
		<header className="dd-header">
			<div className="dd-header-titles">
				<h1 className="dd-title">CRM Desk</h1>
				<p className="dd-subtitle">
					{openCount} open {openCount === 1 ? "deal" : "deals"} ·{" "}
					<strong>
						<Money amount={Math.round(total)} code={REPORTING_CURRENCY} />
					</strong>{" "}
					in pipeline
					{Math.round(weighted) !== Math.round(total) ? (
						<>
							{" "}
							· <Money amount={Math.round(weighted)} /> weighted
						</>
					) : null}
					{missingValue > 0 ? (
						<span className="dd-muted">
							{" "}
							· {missingValue} with no value or rate
						</span>
					) : null}
				</p>
			</div>

			<nav className="dd-tabs" role="tablist" aria-label="CRM sections">
				{TABS.map(({ tab, label, home }) => (
					<button
						key={tab}
						type="button"
						role="tab"
						id={`dd-tab-${tab}`}
						aria-selected={view.tab === tab}
						aria-controls={`dd-panel-${tab}`}
						className="dd-tab"
						data-active={view.tab === tab ? "true" : undefined}
						onClick={() => onNavigate(home)}
					>
						{label}
					</button>
				))}
			</nav>
		</header>
	)
}
