/**
 * The Companies tab: a searchable list, a detail panel with the company's
 * people, deals and linked activity, and a small editor for the core fields.
 */

import { useMemo, useState } from "react"

import {
	Fact,
	Field,
	LinkedActivity,
	Money,
	RecordList,
	RequirementList,
} from "./components.tsx"
import { currencyCode } from "./DealsTab.tsx"
import type { Navigate, View } from "./nav.ts"
import {
	companyRequirements,
	duplicateCompanies,
	emptyCompanyDraft,
	normalizeCompanyDraft,
	searchCompanies,
	unmetRecordRequirements,
	websiteDomain,
	type Company,
	type CompanyDraft,
} from "./records.ts"
import type { Store } from "./store.ts"

type CompaniesView = Extract<View, { tab: "companies" }>

export function CompaniesTab({
	store,
	view,
	onNavigate,
}: {
	store: Store
	view: CompaniesView
	onNavigate: Navigate
}) {
	const [query, setQuery] = useState("")
	const items = useMemo(() => searchCompanies(query, store.companies), [query, store.companies])

	const selectedId = "id" in view ? view.id : null
	const selected =
		selectedId === null ? null : (store.companies.find((c) => c.id === selectedId) ?? null)

	return (
		<RecordList
			items={items}
			total={store.companies.length}
			noun={["company", "companies"]}
			selectedId={selectedId}
			onSelect={(id) => onNavigate({ tab: "companies", id })}
			query={query}
			onQuery={setQuery}
			onNew={() => onNavigate({ tab: "companies", new: true })}
			renderSecondary={(c) => [c.industry, websiteDomain(c.website)].filter(Boolean).join(" · ")}
		>
			{"new" in view ? (
				<CompanyEditor
					key="new"
					store={store}
					company={null}
					onDone={(id) => onNavigate({ tab: "companies", id: id ?? null })}
				/>
			) : selected === null ? (
				<div className="dd-placeholder">
					<p>{selectedId === null ? "Pick a company, or add one." : "That company isn’t in the loaded set."}</p>
				</div>
			) : view.editing ? (
				<CompanyEditor
					key={selected.id}
					store={store}
					company={selected}
					onDone={() => onNavigate({ tab: "companies", id: selected.id })}
				/>
			) : (
				<CompanyDetail
					store={store}
					company={selected}
					onEdit={() => onNavigate({ tab: "companies", id: selected.id, editing: true })}
					onNavigate={onNavigate}
				/>
			)}
		</RecordList>
	)
}

function CompanyDetail({
	store,
	company,
	onEdit,
	onNavigate,
}: {
	store: Store
	company: Company
	onEdit: () => void
	onNavigate: Navigate
}) {
	const contacts = store.contacts
		.filter((c) => c.companyId === company.id)
		.sort((a, b) => a.name.localeCompare(b.name))
	const unloadedContacts = company.contactIds.filter(
		(id) => !store.contacts.some((c) => c.id === id),
	).length

	const dealIdSet = new Set(company.dealIds)
	const deals = store.deals.filter((d) => d.companyId === company.id || dealIdSet.has(d.id))
	const unloadedDeals = company.dealIds.filter((id) => !store.deals.some((d) => d.id === id)).length

	return (
		<article className="dd-record">
			<header className="dd-record-head">
				<div>
					<h2 className="dd-editor-title">{company.name}</h2>
					<p className="dd-muted">
						{[company.industry, company.size, company.country].filter(Boolean).join(" · ") ||
							"No industry, size or country"}
					</p>
				</div>
				<div className="dd-record-actions">
					<button type="button" className="dd-button" onClick={onEdit}>
						Edit
					</button>
					<button
						type="button"
						className="dd-button"
						onClick={() => onNavigate({ tab: "contacts", new: true, companyId: company.id })}
					>
						New contact
					</button>
					<button
						type="button"
						className="dd-button dd-button-primary"
						onClick={() => onNavigate({ tab: "deals", name: "new", companyId: company.id })}
					>
						New deal
					</button>
				</div>
			</header>

			<div className="dd-facts">
				<Fact label="Website">{company.website}</Fact>
				<Fact label="Industry">{company.industry}</Fact>
				<Fact label="Size">{company.size}</Fact>
				<Fact label="Country">{company.country}</Fact>
			</div>

			{company.description ? <p className="dd-record-note">{company.description}</p> : null}

			<section className="dd-activity-section">
				<h3 className="dd-activity-heading">
					People
					<span className="dd-column-count">{contacts.length}</span>
				</h3>
				{contacts.length === 0 ? (
					<p className="dd-column-empty">Nobody on record.</p>
				) : (
					<ul className="dd-related-list">
						{contacts.map((contact) => (
							<li key={contact.id}>
								<button
									type="button"
									className="dd-related-row"
									onClick={() => onNavigate({ tab: "contacts", id: contact.id })}
								>
									<span className="dd-related-name">{contact.name}</span>
									<span className="dd-muted">{contact.jobTitle ?? ""}</span>
									<span className="dd-muted">{contact.email ?? ""}</span>
								</button>
							</li>
						))}
					</ul>
				)}
				{unloadedContacts > 0 ? (
					<p className="dd-muted dd-activity-status">
						{unloadedContacts} {unloadedContacts === 1 ? "person is" : "people are"} linked but
						outside the loaded 999-row window.
					</p>
				) : null}
			</section>

			<section className="dd-activity-section">
				<h3 className="dd-activity-heading">
					Deals
					<span className="dd-column-count">{deals.length}</span>
				</h3>
				{deals.length === 0 ? (
					<p className="dd-column-empty">No deals.</p>
				) : (
					<ul className="dd-related-list">
						{deals.map((deal) => (
							<li key={deal.id}>
								<button
									type="button"
									className="dd-related-row"
									onClick={() => onNavigate({ tab: "deals", name: "deal", id: deal.id })}
								>
									<span className="dd-related-name">{deal.name}</span>
									<span className="dd-stage-pill" data-stage={deal.stage}>
										{deal.stage}
									</span>
									<Money amount={deal.value} code={currencyCode(deal, store)} />
								</button>
							</li>
						))}
					</ul>
				)}
				{unloadedDeals > 0 ? (
					<p className="dd-muted dd-activity-status">
						{unloadedDeals} older closed {unloadedDeals === 1 ? "deal isn’t" : "deals aren’t"} loaded — see the Closed list on the Deals tab.
					</p>
				) : null}
			</section>

			<LinkedActivity
				store={store}
				meetingNoteIds={company.meetingNoteIds}
				emailIds={company.emailIds}
			/>
		</article>
	)
}

function CompanyEditor({
	store,
	company,
	onDone,
}: {
	store: Store
	company: Company | null
	onDone: (id?: string) => void
}) {
	const [draft, setDraft] = useState<CompanyDraft>(() =>
		company === null ? emptyCompanyDraft() : { ...company },
	)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const set = <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) =>
		setDraft((d) => ({ ...d, [key]: value }))

	const unmet = unmetRecordRequirements(companyRequirements(draft))
	const blocked = new Set(unmet.map((r) => r.key))
	const duplicates = duplicateCompanies(draft, store.companies, company?.id ?? null)

	async function save() {
		setSaving(true)
		setError(null)
		const clean = normalizeCompanyDraft(draft)
		const result =
			company === null
				? await store.createCompany(clean)
				: await store.updateCompany(company.id, clean)
		setSaving(false)
		if (result.ok) onDone(result.id ?? company?.id)
		else setError(result.message)
	}

	return (
		<div className="dd-editor">
			<div className="dd-editor-head">
				<button type="button" className="dd-back" onClick={() => onDone(company?.id)}>
					← {company === null ? "Companies" : company.name}
				</button>
				<h2 className="dd-editor-title">{company === null ? "New company" : "Edit company"}</h2>
			</div>

			<RequirementList title="Before this company can be saved" unmet={unmet} />

			{duplicates.length > 0 ? (
				<p className="dd-notice dd-notice-warn" role="status">
					Looks like {duplicates.length === 1 ? "an existing company" : "existing companies"}:{" "}
					<strong>{duplicates.map((c) => c.name).join(", ")}</strong>. Saving anyway
					creates a second record.
				</p>
			) : null}

			<div className="dd-form">
				<Field label="Company name" invalid={blocked.has("name")}>
					<input
						className="dd-input"
						type="text"
						value={draft.name}
						onChange={(e) => set("name", e.target.value)}
					/>
				</Field>

				<Field label="Website" invalid={blocked.has("website")} hint="A bare domain gets https:// on save.">
					<input
						className="dd-input"
						type="text"
						placeholder="example.com"
						value={draft.website ?? ""}
						onChange={(e) => set("website", e.target.value || null)}
					/>
				</Field>

				<div className="dd-field-row">
					<Field label="Industry">
						<select
							className="dd-input"
							value={draft.industry ?? ""}
							disabled={store.industryOptions.length === 0}
							onChange={(e) => set("industry", e.target.value || null)}
						>
							<option value="">—</option>
							{store.industryOptions.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Size">
						<select
							className="dd-input"
							value={draft.size ?? ""}
							disabled={store.sizeOptions.length === 0}
							onChange={(e) => set("size", e.target.value || null)}
						>
							<option value="">—</option>
							{store.sizeOptions.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Country">
						<select
							className="dd-input"
							value={draft.country ?? ""}
							disabled={store.companyCountryOptions.length === 0}
							onChange={(e) => set("country", e.target.value || null)}
						>
							<option value="">—</option>
							{store.companyCountryOptions.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</Field>
				</div>

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
					disabled={unmet.length > 0 || saving}
					onClick={save}
				>
					{saving ? "Saving…" : company === null ? "Create company" : "Save changes"}
				</button>
				<button type="button" className="dd-button" onClick={() => onDone(company?.id)}>
					Cancel
				</button>
			</div>
		</div>
	)
}
