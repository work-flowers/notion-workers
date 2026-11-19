import { fmtHours, type Person } from "./model.ts"
import type { PersonProfile } from "./store.ts"

type Props = {
	person: Person
	draft: PersonProfile
	roleOptions: string[]
	teamOptions: string[]
	saving: boolean
	error: string | null
	onChange: (d: PersonProfile) => void
	onSave: () => void
	onCancel: () => void
}

/** One row of the Team database: name, roles, team and weekly hours. */
export function PersonPanel({ person, draft, roleOptions, teamOptions, saving, error, onChange, onSave, onCancel }: Props) {
	const roles = [...new Set([...roleOptions, ...person.roles])]
	const teams = [...new Set([...teamOptions, ...(person.team ? [person.team] : [])])]
	const capacityInvalid = !(draft.weeklyCapacity > 0 && draft.weeklyCapacity <= 80)
	const nameInvalid = draft.name.trim() === ""
	const toggleRole = (r: string) =>
		onChange({ ...draft, roles: draft.roles.includes(r) ? draft.roles.filter((x) => x !== r) : [...draft.roles, r] })

	return (
		<aside className="rs-panel" aria-label="Edit team member">
			<div className="rs-panel-head">
				<div>
					<div className="rs-panel-kicker">Team member</div>
					<h2 className="rs-panel-title">{draft.name.trim() || person.name}</h2>
				</div>
				<button type="button" className="rs-icon-btn" onClick={onCancel} aria-label="Close">
					×
				</button>
			</div>

			<label className="rs-field">
				<span className="rs-label">Name</span>
				<input className="rs-input" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
			</label>

			<div className="rs-field">
				<span className="rs-label">Role</span>
				<div className="rs-choice-list">
					{roles.map((r) => (
						<button
							key={r}
							type="button"
							className={`rs-choice${draft.roles.includes(r) ? " rs-choice--on" : ""}`}
							aria-pressed={draft.roles.includes(r)}
							onClick={() => toggleRole(r)}
						>
							{r}
						</button>
					))}
				</div>
			</div>

			<div className="rs-field-row">
				<label className="rs-field">
					<span className="rs-label">Team</span>
					<select
						className="rs-input"
						value={draft.team ?? ""}
						onChange={(e) => onChange({ ...draft, team: e.target.value || null })}
					>
						<option value="">No team</option>
						{teams.map((t) => (
							<option key={t}>{t}</option>
						))}
					</select>
				</label>
				<label className="rs-field rs-field--narrow">
					<span className="rs-label">Hours / week</span>
					<input
						type="number"
						className="rs-input"
						min={1}
						max={80}
						step={0.5}
						value={Number.isFinite(draft.weeklyCapacity) ? draft.weeklyCapacity : ""}
						onChange={(e) => onChange({ ...draft, weeklyCapacity: Number(e.target.value) })}
					/>
				</label>
			</div>
			<p className="rs-help">
				{capacityInvalid
					? "Hours per week must be between 1 and 80."
					: `${fmtHours(draft.weeklyCapacity / 5)}h a day over a five-day week.`}
			</p>

			{error ? <div className="rs-banner rs-banner--error">{error}</div> : null}

			<div className="rs-panel-actions">
				<span className="rs-spacer" />
				<button type="button" className="rs-btn" onClick={onCancel} disabled={saving}>
					Cancel
				</button>
				<button
					type="button"
					className="rs-btn rs-btn--primary"
					onClick={onSave}
					disabled={saving || capacityInvalid || nameInvalid}
				>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
		</aside>
	)
}
