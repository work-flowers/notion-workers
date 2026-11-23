import "@notionhq/custom-blocks/nds.css"
import { createPage } from "@notionhq/custom-blocks/pages"
import { NotionCustomBlock, NotionTokenScope, useContainingPage, useTheme } from "@notionhq/custom-blocks/react"
import { listUsers } from "@notionhq/custom-blocks/users"
import { StrictMode, useEffect, useMemo, useState } from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App.tsx"
import { MOCK_PROJECT_IDS, useMockStore } from "./mock.ts"
import { useDataSource, type Row } from "./notion.ts"
import {
	bindingProblems,
	newItemProperties,
	newProjectProperties,
	onlyBound,
	phaseProperties,
	itemProperties,
	toDeliverable,
	toProject,
} from "./rows.ts"
import type { Person, Store } from "./store.ts"
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

/**
 * Workspace members, read once. Paged, capped, and time-limited: the bridge has
 * no timeout of its own, and a picker with no names is better than a block that
 * never finishes loading.
 */
function usePeople(): Person[] {
	const [people, setPeople] = useState<Person[]>([])
	useEffect(() => {
		let cancelled = false
		async function load() {
			const found: Person[] = []
			let cursor: string | undefined
			for (let page = 0; page < 10; page++) {
				const result = await Promise.race([
					listUsers({ pageSize: 100, ...(cursor ? { startCursor: cursor } : {}) }),
					new Promise<null>((r) => setTimeout(() => r(null), 10_000)),
				])
				if (!result || result.status === "error") break
				for (const u of result.list.results) {
					found.push({ id: u.id, name: u.name ?? u.person.email, email: u.person.email ?? null })
				}
				if (!result.list.hasMore || !result.list.nextCursor) break
				cursor = result.list.nextCursor
			}
			if (!cancelled) setPeople(found.sort((a, b) => a.name.localeCompare(b.name)))
		}
		void load()
		return () => {
			cancelled = true
		}
	}, [])
	return people
}

function useNotionStore(): Store {
	const projects = useDataSource("projects", QUERY)
	const deliverables = useDataSource("deliverables", QUERY)
	const people = usePeople()

	return useMemo<Store>(() => {
		const projectRows = new Map<string, Row>(projects.items.map((r) => [r.id, r]))
		const deliverableRows = new Map<string, Row>(deliverables.items.map((r) => [r.id, r]))
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
			people,
			ownerBound: deliverables.propertyIdsByKey.owner !== undefined,
			// Only meaningful once the bindings have resolved.
			bindingProblems: projects.isLoading || deliverables.isLoading ? [] : problems,

			async updateItem(item, next) {
				const row = deliverableRows.get(item.id)
				if (!row) return failed("row not loaded")
				const result = await row.update({
					properties: onlyBound(itemProperties(next, item), deliverables.propertyIdsByKey),
				})
				return result.status === "success" ? { ok: true } : failed(result.error.message)
			},

			async setPhase(project, phase) {
				const row = projectRows.get(project.id)
				if (!row) return failed("project not loaded")
				const result = await row.update({ properties: phaseProperties(phase) })
				return result.status === "success" ? { ok: true } : failed(result.error.message)
			},

			// Make, model and variant are optional bindings: unmapped ones are simply not written.
			async createProject(name, details) {
				const result = await createPage({
					parent: { type: "data_source_key", dataSourceKey: "projects" },
					properties: onlyBound(newProjectProperties(name, details), projects.propertyIdsByKey),
				})
				return result.status === "success" ? { ok: true, id: result.page.getKey() } : failed(result.error.message)
			},

			// Sequential, so a failure part-way leaves a prefix of the checklist
			// that `missingItems` can complete on a retry (matched by Item key).
			async createItems(project, items, onProgress) {
				for (const [i, c] of items.entries()) {
					const result = await createPage({
						parent: { type: "data_source_key", dataSourceKey: "deliverables" },
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
	}, [projects, deliverables, people])
}

function NotionGate() {
	const theme = useTheme()
	const page = useContainingPage()
	const store = useNotionStore()
	const contextProjectId = page.status === "success" && page.value.type === "page" ? page.value.page.getKey() : null
	return (
		<Shell theme={theme}>
			<App store={store} contextProjectId={contextProjectId} />
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
