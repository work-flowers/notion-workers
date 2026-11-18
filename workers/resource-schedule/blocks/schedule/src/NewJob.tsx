import { useMemo, useState } from "react"

import { fmtHours, nextWorkingDay, planFromTemplate, type Client, type Template } from "./model.ts"
import type { NewJob as NewJobInput } from "./store.ts"

type Props = {
	clients: Client[]
	templates: Template[]
	labels: string[]
	today: string
	saving: boolean
	error: string | null
	onCreate: (job: NewJobInput) => void
	onCancel: () => void
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function fmtDate(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number)
	const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
	return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`
}

export function NewJob({ clients, templates, labels, today, saving, error, onCreate, onCancel }: Props) {
	const [title, setTitle] = useState("")
	const [number, setNumber] = useState("")
	const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "")
	const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "")
	const [label, setLabel] = useState<string>(labels[0] ?? "")
	const [start, setStart] = useState(nextWorkingDay(today))

	const template = templates.find((t) => t.id === templateId)
	const rounds = useMemo(() => (template ? planFromTemplate(template, start) : []), [template, start])
	const ready = title.trim().length > 0 && template !== undefined && rounds.length > 0

	return (
		<aside className="rs-panel" aria-label="New job">
			<div className="rs-panel-head">
				<div>
					<div className="rs-panel-kicker">New job</div>
					<h2 className="rs-panel-title">From a template</h2>
				</div>
				<button type="button" className="rs-icon-btn" onClick={onCancel} aria-label="Close">
					×
				</button>
			</div>
			<p className="rs-help">
				In practice a brief in Linear would create this. Each round lands on <strong>Overflow</strong> with the
				template's recommended hours, ready for someone to assign.
			</p>

			<label className="rs-field">
				<span className="rs-label">Job name</span>
				<input className="rs-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Boxing Day EDM" autoFocus />
			</label>
			<div className="rs-field-row">
				<label className="rs-field">
					<span className="rs-label">Job number</span>
					<input className="rs-input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="PA-2430" />
				</label>
				<label className="rs-field">
					<span className="rs-label">Label</span>
					<select className="rs-input" value={label} onChange={(e) => setLabel(e.target.value)}>
						{labels.map((l) => (
							<option key={l}>{l}</option>
						))}
					</select>
				</label>
			</div>
			<label className="rs-field">
				<span className="rs-label">Client</span>
				<select className="rs-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
					{clients.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			</label>
			<div className="rs-field-row">
				<label className="rs-field">
					<span className="rs-label">Template</span>
					<select className="rs-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
						{templates.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</label>
				<label className="rs-field">
					<span className="rs-label">Start</span>
					<input type="date" className="rs-input" value={start} onChange={(e) => setStart(e.target.value || today)} />
				</label>
			</div>

			<div className="rs-field">
				<span className="rs-label">
					Recommended time{template?.role ? <span className="rs-label-hint"> · usually a {template.role.toLowerCase()}</span> : null}
				</span>
				<ol className="rs-rounds">
					{rounds.map((r) => (
						<li key={r.round}>
							<span className="rs-round-name">Round {r.round}</span>
							<span className="rs-round-hours">{fmtHours(r.hours)}h</span>
							<span className="rs-round-dates">
								{fmtDate(r.start)}
								{r.end !== r.start ? ` – ${fmtDate(r.end)}` : ""}
								{r.end !== r.start ? ` · ${fmtHours(r.hoursPerDay)}h/day` : ""}
							</span>
						</li>
					))}
				</ol>
			</div>

			{error ? <div className="rs-banner rs-banner--error">{error}</div> : null}

			<div className="rs-panel-actions">
				<span className="rs-spacer" />
				<button type="button" className="rs-btn" onClick={onCancel} disabled={saving}>
					Cancel
				</button>
				<button
					type="button"
					className="rs-btn rs-btn--primary"
					disabled={!ready || saving}
					onClick={() =>
						onCreate({ title: title.trim(), number: number.trim(), clientId: clientId || null, templateId, label: label || null, rounds })
					}
				>
					{saving ? "Creating…" : "Create on Overflow"}
				</button>
			</div>
		</aside>
	)
}
