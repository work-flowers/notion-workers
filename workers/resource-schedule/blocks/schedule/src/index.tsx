import "@notionhq/custom-blocks/nds.css"

import { pages, users, type NotionDataSourcePage } from "@notionhq/custom-blocks"
import { NotionCustomBlock, NotionTokenScope, useDataSource, useTheme } from "@notionhq/custom-blocks/react"
import { StrictMode, useEffect, useMemo, useState, type ReactNode } from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App.tsx"
import { useMockStore } from "./mock.ts"
import { deriveRoster } from "./model.ts"
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

const live = (rows: readonly NotionDataSourcePage[]) => rows.filter((r) => r.is_archived !== true)

/** `users.get` per person, memoised and time-limited; a name that can't be read stays unknown. */
const nameCache = new Map<string, Promise<string | null>>()

function fetchName(id: string): Promise<string | null> {
	let p = nameCache.get(id)
	if (p === undefined) {
		p = Promise.race([
			users.get(id as Parameters<typeof users.get>[0]).then((r) => (r.status === "success" ? (r.user.name ?? null) : null)),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
		]).catch(() => null)
		nameCache.set(id, p)
	}
	return p
}

function useNames(ids: readonly string[]): Map<string, string> {
	const [names, setNames] = useState<Map<string, string>>(new Map())
	const key = [...new Set(ids)].sort().join(",")
	useEffect(() => {
		let cancelled = false
		const list = key ? key.split(",") : []
		Promise.all(list.map(async (id) => [id, await fetchName(id)] as const)).then((pairs) => {
			if (cancelled) return
			setNames(new Map(pairs.filter((p): p is readonly [string, string] => p[1] !== null)))
		})
		return () => {
			cancelled = true
		}
	}, [key])
	return names
}

function useNotionStore(): Store {
	const bookings = useDataSource("bookings", QUERY)
	const jobs = useDataSource("jobs", QUERY)
	const clients = useDataSource("clients", QUERY)
	const templates = useDataSource("templates", QUERY)

	// The subscription keeps serving a row after the block archives it (seen live,
	// 2026-11-18: Notion had is_archived true, the block still listed it), so
	// hide what this block deleted itself.
	const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set())
	const bookingList = useMemo(
		() => live(bookings.items).filter((r) => !deleted.has(r.id)).map(toBooking),
		[bookings.items, deleted],
	)
	const clientList = useMemo(() => live(clients.items).map(toClient), [clients.items])
	const personIds = useMemo(
		() => [...bookingList.map((b) => b.personId), ...clientList.flatMap((c) => c.dedicatedIds)].filter((x): x is string => x !== null),
		[bookingList, clientList],
	)
	const names = useNames(personIds)

	return useMemo<Store>(() => {
		const rows = new Map<string, NotionDataSourcePage>(bookings.items.map((r) => [r.id, r]))
		const loading = [bookings, jobs, clients, templates].some((s) => s.isLoading)
		const people = deriveRoster(bookingList, names, clientList)

		return {
			bookings: bookingList,
			jobs: live(jobs.items).map(toJob),
			clients: clientList,
			templates: live(templates.items).map(toTemplate),
			people,
			roleOptions: optionNames(bookings.propertySchemasByKey.role),
			teamOptions: optionNames(bookings.propertySchemasByKey.team),
			labelOptions: optionNames(jobs.propertySchemasByKey.label),
			loading,
			bindingProblems: loading ? [] : bindingProblems({ Bookings: bookings, Jobs: jobs, Clients: clients, "Job templates": templates }),

			async saveBooking(id, draft) {
				const row = rows.get(id)
				if (row === undefined) return { ok: false, message: "That booking is no longer loaded. Reload the block." }
				const person = people.find((p) => p.id === draft.personId)
				const result = await settle(
					row.update({ properties: onlyBound(bookingProperties(draft, person), bookings.propertyIdsByKey) }),
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
					pages.create({
						parent: { type: "data_source_key", key: "jobs" },
						properties: onlyBound(newJobProperties(j), jobs.propertyIdsByKey),
					}),
				)
				if (created.status === "error") return { ok: false, message: created.error.message }
				const jobId = created.page?.id
				if (jobId === undefined) return { ok: false, message: "Notion created the job but returned no id." }
				for (const r of j.rounds) {
					const b = await settle(
						pages.create({
							parent: { type: "data_source_key", key: "bookings" },
							properties: onlyBound(newBookingProperties(jobId, `${j.title} · R${r.round}`, r), bookings.propertyIdsByKey),
						}),
					)
					if (b.status === "error") return { ok: false, message: `Job created, but round ${r.round} failed: ${b.error.message}` }
				}
				return { ok: true, jobId }
			},

			async savePerson(personId, profile) {
				const theirs = bookingList.filter((b) => b.personId === personId)
				const properties = onlyBound(personProperties(profile), bookings.propertyIdsByKey)
				for (const [i, b] of theirs.entries()) {
					const row = rows.get(b.id)
					if (row === undefined) continue
					const result = await settle(row.update({ properties }))
					if (result.status === "error") {
						return { ok: false, message: `Saved ${i} of ${theirs.length} bookings, then: ${result.error.message}` }
					}
				}
				return { ok: true }
			},
		}
	}, [bookings, jobs, clients, templates, bookingList, clientList, names])
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
			autoResize
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
