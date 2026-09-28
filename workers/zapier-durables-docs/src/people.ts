import { type Pacer, requireEnv, sdk } from "./zapier.js";

/**
 * Resolve a Zapier customuser id to a Notion user id via the native People
 * database.
 *
 * Verified 2026-07-26: People is blocked on the Notion **MCP** surface
 * (`403 restricted_resource`, "managed by Notion") but readable over the public
 * REST API. `Zapier User ID` stores the numeric customuser id as rich text
 * (`"20495893"`), which is exactly the string `listWorkflows` returns for
 * `created_by_user_id` — no coercion needed. The `01521d30-…` public UUID form
 * matches nothing, so joining on it would silently return zero rows.
 *
 * Routed through the Zapier Notion connection so the worker holds no Notion
 * credential of its own (the platform writes sync rows without one). Switching
 * this to a direct REST call is a one-function change if the connection ever
 * becomes inconvenient, but would need `NOTION_API_TOKEN` set on the worker and
 * People shared with its integration — see
 * `workers/harvest-sync/src/notion-lookup.ts` for that shape.
 *
 * Note `context.notion` cannot be used here: the platform pins it to an older
 * API version that 404s on data-source endpoints.
 */

// Data-source query endpoints need this version or later.
const NOTION_VERSION = "2025-09-03";

const PEOPLE_DATA_SOURCE_ID_DEFAULT = "a0791b07-11ac-8364-9113-07ea21165718";
const ZAPIER_USER_ID_PROPERTY = "Zapier User ID";
const PERSON_PROPERTY = "Person";

type NotionQueryResponse = {
	results: Array<{ properties?: Record<string, any> }>;
};

function peopleDataSourceId(): string {
	return process.env.NOTION_PEOPLE_DATA_SOURCE_ID ?? PEOPLE_DATA_SOURCE_ID_DEFAULT;
}

/**
 * Look up one creator email. Returns undefined when the Zapier id has no People
 * row, the row has an empty `Person`, or the linked user exposes no email —
 * all ordinary states while the mapping is still being backfilled, not errors.
 *
 * An **email** rather than a user id because `Builder.people()` takes emails.
 * The `Person` relation on People resolves to a workspace member whose
 * `person.email` is present on the query response.
 */
async function queryPeople(zapierUserId: string, pacer?: Pacer): Promise<string | undefined> {
	if (pacer) await pacer.wait();

	const res = await sdk().fetch(
		`https://api.notion.com/v1/data_sources/${peopleDataSourceId()}/query`,
		{
			method: "POST",
			connection: requireEnv("ZAPIER_NOTION_CONNECTION_ID"),
			headers: {
				"Content-Type": "application/json",
				"Notion-Version": NOTION_VERSION,
				Accept: "application/json",
			},
			body: JSON.stringify({
				filter: {
					property: ZAPIER_USER_ID_PROPERTY,
					rich_text: { equals: zapierUserId },
				},
				page_size: 1,
			}),
		},
	);

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Notion People query ${res.status}: ${body.slice(0, 300)}`);
	}

	const data = (await res.json()) as NotionQueryResponse;
	const email = data.results[0]?.properties?.[PERSON_PROPERTY]?.people?.[0]?.person?.email;
	return typeof email === "string" ? email : undefined;
}

/**
 * Caching resolver. One Notion call per distinct Zapier id per sync cycle —
 * in practice one call total, since every durable today has the same creator.
 * Misses are cached too, so an unmapped id is not re-queried nine times.
 */
export function createUserResolver(pacer?: Pacer) {
	const cache = new Map<string, string | undefined>();

	return async function resolveCreatorEmail(
		zapierUserId: string | undefined | null,
	): Promise<string | undefined> {
		if (!zapierUserId) return undefined;
		const key = String(zapierUserId);
		if (cache.has(key)) return cache.get(key);
		const resolved = await queryPeople(key, pacer);
		cache.set(key, resolved);
		return resolved;
	};
}
