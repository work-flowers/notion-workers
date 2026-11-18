import { useMemo, useState } from "react"

import {
	bookingDays,
	fmtHours,
	nextWorkingDay,
	OVERFLOW,
	suggestFor,
	type Booking,
	type Client,
	type Job,
	type Person,
} from "./model.ts"
import type { BookingDraft } from "./store.ts"

type Props = {
	booking: Booking
	draft: BookingDraft
	job: Job | undefined
	client: Client | undefined
	role: string | null
	people: Person[]
	/** Every booking as saved, for the open-hours ranking. */
	bookings: Booking[]
	saving: boolean
	error: string | null
	onChange: (d: BookingDraft) => void
	onSave: () => void
	onCancel: () => void
	onDelete: () => void
}

const SHOWN_SUGGESTIONS = 4

export function Editor({ booking, draft, job, client, role, people, bookings, saving, error, onChange, onSave, onCancel, onDelete }: Props) {
	const [showAll, setShowAll] = useState(false)
	const preview: Booking = { ...booking, ...draft }
	const days = bookingDays(preview)
	const total = days.length * draft.hoursPerDay

	const suggestions = useMemo(
		() => suggestFor(preview, people, bookings, { role, clientId: client?.id ?? null }),
		[draft.start, draft.end, draft.hoursPerDay, people, bookings, role, client?.id, booking.id],
	)
	const shown = showAll ? suggestions : suggestions.filter((s) => s.roleMatch).slice(0, SHOWN_SUGGESTIONS)
	const onOverflow = draft.personId === null
	const datesInvalid = draft.start === null || (draft.end !== null && draft.end < draft.start)
	const hoursInvalid = !(draft.hoursPerDay > 0)

	return (
		<aside className="rs-panel" aria-label="Edit booking">
			<div className="rs-panel-head">
				<div>
					<div className="rs-panel-kicker">
						{client?.name ?? "No client"}
						{job?.number ? ` · ${job.number}` : ""}
					</div>
					<h2 className="rs-panel-title">{booking.title}</h2>
				</div>
				<button type="button" className="rs-icon-btn" onClick={onCancel} aria-label="Close">
					×
				</button>
			</div>

			<div className="rs-field">
				<span className="rs-label">Assigned to</span>
				<div className="rs-assignee-current">
					{onOverflow ? (
						<span className="rs-chip rs-chip--overflow">{OVERFLOW}</span>
					) : (
						<span className="rs-chip">{people.find((p) => p.id === draft.personId)?.name ?? "Unknown person"}</span>
					)}
					{!onOverflow ? (
						<button
							type="button"
							className="rs-link-btn"
							onClick={() => onChange({ ...draft, personId: null, placeholder: OVERFLOW })}
						>
							Move back to Overflow
						</button>
					) : null}
				</div>
			</div>

			<div className="rs-field">
				<span className="rs-label">
					{role ? `Suggested ${role.toLowerCase()}s` : "People"}{" "}
					<span className="rs-label-hint">ranked by open hours on these days — you choose</span>
				</span>
				<ul className="rs-suggest">
					{shown.map((s) => {
						const active = draft.personId === s.person.id
						return (
							<li key={s.person.id}>
								<button
									type="button"
									className={`rs-suggest-item${active ? " rs-suggest-item--active" : ""}`}
									onClick={() => onChange({ ...draft, personId: s.person.id, placeholder: null })}
								>
									<span className="rs-suggest-name">
										{s.person.name}
										{s.dedicated ? <span className="rs-tag">Dedicated to {client?.name}</span> : null}
									</span>
									<span className="rs-suggest-meta">
										{s.person.roles.join(", ") || "No role"}
										{s.person.team ? ` · ${s.person.team}` : ""}
									</span>
									<span className={`rs-fit rs-fit--${s.fits ? "ok" : "short"}`}>
										{s.fits
											? `Fits · ${fmtHours(s.tightestOpen)}h spare on tightest day`
											: `${fmtHours(-s.tightestOpen)}h over on tightest day`}
									</span>
								</button>
							</li>
						)
					})}
				</ul>
				<button type="button" className="rs-link-btn" onClick={() => setShowAll((v) => !v)}>
					{showAll ? "Show suggestions only" : `Show everyone (${people.length})`}
				</button>
			</div>

			<div className="rs-field-row">
				<label className="rs-field">
					<span className="rs-label">Start</span>
					<input
						type="date"
						className="rs-input"
						value={draft.start ?? ""}
						onChange={(e) => {
							const start = e.target.value || null
							const end = start && draft.end && draft.end < start ? start : draft.end
							onChange({ ...draft, start, end })
						}}
					/>
				</label>
				<label className="rs-field">
					<span className="rs-label">End</span>
					<input
						type="date"
						className="rs-input"
						value={draft.end ?? draft.start ?? ""}
						min={draft.start ?? undefined}
						onChange={(e) => onChange({ ...draft, end: e.target.value || draft.start })}
					/>
				</label>
				<label className="rs-field rs-field--narrow">
					<span className="rs-label">Hours / day</span>
					<input
						type="number"
						className="rs-input"
						min={0.5}
						max={12}
						step={0.5}
						value={Number.isFinite(draft.hoursPerDay) ? draft.hoursPerDay : ""}
						onChange={(e) => onChange({ ...draft, hoursPerDay: Number(e.target.value) })}
					/>
				</label>
			</div>
			<p className="rs-help">
				{days.length} working day{days.length === 1 ? "" : "s"} × {fmtHours(draft.hoursPerDay || 0)}h = <strong>{fmtHours(total)}h</strong>
				{draft.start && nextWorkingDay(draft.start) !== draft.start ? " · starts on a weekend" : ""}
			</p>

			<label className="rs-field">
				<span className="rs-label">Notes</span>
				<textarea
					className="rs-input rs-textarea"
					rows={2}
					value={draft.notes ?? ""}
					onChange={(e) => onChange({ ...draft, notes: e.target.value || null })}
				/>
			</label>

			{error ? <div className="rs-banner rs-banner--error">{error}</div> : null}

			<div className="rs-panel-actions">
				<button type="button" className="rs-btn rs-btn--danger-quiet" onClick={onDelete} disabled={saving}>
					Delete
				</button>
				<span className="rs-spacer" />
				<button type="button" className="rs-btn" onClick={onCancel} disabled={saving}>
					Cancel
				</button>
				<button
					type="button"
					className="rs-btn rs-btn--primary"
					onClick={onSave}
					disabled={saving || datesInvalid || hoursInvalid}
				>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
		</aside>
	)
}
