import "@notionhq/custom-blocks/nds.css"
import { pages, type NotionDataSourcePage } from "@notionhq/custom-blocks"
import {
	NotionCustomBlock,
	NotionTokenScope,
	useDataSource,
	usePage,
	useTheme,
} from "@notionhq/custom-blocks/react"
import { StrictMode, useMemo } from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App.tsx"
import { MOCK_PROJECT_IDS, useMockStore } from "./mock.ts"
import {
	bindingProblems,
	newItemProperties,
	newProjectProperties,
	onlyBound,
	phaseProperties,
	statusProperties,
	toDeliverable,
	toProject,
} from "./rows.ts"
import { today, type Store } from "./store.ts"
import "./stage-gate.css"

/** The per-subscription cap. Plenty for projects; the banner covers deliverables past it. */
const QUERY = { limit: 999 }

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

function Shell({ theme, children }: { theme: "light" | "dark"; children: React.ReactNode }) {
	return (
		<div className="nds sg-root" data-display-mode={theme}>
			{children}
		</div>
	)
}

function failed(message: string): { ok: false; message: string } {
	return { ok: false, message }
}

function useNotionStore(): Store {
	const projects = useDataSource("projects", QUERY)
	const deliverables = useDataSource("deliverables", QUERY)

	return useMemo<Store>(() => {
		const projectRows = new Map<string, NotionDataSourcePage>(projects.items.map((r) => [r.id, r]))
		const deliverableRows = new Map<string, NotionDataSourcePage>(deliverables.items.map((r) => [r.id, r]))
		const problems = [
			...(projects.error ? [`Projects: ${projects.error.message}`] : []),
			...(deliverables.error ? [`Deliverables: ${deliverables.error.message}`] : []),
			...bindingProblems({
				projectIds: projects.propertyIdsByKey,
				deliverableIds: deliverables.propertyIdsByKey,
				projectPhase: projects.propertySchemasByKey.phase,
				deliverableStatus: deliverables.propertySchemasByKey.status,
			}),
		]

		return {
			projects: projects.items.map(toProject),
			deliverables: deliverables.items.map(toDeliverable),
			loading: projects.isLoading || deliverables.isLoading,
			truncated: deliverables.hasMore,
			// Only meaningful once the bindings have resolved.
			bindingProblems: projects.isLoading || deliverables.isLoading ? [] : problems,

			async setStatus(item, status) {
				const row = deliverableRows.get(item.id)
				if (!row) return failed("row not loaded")
				const result = await row.update({
					properties: onlyBound(statusProperties(item, status, today()), deliverables.propertyIdsByKey),
				})
				return result.status === "success" ? { ok: true } : failed(result.error.message)
			},

			async setPhase(project, phase) {
				const row = projectRows.get(project.id)
				if (!row) return failed("project not loaded")
				const result = await row.update({ properties: phaseProperties(phase) })
				return result.status === "success" ? { ok: true } : failed(result.error.message)
			},

			async createProject(name) {
				const result = await pages.create({
					parent: { type: "data_source_key", key: "projects" },
					properties: onlyBound(newProjectProperties(name), projects.propertyIdsByKey),
				})
				return result.status === "success" ? { ok: true, id: result.page.id } : failed(result.error.message)
			},

			// Sequential, so a failure part-way leaves a prefix of the checklist
			// that `missingItems` can complete on a retry (matched by Item key).
			async createItems(project, items, onProgress) {
				for (const [i, c] of items.entries()) {
					const result = await pages.create({
						parent: { type: "data_source_key", key: "deliverables" },
						properties: onlyBound(newItemProperties(project.id, c), deliverables.propertyIdsByKey),
					})
					if (result.status === "error") {
						return failed(`Created ${i} of ${items.length}, then: ${result.error.message}`)
					}
					onProgress(i + 1)
				}
				return { ok: true }
			},
		}
	}, [projects, deliverables])
}

function NotionGate() {
	const theme = useTheme()
	const page = usePage()
	const store = useNotionStore()
	return (
		<Shell theme={theme}>
			<App store={store} contextProjectId={page.id} />
		</Shell>
	)
}

function MockGate() {
	const store = useMockStore()
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const which = params.get("project") as keyof typeof MOCK_PROJECT_IDS | null
	// `?project=` plays "the block sits on this project's page", which only tags it in the overview.
	const projectId = which && which in MOCK_PROJECT_IDS ? MOCK_PROJECT_IDS[which] : null
	return (
		<Shell theme={theme}>
			<App store={store} contextProjectId={projectId} />
		</Shell>
	)
}

function NotionRoot() {
	const fallbackTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
	return (
		<NotionCustomBlock
			autoResize
			fallback={<Shell theme={fallbackTheme}><div className="sg-empty">Loading…</div></Shell>}
			errorFallback={(error) => (
				<Shell theme={fallbackTheme}>
					<div className="sg-banner sg-banner--error">{error.message}</div>
				</Shell>
			)}
		>
			<NotionTokenScope>
				<NotionGate />
			</NotionTokenScope>
		</NotionCustomBlock>
	)
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

ReactDOM.createRoot(root).render(<StrictMode>{isMock ? <MockGate /> : <NotionRoot />}</StrictMode>)
