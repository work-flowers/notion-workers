/**
 * The persistence and lookup surface the views talk to.
 *
 * Two implementations: one backed by Notion (`index.tsx`, `NotionRoot`) and
 * one held in memory for `?mock` (`MockRoot`). That is what lets the mock
 * demo exercise the real create/edit flows — including the guardrails —
 * without a binding, a deploy, or a write.
 */

import type { LinkedKind, LinkedRecord, PageLike } from "./linked.ts"
import type { Company, CompanyDraft, Contact, ContactDraft } from "./records.ts"
import type { Deal, DealDraft, FxRate, Stage } from "./rules.ts"

export type SaveResult =
	| { ok: true; id?: string }
	| { ok: false; message: string }

export type PageFetchResult =
	| { status: "success"; page: PageLike }
	| { status: "error"; message: string }

export type PageFetcher = (id: string) => Promise<PageFetchResult>

export type UserSummary = {
	id: string
	name: string | null
	email: string | null
	avatarUrl: string | null
}

export type UserFetcher = (id: string) => Promise<UserSummary | null>

/** Which of the three big windows hit the per-subscription cap. */
export type Truncation = {
	deals: boolean
	companies: boolean
	contacts: boolean
}

export type Store = {
	/** Open deals (all of them) plus as many closed deals as have been loaded. */
	deals: Deal[]
	/** True when older closed deals exist beyond the loaded set. */
	closedHasMore: boolean
	loadMoreClosed: () => void

	companies: Company[]
	contacts: Contact[]
	fxRates: FxRate[]

	/**
	 * The stages the bound Stage property actually offers, in pipeline order.
	 *
	 * Read from the schema rather than assumed, because the block knows seven
	 * canonical stages and a given CRM may not have all of them. Offering a
	 * stage the property can't accept would produce a save that fails at the
	 * API instead of a button that was never enabled.
	 */
	stageOptions: readonly Stage[]
	typeOptions: string[]
	lostReasonOptions: string[]
	industryOptions: string[]
	sizeOptions: string[]
	companyCountryOptions: string[]
	contactCountryOptions: string[]
	leadSourceOptions: string[]

	/** False when the Contacts data source has no company relation mapped. */
	companyRelationBound: boolean
	truncated: Truncation
	/**
	 * Whether the host honoured the server-side filters. `null` until known.
	 * An old Notion client ignores them silently; the views keep filtering
	 * client-side either way, this only decides whether to say so.
	 */
	filtersApplied: boolean | null

	/**
	 * Server-side contact search, used to reach past the 999-row window. The
	 * views set the query; the store owns the subscription and its results.
	 */
	contactSearch: {
		query: string
		setQuery: (query: string) => void
		results: Contact[]
		loading: boolean
	}

	/** Newest-first caches from the optional Meeting Notes / Emails bindings. */
	linkedCache: Record<LinkedKind, ReadonlyMap<string, LinkedRecord>>

	createDeal: (draft: DealDraft) => Promise<SaveResult>
	updateDeal: (id: string, draft: DealDraft) => Promise<SaveResult>
	createContact: (draft: ContactDraft) => Promise<SaveResult>
	updateContact: (id: string, draft: ContactDraft) => Promise<SaveResult>
	createCompany: (draft: CompanyDraft) => Promise<SaveResult>
	updateCompany: (id: string, draft: CompanyDraft) => Promise<SaveResult>

	getPage: PageFetcher
	getUser: UserFetcher
}

export type AppState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; store: Store; stale?: boolean; unknownStages?: number }
