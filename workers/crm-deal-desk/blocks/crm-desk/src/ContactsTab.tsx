/**
 * The Contacts tab: a searchable list, a detail panel with the contact's
 * deals and linked activity, and a small editor for the fields the block owns.
 */

import { useEffect, useMemo, useState } from "react"

import {
	Fact,
	Field,
	LinkedActivity,
	Money,
	OwnerChip,
	RecordList,
	RelationPicker,
	RequirementList,
} from "./components.tsx"
import { currencyCode } from "./DealsTab.tsx"
import type { Navigate, View } from "./nav.ts"
import {
	contactRequirements,
	duplicateContacts,
	emptyContactDraft,
	mergeById,
	normalizeContactDraft,
	searchContacts,
	unmetRecordRequirements,
	type Contact,
	type ContactDraft,
} from "./records.ts"
import { byId } from "./rules.ts"
import type { Store } from "./store.ts"

type ContactsView = Extract<View, { tab: "contacts" }>

export function ContactsTab({
	store,
	view,
	onNavigate,
}: {
	store: Store
	view: ContactsView
	onNavigate: Navigate
}) {
	const [query, setQuery] = useState("")
	const companiesById = useMemo(() => byId(store.companies), [store.companies])

	// The server-side search only matters once the window is truncated; before
	// that every contact is already in memory and asking Notion is noise.
	const askNotion = store.truncated.contacts && query.trim().length >= 2
	useEffect(() => {
		store.contactSearch.setQuery(askNotion ? query.trim() : "")
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [askNotion, query])

	const local = useMemo(
		() => searchContacts(query, store.contacts, companiesById),
		[query, store.contacts, companiesById],
	)
	const items = askNotion ? mergeById(local, store.contactSearch.results) : local

	const selectedId = "id" in view ? view.id : null
	const selected =
		selectedId === null
			? null
			: (store.contacts.find((c) => c.id === selectedId) ??
				store.contactSearch.results.find((c) => c.id === selectedId) ??
				null)

	return (
		<RecordList
			items={items}
			total={store.contacts.length}
			noun={["contact", "contacts"]}
			selectedId={selectedId}
			onSelect={(id) => onNavigate({ tab: "contacts", id })}
			query={query}
			onQuery={setQuery}
			searching={askNotion && store.contactSearch.loading}
			onNew={() => onNavigate({ tab: "contacts", new: true })}
			renderSecondary={(c) =>
				[c.jobTitle, c.companyId === null ? null : companiesById.get(c.companyId)?.name]
					.filter(Boolean)
					.join(" · ")
			}
		>
			{"new" in view ? (
				<ContactEditor
					key="new"
					store={store}
					contact={null}
					initialCompanyId={view.companyId ?? null}
					onDone={(id) => onNavigate({ tab: "contacts", id: id ?? null })}
				/>
			) : selected === null ? (
				<div className="dd-placeholder">
					<p>{selectedId === null ? "Pick a contact, or add one." : "That contact isn’t in the loaded set."}</p>
				</div>
			) : view.editing ? (
				<ContactEditor
					key={selected.id}
					store={store}
					contact={selected}
					onDone={() => onNavigate({ tab: "contacts", id: selected.id })}
				/>
			) : (
				<ContactDetail
					store={store}
					contact={selected}
					onEdit={() => onNavigate({ tab: "contacts", id: selected.id, editing: true })}
					onNavigate={onNavigate}
				/>
			)}
		</RecordList>
	)
}

function ContactDetail({
	store,
	contact,
	onEdit,
	onNavigate,
}: {
	store: Store
	contact: Contact
	onEdit: () => void
	onNavigate: Navigate
}) {
	const company =
		contact.companyId === null
			? null
			: (store.companies.find((c) => c.id === contact.companyId) ?? null)
	// Deals come from the loaded window filtered by contact; the relation ids
	// on the contact cover deals outside it (closed ones not yet loaded).
	const dealIdSet = new Set(contact.dealIds)
	const deals = store.deals.filter((d) => d.contactId === contact.id || dealIdSet.has(d.id))
	const unloadedDeals = contact.dealIds.filter((id) => !store.deals.some((d) => d.id === id)).length

	return (
		<article className="dd-record">
			<header className="dd-record-head">
				<div>
					<h2 className="dd-editor-title">{contact.name}</h2>
					<p className="dd-muted">
						{[contact.jobTitle, company?.name].filter(Boolean).join(" · ") || "No title or company"}
					</p>
				</div>
				<div className="dd-record-actions">
					<button type="button" className="dd-button" onClick={onEdit}>
						Edit
					</button>
					<button
						type="button"
						className="dd-button dd-button-primary"
						onClick={() =>
							onNavigate({
								tab: "deals",
								name: "new",
								companyId: contact.companyId,
								contactId: contact.id,
							})
						}
					>
						New deal
					</button>
				</div>
			</header>

			<div className="dd-facts">
				<Fact label="Company">
					{company ? (
						<button
							type="button"
							className="dd-link"
							onClick={() => onNavigate({ tab: "companies", id: company.id })}
						>
							{company.name}
						</button>
					) : null}
				</Fact>
				<Fact label="Email">{contact.email}</Fact>
				<Fact label="Phone">{contact.phone}</Fact>
				<Fact label="LinkedIn">{contact.linkedin}</Fact>
				<Fact label="Lead source">{contact.leadSource}</Fact>
				<Fact label="Country">{contact.country}</Fact>
				<Fact label="Owner">
					<OwnerChip id={contact.ownerId} store={store} />
				</Fact>
			</div>

			{contact.note ? <p className="dd-record-note">{contact.note}</p> : null}

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
				meetingNoteIds={contact.meetingNoteIds}
				emailIds={contact.emailIds}
			/>
		</article>
	)
}

function ContactEditor({
	store,
	contact,
	initialCompanyId = null,
	onDone,
}: {
	store: Store
	contact: Contact | null
	initialCompanyId?: string | null
	onDone: (id?: string) => void
}) {
	const [draft, setDraft] = useState<ContactDraft>(() =>
		contact === null ? emptyContactDraft(initialCompanyId) : { ...contact },
	)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) =>
		setDraft((d) => ({ ...d, [key]: value }))

	const unmet = unmetRecordRequirements(contactRequirements(draft))
	const blocked = new Set(unmet.map((r) => r.key))
	const duplicates = duplicateContacts(draft, store.contacts, contact?.id ?? null)

	async function save() {
		setSaving(true)
		setError(null)
		const clean = normalizeContactDraft(draft)
		const result =
			contact === null
				? await store.createContact(clean)
				: await store.updateContact(contact.id, clean)
		setSaving(false)
		if (result.ok) onDone(result.id ?? contact?.id)
		else setError(result.message)
	}

	return (
		<div className="dd-editor">
			<div className="dd-editor-head">
				<button type="button" className="dd-back" onClick={() => onDone(contact?.id)}>
					← {contact === null ? "Contacts" : contact.name}
				</button>
				<h2 className="dd-editor-title">{contact === null ? "New contact" : "Edit contact"}</h2>
			</div>

			<RequirementList title="Before this contact can be saved" unmet={unmet} />

			{duplicates.length > 0 ? (
				<p className="dd-notice dd-notice-warn" role="status">
					Looks like {duplicates.length === 1 ? "an existing contact" : "existing contacts"}:{" "}
					<strong>{duplicates.map((c) => c.name).join(", ")}</strong>. Saving anyway
					creates a second record.
				</p>
			) : null}

			<div className="dd-form">
				<div className="dd-field-row">
					<Field label="First name">
						<input
							className="dd-input"
							type="text"
							value={draft.firstName ?? ""}
							onChange={(e) => set("firstName", e.target.value || null)}
						/>
					</Field>
					<Field label="Last name">
						<input
							className="dd-input"
							type="text"
							value={draft.lastName ?? ""}
							onChange={(e) => set("lastName", e.target.value || null)}
						/>
					</Field>
				</div>

				<Field
					label="Full name"
					invalid={blocked.has("name")}
					hint="Left blank, it’s built from first and last name on save."
				>
					<input
						className="dd-input"
						type="text"
						value={draft.name}
						onChange={(e) => set("name", e.target.value)}
					/>
				</Field>

				<RelationPicker
					label="Company"
					placeholder="Search companies…"
					options={store.companies}
					value={draft.companyId}
					onChange={(id) => set("companyId", id)}
					hint="Optional, but deals can only pick contacts at their company."
				/>

				<Field label="Job title">
					<input
						className="dd-input"
						type="text"
						value={draft.jobTitle ?? ""}
						onChange={(e) => set("jobTitle", e.target.value || null)}
					/>
				</Field>

				<div className="dd-field-row">
					<Field label="Email" invalid={blocked.has("email")}>
						<input
							className="dd-input"
							type="email"
							value={draft.email ?? ""}
							onChange={(e) => set("email", e.target.value || null)}
						/>
					</Field>
					<Field label="Phone">
						<input
							className="dd-input"
							type="tel"
							value={draft.phone ?? ""}
							onChange={(e) => set("phone", e.target.value || null)}
						/>
					</Field>
				</div>

				<Field label="LinkedIn" invalid={blocked.has("linkedin")}>
					<input
						className="dd-input"
						type="url"
						placeholder="https://www.linkedin.com/in/…"
						value={draft.linkedin ?? ""}
						onChange={(e) => set("linkedin", e.target.value || null)}
					/>
				</Field>

				<div className="dd-field-row">
					<Field label="Lead source">
						<select
							className="dd-input"
							value={draft.leadSource ?? ""}
							disabled={store.leadSourceOptions.length === 0}
							onChange={(e) => set("leadSource", e.target.value || null)}
						>
							<option value="">—</option>
							{store.leadSourceOptions.map((name) => (
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
							disabled={store.contactCountryOptions.length === 0}
							onChange={(e) => set("country", e.target.value || null)}
						>
							<option value="">—</option>
							{store.contactCountryOptions.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</Field>
				</div>

				<Field label="Note" wide>
					<textarea
						className="dd-input dd-textarea"
						rows={4}
						value={draft.note ?? ""}
						onChange={(e) => set("note", e.target.value || null)}
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
					{saving ? "Saving…" : contact === null ? "Create contact" : "Save changes"}
				</button>
				<button type="button" className="dd-button" onClick={() => onDone(contact?.id)}>
					Cancel
				</button>
			</div>
		</div>
	)
}
