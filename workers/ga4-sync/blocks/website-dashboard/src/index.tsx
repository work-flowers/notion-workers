import "@notionhq/custom-blocks/nds.css"
import {
	NotionCustomBlock,
	NotionTokenScope,
	useDataSource,
	useTheme,
} from "@notionhq/custom-blocks/react"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"

import { App, type AppState } from "./App.tsx"
import { toChannelRow, toDailyRow, toPageRow } from "./rows.ts"
import "./dashboard.css"

/**
 * The alpha caps a query at 999 rows. Of the five data sources `ga4-sync`
 * writes, only these three fit: Pages Path Report (1,144 rows) and Landing Page
 * Report (1,157) are already over and grow ~10 rows a day, and there is no
 * server-side filter to trim them with. Site Daily grows one row a day, so it
 * has ~2.4 years of headroom; Page Performance is one row per URL.
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
			<App {...state} />
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
	void import("./mock.ts").then(({ MOCK_CHANNELS, MOCK_DAYS, MOCK_PAGES, MOCK_TODAY }) => {
		ReactDOM.createRoot(root).render(
			<StrictMode>
				<Shell theme={params.get("theme") === "dark" ? "dark" : "light"}>
					<App
						days={MOCK_DAYS}
						channels={MOCK_CHANNELS}
						pages={MOCK_PAGES}
						today={params.get("today") ?? MOCK_TODAY}
						status="ready"
						bound={{ daily: true, acquisition: true, pages: true }}
					/>
				</Shell>
			</StrictMode>,
		)
	})
} else {
	ReactDOM.createRoot(root).render(
		<StrictMode>
			<NotionRoot />
		</StrictMode>,
	)
}
