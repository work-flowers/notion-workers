import { useEffect, useMemo, useRef, useState } from "react"

import { Banner, Field, Picker, Problems, StagePill, stageClass, type PickerOption } from "./components.tsx"
import {
	applyMove,
	blocking,
	formatGp,
	ingredientChoices,
	initialInputs,
	isEditable,
	isHazardous,
	isOpen,
	lineTotal,
	lookup,
	moves,
	nextOrderTitle,
	orderProblems,
	orderTotal,
	PATH,
	possessive,
	pricedPick,
	repriceForCustomer,
	siteAfterCustomerChange,
	siteChoices,
	todayIso,
	unmet,
	type Move,
	type MoveInputs,
	type Order,
	type Problem,
} from "./rules.ts"
import { isNewId, type LineDraft, type OrderDraft, type Store } from "./store.ts"

type View = { draft: OrderDraft; lines: LineDraft[] }

/** How long to keep showing a save before trusting the store's refresh instead. */
const SYNC_GRACE_MS = 8000

function blankOrder(store: Store): Order {
	return {
		id: "new-order",
		title: nextOrderTitle(store.orders),
		stage: "Draft",
		customerId: null,
		siteId: null,
		deliveryDate: null,
		customerRef: null,
		paymentReceived: false,
		sealChecked: false,
		courier: null,
		trackingRef: null,
		deliveredOn: null,
		cancellationReason: null,
		notes: null,
		createdTime: null,
	}
}

function viewOf(order: Order, store: Store): View {
	return {
		draft: {
			title: order.title,
			customerId: order.customerId,
			siteId: order.siteId,
			deliveryDate: order.deliveryDate,
			customerRef: order.customerRef,
			notes: order.notes,
		},
		lines: store.lines
			.filter((l) => l.orderId === order.id)
			.map(({ orderId: _orderId, ...line }) => ({ ...line, removed: false })),
	}
}

function sameView(a: View, b: View): boolean {
	const d = (k: keyof OrderDraft) => a.draft[k] === b.draft[k]
	if (!(["title", "customerId", "siteId", "deliveryDate", "customerRef", "notes"] as const).every(d)) return false
	const live = (v: View) => v.lines.filter((l) => !l.removed)
	const la = live(a)
	const lb = live(b)
	if (la.length !== lb.length) return false
	return la.every((x) => {
		const y = lb.find((l) => l.id === x.id)
		return (
			y !== undefined &&
			y.ingredientId === x.ingredientId &&
			y.quantity === x.quantity &&
			y.unitPrice === x.unitPrice &&
			y.priceEntryId === x.priceEntryId
		)
	})
}

let newLineCounter = 0

export function OrderSheet({
	store,
	orderId,
	onBack,
	onSaved,
}: {
	store: Store
	orderId: string | null
	onBack: () => void
	onSaved: (id: string) => void
}) {
	const stored = orderId === null ? undefined : store.orders.find((o) => o.id === orderId)
	const [blank] = useState(() => blankOrder(store))
	const order = stored ?? blank
	const base = useMemo(() => viewOf(order, store), [order, store])

	const [edit, setEdit] = useState<View | null>(orderId === null ? base : null)
	const [syncing, setSyncing] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)
	const [showAll, setShowAll] = useState<Record<string, boolean>>({})
	const [menuOpen, setMenuOpen] = useState(false)
	const [pendingMove, setPendingMove] = useState<Move | null>(null)

	const view = edit ?? base
	// A new order is unsaved by definition, even before anything is typed.
	const dirty = (edit !== null && !sameView(edit, base)) || (orderId === null && !syncing)
	const editable = isEditable(order)
	const today = todayIso()
	const find = lookup(store)
	const activeLines = view.lines.filter((l) => !l.removed)
	const site = find.site(view.draft.siteId)

	// After a save, keep showing what was saved until the live query catches up.
	useEffect(() => {
		if (!syncing || edit === null) return
		if (sameView(edit, base)) {
			setEdit(null)
			setSyncing(false)
			return
		}
		const timer = setTimeout(() => {
			setEdit(null)
			setSyncing(false)
		}, SYNC_GRACE_MS)
		return () => clearTimeout(timer)
	}, [syncing, edit, base])

	const problems = useMemo(
		() =>
			orderProblems(
				store,
				{ ...view.draft, stage: order.stage },
				activeLines.map((l) => ({ ...l, orderId: order.id })),
				today,
			),
		[store, view, order.stage, order.id, activeLines, today],
	)
	const at = (field: Problem["field"]) => problems.filter((p) => p.field === field)
	const blockers = blocking(problems)

	const available = useMemo(
		() => (orderId === null ? [] : moves(store, order, activeLines.map((l) => ({ ...l, orderId: order.id })), problems)),
		[store, order, activeLines, problems, orderId],
	)

	if (orderId !== null && stored === undefined) {
		return (
			<div className="od-sheet">
				<button type="button" className="od-link" onClick={onBack}>
					← All orders
				</button>
				<div className="od-empty">Loading order…</div>
			</div>
		)
	}

	const change = (fn: (v: View) => View) => {
		setNotice(null)
		setEdit((current) => fn(current ?? base))
	}
	const setDraft = (patch: Partial<OrderDraft>) => change((v) => ({ ...v, draft: { ...v.draft, ...patch } }))
	const setLine = (id: string, patch: Partial<LineDraft>) =>
		change((v) => ({ ...v, lines: v.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))

	const pickCustomer = (customerId: string) => {
		const { lines, changed } = repriceForCustomer(store.priceList, customerId, view.lines)
		const name = possessive(find.customer(customerId)?.name ?? "the new customer")
		setEdit({
			lines,
			draft: { ...view.draft, customerId, siteId: siteAfterCustomerChange(store, customerId, view.draft.siteId) },
		})
		setNotice(changed > 0 ? `Re-priced ${changed} line${changed === 1 ? "" : "s"} from ${name} price list.` : null)
	}

	const addLine = () =>
		change((v) => ({
			...v,
			lines: [
				...v.lines,
				{ id: `new-${++newLineCounter}`, ingredientId: null, quantity: 1, unitPrice: null, priceEntryId: null, removed: false },
			],
		}))

	const removeLine = (id: string) =>
		change((v) => ({
			...v,
			lines: isNewId(id) ? v.lines.filter((l) => l.id !== id) : v.lines.map((l) => (l.id === id ? { ...l, removed: true } : l)),
		}))

	const save = async () => {
		if (edit === null) return
		setSaving(true)
		setError(null)
		const result = await store.saveOrder(orderId, edit.draft, edit.lines)
		setSaving(false)
		if (!result.ok) {
			setError(result.message)
			return
		}
		// Swap the local line ids for Notion's, so the sync check can match them.
		setEdit({
			draft: edit.draft,
			lines: edit.lines.filter((l) => !l.removed).map((l) => ({ ...l, id: result.lineIds[l.id] ?? l.id })),
		})
		setSyncing(true)
		if (orderId === null) onSaved(result.id)
	}

	const discard = () => {
		setEdit(null)
		setNotice(null)
		setError(null)
		if (orderId === null) onBack()
	}

	// ----- pickers -------------------------------------------------------------

	const customerOptions: PickerOption[] = [...store.customers]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((c) => ({ id: c.id, label: c.name, detail: [c.licence, c.terms].filter(Boolean).join(" · ") }))
	const customer = find.customer(view.draft.customerId)

	const hazardous = activeLines.some((l) => isHazardous(find.ingredient(l.ingredientId)))
	const sites = siteChoices(store, view.draft.customerId, hazardous)
	const siteOptions: PickerOption[] =
		sites.kind === "ok"
			? sites.sites.map(({ site: s, note }) => ({
					id: s.id,
					label: s.name,
					detail: [s.address, s.warded ? "Warded" : null].filter(Boolean).join(" · "),
					note,
				}))
			: []

	return (
		<div className="od-sheet">
			<div className="od-sheet-top">
				<button type="button" className="od-link" onClick={dirty ? undefined : onBack} disabled={dirty}>
					← All orders
				</button>
				{dirty ? <span className="od-muted">Save or discard to leave</span> : null}
			</div>

			<header className="od-sheet-head">
				<div className="od-sheet-title">
					<h2>{view.draft.title}</h2>
					<StagePill stage={order.stage} />
				</div>
				{orderId !== null && isOpen(order.stage) ? (
					<div className="od-move">
						<button
							type="button"
							className="od-button"
							onClick={() => setMenuOpen((o) => !o)}
							disabled={dirty || syncing}
							title={dirty ? "Save your changes first" : undefined}
						>
							Move stage ▾
						</button>
					</div>
				) : null}
			</header>

			<StageTrack stage={order.stage} />

			{menuOpen && !dirty ? (
				<MoveMenu
					moves={available}
					onPick={(m) => {
						setPendingMove(m)
						setMenuOpen(false)
					}}
				/>
			) : null}

			{pendingMove ? (
				<MovePanel
					key={pendingMove.to}
					move={pendingMove}
					order={order}
					today={today}
					store={store}
					onCancel={() => setPendingMove(null)}
					onDone={() => setPendingMove(null)}
				/>
			) : null}

			{error ? <Banner tone="error">Couldn't save: {error}</Banner> : null}
			{notice ? <Banner tone="info">{notice}</Banner> : null}
			{!editable && isOpen(order.stage) ? (
				<Banner tone="info">Confirmed orders are locked. Move the stage to progress it.</Banner>
			) : null}

			<section className="od-props">
				<Field
					label="Customer"
					problems={at("customer")}
					hint={customer ? <CustomerHint licence={customer.licence} terms={customer.terms} /> : null}
				>
					<Picker
						value={customer ? { id: customer.id, label: customer.name } : null}
						options={customerOptions}
						placeholder="Pick a customer"
						disabled={!editable}
						onPick={pickCustomer}
					/>
				</Field>
				<Field label="Delivery site" problems={at("site")}>
					<Picker
						value={
							siteOptions.find((o) => o.id === view.draft.siteId) ??
							(site ? { id: site.id, label: site.name } : null)
						}
						options={siteOptions}
						placeholder={
							sites.kind === "needCustomer"
								? "Pick a customer first"
								: sites.kind === "none"
									? `${sites.customerName} has no sites`
									: "Pick a site"
						}
						disabled={!editable || sites.kind !== "ok"}
						searchable={false}
						onPick={(siteId) => setDraft({ siteId })}
					/>
				</Field>
				<Field label="Delivery date" problems={at("deliveryDate")}>
					<input
						type="date"
						className="od-input"
						value={view.draft.deliveryDate ?? ""}
						disabled={!editable}
						onChange={(e) => setDraft({ deliveryDate: e.target.value || null })}
					/>
				</Field>
				<Field label="Customer ref">
					<input
						className="od-input"
						value={view.draft.customerRef ?? ""}
						placeholder="Their PO or reference"
						disabled={!editable}
						onChange={(e) => setDraft({ customerRef: e.target.value || null })}
					/>
				</Field>
				<Field label="Notes">
					<textarea
						className="od-input od-textarea"
						value={view.draft.notes ?? ""}
						rows={2}
						disabled={!isOpen(order.stage)}
						onChange={(e) => setDraft({ notes: e.target.value || null })}
					/>
				</Field>
				{order.stage !== "Draft" ? <GateFields order={order} /> : null}
			</section>

			<section className="od-lines">
				<div className="od-lines-head">
					<h3>Lines</h3>
					<span className="od-muted">Total {formatGp(orderTotal(activeLines.map((l) => ({ ...l, orderId: order.id }))))}</span>
				</div>
				<Problems problems={at("lines")} />
				{activeLines.map((line) => {
					const choices = ingredientChoices(store, view.draft.customerId, site, showAll[line.id] ?? false)
					const ingredient = find.ingredient(line.ingredientId)
					const options: PickerOption[] =
						choices.kind === "needCustomer"
							? []
							: choices.choices.map((c) => ({
									id: c.ingredient.id,
									label: c.ingredient.name,
									detail: [c.ingredient.unit, c.ingredient.hazard !== "None" ? c.ingredient.hazard : null, c.ingredient.restricted ? "Restricted" : null]
										.filter(Boolean)
										.join(" · "),
									aside: c.entry?.price != null ? formatGp(c.entry.price) : null,
									disabledReason: c.disabledReason,
									note: c.note,
								}))
					const hidden = choices.kind === "ok" ? choices.hiddenCount : choices.kind === "noPriceList" ? store.ingredients.length : 0
					const toggle =
						hidden > 0 ? (
							<label className="od-toggle">
								<input
									type="checkbox"
									checked={showAll[line.id] ?? false}
									onChange={(e) => setShowAll((s) => ({ ...s, [line.id]: e.target.checked }))}
								/>
								Show the full catalogue ({hidden} not on {customer ? possessive(customer.name) : "their"} price list)
							</label>
						) : null
					const lineProblems = at(`line:${line.id}`)
					return (
						<div key={line.id} className={`od-line${blocking(lineProblems).length > 0 ? " has-block" : ""}`}>
							<div className="od-line-grid">
								<Picker
									value={
										ingredient
											? { id: ingredient.id, label: ingredient.name, detail: ingredient.unit }
											: null
									}
									options={options}
									placeholder={choices.kind === "needCustomer" ? "Pick a customer first" : "Pick an ingredient"}
									disabled={!editable || choices.kind === "needCustomer"}
									emptyMessage={
										choices.kind === "noPriceList"
											? `${choices.customerName} has no price list yet — nothing can be ordered.`
											: undefined
									}
									footer={toggle}
									onPick={(id) => {
										const choice = choices.kind === "needCustomer" ? undefined : choices.choices.find((c) => c.ingredient.id === id)
										if (choice) setLine(line.id, pricedPick(choice))
									}}
								/>
								<label className="od-num">
									<span>Qty</span>
									<input
										type="number"
										min={0}
										className="od-input"
										value={line.quantity ?? ""}
										disabled={!editable}
										onChange={(e) => setLine(line.id, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
									/>
								</label>
								<label className="od-num">
									<span>
										Price{" "}
										{line.unitPrice !== null ? (
											<em className={line.priceEntryId ? "od-src od-src--list" : "od-src od-src--manual"}>
												{line.priceEntryId ? "price list" : "manual"}
											</em>
										) : null}
									</span>
									<input
										type="number"
										min={0}
										step="0.5"
										className="od-input"
										value={line.unitPrice ?? ""}
										disabled={!editable}
										onChange={(e) =>
											setLine(line.id, {
												unitPrice: e.target.value === "" ? null : Number(e.target.value),
												priceEntryId: null,
											})
										}
									/>
								</label>
								<div className="od-line-total">{formatGp(lineTotal(line))}</div>
								{editable ? (
									<button type="button" className="od-icon" title="Remove line" onClick={() => removeLine(line.id)}>
										×
									</button>
								) : (
									<span />
								)}
							</div>
							<Problems problems={lineProblems} />
						</div>
					)
				})}
				{editable ? (
					<button type="button" className="od-button od-button--ghost" onClick={addLine}>
						+ Add line
					</button>
				) : null}
			</section>

			{dirty || syncing || saving ? (
				<div className="od-savebar">
					{syncing ? (
						<span className="od-muted">Saved — syncing with Notion…</span>
					) : (
						<>
							<span>
								Unsaved changes
								{blockers.length > 0 ? (
									<span className="od-badge od-badge--block">{blockers.length} to fix before confirming</span>
								) : null}
							</span>
							<span className="od-savebar-actions">
								<button type="button" className="od-button od-button--ghost" onClick={discard} disabled={saving}>
									Discard
								</button>
								<button type="button" className="od-button od-button--primary" onClick={save} disabled={saving}>
									{saving ? "Saving…" : orderId === null ? "Create order" : "Save changes"}
								</button>
							</span>
						</>
					)}
				</div>
			) : null}
		</div>
	)
}

function CustomerHint({ licence, terms }: { licence: string | null; terms: string | null }) {
	return (
		<span>
			{licence ?? "No licence set"} · {terms ?? "No payment terms"}
		</span>
	)
}

function GateFields({ order }: { order: Order }) {
	const rows: [string, string][] = [
		["Payment received", order.paymentReceived ? "Yes" : "No"],
		["Courier", order.courier ?? "—"],
		["Tracking ref", order.trackingRef ?? "—"],
		["Hazard seal checked", order.sealChecked ? "Yes" : "No"],
		["Delivered on", order.deliveredOn ?? "—"],
	]
	if (order.stage === "Cancelled") rows.push(["Cancellation reason", order.cancellationReason ?? "—"])
	return (
		<div className="od-gatefields">
			{rows.map(([k, v]) => (
				<div key={k} className="od-gatefield">
					<span className="od-muted">{k}</span>
					<span>{v}</span>
				</div>
			))}
		</div>
	)
}

function StageTrack({ stage }: { stage: Order["stage"] }) {
	const index = PATH.indexOf(stage)
	return (
		<ol className={`od-track${stage === "Cancelled" ? " is-cancelled" : ""}`}>
			{PATH.map((s, i) => (
				<li key={s} className={i < index ? "is-done" : i === index ? "is-current" : undefined}>
					<span className="od-track-dot" />
					<span className="od-track-label">{s}</span>
				</li>
			))}
			{stage === "Cancelled" ? (
				<li className="is-current">
					<span className={stageClass("Cancelled")}>Cancelled</span>
				</li>
			) : null}
		</ol>
	)
}

function MoveMenu({ moves: list, onPick }: { moves: Move[]; onPick: (m: Move) => void }) {
	return (
		<div className="od-menu" role="menu">
			{list.map((m) => {
				const blocked = m.reasons.length > 0
				return (
					<button
						key={`${m.to}-${m.label}`}
						type="button"
						role="menuitem"
						className={`od-menu-item${blocked ? " is-disabled" : ""}`}
						aria-disabled={blocked}
						onClick={() => (blocked ? undefined : onPick(m))}
					>
						<span className="od-menu-label">
							<span className={stageClass(m.to)}>{m.to}</span>
							<span>{m.label === m.to ? null : m.label}</span>
						</span>
						{blocked ? (
							<ul className="od-menu-reasons">
								{m.reasons.map((r, i) => (
									<li key={i}>{r}</li>
								))}
							</ul>
						) : null}
					</button>
				)
			})}
		</div>
	)
}

function MovePanel({
	move,
	order,
	today,
	store,
	onCancel,
	onDone,
}: {
	move: Move
	order: Order
	today: string
	store: Store
	onCancel: () => void
	onDone: () => void
}) {
	const [inputs, setInputs] = useState<MoveInputs>(() => initialInputs(order, today))
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const missing = unmet(move, inputs)
	const ref = useRef<HTMLDivElement>(null)
	// Braces matter: newer Chrome returns a Promise from scrollIntoView, and an
	// effect that returns one crashes React on unmount.
	useEffect(() => {
		ref.current?.scrollIntoView({ block: "nearest" })
	}, [])

	const set = <K extends keyof MoveInputs>(k: K, v: MoveInputs[K]) => setInputs((i) => ({ ...i, [k]: v }))
	const confirm = async () => {
		setBusy(true)
		setError(null)
		const result = await store.moveOrder(applyMove(order, move, inputs))
		setBusy(false)
		if (result.ok) onDone()
		else setError(result.message)
	}

	return (
		<div className="od-panel" ref={ref}>
			<div className="od-panel-title">
				<StagePill stage={order.stage} /> → <StagePill stage={move.to} />
				<strong>{move.label}</strong>
			</div>
			{move.effects.length > 0 ? (
				<ul className="od-effects">
					{move.effects.map((e, i) => (
						<li key={i}>{e}</li>
					))}
				</ul>
			) : null}
			{move.requirements.map((r) => (
				<label key={r.field} className={`od-req od-req--${r.kind}`}>
					{r.kind === "tick" ? (
						<>
							<input type="checkbox" checked={inputs[r.field]} onChange={(e) => set(r.field, e.target.checked)} />
							<span>{r.label}</span>
						</>
					) : r.kind === "select" ? (
						<>
							<span>{r.label}</span>
							<select
								className="od-input"
								value={inputs[r.field] ?? ""}
								onChange={(e) => set(r.field, e.target.value || null)}
							>
								<option value="">Choose…</option>
								{(r.field === "courier" ? store.courierOptions : store.cancellationOptions).map((o) => (
									<option key={o}>{o}</option>
								))}
							</select>
						</>
					) : r.kind === "text" ? (
						<>
							<span>{r.label}</span>
							<input className="od-input" value={inputs[r.field] ?? ""} onChange={(e) => set(r.field, e.target.value || null)} />
						</>
					) : (
						<>
							<span>{r.label}</span>
							<input
								type="date"
								className="od-input"
								value={inputs[r.field] ?? ""}
								onChange={(e) => set(r.field, e.target.value || null)}
							/>
						</>
					)}
				</label>
			))}
			{error ? <Banner tone="error">{error}</Banner> : null}
			<div className="od-panel-actions">
				<button type="button" className="od-button od-button--ghost" onClick={onCancel} disabled={busy}>
					Back
				</button>
				<button
					type="button"
					className={`od-button ${move.to === "Cancelled" ? "od-button--danger" : "od-button--primary"}`}
					onClick={confirm}
					disabled={busy || missing.length > 0}
					title={missing.length > 0 ? `Still needed: ${missing.map((m) => m.label).join(", ")}` : undefined}
				>
					{busy ? "Moving…" : move.label}
				</button>
			</div>
		</div>
	)
}
