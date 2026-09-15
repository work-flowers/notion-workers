/**
 * Contacts and Companies: the domain types, their save requirements, and the
 * non-blocking hints (duplicates, search).
 *
 * Pure functions, no React, no SDK — `test/records.test.ts` exercises this
 * directly. `rules.ts` owns the deal rules and re-exports `Company` / `Contact`
 * from here so the older imports keep working.
 *
 * Two different strengths of rule live here, deliberately:
 *
 * - **Requirements** block a save. There are few of them (a name; a
 *   well-formed email or URL *if* one is given) because a CRM that refuses to
 *   record a half-known person is a CRM that gets bypassed.
 * - **Hints** never block. "This looks like a duplicate" is offered once, next
 *   to the save button, and the person decides.
 */

export type CompanyDraft = {
	name: string
	website: string | null
	description: string | null
	industry: string | null
	size: string | null
	country: string | null
}

export type Company = CompanyDraft & {
	id: string
	/** Read-only relation ids, kept on the entity rather than the draft. */
	contactIds: string[]
	dealIds: string[]
	meetingNoteIds: string[]
	emailIds: string[]
}

export type ContactDraft = {
	name: string
	firstName: string | null
	lastName: string | null
	jobTitle: string | null
	email: string | null
	phone: string | null
	linkedin: string | null
	note: string | null
	leadSource: string | null
	country: string | null
	/** The contact's company, or null when the CRM row has no company set. */
	companyId: string | null
}

export type Contact = ContactDraft & {
	id: string
	ownerId: string | null
	dealIds: string[]
	meetingNoteIds: string[]
	emailIds: string[]
}

export function emptyCompanyDraft(): CompanyDraft {
	return {
		name: "",
		website: null,
		description: null,
		industry: null,
		size: null,
		country: null,
	}
}

export function emptyContactDraft(companyId: string | null = null): ContactDraft {
	return {
		name: "",
		firstName: null,
		lastName: null,
		jobTitle: null,
		email: null,
		phone: null,
		linkedin: null,
		note: null,
		leadSource: null,
		country: null,
		companyId,
	}
}

/**
 * A company built from only the fields the picker and cards need. Handy for
 * fixtures and tests; the live mapper fills the rest from the row.
 */
export function bareCompany(id: string, name: string): Company {
	return {
		...emptyCompanyDraft(),
		id,
		name,
		contactIds: [],
		dealIds: [],
		meetingNoteIds: [],
		emailIds: [],
	}
}

export function bareContact(
	id: string,
	name: string,
	overrides: Partial<Contact> = {},
): Contact {
	return {
		...emptyContactDraft(),
		id,
		name,
		ownerId: null,
		dealIds: [],
		meetingNoteIds: [],
		emailIds: [],
		...overrides,
	}
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export type RecordRequirement = {
	key: string
	label: string
	met: boolean
}

/**
 * The name the CRM will store: the explicit `name` if there is one, otherwise
 * first + last joined. Typing a first and last name and leaving the title blank
 * is the common path through a form, and asking for the same thing twice is
 * how forms get abandoned.
 */
export function deriveContactName(draft: ContactDraft): string {
	const explicit = draft.name.trim()
	if (explicit.length > 0) return explicit
	return [draft.firstName, draft.lastName]
		.map((part) => part?.trim() ?? "")
		.filter((part) => part.length > 0)
		.join(" ")
}

/** Good enough to catch a typo, deliberately not RFC-strict. */
export function isPlausibleEmail(value: string): boolean {
	const trimmed = value.trim()
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value.trim())
		return url.protocol === "https:" || url.protocol === "http:"
	} catch {
		return false
	}
}

/** `example.com` → `https://example.com`; leaves a schemed URL alone. */
export function normalizeWebsite(value: string | null): string | null {
	if (value === null) return null
	const trimmed = value.trim()
	if (trimmed.length === 0) return null
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
	return `https://${trimmed}`
}

export function contactRequirements(draft: ContactDraft): RecordRequirement[] {
	return [
		{
			key: "name",
			label: "Give the contact a name (or a first and last name)",
			met: deriveContactName(draft).length > 0,
		},
		{
			key: "email",
			label: "Use a valid email address, or leave it blank",
			met: draft.email === null || draft.email.trim() === "" || isPlausibleEmail(draft.email),
		},
		{
			key: "linkedin",
			label: "Use a full LinkedIn URL, or leave it blank",
			met:
				draft.linkedin === null ||
				draft.linkedin.trim() === "" ||
				isHttpUrl(normalizeWebsite(draft.linkedin) ?? ""),
		},
	]
}

export function companyRequirements(draft: CompanyDraft): RecordRequirement[] {
	return [
		{
			key: "name",
			label: "Give the company a name",
			met: draft.name.trim().length > 0,
		},
		{
			key: "website",
			label: "Use a valid website URL, or leave it blank",
			met:
				draft.website === null ||
				draft.website.trim() === "" ||
				isHttpUrl(normalizeWebsite(draft.website) ?? ""),
		},
	]
}

export function unmetRecordRequirements(
	requirements: RecordRequirement[],
): RecordRequirement[] {
	return requirements.filter((r) => !r.met)
}

/**
 * What actually gets written: the derived name, trimmed strings, empty strings
 * collapsed to null, and the website given a scheme. Called once, at save.
 */
export function normalizeContactDraft(draft: ContactDraft): ContactDraft {
	return {
		...draft,
		name: deriveContactName(draft),
		firstName: blankToNull(draft.firstName),
		lastName: blankToNull(draft.lastName),
		jobTitle: blankToNull(draft.jobTitle),
		email: blankToNull(draft.email)?.toLowerCase() ?? null,
		phone: blankToNull(draft.phone),
		linkedin: normalizeWebsite(draft.linkedin),
		note: blankToNull(draft.note),
	}
}

export function normalizeCompanyDraft(draft: CompanyDraft): CompanyDraft {
	return {
		...draft,
		name: draft.name.trim(),
		website: normalizeWebsite(draft.website),
		description: blankToNull(draft.description),
	}
}

function blankToNull(value: string | null): string | null {
	if (value === null) return null
	const trimmed = value.trim()
	return trimmed.length === 0 ? null : trimmed
}

// ---------------------------------------------------------------------------
// Hints: duplicates
// ---------------------------------------------------------------------------

const COMPANY_SUFFIXES =
	/\b(pte\.?\s*ltd\.?|private limited|ltd\.?|limited|llp|llc|inc\.?|incorporated|gmbh|co\.?|corp\.?|corporation|plc|sdn\.?\s*bhd\.?|pty\.?|group)\b/g

/**
 * Lower-cased, punctuation stripped, legal suffixes dropped — so
 * "Marina Freight Solutions Pte. Ltd." and "marina freight solutions" collide.
 */
export function normalizeCompanyName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[&+]/g, " and ")
		.replace(COMPANY_SUFFIXES, " ")
		.replace(/[^a-z0-9 ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

/**
 * Existing companies that look like the one being created or renamed.
 * `excludeId` is the record being edited, which would otherwise match itself.
 */
export function duplicateCompanies(
	draft: Pick<CompanyDraft, "name" | "website">,
	companies: readonly Company[],
	excludeId: string | null = null,
): Company[] {
	const name = normalizeCompanyName(draft.name)
	const domain = websiteDomain(draft.website)
	if (name.length === 0 && domain === null) return []

	return companies.filter((c) => {
		if (c.id === excludeId) return false
		if (name.length > 0 && normalizeCompanyName(c.name) === name) return true
		if (domain !== null && websiteDomain(c.website) === domain) return true
		return false
	})
}

export function websiteDomain(website: string | null): string | null {
	const normalized = normalizeWebsite(website)
	if (normalized === null) return null
	try {
		return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase()
	} catch {
		return null
	}
}

/**
 * Existing contacts that look like the one being saved: same email, or the same
 * full name at the same company. Name alone is not enough — two people called
 * Wei Ming Tan at different companies is Tuesday.
 */
export function duplicateContacts(
	draft: Pick<ContactDraft, "name" | "firstName" | "lastName" | "email" | "companyId">,
	contacts: readonly Contact[],
	excludeId: string | null = null,
): Contact[] {
	const email = draft.email?.trim().toLowerCase() ?? ""
	const name = deriveContactName(draft as ContactDraft).toLowerCase()

	return contacts.filter((c) => {
		if (c.id === excludeId) return false
		if (email.length > 0 && (c.email ?? "").trim().toLowerCase() === email) return true
		if (
			name.length > 0 &&
			draft.companyId !== null &&
			c.companyId === draft.companyId &&
			c.name.trim().toLowerCase() === name
		) {
			return true
		}
		return false
	})
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SEARCH_RESULT_CAP = 200

/**
 * Case-insensitive substring match over the fields a person would type. The
 * result is capped so a blank query on 900 contacts renders a page, not a wall.
 */
export function searchContacts(
	query: string,
	contacts: readonly Contact[],
	companiesById: ReadonlyMap<string, Company>,
): Contact[] {
	const q = query.trim().toLowerCase()
	const pool =
		q.length === 0
			? contacts
			: contacts.filter((c) =>
					[
						c.name,
						c.email ?? "",
						c.jobTitle ?? "",
						c.companyId === null ? "" : (companiesById.get(c.companyId)?.name ?? ""),
					]
						.join(" ")
						.toLowerCase()
						.includes(q),
				)
	return [...pool]
		.sort((a, b) => a.name.localeCompare(b.name))
		.slice(0, SEARCH_RESULT_CAP)
}

export function searchCompanies(
	query: string,
	companies: readonly Company[],
): Company[] {
	const q = query.trim().toLowerCase()
	const pool =
		q.length === 0
			? companies
			: companies.filter((c) =>
					[c.name, websiteDomain(c.website) ?? "", c.industry ?? ""]
						.join(" ")
						.toLowerCase()
						.includes(q),
				)
	return [...pool]
		.sort((a, b) => a.name.localeCompare(b.name))
		.slice(0, SEARCH_RESULT_CAP)
}

/** Merge two result sets by id, keeping the first occurrence's order. */
export function mergeById<T extends { id: string }>(
	primary: readonly T[],
	secondary: readonly T[],
): T[] {
	const seen = new Set(primary.map((item) => item.id))
	const merged = [...primary]
	for (const item of secondary) {
		if (!seen.has(item.id)) {
			seen.add(item.id)
			merged.push(item)
		}
	}
	return merged
}
