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
import { MOCK_SENDS } from "./mock.ts"
import { toSend } from "./rows.ts"
import "./dashboard.css"

const DATA_SOURCE_KEY = "sends"
/** The alpha caps a query at 999 rows; a newsletter archive is far short of it. */
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
			className="nds nl-root"
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

function Dashboard() {
	const theme = useTheme()
	const { items, isLoading, error } = useDataSource(DATA_SOURCE_KEY, { limit: ROW_LIMIT })

	const state: AppState = error
		? { sends: [], today: today(), status: "error", message: error.message }
		: isLoading && items.length === 0
			? { sends: [], today: today(), status: "loading" }
			: {
					sends: items.map(toSend),
					today: today(),
					status: "ready",
					// Hold the rendered frame at reduced opacity while refetching.
					stale: isLoading,
				}

	return (
		<Shell theme={theme}>
			<App {...state} />
		</Shell>
	)
}

/** `?mock` renders the dashboard from fixture data outside Notion. */
function MockRoot() {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	return (
		<Shell theme={theme}>
			<App sends={MOCK_SENDS} today={params.get("today") ?? today()} status="ready" />
		</Shell>
	)
}

function NotionRoot() {
	const fallbackTheme = prefersDark() ? "dark" : "light"
	return (
		<NotionCustomBlock
			autoResize
			fallback={
				<Shell theme={fallbackTheme}>
					<App sends={[]} today={today()} status="loading" />
				</Shell>
			}
			errorFallback={(error) => (
				<Shell theme={fallbackTheme}>
					<App sends={[]} today={today()} status="error" message={error.message} />
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

ReactDOM.createRoot(root).render(
	<StrictMode>{isMock ? <MockRoot /> : <NotionRoot />}</StrictMode>,
)
