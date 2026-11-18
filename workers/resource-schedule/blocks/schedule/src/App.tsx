import { useMemo, useState } from "react"

import { columnsFor, stepDays, type Column, type Scale } from "./columns.ts"
import { Editor } from "./Editor.tsx"
import { Grid, type BarSpec, type CellSpec, type GridRow } from "./Grid.tsx"
import {
	addDays,
	dailyCapacity,
	dailyLoad,
	dayCell,
	fmtHours,
	matchesQuery,
	mondayOf,
	nextWorkingDay,
	OVERFLOW,
	overlaps,
	personHaystack,
	roleForJob,
	rowKey,
	todayIso,
	workingDays,
	type Booking,
	type Job,
	type Person,
} from "./model.ts"
import { NewJob } from "./NewJob.tsx"
import type { BookingDraft, NewJob as NewJobInput, Store } from "./store.ts"

type Tab = "team" | "projects"

type Panel = { kind: "booking"; id: string; draft: BookingDraft } | { kind: "newJob" } | null

const OVERFLOW_KEY = `placeholder:${OVERFLOW}`
/** Bar-id prefix for a collapsed job's summary bar, which expands the job rather than opening a booking. */
const SUMMARY = "summary:"

function draftOf(b: Booking): BookingDraft {
	return { personId: b.personId, placeholder: b.placeholder, start: b.start, end: b.end, hoursPerDay: b.hoursPerDay, notes: b.notes }
}

function withDraft(bookings: Booking[], panel: Panel, people: Person[]): Booking[] {
	if (panel?.kind !== "booking") return bookings
	return bookings.map((b) => {
		if (b.id !== panel.id) return b
		const who = people.find((p) => p.id === panel.draft.personId)
		return {
			...b,
			...panel.draft,
			placeholder: panel.draft.personId ? null : (panel.draft.placeholder ?? OVERFLOW),
			roles: who ? who.roles : [],
			team: who?.team ?? null,
			capacity: who?.weeklyCapacity ?? null,
		}
	})
}

// ---------------------------------------------------------------------------
// Heat-map cells
// ---------------------------------------------------------------------------

function personCells(cols: Column[], load: Map<string, number>, person: Person, scale: Scale): CellSpec[] {
	const cap = dailyCapacity(person)
	return cols.map((c) => {
		if (c.weekend) return { text: "", tone: "none" }
		if (scale === "day") {
			const cell = dayCell(load.get(c.from) ?? 0, cap)
			const title = `${fmtHours(cell.booked)}h booked of ${fmtHours(cap)}h`
			if (cell.state === "full") return { text: "Full", tone: "full", title }
			if (cell.state === "over") return { text: `+${fmtHours(-cell.open)}`, tone: "over", title: `${title} — over capacity` }
			return { text: fmtHours(cell.open), tone: cell.state, title: `${fmtHours(cell.open)}h open · ${title}` }
		}
		const days = workingDays(c.from, c.to)
		const booked = days.reduce((s, d) => s + (load.get(d) ?? 0), 0)
		const cell = dayCell(booked, person.weeklyCapacity)
		return {
			text: `${fmtHours(booked)}/${fmtHours(person.weeklyCapacity)}`,
			tone: cell.state,
			title: `${fmtHours(booked)}h scheduled of ${fmtHours(person.weeklyCapacity)}h this week`,
		}
	})
}

function overflowCells(cols: Column[], load: Map<string, number>, scale: Scale): CellSpec[] {
	return cols.map((c) => {
		if (c.weekend) return { text: "", tone: "none" }
		const booked = scale === "day" ? (load.get(c.from) ?? 0) : workingDays(c.from, c.to).reduce((s, d) => s + (load.get(d) ?? 0), 0)
		return booked > 0
			? { text: `${fmtHours(booked)}h`, tone: "overflow", title: `${fmtHours(booked)}h waiting to be assigned` }
			: { text: "", tone: "none" }
	})
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App({ store, mock }: { store: Store; mock: boolean }) {
	const today = todayIso()
	const [tab, setTab] = useState<Tab>("team")
	const [scale, setScale] = useState<Scale>("day")
	const [anchor, setAnchor] = useState(mondayOf(today))
	const [query, setQuery] = useState("")
	const [role, setRole] = useState("")
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set([OVERFLOW_KEY]))
	const [panel, setPanel] = useState<Panel>(null)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [flash, setFlash] = useState<string | null>(null)

	const cols = useMemo(() => columnsFor(scale, anchor), [scale, anchor])
	const from = cols[0].from
	const to = cols[cols.length - 1].to

	const jobsById = useMemo(() => new Map(store.jobs.map((j) => [j.id, j])), [store.jobs])
	const clientsById = useMemo(() => new Map(store.clients.map((c) => [c.id, c])), [store.clients])
	const peopleById = useMemo(() => new Map(store.people.map((p) => [p.id, p])), [store.people])
	const bookings = useMemo(() => withDraft(store.bookings, panel, store.people), [store.bookings, panel, store.people])
	const selectedId = panel?.kind === "booking" ? panel.id : null

	const toggle = (key: string) =>
		setExpanded((s) => {
			const next = new Set(s)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})

	/**
	 * In a sub-row the row label already names the job (Team) or the person
	 * (Projects), so the bar only says which round and how many hours a day.
	 * A collapsed job row names who is on each bar instead.
	 */
	function bar(b: Booking, mode: "compact" | "person"): BarSpec {
		const job = b.jobId ? jobsById.get(b.jobId) : undefined
		const who = b.personId ? (peopleById.get(b.personId)?.name.split(" ")[0] ?? "Unknown") : (b.placeholder ?? OVERFLOW)
		const round = b.round ? `R${b.round} · ` : ""
		const hours = `${fmtHours(b.hoursPerDay)}h/d`
		return {
			id: b.id,
			start: b.start ?? from,
			end: b.end ?? b.start ?? from,
			label: mode === "compact" ? `${round}${hours}` : who,
			sublabel: mode === "compact" ? `${job?.title ?? b.title}` : `${round}${hours}`,
			color: job?.label?.toLowerCase() ?? null,
			selected: b.id === selectedId,
			placeholder: b.personId === null,
			draggable: true,
		}
	}

	function summaryBar(job: Job, list: Booking[]): BarSpec {
		const starts = list.map((b) => b.start ?? from).sort()
		const ends = list.map((b) => b.end ?? b.start ?? from).sort()
		const names = [
			...new Set(list.map((b) => (b.personId ? (peopleById.get(b.personId)?.name.split(" ")[0] ?? "Unknown") : (b.placeholder ?? OVERFLOW)))),
		]
		return {
			id: `${SUMMARY}${job.id}`,
			start: starts[0],
			end: ends[ends.length - 1],
			label: names.join(", "),
			color: job.label?.toLowerCase() ?? null,
			placeholder: list.every((b) => b.personId === null),
			draggable: false,
		}
	}

	// People who pass the search and role filter.
	const visiblePeople = store.people.filter(
		(p) => (role === "" || p.roles.includes(role)) && matchesQuery(personHaystack(p), query),
	)

	const rows: GridRow[] = []

	if (tab === "team") {
		const groups: { key: string; person: Person | null }[] = [
			{ key: OVERFLOW_KEY, person: null },
			...visiblePeople.map((p) => ({ key: p.id, person: p })),
		]
		for (const { key, person } of groups) {
			const rk = person ? person.id : OVERFLOW
			const mine = bookings.filter((b) => rowKey(b) === rk)
			const load = dailyLoad(bookings, rk)
			const inView = mine.filter((b) => overlaps(b, from, to))
			const isOpen = expanded.has(key)
			rows.push({
				key,
				kind: person ? "person" : "overflow",
				label: person ? person.name : OVERFLOW,
				sublabel: person
					? [person.roles.join(", "), person.team, person.weeklyCapacity !== 35 ? `${fmtHours(person.weeklyCapacity)}h/wk` : null]
							.filter(Boolean)
							.join(" · ")
					: `${inView.length} booking${inView.length === 1 ? "" : "s"} waiting to be assigned`,
				badge:
					person && person.dedicatedTo.length > 0 ? (
						<span className="rs-tag" title="Dedicated to an account">
							{person.dedicatedTo.map((id) => clientsById.get(id)?.name ?? "Account").join(", ")}
						</span>
					) : undefined,
				expandable: inView.length > 0,
				expanded: isOpen,
				highlight: !person && flash !== null,
				cells: person ? personCells(cols, load, person, scale) : overflowCells(cols, load, scale),
			})
			if (!isOpen) continue
			const byJob = new Map<string, Booking[]>()
			for (const b of inView) {
				const k = b.jobId ?? `none:${b.id}`
				byJob.set(k, [...(byJob.get(k) ?? []), b])
			}
			for (const [jobKey, list] of byJob) {
				const job = jobsById.get(jobKey)
				const client = job?.clientId ? clientsById.get(job.clientId) : undefined
				rows.push({
					key: `${key}/${jobKey}`,
					kind: "sub",
					label: job?.title ?? list[0].title,
					sublabel: [client?.name, job?.number].filter(Boolean).join(" · "),
					bars: list.map((b) => bar(b, "compact")),
				})
			}
		}
	} else {
		const qJobs = (job: Job, list: Booking[]) => {
			const client = job.clientId ? clientsById.get(job.clientId) : undefined
			const people = list.map((b) => (b.personId ? peopleById.get(b.personId) : undefined)).filter((p): p is Person => !!p)
			const hay = [job.title, job.number ?? "", client?.name ?? "", ...people.flatMap(personHaystack), ...list.map((b) => b.placeholder ?? "")]
			const roleOk = role === "" || people.some((p) => p.roles.includes(role))
			return roleOk && matchesQuery(hay, query)
		}
		const byClient = new Map<string, { job: Job; list: Booking[] }[]>()
		for (const job of store.jobs) {
			const list = bookings.filter((b) => b.jobId === job.id && overlaps(b, from, to))
			if (list.length === 0 || !qJobs(job, list)) continue
			const ck = job.clientId ?? "none"
			byClient.set(ck, [...(byClient.get(ck) ?? []), { job, list }])
		}
		// Clients A–Z, jobs without a client last.
		const clientOrder = [...byClient.keys()].sort((a, b) => {
			const an = clientsById.get(a)?.name
			const bn = clientsById.get(b)?.name
			if (an === undefined || bn === undefined) return Number(an === undefined) - Number(bn === undefined)
			return an.localeCompare(bn)
		})
		for (const ck of clientOrder) {
			const client = clientsById.get(ck)
			rows.push({ key: `client:${ck}`, kind: "client", label: client?.name ?? "No client" })
			for (const { job, list } of byClient.get(ck) ?? []) {
				const key = `job:${job.id}`
				const isOpen = expanded.has(key)
				const total = list.reduce((s, b) => s + workingDays(b.start ?? from, b.end ?? b.start ?? from).length * b.hoursPerDay, 0)
				const waiting = list.some((b) => b.personId === null)
				rows.push({
					key,
					kind: "job",
					label: job.title,
					sublabel: [job.number, `${fmtHours(total)}h scheduled`].filter(Boolean).join(" · "),
					badge: waiting ? <span className="rs-tag rs-tag--overflow">On Overflow</span> : undefined,
					expandable: true,
					expanded: isOpen,
					highlight: flash === job.id,
					// Collapsed, a job is one summary bar across all its bookings; clicking it expands the job.
					bars: isOpen ? [] : [summaryBar(job, list)],
				})
				if (!isOpen) continue
				const byWho = new Map<string, Booking[]>()
				for (const b of list) {
					const k = rowKey(b) ?? "none"
					byWho.set(k, [...(byWho.get(k) ?? []), b])
				}
				for (const [who, wl] of byWho) {
					const person = peopleById.get(who)
					rows.push({
						key: `${key}/${who}`,
						kind: "sub",
						label: person?.name ?? who,
						sublabel: person ? person.roles.join(", ") : "Waiting to be assigned",
						bars: wl.map((b) => bar(b, "compact")),
					})
				}
			}
		}
	}

	// -------------------------------------------------------------------------
	// Actions
	// -------------------------------------------------------------------------

	function openBooking(id: string) {
		if (id.startsWith(SUMMARY)) {
			toggle(`job:${id.slice(SUMMARY.length)}`)
			return
		}
		const b = store.bookings.find((x) => x.id === id)
		if (!b) return
		setError(null)
		setPanel({ kind: "booking", id, draft: draftOf(b) })
	}

	async function saveBooking() {
		if (panel?.kind !== "booking") return
		setSaving(true)
		setError(null)
		const result = await store.saveBooking(panel.id, panel.draft)
		setSaving(false)
		if (result.ok) {
			if (panel.draft.personId) setExpanded((s) => new Set(s).add(panel.draft.personId as string))
			setPanel(null)
		} else setError(result.message)
	}

	async function deleteBooking() {
		if (panel?.kind !== "booking") return
		setSaving(true)
		const result = await store.deleteBooking(panel.id)
		setSaving(false)
		if (result.ok) setPanel(null)
		else setError(result.message)
	}

	async function moveBooking(id: string, days: number) {
		const b = store.bookings.find((x) => x.id === id)
		if (!b || b.start === null) return
		const length = workingDays(b.start, b.end ?? b.start).length
		const start = nextWorkingDay(addDays(b.start, days))
		const end = workingDays(start, addDays(start, length * 2 + 7))[Math.max(0, length - 1)] ?? start
		const result = await store.saveBooking(id, { ...draftOf(b), start, end })
		if (!result.ok) setError(result.message)
	}

	async function createJob(j: NewJobInput) {
		setSaving(true)
		setError(null)
		const result = await store.createJob(j)
		setSaving(false)
		if (!result.ok) {
			setError(result.message)
			return
		}
		setPanel(null)
		setTab("team")
		setExpanded((s) => new Set(s).add(OVERFLOW_KEY))
		setAnchor(mondayOf(j.rounds[0]?.start ?? today))
		setFlash(result.jobId ?? "new")
		setTimeout(() => setFlash(null), 2500)
	}

	const selected = panel?.kind === "booking" ? store.bookings.find((b) => b.id === panel.id) : undefined
	const selectedJob = selected?.jobId ? jobsById.get(selected.jobId) : undefined

	return (
		<div className="rs-app">
			{/* Hidden by default; brand.local.css shows it and supplies the mark and name. */}
			<header className="rs-brandbar" aria-hidden="true">
				<span className="rs-brandmark" />
				<span className="rs-brandname" />
				<span className="rs-brandname-sub">Resourcing schedule</span>
			</header>
			<div className="rs-toolbar">
				<div className="rs-seg" role="tablist" aria-label="View">
					<button type="button" role="tab" aria-selected={tab === "projects"} className="rs-seg-btn" onClick={() => setTab("projects")}>
						Projects
					</button>
					<button type="button" role="tab" aria-selected={tab === "team"} className="rs-seg-btn" onClick={() => setTab("team")}>
						Team
					</button>
				</div>
				<input
					className="rs-input rs-search"
					type="search"
					placeholder={tab === "team" ? "Search people, roles, teams…" : "Search jobs, clients, people…"}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<select className="rs-input rs-role" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
					<option value="">All roles</option>
					{store.roleOptions.map((r) => (
						<option key={r}>{r}</option>
					))}
				</select>
				<span className="rs-spacer" />
				<div className="rs-nav">
					<button type="button" className="rs-icon-btn" aria-label="Back" onClick={() => setAnchor((a) => addDays(a, -stepDays(scale)))}>
						‹
					</button>
					<button type="button" className="rs-btn" onClick={() => setAnchor(mondayOf(today))}>
						This week
					</button>
					<button type="button" className="rs-icon-btn" aria-label="Forward" onClick={() => setAnchor((a) => addDays(a, stepDays(scale)))}>
						›
					</button>
				</div>
				<div className="rs-seg" role="tablist" aria-label="Timescale">
					<button type="button" role="tab" aria-selected={scale === "day"} className="rs-seg-btn" onClick={() => setScale("day")}>
						Day
					</button>
					<button type="button" role="tab" aria-selected={scale === "week"} className="rs-seg-btn" onClick={() => setScale("week")}>
						Week
					</button>
				</div>
				<button
					type="button"
					className="rs-btn rs-btn--primary"
					onClick={() => {
						setError(null)
						setPanel({ kind: "newJob" })
					}}
				>
					New job
				</button>
			</div>

			{store.bindingProblems.length > 0 ? (
				<div className="rs-banner rs-banner--error">
					{store.bindingProblems.map((p) => (
						<div key={p}>{p}</div>
					))}
				</div>
			) : null}
			{mock ? <div className="rs-banner">Mock data — nothing is saved.</div> : null}
			{error && panel === null ? <div className="rs-banner rs-banner--error">{error}</div> : null}

			<div className="rs-body">
				<div className="rs-scroll">
					{store.loading ? (
						<div className="rs-empty">Loading schedule…</div>
					) : (
						<Grid
							scale={scale}
							cols={cols}
							rows={rows}
							today={today}
							onToggle={toggle}
							onBarClick={openBooking}
							onBarMove={moveBooking}
						/>
					)}
					{!store.loading && rows.length <= 1 && tab === "team" && (query || role) ? (
						<div className="rs-empty">No one matches “{query || role}”.</div>
					) : null}
				</div>

				{panel?.kind === "booking" && selected ? (
					<Editor
						booking={selected}
						draft={panel.draft}
						job={selectedJob}
						client={selectedJob?.clientId ? clientsById.get(selectedJob.clientId) : undefined}
						role={roleForJob(selectedJob, store.templates)}
						people={store.people}
						bookings={store.bookings}
						saving={saving}
						error={error}
						onChange={(draft) => setPanel({ kind: "booking", id: panel.id, draft })}
						onSave={saveBooking}
						onCancel={() => setPanel(null)}
						onDelete={deleteBooking}
					/>
				) : null}
				{panel?.kind === "newJob" ? (
					<NewJob
						clients={store.clients}
						templates={store.templates}
						labels={store.labelOptions}
						today={today}
						saving={saving}
						error={error}
						onCreate={createJob}
						onCancel={() => setPanel(null)}
					/>
				) : null}
			</div>
		</div>
	)
}
