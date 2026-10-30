import { sdk } from "./zapier.js";

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

function connectionId(): string {
	const id = process.env.APOLLO_CONNECTION_ID;
	if (!id) throw new Error("APOLLO_CONNECTION_ID must be set");
	return id;
}

/** Apollo list (label) IDs whose contacts belong in Outbound Leads. */
export function listIds(): string[] {
	const ids = (process.env.APOLLO_LIST_IDS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (ids.length === 0) throw new Error("APOLLO_LIST_IDS must list at least one Apollo list ID");
	return ids;
}

/**
 * One page of contacts on the given lists, most recently updated first.
 *
 * Must go through an API by Zapier connection that sends `X-Api-Key`: the
 * Apollo.io app connection's auth template injects `name=Zapier Master Key`
 * into every search, which silently filters out every contact.
 */
export async function searchContacts(
	labelIds: string[],
	page: number,
): Promise<{ contacts: ApolloContact[]; totalPages: number }> {
	const res = await sdk().fetch("https://api.apollo.io/api/v1/contacts/search", {
		method: "POST",
		connection: connectionId(),
		headers: { "Content-Type": "application/json", Accept: "application/json" },
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
