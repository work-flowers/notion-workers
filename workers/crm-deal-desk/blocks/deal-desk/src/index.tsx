// Bundled, not linked: the brand's typography.css pulls these from the Google
// Fonts CDN, which the sandbox blocks silently. See deal-desk.css.
import "@fontsource-variable/inter"
import "@fontsource/jetbrains-mono/400.css"
import "@fontsource/jetbrains-mono/500.css"

import { pages } from "@notionhq/custom-blocks"
import { NotionCustomBlock, useDataSource } from "@notionhq/custom-blocks/react"
import { StrictMode, useState } from "react"
import ReactDOM from "react-dom/client"

import { App, type AppState, type SaveResult, type Store } from "./App.tsx"
import {
	MOCK_COMPANIES,
	MOCK_CONTACTS,
	MOCK_DEALS,
	MOCK_STAGE_OPTIONS,
} from "./mock.ts"
import {
	optionNames,
	stageOptionNames,
	toCompany,
	toContact,
	toDeal,
	toProperties,
} from "./rows.ts"
import { STAGES, type Deal, type DealDraft, type Stage } from "./rules.ts"
import "./deal-desk.css"

/**
 * The alpha caps a query at 999 rows and offers no server-side filter, so every
 * row of all three data sources is loaded and filtered in the browser.
 *
 * Fine for the CRM template this is bound to (25 companies, 125 contacts). The
 * live workFlowers CRM is inside the cap but not comfortably — 945 contacts and
 * 568 companies as of 2026-08-06 — and Contacts is the one to watch. When it
 * crosses 999 the Contact picker silently stops seeing the newest people and
 * the "no contacts at this company" state starts lying. There is no pagination
 * to reach for; the fix would have to come from the SDK.
 */
const ROW_LIMIT = 999

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

/**
 * The block paints its own brand surface and does not follow the page theme —
 * see the header comment in `deal-desk.css` for why that is deliberate.
 */
function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="dd-root" data-mock={isMock ? "true" : undefined}>
			{children}
		</div>
	)
}

function DealDesk() {
	const deals = useDataSource("deals", { limit: ROW_LIMIT })
	const companies = useDataSource("companies", { limit: ROW_LIMIT })
	const contacts = useDataSource("contacts", { limit: ROW_LIMIT })

	const error = deals.error ?? companies.error ?? contacts.error
	const isLoading = deals.isLoading || companies.isLoading || contacts.isLoading
	const hasNothing =
		deals.items.length === 0 &&
		companies.items.length === 0 &&
		contacts.items.length === 0

	let state: AppState
	if (error) {
		state = { status: "error", message: error.message }
	} else if (isLoading && hasNothing) {
		state = { status: "loading" }
	} else {
		const mapped = deals.items.map(toDeal)
		const known = mapped.filter((d): d is Deal => d !== null)

		const store: Store = {
			deals: known,
			companies: companies.items.map(toCompany),
			contacts: contacts.items.map(toContact),
			typeOptions: optionNames(deals.propertySchemasByKey.dealType),
			lostReasonOptions: optionNames(deals.propertySchemasByKey.lostReason),
			// Fall back to all seven only when the schema yields nothing, which
			// means the Stage binding is missing or points at the wrong property.
			stageOptions: fallbackToAll(
				stageOptionNames(deals.propertySchemasByKey.stage),
			),
			// An unmapped key resolves to `undefined`, which is a supported state
			// — the block degrades to an unfiltered picker rather than pretending.
			companyRelationBound: contacts.propertyIdsByKey.company !== undefined,

			createDeal: async (draft) =>
				report(
					await pages.create({
						parent: { type: "data_source_key", key: "deals" },
						properties: toProperties(draft),
					}),
				),

			updateDeal: async (id, draft) => {
				const row = deals.items.find((item) => item.id === id)
				if (row === undefined) {
					return {
						ok: false,
						message: "That deal is no longer in the loaded set. Reload the block.",
					}
				}
				// `row.update` resolves manifest keys to raw property ids for us;
				// the top-level `pages.update` would need the raw ids spelled out.
				return report(await row.update({ properties: toProperties(draft) }))
			},
		}

		state = {
			status: "ready",
			store,
			stale: isLoading,
			unknownStages: mapped.length - known.length,
		}
	}

	return (
		<Shell>
			<App {...state} />
		</Shell>
	)
}

function fallbackToAll(stages: Stage[]): readonly Stage[] {
	return stages.length > 0 ? stages : STAGES
}

function report(result: { status: "success" } | { status: "error"; error: { message: string } }): SaveResult {
	return result.status === "success"
		? { ok: true }
		: { ok: false, message: result.error.message }
}

/**
 * `?mock` runs the whole app against the snapshot, with writes held in memory.
 *
 * Deliberately a real store rather than a read-only preview: creating a deal
 * and watching the stage buttons unlock is the demo, and it needs no Notion, no
 * binding and no write to the live CRM to give it.
 */
function MockRoot() {
	const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS)

	const store: Store = {
		deals,
		companies: MOCK_COMPANIES,
		contacts: MOCK_CONTACTS,
		stageOptions: MOCK_STAGE_OPTIONS,
		typeOptions: [
			"Full Retainer",
			"Project",
			"Support Retainer",
			"Subscription",
			"Workshop",
		],
		lostReasonOptions: [
			"Price / Budget",
			"Chose competitor",
			"Timing / Not now",
			"No budget",
			"Went with internal build",
			"Went silent / No response",
			"Not a fit",
			"Other",
		],
		companyRelationBound: params.get("relation") !== "unbound",
		createDeal: async (draft: DealDraft) => {
			setDeals((current) => [
				{ ...draft, id: `local-${current.length + 1}-${draft.name.slice(0, 8)}` },
				...current,
			])
			return { ok: true }
		},
		updateDeal: async (id: string, draft: DealDraft) => {
			setDeals((current) =>
				current.map((d) => (d.id === id ? { ...draft, id } : d)),
			)
			return { ok: true }
		},
	}

	return (
		<Shell>
			<App status="ready" store={store} />
		</Shell>
	)
}

function NotionRoot() {
	return (
		<NotionCustomBlock
			autoResize
			fallback={
				<Shell>
					<App status="loading" />
				</Shell>
			}
			errorFallback={(error) => (
				<Shell>
					<App status="error" message={error.message} />
				</Shell>
			)}
		>
			{/*
			 * No <NotionTokenScope>: it exists to supply NDS theme tokens, and
			 * this block styles itself from the workFlowers palette instead.
			 */}
			<DealDesk />
		</NotionCustomBlock>
	)
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

ReactDOM.createRoot(root).render(
	<StrictMode>{isMock ? <MockRoot /> : <NotionRoot />}</StrictMode>,
)
