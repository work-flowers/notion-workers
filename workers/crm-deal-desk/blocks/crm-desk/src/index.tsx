// Bundled, not linked: the brand's typography.css pulls these from the Google
// Fonts CDN, which the sandbox blocks silently. See crm-desk.css.
import "@fontsource-variable/inter"
import "@fontsource/jetbrains-mono/400.css"
import "@fontsource/jetbrains-mono/500.css"

import { pages, users, type NotionPageId, type NotionUserId } from "@notionhq/custom-blocks"
import { NotionCustomBlock, useDataSource } from "@notionhq/custom-blocks/react"
import { StrictMode, useCallback, useMemo, useState } from "react"
import ReactDOM from "react-dom/client"

import { App } from "./App.tsx"
import { DebugPanel } from "./debug.tsx"
import type { PageLike } from "./linked.ts"
import {
	MOCK_COMPANIES,
	MOCK_CONTACTS,
	MOCK_DEALS,
	MOCK_FX_RATES,
	MOCK_STAGE_OPTIONS,
	MOCK_USERS,
} from "./mock.ts"
import { MOCK_LINKED_PAGES } from "./mock-linked.ts"
import type { Company, CompanyDraft, Contact, ContactDraft } from "./records.ts"
import {
	onlyBound,
	optionNames,
	stageOptionNames,
	toCompany,
	toCompanyProperties,
	toContact,
	toContactProperties,
	toDeal,
	toFxRate,
	toLinkedCache,
	toProperties,
} from "./rows.ts"
import {
	CLOSED_STAGES,
	OPEN_STAGES,
	STAGES,
	isClosed,
	type Deal,
	type DealDraft,
	type Stage,
} from "./rules.ts"
import type { AppState, PageFetchResult, SaveResult, Store, UserSummary } from "./store.ts"
import "./crm-desk.css"

/**
 * 999 is the per-subscription cap. Each window below is its own subscription
 * with its own filter and sort, so the cap is per *view*, not per database:
 * open deals never compete with closed ones, and the contact window drops the
 * oldest people first. Server-side relation filters don't exist, which is why
 * linked notes and emails go through `pages.get` instead (see linked-loader.ts).
 */
const ROW_LIMIT = 999
const CLOSED_PAGE = 200

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")
const isDebug = params.has("debug")

/**
 * The block paints its own brand surface and does not follow the page theme —
 * see the header comment in `crm-desk.css` for why that is deliberate.
 */
function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="dd-root" data-mock={isMock ? "true" : undefined}>
			{children}
		</div>
	)
}

// Query options are module constants so their identity is stable — a fresh
// object each render would tear the subscription down and up every time.
const OPEN_DEALS_QUERY = {
	limit: ROW_LIMIT,
	filter: { key: "stage", status: { equals: [...OPEN_STAGES] } },
	sorts: [{ propertyId: "created_time", direction: "descending" as const }],
}
const COMPANIES_QUERY = {
	limit: ROW_LIMIT,
	sorts: [{ key: "name", direction: "ascending" as const }],
}
const CONTACTS_QUERY = {
	limit: ROW_LIMIT,
	sorts: [{ propertyId: "created_time", direction: "descending" as const }],
}
const FX_QUERY = { limit: 50 }
const CACHE_QUERY = {
	limit: ROW_LIMIT,
	sorts: [{ key: "date", direction: "descending" as const }],
}

function CrmDesk() {
	const [closedLimit, setClosedLimit] = useState(CLOSED_PAGE)
	const [contactQuery, setContactQuery] = useState("")

	const openDeals = useDataSource("deals", OPEN_DEALS_QUERY)
	const closedQuery = useMemo(
		() => ({
			limit: Math.min(closedLimit, ROW_LIMIT),
			filter: { key: "stage", status: { equals: [...CLOSED_STAGES] } },
			sorts: [{ key: "actualClose", direction: "descending" as const }],
		}),
		[closedLimit],
	)
	const closedDeals = useDataSource("deals", closedQuery)
	const companies = useDataSource("companies", COMPANIES_QUERY)
	const contacts = useDataSource("contacts", CONTACTS_QUERY)
	const searchQuery = useMemo(
		() =>
			contactQuery.length === 0
				? { limit: 1 }
				: { limit: 50, filter: { key: "name", title: { contains: contactQuery } } },
		[contactQuery],
	)
	const contactSearch = useDataSource("contacts", searchQuery)
	const fxRates = useDataSource("fxRates", FX_QUERY)
	const meetingNotes = useDataSource("meetingNotes", CACHE_QUERY)
	const emails = useDataSource("emails", CACHE_QUERY)

	const getPage = useCallback(async (id: string): Promise<PageFetchResult> => {
		const result = await pages.get(id as NotionPageId)
		if (result.status === "error") return { status: "error", message: result.error.message }
		return { status: "success", page: result.page as unknown as PageLike }
	}, [])

	const getUser = useCallback(async (id: string): Promise<UserSummary | null> => {
		const result = await users.get(id as NotionUserId)
		if (result.status === "error") return null
		const u = result.user
		return { id: u.id, name: u.name ?? null, email: u.person?.email ?? null, avatarUrl: u.avatar_url }
	}, [])

	// Optional bindings report an error when unbound; that is not a failure of the block.
	const error = openDeals.error ?? closedDeals.error ?? companies.error ?? contacts.error ?? fxRates.error
	const isLoading = openDeals.isLoading || companies.isLoading || contacts.isLoading
	const hasNothing =
		openDeals.items.length === 0 && companies.items.length === 0 && contacts.items.length === 0

	let state: AppState
	if (error) {
		state = { status: "error", message: error.message }
	} else if (isLoading && hasNothing) {
		state = { status: "loading" }
	} else {
		const mappedOpen = openDeals.items.map(toDeal)
		const mappedClosed = closedDeals.items.map(toDeal)
		const known = [...mappedOpen, ...mappedClosed].filter((d): d is Deal => d !== null)
		const unknownStages = mappedOpen.length + mappedClosed.length - known.length

		// An old Notion client ignores the filter and returns everything; the
		// tell is a closed deal in the open window (or vice versa).
		const filtersApplied =
			known.length === 0
				? null
				: !mappedOpen.some((d) => d !== null && isClosed(d.stage)) &&
					!mappedClosed.some((d) => d !== null && !isClosed(d.stage))
		// Dedupe in case both windows returned the same row (filters ignored).
		const seen = new Set<string>()
		const deals = known.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))

		const rowsById = new Map<string, (typeof openDeals.items)[number]>(
			[...openDeals.items, ...closedDeals.items, ...contactSearch.items].map((r) => [r.id, r]),
		)

		const store: Store = {
			deals,
			closedHasMore: closedDeals.hasMore,
			loadMoreClosed: () => setClosedLimit((n) => Math.min(n + CLOSED_PAGE, ROW_LIMIT)),
			companies: companies.items.map(toCompany),
			contacts: contacts.items.map(toContact),
			fxRates: fxRates.items.map(toFxRate),
			typeOptions: optionNames(openDeals.propertySchemasByKey.dealType),
			lostReasonOptions: optionNames(openDeals.propertySchemasByKey.lostReason),
			// Fall back to all seven only when the schema yields nothing, which
			// means the Stage binding is missing or points at the wrong property.
			stageOptions: fallbackToAll(stageOptionNames(openDeals.propertySchemasByKey.stage)),
			industryOptions: optionNames(companies.propertySchemasByKey.industry),
			sizeOptions: optionNames(companies.propertySchemasByKey.size),
			companyCountryOptions: optionNames(companies.propertySchemasByKey.country),
			contactCountryOptions: optionNames(contacts.propertySchemasByKey.country),
			leadSourceOptions: optionNames(contacts.propertySchemasByKey.leadSource),
			// An unmapped key resolves to `undefined`, which is a supported state
			// — the block degrades to an unfiltered picker rather than pretending.
			companyRelationBound: contacts.propertyIdsByKey.company !== undefined,
			truncated: {
				deals: openDeals.hasMore,
				companies: companies.hasMore,
				contacts: contacts.hasMore,
			},
			filtersApplied,
			contactSearch: {
				query: contactQuery,
				setQuery: setContactQuery,
				results: contactQuery.length === 0 ? [] : contactSearch.items.map(toContact),
				loading: contactSearch.isLoading,
			},
			linkedCache: {
				meetingNote: meetingNotes.error ? new Map() : toLinkedCache(meetingNotes.items, "meetingNote"),
				email: emails.error ? new Map() : toLinkedCache(emails.items, "email"),
			},

			createDeal: async (draft) =>
				report(
					await pages.create({
						parent: { type: "data_source_key", key: "deals" },
						properties: onlyBound(toProperties(draft), openDeals.propertyIdsByKey),
					}),
				),
			updateDeal: async (id, draft) => {
				const row = rowsById.get(id)
				if (row === undefined) return gone("deal")
				// `row.update` resolves manifest keys to raw property ids for us;
				// the top-level `pages.update` would need the raw ids spelled out.
				return report(
					await row.update({
						properties: onlyBound(toProperties(draft), openDeals.propertyIdsByKey),
					}),
				)
			},
			createContact: async (draft) =>
				report(
					await pages.create({
						parent: { type: "data_source_key", key: "contacts" },
						properties: onlyBound(toContactProperties(draft), contacts.propertyIdsByKey),
					}),
				),
			updateContact: async (id, draft) => {
				const row = contacts.items.find((r) => r.id === id) ?? rowsById.get(id)
				if (row === undefined) return gone("contact")
				return report(
					await row.update({
						properties: onlyBound(toContactProperties(draft), contacts.propertyIdsByKey),
					}),
				)
			},
			createCompany: async (draft) =>
				report(
					await pages.create({
						parent: { type: "data_source_key", key: "companies" },
						properties: onlyBound(toCompanyProperties(draft), companies.propertyIdsByKey),
					}),
				),
			updateCompany: async (id, draft) => {
				const row = companies.items.find((r) => r.id === id)
				if (row === undefined) return gone("company")
				return report(
					await row.update({
						properties: onlyBound(toCompanyProperties(draft), companies.propertyIdsByKey),
					}),
				)
			},

			getPage,
			getUser,
		}

		state = {
			status: "ready",
			store,
			stale: isLoading,
			unknownStages,
		}
	}

	// Always rendered (collapsed) in Notion: the iframe URL is Notion's, so a
	// `?debug` flag can't be added there. `?debug` only opens it by default.
	return (
		<Shell>
			<App {...state} />
			<DebugPanel
				open={isDebug}
				sources={{
					deals: openDeals,
					closedDeals,
					companies,
					contacts,
					fxRates,
					meetingNotes,
					emails,
				}}
				getPage={getPage}
			/>
		</Shell>
	)
}

function fallbackToAll(stages: Stage[]): readonly Stage[] {
	return stages.length > 0 ? stages : STAGES
}

function gone(noun: string): SaveResult {
	return {
		ok: false,
		message: `That ${noun} is no longer in the loaded set. Reload the block.`,
	}
}

function report(
	result:
		| { status: "success"; page?: { id: string } }
		| { status: "error"; error: { message: string } },
): SaveResult {
	if (result.status === "success") {
		return result.page === undefined ? { ok: true } : { ok: true, id: result.page.id }
	}
	return { ok: false, message: result.error.message }
}

/**
 * `?mock` runs the whole app against the fixture, with writes held in memory.
 *
 * Deliberately a real store rather than a read-only preview: creating a deal
 * and watching the stage buttons unlock is the demo, and it needs no Notion, no
 * binding and no write to the live CRM to give it.
 *
 * `?mock&slow` makes page fetches take 1.5 s; `?mock&truncated` pretends the
 * contact window hit the cap; `?mock&relation=unbound` drops the company join.
 */
function MockRoot() {
	const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS)
	const [contacts, setContacts] = useState<Contact[]>(MOCK_CONTACTS)
	const [companies, setCompanies] = useState<Company[]>(MOCK_COMPANIES)
	const [contactQuery, setContactQuery] = useState("")

	const delay = params.has("slow") ? 1500 : 150
	const getPage = useCallback(
		(id: string): Promise<PageFetchResult> =>
			new Promise((resolve) =>
				setTimeout(() => {
					const page = MOCK_LINKED_PAGES.get(id)
					resolve(
						page === undefined
							? { status: "error", message: `No page ${id} in the fixture` }
							: { status: "success", page },
					)
				}, delay),
			),
		[delay],
	)
	const getUser = useCallback(async (id: string): Promise<UserSummary | null> => {
		const user = MOCK_USERS[id]
		return user === undefined ? null : { id, name: user.name, email: user.email, avatarUrl: null }
	}, [])

	let counter = deals.length + contacts.length + companies.length
	const nextId = (prefix: string) => `local-${prefix}-${++counter}`

	const store: Store = {
		deals,
		closedHasMore: false,
		loadMoreClosed: () => {},
		companies,
		contacts,
		fxRates: MOCK_FX_RATES,
		stageOptions: MOCK_STAGE_OPTIONS,
		typeOptions: ["Full Retainer", "Project", "Support Retainer", "Vanta Subscription", "Workshop"],
		lostReasonOptions: [
			"Chose competitor",
			"No budget",
			"Not a fit",
			"Other",
			"Price / Budget",
			"Timing / Not now",
			"Went silent / No response",
			"Went with internal build",
		],
		industryOptions: [
			"Automation Agency",
			"E-commerce",
			"Education",
			"Energy",
			"Finance",
			"Healthcare",
			"Manufacturing",
			"Marketing Agency",
			"Media & Entertainment",
			"Nonprofit",
			"Retail",
			"Technology",
			"Transportation",
		],
		sizeOptions: ["1-49", "50-249", "250-999", "1000+"],
		companyCountryOptions: ["AE", "AU", "CA", "DK", "FR", "GB", "ID", "IN", "JP", "NL", "SG", "US"],
		contactCountryOptions: ["Australia", "Indonesia", "Japan", "Singapore", "United Kingdom", "United States"],
		leadSourceOptions: [
			"Client Referral",
			"Contact Us",
			"Event",
			"Existing Network",
			"LinkedIn",
			"Newsletter Sign-up",
			"Notion Partner Directory",
			"Notion Setup Session",
			"Vendor",
			"Zapier Partner Directory",
		],
		companyRelationBound: params.get("relation") !== "unbound",
		truncated: { deals: false, companies: false, contacts: params.has("truncated") },
		filtersApplied: true,
		contactSearch: {
			query: contactQuery,
			setQuery: setContactQuery,
			results:
				contactQuery.length === 0
					? []
					: contacts.filter((c) => c.name.toLowerCase().includes(contactQuery.toLowerCase())),
			loading: false,
		},
		linkedCache: { meetingNote: new Map(), email: new Map() },
		createDeal: async (draft: DealDraft) => {
			const id = nextId("deal")
			setDeals((current) => [
				{ ...draft, id, ownerId: "user-demo-1", meetingNoteIds: [], emailIds: [] },
				...current,
			])
			return { ok: true, id }
		},
		updateDeal: async (id: string, draft: DealDraft) => {
			setDeals((current) => current.map((d) => (d.id === id ? { ...d, ...draft, id } : d)))
			return { ok: true }
		},
		createContact: async (draft: ContactDraft) => {
			const id = nextId("contact")
			setContacts((current) => [
				{ ...draft, id, ownerId: "user-demo-1", dealIds: [], meetingNoteIds: [], emailIds: [] },
				...current,
			])
			return { ok: true, id }
		},
		updateContact: async (id: string, draft: ContactDraft) => {
			setContacts((current) => current.map((c) => (c.id === id ? { ...c, ...draft, id } : c)))
			return { ok: true }
		},
		createCompany: async (draft: CompanyDraft) => {
			const id = nextId("company")
			setCompanies((current) => [
				{ ...draft, id, contactIds: [], dealIds: [], meetingNoteIds: [], emailIds: [] },
				...current,
			])
			return { ok: true, id }
		},
		updateCompany: async (id: string, draft: CompanyDraft) => {
			setCompanies((current) => current.map((c) => (c.id === id ? { ...c, ...draft, id } : c)))
			return { ok: true }
		},
		getPage,
		getUser,
	}

	return (
		<Shell>
			<App status="ready" store={store} />
		</Shell>
	)
}

function NotionRoot() {
	return (
		<NotionCustomBlock
			autoResize
			fallback={
				<Shell>
					<App status="loading" />
				</Shell>
			}
			errorFallback={(error) => (
				<Shell>
					<App status="error" message={error.message} />
				</Shell>
			)}
		>
			{/*
			 * No <NotionTokenScope>: it exists to supply NDS theme tokens, and
			 * this block styles itself from the workFlowers palette instead.
			 */}
			<CrmDesk />
		</NotionCustomBlock>
	)
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

ReactDOM.createRoot(root).render(
	<StrictMode>{isMock ? <MockRoot /> : <NotionRoot />}</StrictMode>,
)
