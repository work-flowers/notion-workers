/**
 * The reusable pieces of the Deal Desk UI.
 *
 * `RelationPicker` and `RequirementList` are the two that carry the argument;
 * the rest is ordinary form furniture kept here so `App.tsx` reads as layout.
 */

import { useId, useMemo, useState } from "react"

import type { ContactChoices, Requirement, Stage } from "./rules.ts"

export function Field({
	label,
	hint,
	invalid,
	children,
}: {
	label: string
	hint?: string
	invalid?: boolean
	children: React.ReactNode
}) {
	return (
		<label className="dd-field" data-invalid={invalid ? "true" : undefined}>
			<span className="dd-field-label">{label}</span>
			{children}
			{hint ? <span className="dd-field-hint">{hint}</span> : null}
		</label>
	)
}

/**
 * A searchable single-select over a list of records.
 *
 * A plain `<select>` would do for twenty rows; the CRM has 568 companies, so
 * this filters as you type. It is deliberately *not* a free-text field — the
 * only way out of it is an existing record or nothing, which is half the point
 * of replacing the Notion cell.
 */
export function RelationPicker({
	label,
	placeholder,
	options,
	value,
	onChange,
	disabled,
	disabledReason,
	invalid,
	hint,
}: {
	label: string
	placeholder: string
	options: { id: string; name: string; secondary?: string | null }[]
	value: string | null
	onChange: (id: string | null) => void
	disabled?: boolean
	disabledReason?: string
	invalid?: boolean
	hint?: string
}) {
	const [query, setQuery] = useState("")
	const [open, setOpen] = useState(false)
	const listId = useId()

	const selected = options.find((o) => o.id === value) ?? null

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase()
		const pool = q.length === 0 ? options : options.filter((o) =>
			`${o.name} ${o.secondary ?? ""}`.toLowerCase().includes(q),
		)
		// Long lists are truncated rather than virtualised — this is a picker,
		// not a browser. Narrow it by typing.
		return pool.slice(0, 50)
	}, [options, query])

	if (disabled) {
		// The reason goes in the box itself rather than in the hint slot — it is
		// the field's entire content, and showing it in both places reads as a
		// rendering bug.
		return (
			<Field label={label} invalid={invalid}>
				<div className="dd-picker-disabled">{disabledReason ?? "Unavailable"}</div>
			</Field>
		)
	}

	if (selected !== null && !open) {
		return (
			<Field label={label} hint={hint} invalid={invalid}>
				<div className="dd-picker-selected">
					<span className="dd-picker-selected-name">{selected.name}</span>
					{selected.secondary ? (
						<span className="dd-picker-selected-secondary">
							{selected.secondary}
						</span>
					) : null}
					<button
						type="button"
						className="dd-picker-change"
						onClick={() => {
							setOpen(true)
							setQuery("")
						}}
					>
						Change
					</button>
					<button
						type="button"
						className="dd-picker-clear"
						aria-label={`Clear ${label}`}
						onClick={() => onChange(null)}
					>
						×
					</button>
				</div>
			</Field>
		)
	}

	return (
		<Field label={label} hint={hint} invalid={invalid}>
			<input
				className="dd-input"
				type="text"
				role="combobox"
				aria-expanded="true"
				aria-controls={listId}
				placeholder={placeholder}
				value={query}
				autoFocus={open}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<ul className="dd-picker-list" id={listId} role="listbox">
				{matches.length === 0 ? (
					<li className="dd-picker-empty">No match for “{query}”</li>
				) : (
					matches.map((option) => (
						<li key={option.id}>
							<button
								type="button"
								role="option"
								aria-selected={option.id === value}
								className="dd-picker-option"
								onClick={() => {
									onChange(option.id)
									setOpen(false)
									setQuery("")
								}}
							>
								<span className="dd-picker-option-name">{option.name}</span>
								{option.secondary ? (
									<span className="dd-picker-option-secondary">
										{option.secondary}
									</span>
								) : null}
							</button>
						</li>
					))
				)}
			</ul>
		</Field>
	)
}

/**
 * The Contact picker, rendered from the eligibility decision rather than from a
 * raw array.
 *
 * Each empty state gets its own sentence. That is the difference between a
 * constraint the user understands and a dropdown that looks broken — and it is
 * the reason `contactChoicesFor` returns a union instead of a filtered list.
 */
export function ContactPicker({
	choices,
	value,
	onChange,
	invalid,
	orphan,
}: {
	choices: ContactChoices
	value: string | null
	onChange: (id: string | null) => void
	invalid?: boolean
	orphan?: { contact: { name: string }; companyName: string } | null
}) {
	// A mismatched contact isn't in the eligible list, so the picker below shows
	// nothing selected. Say who it is before the picker rather than leaving the
	// requirement pointing at an apparently empty field.
	if (orphan) {
		return (
			<div className="dd-field">
				<span className="dd-field-label">Contact</span>
				<div className="dd-orphan">
					<span>
						<strong>{orphan.contact.name}</strong> works at{" "}
						{orphan.companyName}, not this company.
					</span>
					<button
						type="button"
						className="dd-orphan-clear"
						onClick={() => onChange(null)}
					>
						Remove
					</button>
				</div>
			</div>
		)
	}

	switch (choices.state) {
		case "needs-company":
			return (
				<RelationPicker
					label="Contact"
					placeholder=""
					options={[]}
					value={null}
					onChange={onChange}
					disabled
					disabledReason="Pick a company first — contacts are filtered to that company."
					invalid={invalid}
				/>
			)
		case "none-at-company":
			return (
				<RelationPicker
					label="Contact"
					placeholder=""
					options={[]}
					value={null}
					onChange={onChange}
					disabled
					disabledReason={`No contacts on record at ${choices.companyName}. Add one in the Contacts database first.`}
					invalid={invalid}
				/>
			)
		case "unfiltered":
			return (
				<RelationPicker
					label="Contact"
					placeholder="Search all contacts…"
					options={choices.contacts.map(toOption)}
					value={value}
					onChange={onChange}
					invalid={invalid}
					hint="Showing every contact: no company relation is mapped on the Contacts data source, so this list can't be narrowed."
				/>
			)
		case "ready":
			return (
				<RelationPicker
					label="Contact"
					placeholder={`Search ${choices.companyName}…`}
					options={choices.contacts.map(toOption)}
					value={value}
					onChange={onChange}
					invalid={invalid}
					hint={`${choices.contacts.length} ${
						choices.contacts.length === 1 ? "person" : "people"
					} on record at ${choices.companyName}.`}
				/>
			)
	}
}

function toOption(contact: {
	id: string
	name: string
	jobTitle: string | null
}) {
	return { id: contact.id, name: contact.name, secondary: contact.jobTitle }
}

/**
 * The unmet preconditions for a stage, as a checklist.
 *
 * Shown rather than hidden behind a disabled button's tooltip: "you can't do
 * this" is only useful next to "here is what would make it possible".
 */
export function RequirementList({
	stage,
	unmet,
}: {
	stage: Stage
	unmet: Requirement[]
}) {
	if (unmet.length === 0) return null
	return (
		<div className="dd-requirements" role="status">
			<p className="dd-requirements-title">
				To move this deal to <strong>{stage}</strong>:
			</p>
			<ul>
				{unmet.map((r) => (
					<li key={r.key}>{r.label}</li>
				))}
			</ul>
		</div>
	)
}

export function StageBar({
	stages,
	current,
	target,
	isBlocked,
	onPick,
}: {
	stages: readonly Stage[]
	current: Stage
	target: Stage
	isBlocked: (stage: Stage) => boolean
	onPick: (stage: Stage) => void
}) {
	return (
		<div className="dd-stagebar" role="group" aria-label="Stage">
			{stages.map((stage) => {
				const blocked = isBlocked(stage)
				return (
					<button
						key={stage}
						type="button"
						className="dd-stage"
						data-current={stage === current ? "true" : undefined}
						data-target={stage === target && stage !== current ? "true" : undefined}
						data-blocked={blocked ? "true" : undefined}
						aria-pressed={stage === target}
						onClick={() => onPick(stage)}
					>
						{stage}
						{blocked ? <span aria-hidden="true"> 🔒</span> : null}
					</button>
				)
			})}
		</div>
	)
}

export function Money({ amount }: { amount: number | null }) {
	if (amount === null) return <span className="dd-muted">—</span>
	return (
		<span className="dd-num">
			{amount.toLocaleString("en-SG", { maximumFractionDigits: 0 })}
		</span>
	)
}
