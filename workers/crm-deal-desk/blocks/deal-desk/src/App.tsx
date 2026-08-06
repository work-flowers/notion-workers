/**
 * The Deal Desk views.
 *
 * All persistence goes through the `Store` interface, which has two
 * implementations: one backed by Notion and one held in memory for `?mock`.
 * That is what lets the mock demo exercise the real create/edit flows —
 * including the guardrails — without a binding, a deploy, or a write.
 */

import { useMemo, useState } from "react"

import {
	ContactPicker,
	Field,
	Money,
	RelationPicker,
	RequirementList,
	StageBar,
} from "./components.tsx"
import {
	auditDeals,
	byId,
	canEnterStage,
	contactChoicesFor,
	emptyDraft,
	isClosed,
	isReopen,
	OPEN_STAGES,
	orphanedContact,
	unmetRequirements,
	weightedPipeline,
	type Company,
	type Contact,
	type Deal,
	type DealDraft,
	type RuleContext,
	type Stage,
} from "./rules.ts"

export type SaveResult = { ok: true } | { ok: false; message: string }

export type Store = {
	deals: Deal[]
	companies: Company[]
	contacts: Contact[]
	typeOptions: string[]
	lostReasonOptions: string[]
	/**
	 * The stages the bound Stage property actually offers, in pipeline order.
	 *
	 * Read from the schema rather than assumed, because the block knows seven
	 * canonical stages and a given CRM may not have all of them — the
	 * workFlowers CRM Template has no **Declined**. Offering a stage the
	 * property can't accept would produce a save that fails at the API instead
	 * of a button that was never enabled.
	 */
	stageOptions: readonly Stage[]
	/** False when the Contacts data source has no company relation mapped. */
	companyRelationBound: boolean
	createDeal: (draft: DealDraft) => Promise<SaveResult>
	updateDeal: (id: string, draft: DealDraft) => Promise<SaveResult>
}

export type AppState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; store: Store; stale?: boolean; unknownStages?: number }

type View =
	| { name: "pipeline" }
	| { name: "attention" }
	| { name: "deal"; id: string }
	| { name: "new" }

export function App(state: AppState) {
	const [view, setView] = useState<View>({ name: "pipeline" })

	if (state.status === "loading") {
		return <div className="dd-placeholder">Loading the pipeline…</div>
	}
	if (state.status === "error") {
		return (
			<div className="dd-placeholder dd-error" role="alert">
				<p>Couldn’t load the CRM.</p>
				<p className="dd-muted">{state.message}</p>
			</div>
		)
	}

	const { store } = state
	const ctx: RuleContext = { contactsById: byId(store.contacts) }
	const violations = auditDeals(store.deals, store.contacts)
	const flagged = new Set(violations.map((v) => v.dealId))

	const selected =
		view.name === "deal"
			? (store.deals.find((d) => d.id === view.id) ?? null)
			: null

	return (
		<div className="dd-app" data-stale={state.stale ? "true" : undefined}>
			<Header
				store={store}
				view={view}
				attentionCount={flagged.size}
				onNavigate={setView}
			/>

			{state.unknownStages ? (
				<p className="dd-notice" role="status">
					{state.unknownStages} deal{state.unknownStages === 1 ? "" : "s"} hidden:
					their Stage value isn’t one this block knows how to govern. Check that
					the Stage property is mapped to the pipeline status.
				</p>
			) : null}

			{view.name === "pipeline" ? (
				<PipelineBoard
					store={store}
					flagged={flagged}
					onOpen={(id) => setView({ name: "deal", id })}
				/>
			) : null}

			{view.name === "attention" ? (
				<AttentionList
					violations={violations}
					onOpen={(id) => setView({ name: "deal", id })}
				/>
			) : null}

			{view.name === "new" ? (
				<DealEditor
					key="new"
					store={store}
					ctx={ctx}
					deal={null}
					onDone={() => setView({ name: "pipeline" })}
				/>
			) : null}

			{view.name === "deal" ? (
				selected === null ? (
					<div className="dd-placeholder">
						<p>That deal is no longer in the loaded set.</p>
						<button
							type="button"
							className="dd-button"
							onClick={() => setView({ name: "pipeline" })}
						>
							Back to pipeline
						</button>
					</div>
				) : (
					<DealEditor
						key={selected.id}
						store={store}
						ctx={ctx}
						deal={selected}
						onDone={() => setView({ name: "pipeline" })}
					/>
				)
			) : null}
		</div>
	)
}

function Header({
	store,
	view,
	attentionCount,
	onNavigate,
}: {
	store: Store
	view: View
	attentionCount: number
	onNavigate: (v: View) => void
}) {
	const { total, weighted, missingValue } = weightedPipeline(store.deals)
	const openCount = store.deals.filter((d) => !isClosed(d.stage)).length

	return (
		<header className="dd-header">
			<div className="dd-header-titles">
				<h1 className="dd-title">Deal Desk</h1>
				<p className="dd-subtitle">
					{openCount} open {openCount === 1 ? "deal" : "deals"} ·{" "}
					<strong>
						<Money amount={total} />
					</strong>{" "}
					in pipeline
					{weighted !== total ? (
						<>
							{" "}
							· <Money amount={Math.round(weighted)} /> weighted
						</>
					) : null}
					{missingValue > 0 ? (
						<span className="dd-muted">
							{" "}
							· {missingValue} with no value set
						</span>
					) : null}
				</p>
			</div>

			<nav className="dd-tabs">
				<button
					type="button"
					className="dd-tab"
					data-active={view.name === "pipeline" ? "true" : undefined}
					onClick={() => onNavigate({ name: "pipeline" })}
				>
					Pipeline
				</button>
				<button
					type="button"
					className="dd-tab"
					data-active={view.name === "attention" ? "true" : undefined}
					onClick={() => onNavigate({ name: "attention" })}
				>
					Needs attention
					{attentionCount > 0 ? (
						<span className="dd-badge">{attentionCount}</span>
					) : null}
				</button>
				<button
					type="button"
					className="dd-button dd-button-primary"
					onClick={() => onNavigate({ name: "new" })}
				>
					New deal
				</button>
			</nav>
		</header>
	)
}

function PipelineBoard({
	store,
	flagged,
	onOpen,
}: {
	store: Store
	flagged: ReadonlySet<string>
	onOpen: (id: string) => void
}) {
	const companies = byId(store.companies)
	const contacts = byId(store.contacts)

	return (
		<div className="dd-board">
			{OPEN_STAGES.map((stage) => {
				const deals = store.deals.filter((d) => d.stage === stage)
				return (
					<section className="dd-column" key={stage}>
						<h2 className="dd-column-title">
							{stage}
							<span className="dd-column-count">{deals.length}</span>
						</h2>
						{deals.length === 0 ? (
							<p className="dd-column-empty">Nothing here.</p>
						) : (
							<ul className="dd-cards">
								{deals.map((deal) => (
									<li key={deal.id}>
										<button
											type="button"
											className="dd-card"
											data-flagged={flagged.has(deal.id) ? "true" : undefined}
											onClick={() => onOpen(deal.id)}
										>
											<span className="dd-card-name">{deal.name}</span>
											<span className="dd-card-company">
												{deal.companyId === null
													? "No company"
													: (companies.get(deal.companyId)?.name ??
														"Unknown company")}
											</span>
											<span className="dd-card-meta">
												<Money amount={deal.value} />
												{deal.expectedClose ? (
													<span className="dd-muted">
														{" "}
														· {deal.expectedClose}
													</span>
												) : null}
											</span>
											{deal.contactId ? (
												<span className="dd-card-contact">
													{contacts.get(deal.contactId)?.name ?? "Unknown contact"}
												</span>
											) : null}
										</button>
									</li>
								))}
							</ul>
						)}
					</section>
				)
			})}
		</div>
	)
}

function AttentionList({
	violations,
	onOpen,
}: {
	violations: ReturnType<typeof auditDeals>
	onOpen: (id: string) => void
}) {
	const grouped = useMemo(() => {
		const map = new Map<string, { name: string; stage: Stage; labels: string[] }>()
		for (const v of violations) {
			const entry = map.get(v.dealId)
			if (entry === undefined) {
				map.set(v.dealId, { name: v.dealName, stage: v.stage, labels: [v.label] })
			} else {
				entry.labels.push(v.label)
			}
		}
		return [...map.entries()]
	}, [violations])

	if (grouped.length === 0) {
		return (
			<div className="dd-placeholder">
				<p>Every deal satisfies the rules for the stage it’s in.</p>
			</div>
		)
	}

	return (
		<div className="dd-attention">
			<p className="dd-attention-intro">
				{grouped.length} deal{grouped.length === 1 ? "" : "s"}{" "}
				{grouped.length === 1 ? "is" : "are"} in a state this desk would not have
				let you save. They were all created directly in the Notion database,
				which enforces none of these rules.
			</p>
			<ul className="dd-attention-list">
				{grouped.map(([id, entry]) => (
					<li key={id}>
						<button type="button" className="dd-attention-row" onClick={() => onOpen(id)}>
							<span className="dd-attention-name">{entry.name}</span>
							<span className="dd-attention-stage">{entry.stage}</span>
							<span className="dd-attention-labels">
								{entry.labels.join(" · ")}
							</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	)
}

function DealEditor({
	store,
	ctx,
	deal,
	onDone,
}: {
	store: Store
	ctx: RuleContext
	deal: Deal | null
	onDone: () => void
}) {
	const [draft, setDraft] = useState<DealDraft>(() => deal ?? emptyDraft())
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const companiesById = byId(store.companies)
	const set = <K extends keyof DealDraft>(key: K, value: DealDraft[K]) => {
		setDraft((d) => ({ ...d, [key]: value }))
	}

	const choices = contactChoicesFor(
		draft.companyId,
		store.contacts,
		companiesById,
		{ companyRelationBound: store.companyRelationBound },
	)

	const unmet = unmetRequirements(draft.stage, draft, ctx)
	const blocked = new Set(unmet.map((r) => r.key))
	const canSave = unmet.length === 0 && !saving

	const reopening = deal !== null && isReopen(deal.stage, draft.stage)
	const closing = isClosed(draft.stage)

	async function save() {
		setSaving(true)
		setError(null)
		const result =
			deal === null
				? await store.createDeal(draft)
				: await store.updateDeal(deal.id, draft)
		setSaving(false)
		if (result.ok) onDone()
		else setError(result.message)
	}

	return (
		<div className="dd-editor">
			<div className="dd-editor-head">
				<button type="button" className="dd-back" onClick={onDone}>
					← Pipeline
				</button>
				<h2 className="dd-editor-title">
					{deal === null ? "New deal" : deal.name}
				</h2>
			</div>

			<StageBar
				stages={store.stageOptions}
				current={deal?.stage ?? "Lead"}
				target={draft.stage}
				isBlocked={(stage) => !canEnterStage(stage, draft, ctx)}
				onPick={(stage) => set("stage", stage)}
			/>

			<RequirementList stage={draft.stage} unmet={unmet} />

			{reopening ? (
				<p className="dd-notice dd-notice-warn" role="status">
					This reopens a closed deal. Its close date stays on the record — clear
					it yourself if that’s wrong.
				</p>
			) : null}

			<div className="dd-form">
				<Field label="Deal name" invalid={blocked.has("name")}>
					<input
						className="dd-input"
						type="text"
						value={draft.name}
						placeholder="e.g. Marina Freight — Depot Rollout"
						onChange={(e) => set("name", e.target.value)}
					/>
				</Field>

				<RelationPicker
					label="Company"
					placeholder="Search companies…"
					options={store.companies}
					value={draft.companyId}
					invalid={blocked.has("companyId")}
					onChange={(id) => {
						// Changing the company invalidates the contact, so drop it rather
						// than leave a cross-company pair behind. This is the write that
						// Notion's relation cell cannot police.
						setDraft((d) => ({
							...d,
							companyId: id,
							contactId: d.contactId === null ? null : nextContact(d.contactId, id, store.contacts),
						}))
					}}
				/>

				<ContactPicker
					choices={choices}
					value={draft.contactId}
					onChange={(id) => set("contactId", id)}
					invalid={blocked.has("contactId") || blocked.has("contactMatch")}
					orphan={orphanedContact(draft, ctx.contactsById, companiesById)}
				/>

				<Field label="Type" invalid={blocked.has("dealType")}>
					<select
						className="dd-input"
						value={draft.dealType ?? ""}
						onChange={(e) => set("dealType", e.target.value || null)}
					>
						<option value="">—</option>
						{store.typeOptions.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
				</Field>

				<Field label="Value" invalid={blocked.has("value")}>
					<input
						className="dd-input"
						type="number"
						min="0"
						step="100"
						value={draft.value ?? ""}
						onChange={(e) =>
							set("value", e.target.value === "" ? null : Number(e.target.value))
						}
					/>
				</Field>

				<Field label="Probability" hint="0–100%">
					<input
						className="dd-input"
						type="number"
						min="0"
						max="100"
						step="5"
						value={draft.probability === null ? "" : Math.round(draft.probability * 100)}
						onChange={(e) =>
							set(
								"probability",
								e.target.value === "" ? null : Number(e.target.value) / 100,
							)
						}
					/>
				</Field>

				<Field label="Expected close" invalid={blocked.has("expectedClose")}>
					<input
						className="dd-input"
						type="date"
						value={draft.expectedClose ?? ""}
						onChange={(e) => set("expectedClose", e.target.value || null)}
					/>
				</Field>

				{closing ? (
					<Field label="Actual close" invalid={blocked.has("actualClose")}>
						<input
							className="dd-input"
							type="date"
							value={draft.actualClose ?? ""}
							onChange={(e) => set("actualClose", e.target.value || null)}
						/>
					</Field>
				) : null}

				{draft.stage === "Closed Lost" || draft.stage === "Declined" ? (
					<Field label="Lost reason" invalid={blocked.has("lostReason")}>
						<select
							className="dd-input"
							value={draft.lostReason ?? ""}
							onChange={(e) => set("lostReason", e.target.value || null)}
						>
							<option value="">—</option>
							{store.lostReasonOptions.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</Field>
				) : null}

				<Field label="Description">
					<textarea
						className="dd-input dd-textarea"
						rows={3}
						value={draft.description ?? ""}
						onChange={(e) => set("description", e.target.value || null)}
					/>
				</Field>
			</div>

			{error ? (
				<p className="dd-notice dd-notice-error" role="alert">
					{error}
				</p>
			) : null}

			<div className="dd-actions">
				<button
					type="button"
					className="dd-button dd-button-primary"
					disabled={!canSave}
					onClick={save}
				>
					{saving
						? "Saving…"
						: deal === null
							? "Create deal"
							: "Save changes"}
				</button>
				<button type="button" className="dd-button" onClick={onDone}>
					Cancel
				</button>
				{unmet.length > 0 ? (
					<span className="dd-actions-hint">
						{unmet.length} thing{unmet.length === 1 ? "" : "s"} left before this
						can be saved as <strong>{draft.stage}</strong>.
					</span>
				) : null}
			</div>
		</div>
	)
}

/**
 * Keep the contact only if they work at the newly chosen company.
 *
 * Dropping it unconditionally would punish someone who re-picked the same
 * company from the dropdown; keeping it unconditionally is the bug this whole
 * block exists to prevent.
 */
function nextContact(
	contactId: string,
	companyId: string | null,
	contacts: readonly Contact[],
): string | null {
	if (companyId === null) return null
	const contact = contacts.find((c) => c.id === contactId)
	if (contact === undefined) return null
	return contact.companyId === companyId ? contactId : null
}
