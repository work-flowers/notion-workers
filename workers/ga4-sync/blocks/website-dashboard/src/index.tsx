import "@notionhq/custom-blocks/nds.css"
import type { UseDataSourceOptions } from "@notionhq/custom-blocks"
import {
	NotionCustomBlock,
	NotionTokenScope,
	useDataSource,
	useTheme,
} from "@notionhq/custom-blocks/react"
import { StrictMode, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import ReactDOM from "react-dom/client"

import { mergeWindows, monthWindows, type ChannelRow, type DateWindow } from "./aggregate.ts"
import { App, type AppState } from "./App.tsx"
import { PeriodPagesContext, type PeriodPagesResult, type UsePeriodPages } from "./periodPages.ts"
import { toChannelRow, toDailyRow, toPageDayRow, toPageRow } from "./rows.ts"
import "./dashboard.css"

/**
 * The alpha caps a query at 999 rows. `daily` and `pages` load whole: Site
 * Daily grows one row a day, Page Performance one row per URL. `acquisition`
 * loads one month per query (`useAcquisition`), and `pageDays` one drill-down
 * period at a time (`useNotionPeriodPages`).
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
 * One date window of a data source: a server-side date filter on its `day`
 * key, sorted descending on `sortKey` so that if a window ever overflowed the
 * cap, what fell off would be the smallest rows rather than an arbitrary set.
 * Old Notion clients ignore both silently, which callers detect by
 * re-checking dates. A host that *rejects* either gets the query again
 * without it — the sort as in crm-deal-desk, and the filter too, since the
 * date re-check turns an unfiltered result into a visible "incomplete" note
 * rather than a broken tab. The date filter itself was verified live on
 * 2026-09-30, so that fallback is insurance for other hosts and clients, not
 * a known need. Options are memoised: a fresh object per render would
 * replace the subscription and blank the rows.
 */
function useDateWindow(key: string, from: string, to: string, sortKey: string) {
	const [sortRejected, setSortRejected] = useState(false)
	const [filterRejected, setFilterRejected] = useState(false)
	const query = useMemo<UseDataSourceOptions>(
		() => ({
			limit: ROW_LIMIT,
			...(filterRejected
				? {}
				: {
						filter: {
							and: [
								{ key: "day", date: { on_or_after: from } },
								{ key: "day", date: { on_or_before: to } },
							],
						},
					}),
			...(sortRejected ? {} : { sorts: [{ key: sortKey, direction: "descending" as const }] }),
		}),
		[from, to, sortKey, sortRejected, filterRejected],
	)
	const result = useDataSource(key, query)
	const bound = isBound(result.propertyIdsByKey)
	const message = result.error?.message ?? ""
	const sortError = !sortRejected && /sort/i.test(message)
	// Only once bound: on an unmapped key the filter errors for want of a
	// property, which is "not set up" rather than a rejected filter.
	const filterError = bound && !filterRejected && !sortError && /filter/i.test(message)

	useEffect(() => {
		if (sortError) setSortRejected(true)
		else if (filterError) setFilterRejected(true)
	}, [sortError, filterError])

	const retrying = sortError || filterError
	return {
		items: result.items,
		// A rejected option is about to be retried without it: loading, not failed.
		isLoading: result.isLoading || retrying,
		hasMore: result.hasMore,
		error: retrying ? undefined : result.error,
		bound,
	}
}

/**
 * One drill-down period of 📄 Pages Path Report. The report is past the cap,
 * but one period of it isn't — a month is a few hundred page-days — so the
 * date filter is what makes it readable at all. `summarizePeriodPages`
 * re-checks the dates.
 */
const useNotionPeriodPages: UsePeriodPages = (from, to) => {
	const window = useDateWindow("pageDays", from, to, "views")

	return useMemo<PeriodPagesResult>(() => {
		// Unmapped comes first: filtering on a key with no property behind it
		// errors, and that error means "not set up", not "broken".
		if (!window.bound) {
			return { status: window.isLoading ? "loading" : "unbound", rows: [], hasMore: false }
		}
		if (window.error) {
			return { status: "error", rows: [], hasMore: false, message: window.error.message }
		}
		if (window.isLoading) return { status: "loading", rows: [], hasMore: false }
		return { status: "ready", rows: window.items.map(toPageDayRow), hasMore: window.hasMore }
	}, [window.bound, window.error, window.isLoading, window.items, window.hasMore])
}

/**
 * 🚥 Traffic starts here. The GA4 property was created 2026-04-12 (see
 * `workers/ga4-sync/CLAUDE.md`), so no earlier row exists to miss.
 */
const ACQUISITION_START = "2026-04-01"

type WindowSnapshot = {
	rows: ChannelRow[]
	isLoading: boolean
	hasMore: boolean
	error?: { message: string }
	bound: boolean
}

/** One month of 🚥 Traffic. Renders nothing; reports its snapshot upward. */
function AcquisitionMonth({
	window,
	onSnapshot,
}: {
	window: DateWindow
	onSnapshot: (key: string, snapshot: WindowSnapshot) => void
}) {
	const result = useDateWindow("acquisition", window.from, window.to, "sessions")
	const snapshot = useMemo<WindowSnapshot>(
		() => ({
			rows: result.items.map(toChannelRow),
			isLoading: result.isLoading,
			hasMore: result.hasMore,
			error: result.error,
			bound: result.bound,
		}),
		[result.items, result.isLoading, result.hasMore, result.error, result.bound],
	)
	useEffect(() => onSnapshot(window.key, snapshot), [window.key, snapshot, onSnapshot])
	return null
}

/**
 * 🚥 Traffic, loaded one calendar month per subscription and merged.
 *
 * Loaded whole it passed the 999-row cap in late October 2026 (865 rows on
 * 09-30, ~6 a day), after which the host returns an arbitrary 999 and every
 * channel figure silently under-counts. A month is ~170 rows, so each window
 * has years of headroom, and the rest of the block still gets the full row set
 * and filters by range itself. Subscriptions are components because the
 * number of months grows and hooks can't be called a variable number of times.
 */
function useAcquisition(todayDay: string): {
	loaders: ReactNode
	rows: ChannelRow[]
	isLoading: boolean
	error?: { message: string }
	bound: boolean
	incomplete: "filterIgnored" | "overflow" | null
} {
	const windows = useMemo(() => monthWindows(ACQUISITION_START, todayDay), [todayDay])
	const [snapshots, setSnapshots] = useState<Record<string, WindowSnapshot>>({})
	const onSnapshot = useCallback(
		(key: string, snapshot: WindowSnapshot) =>
			setSnapshots((held) => (held[key] === snapshot ? held : { ...held, [key]: snapshot })),
		[],
	)

	const merged = useMemo(() => {
		const got = windows.map((window) => ({ window, snapshot: snapshots[window.key] }))
		const { rows, outOfRange } = mergeWindows(
			got.map(({ window, snapshot }) => ({ window, rows: snapshot?.rows ?? [] })),
		)
		const bound = got.some(({ snapshot }) => snapshot?.bound)
		return {
			rows,
			// A month that hasn't reported yet is still loading.
			isLoading: got.some(({ snapshot }) => !snapshot || snapshot.isLoading),
			// Unbound months error on the filter's unmapped key; that is "not set
			// up", which the Acquisition tab already explains, not a failure.
			error: bound ? got.find(({ snapshot }) => snapshot?.error)?.snapshot?.error : undefined,
			bound,
			incomplete:
				outOfRange > 0
					? ("filterIgnored" as const)
					: got.some(({ snapshot }) => snapshot?.hasMore)
						? ("overflow" as const)
						: null,
		}
	}, [windows, snapshots])

	return {
		loaders: windows.map((window) => (
			<AcquisitionMonth key={window.key} window={window} onSnapshot={onSnapshot} />
		)),
		...merged,
	}
}

function Dashboard() {
	const theme = useTheme()
	const daily = useDataSource("daily", { limit: ROW_LIMIT })
	const day = today()
	const acquisition = useAcquisition(day)
	const pages = useDataSource("pages", { limit: ROW_LIMIT })

	// One failure shouldn't blank the whole dashboard, but a failure on every
	// key means the block isn't wired up at all — worth saying plainly.
	const errors = [daily.error, acquisition.error, pages.error].filter(Boolean)
	const isLoading = daily.isLoading || acquisition.isLoading || pages.isLoading
	const empty =
		daily.items.length === 0 &&
		acquisition.rows.length === 0 &&
		pages.items.length === 0

	const state: AppState =
		errors.length === 3
			? {
					days: [],
					channels: [],
					pages: [],
					today: day,
					status: "error",
					message: errors[0]?.message,
					bound: { daily: false, acquisition: false, pages: false },
				}
			: isLoading && empty
				? {
						days: [],
						channels: [],
						pages: [],
						today: day,
						status: "loading",
						bound: { daily: false, acquisition: false, pages: false },
					}
				: {
						days: daily.items.map(toDailyRow),
						channels: acquisition.rows,
						pages: pages.items.map(toPageRow),
						today: day,
						status: "ready",
						acquisitionIncomplete: acquisition.incomplete,
						// Hold the rendered frame at reduced opacity while refetching.
						stale: isLoading,
						bound: {
							daily: isBound(daily.propertyIdsByKey),
							acquisition: acquisition.bound,
							pages: isBound(pages.propertyIdsByKey),
						},
					}

	return (
		<Shell theme={theme}>
			{acquisition.loaders}
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
