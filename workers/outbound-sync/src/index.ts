import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { type ApolloContact, listIds, revealedEmail, searchContacts } from "./apollo.js";

const worker = new Worker();
export default worker;

/**
 * Outbound Leads (data source 61a01f87-741b-4dbd-a98e-ada01e07eb3b), attached
 * rather than managed so existing rows, views, the Contacts relation and agents
 * survive. Bind it with `ntn workers databases attach outboundLeads <data-source-id>`.
 *
 * Only Apollo facts are declared: declaring a property makes it read-only in
 * Notion. Status, Campaign, Subject Line, Message, Notes, Owner, Contacts and
 * Follow-up Date are human decisions and must stay out of this schema.
 *
 * Before decommissioning, run `ntn workers databases detach outboundLeads`.
 * Deleting the worker does not release the database; it stays locked.
 */
const outboundLeads = worker.database("outboundLeads", {
	type: "attached",
	initialTitle: "Outbound Leads",
	primaryKeyProperty: "Apollo ID",
	schema: {
		properties: {
			Lead: Schema.title(),
			"Apollo ID": Schema.richText(),
			Role: Schema.richText(),
			Company: Schema.richText(),
			Email: Schema.email(),
			"LinkedIn Profile URL": Schema.url(),
			Location: Schema.richText(),
		},
	},
});

// Apollo's per-minute limit varies by plan; stay well under the lowest.
const apollo = worker.pacer("apollo", { allowedRequests: 40, intervalMs: 60_000 });

// Re-read this much before the high-water mark each cycle, so a contact that
// Apollo indexed late is not skipped. Re-upserting a few rows is harmless.
const OVERLAP_MS = 5 * 60_000;

type State = {
	/** Contacts updated at or before this were synced in an earlier cycle. */
	cursor?: string;
	/** Next page of the current cycle. */
	page?: number;
	/** Latest `updated_at` seen so far in the current cycle. */
	runMax?: string;
};

function later(a: string | undefined, b: string | null | undefined): string | undefined {
	if (!b) return a;
	if (!a) return b;
	return Date.parse(b) > Date.parse(a) ? b : a;
}

function toUpsert(c: ApolloContact) {
	const name = c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.id;
	const location = [c.city, c.state, c.country].filter(Boolean).join(", ");
	return {
		type: "upsert" as const,
		// Must be byte-identical to the "Apollo ID" value, or every run inserts a new row.
		key: c.id,
		upstreamUpdatedAt: c.updated_at ?? undefined,
		properties: {
			Lead: Builder.title(name),
			"Apollo ID": Builder.richText(c.id),
			Role: Builder.richText(c.title ?? ""),
			Company: Builder.richText(c.organization_name ?? ""),
			Email: Builder.email(revealedEmail(c.email) ?? ""),
			"LinkedIn Profile URL": Builder.url(c.linkedin_url ?? ""),
			Location: Builder.richText(location),
		},
	};
}

/**
 * Apollo's contact search has no updated-since filter, so each cycle pages
 * through the lists newest-first and stops at the first contact that is not
 * newer than the cursor. Incremental only: replace mode would delete the row
 * (and its notes and status) of anyone dropped from an Apollo list.
 *
 * Adding a list to APOLLO_LIST_IDS only picks up contacts updated after the
 * cursor; run `ntn workers sync state reset apolloLeads` to pull it in full.
 */
worker.sync("apolloLeads", {
	database: outboundLeads,
	mode: "incremental",
	schedule: "15m",
	execute: async (state: State | undefined) => {
		const cursor = state?.cursor;
		const page = state?.page ?? 1;

		await apollo.wait();
		const { contacts, totalPages } = await searchContacts(listIds(), page);

		const fresh = cursor
			? contacts.filter((c) => !c.updated_at || Date.parse(c.updated_at) > Date.parse(cursor))
			: contacts;
		const runMax = fresh.reduce<string | undefined>((max, c) => later(max, c.updated_at), state?.runMax);
		const done = fresh.length < contacts.length || page >= totalPages || contacts.length === 0;

		const nextState: State = done
			? {
					cursor: runMax
						? new Date(Date.parse(runMax) - OVERLAP_MS).toISOString()
						: cursor,
				}
			: { cursor, page: page + 1, runMax };

		return { changes: fresh.map(toUpsert), hasMore: !done, nextState };
	},
});
