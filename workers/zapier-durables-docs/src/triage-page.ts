import { type Pacer, requireEnv, sdk } from "./zapier.js";

/**
 * Find a triage row's Notion page URL, so it can be attached to its Linear
 * issue.
 *
 * ## Why this needs a data source id in config
 *
 * `worker.database()` returns an opaque `DatabaseHandle` — `{ key, config }` and
 * nothing else. A worker cannot discover the id of the database the platform
 * created for it, so the only route to the row is a data-source query with an id
 * supplied from outside. Hence `NOTION_TRIAGE_DATA_SOURCE_ID`.
 *
 * **Unset means no attachment**, not an error. It is a post-deploy value (the
 * database has to exist before it has an id), so a worker that has never had it
 * set is in an ordinary state, not a broken one.
 *
 * ## Why the link is attached on a later execution
 *
 * A sync's `changes` are applied by the platform *after* `execute` returns, so
 * on the execution that first sees a signature its row does not exist yet and
 * this query correctly finds nothing. The sync chains one execution per durable,
 * so the row is normally there a few seconds later on the next one — the ticket
 * stays marked unattached until it is.
 *
 * Routed through the Zapier Notion connection, same as `people.ts`, so the
 * worker holds no Notion credential of its own. `context.notion` cannot be used:
 * the platform pins it to an older API version that 404s on data-source
 * endpoints.
 */

// Data-source query endpoints need this version or later. Matches people.ts.
const NOTION_VERSION = "2025-09-03";

const SIGNATURE_PROPERTY = "Signature";
const TICKET_ID_PROPERTY = "Ticket ID";

type NotionQueryResponse = {
	results: Array<{ url?: string; properties?: Record<string, any> }>;
};

export type TriagePage = {
	url: string;
	/** `ZAP-25`, from the hand-made `Ticket ID` auto-increment property. Absent
	 *  if that property is ever removed — it is not part of the managed schema,
	 *  so this must not depend on it. */
	ticketId?: string;
};

/** `{prefix: "ZAP", number: 25}` → `ZAP-25`. The prefix is optional in Notion. */
export function formatTicketId(property: unknown): string | undefined {
	if (!property || typeof property !== "object") return undefined;
	const uniqueId = (property as Record<string, any>).unique_id;
	if (!uniqueId || typeof uniqueId.number !== "number") return undefined;
	return uniqueId.prefix ? `${uniqueId.prefix}-${uniqueId.number}` : String(uniqueId.number);
}

/** Unset is a working configuration — see the header. */
export function triageDataSourceId(): string | undefined {
	return process.env.NOTION_TRIAGE_DATA_SOURCE_ID || undefined;
}

/**
 * The page URL for one signature, or undefined when the row does not exist yet.
 *
 * Queries on `Signature` rather than the title, because the signature is the
 * database's primary key and the title is derived from the newest occurrence —
 * the same reason the Linear issue carries a hashed marker instead of matching
 * on its title.
 */
export async function findTriagePage(
	signature: string,
	pacer?: Pacer,
): Promise<TriagePage | undefined> {
	const dataSourceId = triageDataSourceId();
	if (!dataSourceId) return undefined;
	if (pacer) await pacer.wait();

	const res = await sdk().fetch(
		`https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
		{
			method: "POST",
			connection: requireEnv("ZAPIER_NOTION_CONNECTION_ID"),
			headers: {
				"Content-Type": "application/json",
				"Notion-Version": NOTION_VERSION,
				Accept: "application/json",
			},
			body: JSON.stringify({
				filter: { property: SIGNATURE_PROPERTY, rich_text: { equals: signature } },
				page_size: 1,
			}),
		},
	);

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Notion triage query ${res.status}: ${body.slice(0, 300)}`);
	}

	const data = (await res.json()) as NotionQueryResponse;
	const row = data.results[0];
	if (!row || typeof row.url !== "string" || !row.url) return undefined;
	const ticketId = formatTicketId(row.properties?.[TICKET_ID_PROPERTY]);
	return { url: row.url, ...(ticketId ? { ticketId } : {}) };
}
