/**
 * The Deals tab: pipeline board, "needs attention" audit, closed deals, and
 * the gated editor. This is the original Deal Desk, moved here largely intact.
 */

import { useMemo, useState } from "react"

import {
	ContactPicker,
	Fact,
	Field,
	LinkedActivity,
	Money,
	OwnerChip,
	ReadOnlyField,
	RelationPicker,
	RequirementList,
	StageBar,
} from "./components.tsx"
import type { Navigate, View } from "./nav.ts"
import type { Contact } from "./records.ts"
import {
	auditDeals,
	byId,
	canEnterStage,
	CLOSED_STAGES,
	contactChoicesFor,
	emptyDraft,
	isClosed,
	isLost,
	isReopen,
	normalizeDraft,
	OPEN_STAGES,
	orphanedContact,
	REPORTING_CURRENCY,
	unmetRequirements,
	type Deal,
	type DealDraft,
	type RuleContext,
	type Stage,
} from "./rules.ts"
import type { Store } from "./store.ts"

type DealsView = Extract<View, { tab: "deals" }>

export function DealsTab({
	store,
	view,
	onNavigate,
}: {
	store: Store
	view: DealsView
	onNavigate: Navigate
}) {
	const ctx: RuleContext = useMemo(
		() => ({ contactsById: byId(store.contacts) }),
		[store.contacts],
	)
	const violations = useMemo(
		() => auditDeals(store.deals, store.contacts),
		[store.deals, store.contacts],
	)
	const flagged = new Set(violations.map((v) => v.dealId))

	const selected =
		view.name === "deal" ? (store.deals.find((d) => d.id === view.id) ?? null) : null

	const backToPipeline = () => onNavigate({ tab: "deals", name: "pipeline" })

	return (
		<>
			<SubNav view={view} attentionCount={flagged.size} onNavigate={onNavigate} />

			{view.name === "pipeline" ? (
				<PipelineBoard
					store={store}
					flagged={flagged}
					onOpen={(id) => onNavigate({ tab: "deals", name: "deal", id })}
				/>
			) : null}

			{view.name === "attention" ? (
				<AttentionList
					violations={violations}
					onOpen={(id) => onNavigate({ tab: "deals", name: "deal", id })}
				/>
			) : null}

			{view.name === "closed" ? (
				<ClosedList store={store} onOpen={(id) => onNavigate({ tab: "deals", name: "deal", id })} />
			) : null}

			{view.name === "new" ? (
				<DealEditor
					key="new"
					store={store}
					ctx={ctx}
					deal={null}
					initial={{ companyId: view.companyId ?? null, contactId: view.contactId ?? null }}
					onDone={backToPipeline}
					onNavigate={onNavigate}
				/>
			) : null}

			{view.name === "deal" ? (
				selected === null ? (
					<div className="dd-placeholder">
						<p>That deal is no longer in the loaded set.</p>
						<button type="button" className="dd-button" onClick={backToPipeline}>
							Back to pipeline
						</button>
					</div>
				) : (
					<DealEditor
						key={selected.id}
						store={store}
						ctx={ctx}
						deal={selected}
						onDone={backToPipeline}
						onNavigate={onNavigate}
					/>
				)
			) : null}
		</>
	)
}

function SubNav({
	view,
	attentionCount,
	onNavigate,
}: {
	view: DealsView
	attentionCount: number
	onNavigate: Navigate
}) {
	return (
		<nav className="dd-subnav">
			<button
				type="button"
				className="dd-tab dd-tab-small"
				data-active={view.name === "pipeline" ? "true" : undefined}
				onClick={() => onNavigate({ tab: "deals", name: "pipeline" })}
			>
				Pipeline
			</button>
			<button
				type="button"
				className="dd-tab dd-tab-small"
				data-active={view.name === "attention" ? "true" : undefined}
				onClick={() => onNavigate({ tab: "deals", name: "attention" })}
			>
				Needs attention
				{attentionCount > 0 ? <span className="dd-badge">{attentionCount}</span> : null}
			</button>
			<button
				type="button"
				className="dd-tab dd-tab-small"
				data-active={view.name === "closed" ? "true" : undefined}
				onClick={() => onNavigate({ tab: "deals", name: "closed" })}
			>
				Closed
			</button>
			<button
				type="button"
				className="dd-button dd-button-primary"
				onClick={() => onNavigate({ tab: "deals", name: "new" })}
			>
				New deal
			</button>
		</nav>
	)
}

/** The currency code for a deal, or the reporting currency when none is set. */
export function currencyCode(deal: Pick<Deal, "currencyId">, store: Store): string {
	if (deal.currencyId === null) return REPORTING_CURRENCY
	return store.fxRates.find((fx) => fx.id === deal.currencyId)?.code ?? "?"
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
				// Client-side filter kept on purpose: an old Notion client ignores
				// the server-side status filter, and a closed deal on the board
				// would be worse than a redundant `filter`.
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
													: (companies.get(deal.companyId)?.name ?? "Unknown company")}
											</span>
											<span className="dd-card-meta">
												<Money amount={deal.value} code={currencyCode(deal, store)} />
												{deal.expectedClose ? (
													<span className="dd-muted"> · {deal.expectedClose}</span>
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
							<span className="dd-attention-labels">{entry.labels.join(" · ")}</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	)
}

/** Closed deals, newest close first, with the closed-window "load more". */
function ClosedList({ store, onOpen }: { store: Store; onOpen: (id: string) => void }) {
	const companies = byId(store.companies)
	const closed = store.deals
		.filter((d) => isClosed(d.stage))
		.sort((a, b) => (b.actualClose ?? "").localeCompare(a.actualClose ?? ""))

	return (
		<div className="dd-closed">
			{closed.length === 0 ? (
				<p className="dd-column-empty">No closed deals loaded.</p>
			) : (
				<table className="dd-table">
					<thead>
						<tr>
							<th>Deal</th>
							<th>Company</th>
							<th>Stage</th>
							<th className="dd-num">Value</th>
							<th>Closed</th>
							<th>Lost reason</th>
						</tr>
					</thead>
					<tbody>
						{closed.map((deal) => (
							<tr key={deal.id}>
								<td>
									<button type="button" className="dd-link" onClick={() => onOpen(deal.id)}>
										{deal.name}
									</button>
								</td>
								<td>
									{deal.companyId === null ? "—" : (companies.get(deal.companyId)?.name ?? "Unknown")}
								</td>
								<td>
									<span className="dd-stage-pill" data-stage={deal.stage}>
										{deal.stage}
									</span>
								</td>
								<td className="dd-num">
									<Money amount={deal.value} code={currencyCode(deal, store)} />
								</td>
								<td>{deal.actualClose ?? <span className="dd-muted">—</span>}</td>
								<td>{deal.lostReason ?? <span className="dd-muted">—</span>}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{store.closedHasMore ? (
				<button type="button" className="dd-button" onClick={store.loadMoreClosed}>
					Load older closed deals
				</button>
			) : null}
		</div>
	)
}

function DealEditor({
	store,
	ctx,
	deal,
	initial,
	onDone,
	onNavigate,
}: {
	store: Store
	ctx: RuleContext
	deal: Deal | null
	initial?: Partial<DealDraft>
	onDone: () => void
	onNavigate: Navigate
}) {
	const [draft, setDraft] = useState<DealDraft>(() => ({
		...emptyDraft(),
		currencyId: defaultCurrencyId(store),
		...initial,
		...(deal ?? {}),
	}))
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const companiesById = byId(store.companies)
	const set = <K extends keyof DealDraft>(key: K, value: DealDraft[K]) => {
		setDraft((d) => ({ ...d, [key]: value }))
	}

	const choices = contactChoicesFor(draft.companyId, store.contacts, companiesById, {
		companyRelationBound: store.companyRelationBound,
	})

	const unmet = unmetRequirements(draft.stage, draft, ctx)
	const blocked = new Set(unmet.map((r) => r.key))
	const canSave = unmet.length === 0 && !saving

	const reopening = deal !== null && isReopen(deal.stage, draft.stage)
	const stages =
		store.stageOptions.length > 0
			? store.stageOptions
			: ([...OPEN_STAGES, ...CLOSED_STAGES] as readonly Stage[])

	async function save() {
		setSaving(true)
		setError(null)
		const clean = normalizeDraft(draft)
		const result =
			deal === null ? await store.createDeal(clean) : await store.updateDeal(deal.id, clean)
		setSaving(false)
		if (result.ok) onDone()
		else setError(result.message)
	}

	const company = draft.companyId === null ? null : (companiesById.get(draft.companyId) ?? null)

	return (
		<div className="dd-editor">
			<div className="dd-editor-head">
				<button type="button" className="dd-back" onClick={onDone}>
					← Pipeline
				</button>
				<h2 className="dd-editor-title">{deal === null ? "New deal" : deal.name}</h2>
				{deal !== null ? (
					<span className="dd-editor-side">
						<OwnerChip id={deal.ownerId} store={store} />
					</span>
				) : null}
			</div>

			<StageBar
				stages={stages}
				current={deal?.stage ?? "Lead"}
				target={draft.stage}
				isBlocked={(stage) => !canEnterStage(stage, draft, ctx)}
				onPick={(stage) => set("stage", stage)}
			/>

			<RequirementList
				title={
					<>
						To move this deal to <strong>{draft.stage}</strong>
					</>
				}
				unmet={unmet}
			/>

			{reopening ? (
				<p className="dd-notice dd-notice-warn" role="status">
					This reopens a closed deal. Its close date stays on the record until the
					automation next runs
					{isLost(deal.stage) ? "; the lost reason is cleared on save" : ""}.
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
							contactId:
								d.contactId === null ? null : nextContact(d.contactId, id, store.contacts),
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

				<div className="dd-field-row">
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
					<Field
						label="Currency"
						hint={
							store.fxRates.length === 0
								? "No FX Rates data source bound — values are taken as SGD."
								: undefined
						}
					>
						<select
							className="dd-input"
							value={draft.currencyId ?? ""}
							disabled={store.fxRates.length === 0}
							onChange={(e) => set("currencyId", e.target.value || null)}
						>
							<option value="">— ({REPORTING_CURRENCY} assumed)</option>
							{[...store.fxRates]
								.sort((a, b) => a.code.localeCompare(b.code))
								.map((fx) => (
									<option key={fx.id} value={fx.id}>
										{fx.code}
									</option>
								))}
						</select>
					</Field>
				</div>

				<Field label="Probability" hint="0–100%">
					<input
						className="dd-input"
						type="number"
						min="0"
						max="100"
						step="5"
						value={draft.probability === null ? "" : Math.round(draft.probability * 100)}
						onChange={(e) =>
							set("probability", e.target.value === "" ? null : Number(e.target.value) / 100)
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

				{deal !== null && deal.actualClose !== null ? (
					<ReadOnlyField label="Actual close">
						{deal.actualClose}{" "}
						<span className="dd-muted">(stamped by the database automation)</span>
					</ReadOnlyField>
				) : null}

				{isLost(draft.stage) ? (
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

				<RelationPicker
					label="Referred by"
					placeholder="Search all contacts…"
					options={store.contacts.map((c) => ({
						id: c.id,
						name: c.name,
						secondary: c.jobTitle,
					}))}
					value={draft.referredById}
					onChange={(id) => set("referredById", id)}
					hint="Optional. Any contact — referrers needn’t work at the company."
				/>

				<Field label="Description" wide>
					<textarea
						className="dd-input dd-textarea"
						rows={5}
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
					{saving ? "Saving…" : deal === null ? "Create deal" : "Save changes"}
				</button>
				<button type="button" className="dd-button" onClick={onDone}>
					Cancel
				</button>
				{unmet.length > 0 ? (
					<span className="dd-actions-hint">
						{unmet.length} thing{unmet.length === 1 ? "" : "s"} left before this can be
						saved as <strong>{draft.stage}</strong>.
					</span>
				) : null}
			</div>

			{deal !== null ? (
				<div className="dd-record-related">
					<div className="dd-facts">
						{company ? (
							<Fact label="Company">
								<button
									type="button"
									className="dd-link"
									onClick={() => onNavigate({ tab: "companies", id: company.id })}
								>
									{company.name}
								</button>
							</Fact>
						) : null}
						{deal.contactId ? (
							<Fact label="Contact">
								<button
									type="button"
									className="dd-link"
									onClick={() => onNavigate({ tab: "contacts", id: deal.contactId })}
								>
									{ctx.contactsById.get(deal.contactId)?.name ?? "Unknown contact"}
								</button>
							</Fact>
						) : null}
					</div>
					<LinkedActivity
						store={store}
						meetingNoteIds={deal.meetingNoteIds}
						emailIds={deal.emailIds}
					/>
				</div>
			) : null}
		</div>
	)
}

/** New deals default to the reporting currency when an FX row for it exists. */
function defaultCurrencyId(store: Store): string | null {
	return store.fxRates.find((fx) => fx.code === REPORTING_CURRENCY)?.id ?? null
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
