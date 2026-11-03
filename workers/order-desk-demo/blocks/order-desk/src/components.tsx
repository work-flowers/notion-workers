import { useMemo, useState, type ReactNode } from "react"

import type { Problem, Stage } from "./rules.ts"

export function stageClass(stage: Stage): string {
	return `od-pill od-pill--${stage.toLowerCase().replace(/\s+/g, "-")}`
}

export function StagePill({ stage }: { stage: Stage }) {
	return <span className={stageClass(stage)}>{stage}</span>
}

export function Problems({ problems }: { problems: readonly Problem[] }) {
	if (problems.length === 0) return null
	return (
		<ul className="od-problems">
			{problems.map((p, i) => (
				<li key={i} className={`od-problem od-problem--${p.severity}`}>
					<span aria-hidden className="od-problem-icon">
						{p.severity === "block" ? "●" : "▲"}
					</span>
					{p.message}
				</li>
			))}
		</ul>
	)
}

export function Field({
	label,
	problems = [],
	children,
	hint,
}: {
	label: string
	problems?: readonly Problem[]
	children: ReactNode
	hint?: ReactNode
}) {
	return (
		<div className="od-field">
			<div className="od-field-label">{label}</div>
			<div className="od-field-body">
				{children}
				{hint !== undefined && hint !== null ? <div className="od-field-hint">{hint}</div> : null}
				<Problems problems={problems} />
			</div>
		</div>
	)
}

export type PickerOption = {
	id: string
	label: string
	detail?: string | null
	/** Shown on the right of the option, e.g. a price. */
	aside?: string | null
	disabledReason?: string | null
	note?: string | null
}

/**
 * A select that can say *why* an option is unavailable — which a native
 * `<select>` can't. It opens inline rather than as a floating popover, so the
 * block's auto-resize grows to fit it instead of clipping it.
 */
export function Picker({
	value,
	options,
	placeholder,
	disabled,
	emptyMessage,
	footer,
	onPick,
	searchable = true,
}: {
	value: PickerOption | null
	options: readonly PickerOption[]
	placeholder: string
	disabled?: boolean
	emptyMessage?: ReactNode
	footer?: ReactNode
	onPick: (id: string) => void
	searchable?: boolean
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState("")
	const visible = useMemo(() => {
		const q = query.trim().toLowerCase()
		return q.length === 0 ? options : options.filter((o) => o.label.toLowerCase().includes(q))
	}, [options, query])

	return (
		<div className={`od-picker${open ? " is-open" : ""}`}>
			<button
				type="button"
				className="od-picker-button"
				disabled={disabled}
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
			>
				<span className={value === null ? "od-placeholder" : undefined}>{value?.label ?? placeholder}</span>
				{value?.detail ? <span className="od-picker-detail">{value.detail}</span> : null}
				{disabled ? null : <span className="od-caret" aria-hidden>▾</span>}
			</button>
			{open && !disabled ? (
				<div className="od-picker-panel">
					{searchable && options.length > 6 ? (
						<input
							className="od-input od-picker-search"
							placeholder="Search…"
							value={query}
							autoFocus
							onChange={(e) => setQuery(e.target.value)}
						/>
					) : null}
					{visible.length === 0 ? (
						<div className="od-picker-empty">{emptyMessage ?? "Nothing matches."}</div>
					) : (
						<ul className="od-picker-list" role="listbox">
							{visible.map((o) => {
								const blocked = Boolean(o.disabledReason)
								return (
									<li key={o.id}>
										<button
											type="button"
											role="option"
											aria-selected={value?.id === o.id}
											aria-disabled={blocked}
											className={`od-option${blocked ? " is-disabled" : ""}${value?.id === o.id ? " is-selected" : ""}`}
											onClick={() => {
												if (blocked) return
												onPick(o.id)
												setOpen(false)
												setQuery("")
											}}
										>
											<span className="od-option-main">
												<span className="od-option-label">{o.label}</span>
												{o.detail ? <span className="od-option-detail">{o.detail}</span> : null}
												{o.disabledReason ? <span className="od-option-reason">{o.disabledReason}</span> : null}
												{o.note ? <span className="od-option-note">{o.note}</span> : null}
											</span>
											{o.aside ? <span className="od-option-aside">{o.aside}</span> : null}
										</button>
									</li>
								)
							})}
						</ul>
					)}
					{footer ? <div className="od-picker-footer">{footer}</div> : null}
				</div>
			) : null}
		</div>
	)
}

export function Banner({ tone, children }: { tone: "error" | "warn" | "info"; children: ReactNode }) {
	return <div className={`od-banner od-banner--${tone}`}>{children}</div>
}
