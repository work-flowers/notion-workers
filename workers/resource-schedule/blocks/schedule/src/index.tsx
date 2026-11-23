import "@notionhq/custom-blocks/nds.css"

import { createPage } from "@notionhq/custom-blocks/pages"
import { NotionCustomBlock, NotionTokenScope, useTheme } from "@notionhq/custom-blocks/react"
import { StrictMode, useMemo, useState, type ReactNode } from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App.tsx"
import { useMockStore } from "./mock.ts"
import { useDataSource, type Row } from "./notion.ts"
import { sortPeople } from "./model.ts"
import {
	bindingProblems,
	bookingProperties,
	newBookingProperties,
	newJobProperties,
	onlyBound,
	optionNames,
	personProperties,
	toBooking,
	toClient,
	toJob,
	toPerson,
	toTemplate,
} from "./rows.ts"
import type { Store } from "./store.ts"
import "./schedule.css"

// Optional per-client theme, kept out of git so no client branding lands in this
// public repo. The glob matches nothing when the file is absent, so the build
// still works without it.
import.meta.glob("./brand.local.css", { eager: true })

/** The mock-up databases are small; one window at the per-subscription cap is plenty. */
const QUERY = { limit: 999 }

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

function Shell({ theme, children }: { theme: "light" | "dark"; children: ReactNode }) {
	return (
		<div className="nds rs-root" data-display-mode={theme}>
			{children}
		</div>
	)
}

/**
 * Every write goes through this. The bridge has no timeout, and a host result
 * the SDK's strict parse rejects never settles even though the write landed.
 */
const WRITE_TIMEOUT_MS = 15_000

type WriteResult<T> = { status: "success"; page?: T } | { status: "error"; error: { message: string } }

function settle<T>(write: Promise<WriteResult<T>>): Promise<WriteResult<T>> {
	return Promise.race([
		write,
		new Promise<WriteResult<T>>((resolve) =>
			setTimeout(
				() =>
					resolve({
						status: "error",
						error: { message: "Notion didn't confirm the save within 15s. It may still have landed — reload before retrying." },
					}),
				WRITE_TIMEOUT_MS,
			),
		),
	])
}

const live = (rows: readonly Row[]) => rows.filter((r) => r.is_archived !== true)

function useNotionStore(): Store {
	const bookings = useDataSource("bookings", QUERY)
	const jobs = useDataSource("jobs", QUERY)
	const clients = useDataSource("clients", QUERY)
	const templates = useDataSource("templates", QUERY)
	const team = useDataSource("team", QUERY)

	// The subscription keeps serving a row after the block archives it (seen live,
	// 2026-11-18: Notion had is_archived true, the block still listed it), so
	// hide what this block deleted itself.
	const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set())
	const bookingList = useMemo(
		() => live(bookings.items).filter((r) => !deleted.has(r.id)).map(toBooking),
		[bookings.items, deleted],
	)
	const clientList = useMemo(() => live(clients.items).map(toClient), [clients.items])
	const people = useMemo(() => sortPeople(live(team.items).map(toPerson)), [team.items])

	return useMemo<Store>(() => {
		const rows = new Map<string, Row>(bookings.items.map((r) => [r.id, r]))
		const teamRows = new Map<string, Row>(team.items.map((r) => [r.id, r]))
		const loading = [bookings, team, jobs, clients, templates].some((s) => s.isLoading)

		return {
			bookings: bookingList,
			jobs: live(jobs.items).map(toJob),
			clients: clientList,
			templates: live(templates.items).map(toTemplate),
			people,
			roleOptions: optionNames(team.propertySchemasByKey.roles),
			teamOptions: optionNames(team.propertySchemasByKey.team),
			labelOptions: optionNames(jobs.propertySchemasByKey.label),
			loading,
			bindingProblems: loading ? [] : bindingProblems({ Bookings: bookings, Team: team, Jobs: jobs, Clients: clients, "Job templates": templates }),

			async saveBooking(id, draft) {
				const row = rows.get(id)
				if (row === undefined) return { ok: false, message: "That booking is no longer loaded. Reload the block." }
				const result = await settle(
					row.update({ properties: onlyBound(bookingProperties(draft), bookings.propertyIdsByKey) }),
				)
				return result.status === "success" ? { ok: true } : { ok: false, message: result.error.message }
			},

			async deleteBooking(id) {
				const row = rows.get(id)
				if (row === undefined) return { ok: false, message: "That booking is no longer loaded. Reload the block." }
				const result = await settle(row.archive())
				if (result.status === "error") return { ok: false, message: result.error.message }
				setDeleted((s) => new Set(s).add(id))
				return { ok: true }
			},

			async createJob(j) {
				const created = await settle(
					createPage({
						parent: { type: "data_source_key", dataSourceKey: "jobs" },
						properties: onlyBound(newJobProperties(j), jobs.propertyIdsByKey),
					}),
				)
				if (created.status === "error") return { ok: false, message: created.error.message }
				const jobId = created.page?.getKey()
				if (jobId === undefined) return { ok: false, message: "Notion created the job but returned no id." }
				for (const r of j.rounds) {
					const b = await settle(
						createPage({
							parent: { type: "data_source_key", dataSourceKey: "bookings" },
							properties: onlyBound(newBookingProperties(jobId, `${j.title} · R${r.round}`, r), bookings.propertyIdsByKey),
						}),
					)
					if (b.status === "error") return { ok: false, message: `Job created, but round ${r.round} failed: ${b.error.message}` }
				}
				return { ok: true, jobId }
			},

			async savePerson(personId, profile) {
				const row = teamRows.get(personId)
				if (row === undefined) return { ok: false, message: "That person is no longer loaded. Reload the block." }
				const result = await settle(row.update({ properties: onlyBound(personProperties(profile), team.propertyIdsByKey) }))
				return result.status === "success" ? { ok: true } : { ok: false, message: result.error.message }
			},
		}
	}, [bookings, team, jobs, clients, templates, bookingList, clientList, people])
}

function NotionSchedule() {
	const theme = useTheme()
	const store = useNotionStore()
	return (
		<Shell theme={theme}>
			<App store={store} mock={false} />
		</Shell>
	)
}

function MockSchedule() {
	const store = useMockStore()
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	return (
		<Shell theme={theme}>
			<App store={store} mock />
		</Shell>
	)
}

function NotionRoot() {
	const fallbackTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
	return (
		<NotionCustomBlock
			fallback={
				<Shell theme={fallbackTheme}>
					<div className="rs-empty">Loading…</div>
				</Shell>
			}
			errorFallback={(error) => (
				<Shell theme={fallbackTheme}>
					<div className="rs-banner rs-banner--error">{error.message}</div>
				</Shell>
			)}
		>
			<NotionTokenScope>
				<NotionSchedule />
			</NotionTokenScope>
		</NotionCustomBlock>
	)
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

ReactDOM.createRoot(root).render(<StrictMode>{isMock ? <MockSchedule /> : <NotionRoot />}</StrictMode>)
