import "@notionhq/custom-blocks/nds.css"
import type { UseDataSourceOptions } from "@notionhq/custom-blocks"
import {
	NotionCustomBlock,
	NotionTokenScope,
	useDataSource,
	useTheme,
} from "@notionhq/custom-blocks/react"
import { StrictMode, useEffect, useMemo, useState } from "react"
import ReactDOM from "react-dom/client"

import { App, type AppState } from "./App.tsx"
import { PeriodPagesContext, type PeriodPagesResult, type UsePeriodPages } from "./periodPages.ts"
import { toChannelRow, toDailyRow, toPageDayRow, toPageRow } from "./rows.ts"
import "./dashboard.css"

/**
 * The alpha caps a query at 999 rows. `daily`, `acquisition` and `pages` load
 * whole: Site Daily grows one row a day, Page Performance one row per URL.
 * Pages Path Report (1,917 rows on 2026-09-30) doesn't fit, so `pageDays` is
 * only read one drill-down period at a time — see `useNotionPeriodPages`.
 */
const ROW_LIMIT = 999

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

/** Today as a local calendar day — the ranges are day-granular, not instants. */
function today(): string {
	const now = new Date()
	return [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("-")
}

function Shell({
	theme,
	children,
}: {
	theme: "light" | "dark"
	children: React.ReactNode
}) {
	return (
		<div
			className="nds wd-root"
			data-display-mode={theme}
			data-mock={isMock ? "true" : undefined}
		>
			{children}
		</div>
	)
}

function prefersDark(): boolean {
	return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches)
}

/**
 * A data source the config panel never mapped resolves every property id to
 * `undefined` — a supported state, not an error. One defined id is enough to
 * say the key is bound; the tab then renders whatever it got.
 */
function isBound(propertyIdsByKey: Record<string, string | undefined>): boolean {
	return Object.values(propertyIdsByKey).some((id) => id !== undefined)
}

/**
 * One drill-down period of 📄 Pages Path Report, filtered server-side.
 *
 * The report is past the 999-row cap, but one period of it isn't — a month is
 * a few hundred page-days — so the date filter is what makes it readable at
 * all. Sorted by views so that, if a period ever did overflow, the cap would
 * drop the least-viewed pages rather than an arbitrary set. Old Notion clients
 * ignore both silently; `summarizePeriodPages` re-checks the dates to catch
 * that. A host that rejects the sort gets the query again without it, as in
 * crm-deal-desk.
 */
const useNotionPeriodPages: UsePeriodPages = (from, to) => {
	const [sortRejected, setSortRejected] = useState(false)
	const query = useMemo<UseDataSourceOptions>(
		() => ({
			limit: ROW_LIMIT,
			filter: {
				and: [
					{ key: "day", date: { on_or_after: from } },
					{ key: "day", date: { on_or_before: to } },
				],
			},
			...(sortRejected ? {} : { sorts: [{ key: "views", direction: "descending" as const }] }),
		}),
		[from, to, sortRejected],
	)
	const result = useDataSource("pageDays", query)
	const sortError = Boolean(result.error && /sort/i.test(result.error.message))

	useEffect(() => {
		if (sortError && !sortRejected) setSortRejected(true)
	}, [sortError, sortRejected])

	return useMemo<PeriodPagesResult>(() => {
		// Unmapped comes first: filtering on a key with no property behind it
		// errors, and that error means "not set up", not "broken".
		if (!isBound(result.propertyIdsByKey)) {
			return { status: result.isLoading ? "loading" : "unbound", rows: [], hasMore: false }
		}
		if (result.error && !sortError) {
			return { status: "error", rows: [], hasMore: false, message: result.error.message }
		}
		if (result.isLoading || sortError) return { status: "loading", rows: [], hasMore: false }
		return { status: "ready", rows: result.items.map(toPageDayRow), hasMore: result.hasMore }
	}, [result, sortError])
}

function Dashboard() {
	const theme = useTheme()
	const daily = useDataSource("daily", { limit: ROW_LIMIT })
	const acquisition = useDataSource("acquisition", { limit: ROW_LIMIT })
	const pages = useDataSource("pages", { limit: ROW_LIMIT })

	// One failure shouldn't blank the whole dashboard, but a failure on every
	// key means the block isn't wired up at all — worth saying plainly.
	const errors = [daily.error, acquisition.error, pages.error].filter(Boolean)
	const isLoading = daily.isLoading || acquisition.isLoading || pages.isLoading
	const empty =
		daily.items.length === 0 &&
		acquisition.items.length === 0 &&
		pages.items.length === 0

	const state: AppState =
		errors.length === 3
			? {
					days: [],
					channels: [],
					pages: [],
					today: today(),
					status: "error",
					message: errors[0]?.message,
					bound: { daily: false, acquisition: false, pages: false },
				}
			: isLoading && empty
				? {
						days: [],
						channels: [],
						pages: [],
						today: today(),
						status: "loading",
						bound: { daily: false, acquisition: false, pages: false },
					}
				: {
						days: daily.items.map(toDailyRow),
						channels: acquisition.items.map(toChannelRow),
						pages: pages.items.map(toPageRow),
						today: today(),
						status: "ready",
						// Hold the rendered frame at reduced opacity while refetching.
						stale: isLoading,
						bound: {
							daily: isBound(daily.propertyIdsByKey),
							acquisition: isBound(acquisition.propertyIdsByKey),
							pages: isBound(pages.propertyIdsByKey),
						},
					}

	return (
		<Shell theme={theme}>
			<PeriodPagesContext.Provider value={useNotionPeriodPages}>
				<App {...state} />
			</PeriodPagesContext.Provider>
		</Shell>
	)
}

function NotionRoot() {
	const fallbackTheme = prefersDark() ? "dark" : "light"
	const blank: AppState = {
		days: [],
		channels: [],
		pages: [],
		today: today(),
		status: "loading",
		bound: { daily: false, acquisition: false, pages: false },
	}

	return (
		<NotionCustomBlock
			autoResize
			fallback={
				<Shell theme={fallbackTheme}>
					<App {...blank} />
				</Shell>
			}
			errorFallback={(error) => (
				<Shell theme={fallbackTheme}>
					<App {...blank} status="error" message={error.message} />
				</Shell>
			)}
		>
			<NotionTokenScope>
				<Dashboard />
			</NotionTokenScope>
		</NotionCustomBlock>
	)
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

if (isMock) {
	// Dynamically imported so the ~700-row fixture snapshot is code-split out of
	// the bundle Notion actually serves.
	void import("./mock.ts").then(
		({ MOCK_CHANNELS, MOCK_DAYS, MOCK_PAGE_DAYS, MOCK_PAGES, MOCK_TODAY }) => {
			// Slices the fixture the way the host's date filter would. `?mock&nopages`
			// leaves the default in place, to see the drill-down with pageDays unmapped.
			const useMockPeriodPages: UsePeriodPages = (from, to) =>
				useMemo(
					() => ({
						status: "ready",
						rows: MOCK_PAGE_DAYS.filter((r) => r.day !== null && r.day >= from && r.day <= to),
						hasMore: false,
					}),
					[from, to],
				)
			const app = (
				<App
					days={MOCK_DAYS}
					channels={MOCK_CHANNELS}
					pages={MOCK_PAGES}
					today={params.get("today") ?? MOCK_TODAY}
					status="ready"
					bound={{ daily: true, acquisition: true, pages: true }}
				/>
			)
			ReactDOM.createRoot(root).render(
				<StrictMode>
					<Shell theme={params.get("theme") === "dark" ? "dark" : "light"}>
						{params.has("nopages") ? (
							app
						) : (
							<PeriodPagesContext.Provider value={useMockPeriodPages}>
								{app}
							</PeriodPagesContext.Provider>
						)}
					</Shell>
				</StrictMode>,
			)
		},
	)
} else {
	ReactDOM.createRoot(root).render(
		<StrictMode>
			<NotionRoot />
		</StrictMode>,
	)
}
