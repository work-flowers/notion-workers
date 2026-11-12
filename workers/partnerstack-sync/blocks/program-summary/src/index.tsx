import "@notionhq/custom-blocks/nds.css"
import type { UseDataSourceResult } from "@notionhq/custom-blocks"
import {
	NotionCustomBlock,
	NotionTokenScope,
	useDataSource,
	usePage,
	useTheme,
} from "@notionhq/custom-blocks/react"
import { StrictMode, useMemo, type ReactNode } from "react"
import ReactDOM from "react-dom/client"

import { summarize } from "./aggregate.ts"
import { App, type AppProps } from "./App.tsx"
import { toPayoutRow, toProgramRow, toRewardRow } from "./rows.ts"
import "./block.css"

// The alpha caps a query at 999 rows, far above today's volumes.
const QUERY = { limit: 999 } as const

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

function Shell({ theme, children }: { theme: "light" | "dark"; children: ReactNode }) {
	return (
		<div className="nds ps-root" data-display-mode={theme} data-mock={isMock ? "true" : undefined}>
			{children}
		</div>
	)
}

/** Which required keys of a data source are not mapped. */
function missing(label: string, ds: UseDataSourceResult, required: string[]): string[] {
	if (!ds.collectionSchema) return [`the ${label} data source`]
	return required.filter((k) => !ds.propertyIdsByKey[k]).map((k) => `${label} → ${k}`)
}

function Block() {
	const theme = useTheme()
	const page = usePage()
	const programs = useDataSource("programs", QUERY)
	const rewards = useDataSource("rewards", QUERY)
	const payouts = useDataSource("payouts", QUERY)

	const state: AppProps = useMemo(() => {
		const all = [programs, rewards, payouts]
		const error = all.find((d) => d.error)?.error
		if (error) return { status: "error", message: error.message }
		if (all.some((d) => d.isLoading && d.items.length === 0)) return { status: "loading" }
		const unbound = [
			...missing("Programs", programs, ["name"]),
			...missing("Rewards", rewards, ["name", "program", "amount", "status"]),
			...missing("Payouts", payouts, ["amount"]),
		]
		if (unbound.length) return { status: "unbound", missing: unbound }
		return {
			status: "ready",
			summary: summarize(
				programs.items.map(toProgramRow),
				rewards.items.map(toRewardRow),
				payouts.items.map(toPayoutRow),
				page.id,
			),
			truncated: all.some((d) => d.hasMore),
		}
	}, [programs, rewards, payouts, page.id])

	return (
		<Shell theme={theme}>
			<App {...state} />
		</Shell>
	)
}

const fallbackTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

if (isMock) {
	// `?mock` = all-programs overview; `?mock&program=prog_setup` = one program page.
	void import("./mock.ts").then(({ MOCK_PAYOUTS, MOCK_PROGRAMS, MOCK_REWARDS }) => {
		const summary = summarize(MOCK_PROGRAMS, MOCK_REWARDS, MOCK_PAYOUTS, params.get("program"))
		ReactDOM.createRoot(root).render(
			<StrictMode>
				<Shell theme={params.get("theme") === "dark" ? "dark" : "light"}>
					<App status="ready" summary={summary} truncated={false} />
				</Shell>
			</StrictMode>,
		)
	})
} else {
	ReactDOM.createRoot(root).render(
		<StrictMode>
			<NotionCustomBlock
				autoResize
				fallback={
					<Shell theme={fallbackTheme}>
						<App status="loading" />
					</Shell>
				}
				errorFallback={(error) => (
					<Shell theme={fallbackTheme}>
						<App status="error" message={error.message} />
					</Shell>
				)}
			>
				<NotionTokenScope>
					<Block />
				</NotionTokenScope>
			</NotionCustomBlock>
		</StrictMode>,
	)
}
