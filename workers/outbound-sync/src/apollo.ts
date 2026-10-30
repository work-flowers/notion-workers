/** The subset of an Apollo contact (`POST /api/v1/contacts/search`) we sync. */
export type ApolloContact = {
	id: string;
	name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	title?: string | null;
	organization_name?: string | null;
	email?: string | null;
	linkedin_url?: string | null;
	city?: string | null;
	state?: string | null;
	country?: string | null;
	updated_at?: string | null;
};

type SearchResponse = {
	contacts?: ApolloContact[];
	pagination?: { page: number; per_page: number; total_entries: number; total_pages: number };
};

export const PAGE_SIZE = 100;

/** An Apollo master API key: only master keys can search contacts. */
function apiKey(): string {
	const key = process.env.APOLLO_API_KEY;
	if (!key) throw new Error("APOLLO_API_KEY must be set");
	return key;
}

/**
 * Every Apollo contact list (label). Any contact on any list belongs in
 * Outbound Leads; contacts on no list (saved ad hoc, or added by Apollo
 * itself) stay out. Looked up each cycle, so a new list needs no config.
 */
export async function contactListIds(): Promise<string[]> {
	const res = await fetch("https://api.apollo.io/api/v1/labels", {
		headers: { "X-Api-Key": apiKey(), Accept: "application/json", "Cache-Control": "no-cache" },
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Apollo labels failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
	}
	const labels = (await res.json()) as { id: string; modality?: string }[];
	return labels.filter((l) => l.modality === "contacts").map((l) => l.id);
}

/** One page of contacts on the given lists, most recently updated first. */
export async function searchContacts(
	labelIds: string[],
	page: number,
): Promise<{ contacts: ApolloContact[]; totalPages: number }> {
	const res = await fetch("https://api.apollo.io/api/v1/contacts/search", {
		method: "POST",
		headers: {
			"X-Api-Key": apiKey(),
			"Content-Type": "application/json",
			Accept: "application/json",
			"Cache-Control": "no-cache",
		},
		body: JSON.stringify({
			contact_label_ids: labelIds,
			sort_by_field: "contact_updated_at",
			sort_ascending: false,
			per_page: PAGE_SIZE,
			page,
		}),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Apollo contacts/search failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
	}
	const data = (await res.json()) as SearchResponse;
	return { contacts: data.contacts ?? [], totalPages: data.pagination?.total_pages ?? 0 };
}

/** Apollo returns this placeholder until an email has been revealed. */
export function revealedEmail(email: string | null | undefined): string | null {
	if (!email || email.startsWith("email_not_unlocked@")) return null;
	return email;
}
