/**
 * The reusable pieces of the Deal Desk UI.
 *
 * `RelationPicker` and `RequirementList` are the two that carry the argument;
 * the rest is ordinary form furniture kept here so `App.tsx` reads as layout.
 */

import { useId, useMemo, useState } from "react"

import { dateDay, excerpt, type LinkedKind } from "./linked.ts"
import { useLinkedRecords } from "./linked-loader.ts"
import type { ContactChoices, Requirement } from "./rules.ts"
import type { Store } from "./store.ts"
import { userLabel, useUser } from "./users.ts"

export function Field({
	label,
	hint,
	invalid,
	wide,
	children,
}: {
	label: string
	hint?: string
	invalid?: boolean
	/** Span the full form width — for textareas. */
	wide?: boolean
	children: React.ReactNode
}) {
	return (
		<label
			className={wide ? "dd-field dd-field-wide" : "dd-field"}
			data-invalid={invalid ? "true" : undefined}
		>
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

	// The list only drops down while the field has focus (or a query), so an
	// optional, empty picker doesn't sit there open. Options swallow mousedown
	// so choosing one doesn't blur the input first and dismiss the list.
	const listOpen = open || query.length > 0
	return (
		<Field label={label} hint={hint} invalid={invalid}>
			<input
				className="dd-input"
				type="text"
				role="combobox"
				aria-expanded={listOpen}
				aria-controls={listId}
				placeholder={placeholder}
				value={query}
				autoFocus={open}
				onFocus={() => setOpen(true)}
				onBlur={() => {
					setOpen(false)
					setQuery("")
				}}
				onChange={(e) => setQuery(e.target.value)}
			/>
			{!listOpen ? null : (
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
								onMouseDown={(e) => e.preventDefault()}
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
			)}
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
	title,
	unmet,
}: {
	/** e.g. "To move this deal to Proposal" or "Before this contact can be saved". */
	title: React.ReactNode
	unmet: { key: Requirement["key"] | string; label: string }[]
}) {
	if (unmet.length === 0) return null
	return (
		<div className="dd-requirements" role="status">
			<p className="dd-requirements-title">{title}:</p>
			<ul>
				{unmet.map((r) => (
					<li key={r.key}>{r.label}</li>
				))}
			</ul>
		</div>
	)
}

export function StageBar<S extends string>({
	stages,
	current,
	target,
	isBlocked,
	onPick,
}: {
	stages: readonly S[]
	current: S
	target: S
	isBlocked: (stage: S) => boolean
	onPick: (stage: S) => void
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

export function Money({ amount, code }: { amount: number | null; code?: string | null }) {
	if (amount === null) return <span className="dd-muted">—</span>
	return (
		<span className="dd-num">
			{code ? <span className="dd-currency">{code} </span> : null}
			{amount.toLocaleString("en-SG", { maximumFractionDigits: 0 })}
		</span>
	)
}

/** A read-only select-like display for fields the block does not write. */
export function ReadOnlyField({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="dd-field dd-field-readonly">
			<span className="dd-field-label">{label}</span>
			<div className="dd-readonly">{children}</div>
		</div>
	)
}

/** Owner, resolved from a user id. Read-only by design — see rows.ts. */
export function OwnerChip({ id, store }: { id: string | null; store: Store }) {
	const state = useUser(id, store.getUser)
	if (id === null) return <span className="dd-muted">Unassigned</span>
	if (state.status === "loading") return <span className="dd-muted">…</span>
	const user = state.user
	return (
		<span className="dd-owner">
			{user?.avatarUrl ? (
				<img className="dd-owner-avatar" src={user.avatarUrl} alt="" />
			) : (
				<span className="dd-owner-avatar dd-owner-initial" aria-hidden="true">
					{userLabel(user).slice(0, 1).toUpperCase()}
				</span>
			)}
			{userLabel(user)}
		</span>
	)
}

/**
 * The 999-row cap, said out loud. Only rendered when a window actually hit it —
 * at ~945 contacts the live CRM is the one to watch.
 */
export function TruncationBanner({ store }: { store: Store }) {
	const hit = (Object.entries(store.truncated) as [keyof Store["truncated"], boolean][])
		.filter(([, truncated]) => truncated)
		.map(([key]) => key)
	if (hit.length === 0) return null
	const names = hit.map((k) => ({ deals: "Deals", companies: "Companies", contacts: "Contacts" })[k])
	return (
		<p className="dd-notice dd-notice-warn" role="alert">
			<strong>{names.join(" and ")}</strong> {hit.length === 1 ? "is" : "are"} showing the
			999 most recent rows only. Older records are still in Notion but missing from
			these lists and pickers; use the search box, which asks Notion directly.
		</p>
	)
}

/**
 * The split list/detail layout the Contacts and Companies tabs share.
 * `children` is the detail pane.
 */
/**
 * One compact dropdown in a list pane's filter row.
 *
 * The empty option carries the field name ("Any industry") so the row reads
 * without labels above it — in a 300px pane, labels cost more than they earn.
 */
export function FilterSelect({
	label,
	anyLabel,
	value,
	onChange,
	options,
}: {
	label: string
	anyLabel: string
	value: string | null
	onChange: (value: string | null) => void
	options: readonly { value: string; label: string }[]
}) {
	return (
		<select
			className="dd-input dd-filter-input"
			aria-label={label}
			data-set={value === null ? undefined : "true"}
			disabled={options.length === 0}
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value || null)}
		>
			<option value="">{anyLabel}</option>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	)
}

/**
 * The searchable variant, for the one filter whose option list is too long for
 * a `<select>` — company, of which there are hundreds.
 */
export function FilterCombo({
	label,
	anyLabel,
	value,
	onChange,
	options,
}: {
	label: string
	anyLabel: string
	value: string | null
	onChange: (id: string | null) => void
	options: readonly { id: string; name: string }[]
}) {
	const [query, setQuery] = useState("")
	const [open, setOpen] = useState(false)
	const listId = useId()

	const selected = options.find((o) => o.id === value) ?? null
	const matches = useMemo(() => {
		const q = query.trim().toLowerCase()
		const pool = q.length === 0 ? options : options.filter((o) => o.name.toLowerCase().includes(q))
		return pool.slice(0, 50)
	}, [options, query])

	if (selected !== null && !open) {
		return (
			<div className="dd-filter-chip" data-set="true">
				<button
					type="button"
					className="dd-filter-chip-name"
					aria-label={`Change ${label}`}
					onClick={() => {
						setOpen(true)
						setQuery("")
					}}
				>
					{selected.name}
				</button>
				<button
					type="button"
					className="dd-filter-chip-clear"
					aria-label={`Clear ${label}`}
					onClick={() => onChange(null)}
				>
					×
				</button>
			</div>
		)
	}

	const listOpen = open || query.length > 0
	return (
		<div className="dd-filter-combo">
			<input
				className="dd-input dd-filter-input"
				type="text"
				role="combobox"
				aria-label={label}
				aria-expanded={listOpen}
				aria-controls={listId}
				placeholder={anyLabel}
				value={query}
				autoFocus={open}
				onFocus={() => setOpen(true)}
				onBlur={() => {
					setOpen(false)
					setQuery("")
				}}
				onChange={(e) => setQuery(e.target.value)}
			/>
			{!listOpen ? null : (
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
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										onChange(option.id)
										setOpen(false)
										setQuery("")
									}}
								>
									<span className="dd-picker-option-name">{option.name}</span>
								</button>
							</li>
						))
					)}
				</ul>
			)}
		</div>
	)
}

/** The three deal-activity choices, shared by both record tabs. */
export const DEAL_ACTIVITY_OPTIONS: readonly { value: string; label: string }[] = [
	{ value: "open", label: "Has an open deal" },
	{ value: "none", label: "No deals" },
]

export function RecordList<T extends { id: string; name: string }>({
	items,
	total,
	noun,
	selectedId,
	onSelect,
	query,
	onQuery,
	searching,
	onNew,
	filters,
	activeFilters = 0,
	filteredTotal,
	onClearFilters,
	countNote,
	renderSecondary,
	children,
}: {
	items: readonly T[]
	total: number
	noun: [singular: string, plural: string]
	selectedId: string | null
	onSelect: (id: string) => void
	query: string
	onQuery: (query: string) => void
	searching?: boolean
	onNew: () => void
	/** The tab's filter controls, laid out in a row under the search box. */
	filters?: React.ReactNode
	activeFilters?: number
	/** How many records survive the filters, before the query narrows further. */
	filteredTotal?: number
	onClearFilters?: () => void
	/** A caveat appended to the count line — e.g. that filters see loaded rows only. */
	countNote?: React.ReactNode
	renderSecondary?: (item: T) => React.ReactNode
	children: React.ReactNode
}) {
	return (
		<div className="dd-split">
			<aside className="dd-list-pane">
				<div className="dd-list-tools">
					<input
						className="dd-input dd-search"
						type="search"
						placeholder={`Search ${noun[1]}…`}
						value={query}
						onChange={(e) => onQuery(e.target.value)}
						aria-label={`Search ${noun[1]}`}
					/>
					<button type="button" className="dd-button dd-button-primary" onClick={onNew}>
						New {noun[0]}
					</button>
				</div>
				{filters === undefined ? null : (
					<div className="dd-filters">
						{filters}
						{activeFilters > 0 && onClearFilters !== undefined ? (
							<button type="button" className="dd-filter-clear" onClick={onClearFilters}>
								Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}
							</button>
						) : null}
					</div>
				)}
				<p className="dd-list-count dd-muted">
					{countLine({ items: items.length, total, filteredTotal, activeFilters, query, noun })}
					{searching ? " · asking Notion…" : ""}
					{countNote ? <> · {countNote}</> : null}
				</p>
				{items.length === 0 ? (
					<p className="dd-column-empty">Nothing matches.</p>
				) : (
					<ul className="dd-list">
						{items.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									className="dd-list-row"
									data-active={item.id === selectedId ? "true" : undefined}
									onClick={() => onSelect(item.id)}
								>
									<span className="dd-list-name">{item.name}</span>
									{renderSecondary ? (
										<span className="dd-list-secondary">{renderSecondary(item)}</span>
									) : null}
								</button>
							</li>
						))}
					</ul>
				)}
			</aside>
			<section className="dd-detail-pane">{children}</section>
		</div>
	)
}


/**
 * The one line under the search box. It has to answer "am I looking at
 * everything?" in every combination of query and filters, so each case gets its
 * own sentence rather than a single template with holes in it.
 */
function countLine({
	items,
	total,
	filteredTotal,
	activeFilters,
	query,
	noun,
}: {
	items: number
	total: number
	filteredTotal?: number
	activeFilters: number
	query: string
	noun: [singular: string, plural: string]
}): string {
	const n = (value: number) => value.toLocaleString("en-SG")
	const searching = query.trim().length > 0
	const filtered = activeFilters > 0
	if (!searching && !filtered) return `${n(total)} ${total === 1 ? noun[0] : noun[1]}`
	if (!searching) {
		const shown = filteredTotal ?? items
		return `${n(shown)} of ${n(total)} ${noun[1]}`
	}
	return `${n(items)} match${items === 1 ? "" : "es"}${filtered ? " in the filtered set" : ""}`
}

/** A label/value pair in a detail view. Hidden when the value is empty. */
export function Fact({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	if (children === null || children === undefined || children === "") return null
	return (
		<div className="dd-fact">
			<span className="dd-fact-label">{label}</span>
			<span className="dd-fact-value">{children}</span>
		</div>
	)
}

/**
 * Linked Meeting Notes and Emails for one record, newest first.
 *
 * The sandbox cannot open a Notion page, so there is nothing to click through
 * to; the list carries enough (title, date, type or sender, summary) to be the
 * reference on its own. See linked-loader.ts for how the rows get here.
 */
export function LinkedActivity({
	store,
	meetingNoteIds,
	emailIds,
}: {
	store: Store
	meetingNoteIds: readonly string[]
	emailIds: readonly string[]
}) {
	return (
		<div className="dd-activity">
			<LinkedList
				store={store}
				kind="meetingNote"
				ids={meetingNoteIds}
				heading="Meeting notes"
				empty="No meeting notes linked."
			/>
			<LinkedList
				store={store}
				kind="email"
				ids={emailIds}
				heading="Emails"
				empty="No emails linked."
			/>
		</div>
	)
}

function LinkedList({
	store,
	kind,
	ids,
	heading,
	empty,
}: {
	store: Store
	kind: LinkedKind
	ids: readonly string[]
	heading: string
	empty: string
}) {
	const { records, loading, failed, remaining, loadMore } = useLinkedRecords(
		ids,
		kind,
		store.getPage,
		store.linkedCache[kind],
	)

	return (
		<section className="dd-activity-section">
			<h3 className="dd-activity-heading">
				{heading}
				<span className="dd-column-count">{ids.length}</span>
			</h3>
			{ids.length === 0 ? (
				<p className="dd-column-empty">{empty}</p>
			) : (
				<ul className="dd-activity-list">
					{records.map((r) => (
						<li key={r.id} className="dd-activity-item">
							<div className="dd-activity-line">
								<span className="dd-activity-title">{r.title}</span>
								<span className="dd-activity-meta dd-muted">
									{dateDay(r.date) ?? "Undated"}
									{r.subtitle ? ` · ${r.subtitle}` : ""}
								</span>
							</div>
							{r.summary ? (
								<p className="dd-activity-summary">{excerpt(r.summary)}</p>
							) : null}
						</li>
					))}
				</ul>
			)}
			{loading ? <p className="dd-muted dd-activity-status">Loading…</p> : null}
			{!loading && remaining > 0 ? (
				<button type="button" className="dd-button dd-button-small" onClick={loadMore}>
					Load {Math.min(remaining, 30)} more ({remaining} older not yet loaded)
				</button>
			) : null}
			{failed > 0 ? (
				<p className="dd-muted dd-activity-status">
					{failed} linked {failed === 1 ? "page" : "pages"} couldn’t be read.
				</p>
			) : null}
		</section>
	)
}
