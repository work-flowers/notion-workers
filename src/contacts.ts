import type { Client } from "@notionhq/client";
import type { createZapierSdk } from "@zapier/zapier-sdk";
import { createPage, queryDataSource } from "./notionRaw";

type Zapier = ReturnType<typeof createZapierSdk>;

export const DEFAULT_BLOCKLIST_TABLE_ID = "01KQY6RB1TJ9X7BAYBRRRKB35S";
export const DEFAULT_CONTACTS_DATA_SOURCE_ID =
	"21991b07-11ac-81a6-a894-000be4a09a67";
export const DEFAULT_NEW_CONTACT_CAP = 10;
export const DEFAULT_INTERNAL_DOMAIN = "@work.flowers";

const PRIMARY_EMAIL_PROPERTY = "Primary Email";
// Secondary Email is a multi_select on the Contacts data source, so lookups
// use `multi_select.contains` rather than `email.equals`.
const SECONDARY_EMAIL_PROPERTY = "Secondary Email";

// Notion caps compound filters at 100 conditions; each email contributes two
// (primary + secondary), so chunk lookups at 50.
const LOOKUP_CHUNK_SIZE = 50;

const AI_PROVIDER_ID = "openai";
const AI_MODEL_ID = "openai/gpt-5-mini";
const AI_AUTHENTICATION_ID = "0";

const CLASSIFIER_INSTRUCTIONS = `You are an email classifier. The "Emails" input contains one or more email addresses, one per line. For EACH email address in the list, classify whether it belongs to a real individual person or a service/organisational account, and produce one output object per input email. Preserve the original casing of the email in the Email output field.

Classify as false (service/organisational) if the address contains prefixes such as:

Generic roles: info, contact, hello, support, help, admin, administrator
No-reply patterns: noreply, no-reply, donotreply, do-not-reply
Team/group aliases: team, staff, crew, group, all, everyone
Operational: billing, accounts, finance, legal, hr, careers, jobs, recruiting, sales, marketing, press, media, pr
Technical: webmaster, postmaster, hostmaster, abuse, security, devops, it
Automated: bot, automated, notification, alerts, mailer, daemon
Classify as true (individual) if the address:

Appears to contain a personal name (e.g. john.smith@, jsmith@, j.doe@)
Uses a name with numbers that suggest a person (e.g. sarah92@)
Does not match any of the service patterns above

When uncertain, default to false. Include rationale for your decision in your output in a separate field.`;

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export interface Blocklist {
	exact: Set<string>;
	substrings: string[];
}

export interface ResolveContactsOptions {
	blocklistTableId?: string;
	contactsDataSourceId?: string;
	newContactCap?: number;
	internalDomain?: string;
}

export function extractAddresses(field: string | undefined | null): string[] {
	return (field || "")
		.split(",")
		.map((entry) => {
			const m = entry.match(EMAIL_REGEX);
			return m ? m[0].toLowerCase() : null;
		})
		.filter((e): e is string => Boolean(e));
}

function isExternal(
	email: string,
	blocklist: Blocklist,
	internalDomain: string,
): boolean {
	if (email.endsWith(internalDomain)) return false;
	if (blocklist.exact.has(email)) return false;
	for (const fragment of blocklist.substrings) {
		if (email.includes(fragment)) return false;
	}
	return true;
}

export function dedupeExternal(
	emails: string[],
	blocklist: Blocklist,
	internalDomain: string = DEFAULT_INTERNAL_DOMAIN,
): string[] {
	return [
		...new Set(
			emails
				.map((e) => e.toLowerCase())
				.filter((e) => isExternal(e, blocklist, internalDomain)),
		),
	];
}

export async function loadBlocklist(
	zapier: Zapier,
	tableId: string = DEFAULT_BLOCKLIST_TABLE_ID,
): Promise<Blocklist> {
	const { data } = await zapier.runAction({
		appKey: "TableCLIAPI",
		actionType: "search",
		actionKey: "find_record",
		inputs: {
			table_id: tableId,
			filter_count: "1",
			use_stored_order: false,
			field_data_key: "data__f2",
			operator: "in",
			lookup_value: ["exact", "substring"],
			_zap_search_success_on_miss: true,
			_zap_search_multiple_results: "group",
		},
	} as any);

	const exact = new Set<string>();
	const substrings: string[] = [];
	const rows: any[] = Array.isArray(data) ? data : data ? [data] : [];
	for (const row of rows) {
		const recordData = row?.old?.data ?? row?.new?.data ?? row?.data;
		if (!recordData) continue;
		const pattern = recordData.f1;
		const matchTypeRaw = recordData.f2;
		const matchType =
			typeof matchTypeRaw === "object" ? matchTypeRaw?.value : matchTypeRaw;
		if (!pattern || !matchType) continue;
		const normalised = String(pattern).toLowerCase();
		if (matchType === "exact") exact.add(normalised);
		else if (matchType === "substring") substrings.push(normalised);
	}
	console.log(
		`Loaded blocklist: ${exact.size} exact, ${substrings.length} substring`,
	);
	return { exact, substrings };
}

/**
 * Look up existing Contact pages by email, matching on Primary Email
 * (email property) OR Secondary Email (multi_select). Returns a
 * lowercase-email → page-id map covering both properties.
 */
export async function lookupExistingContacts(
	emails: string[],
	dataSourceId: string = DEFAULT_CONTACTS_DATA_SOURCE_ID,
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (emails.length === 0) return map;

	for (let i = 0; i < emails.length; i += LOOKUP_CHUNK_SIZE) {
		const chunk = emails.slice(i, i + LOOKUP_CHUNK_SIZE);
		const orFilters = chunk.flatMap((email) => [
			{ property: PRIMARY_EMAIL_PROPERTY, email: { equals: email } },
			{
				property: SECONDARY_EMAIL_PROPERTY,
				multi_select: { contains: email },
			},
		]);

		let cursor: string | null = null;
		do {
			const resp = await queryDataSource(dataSourceId, {
				filter: { or: orFilters },
				page_size: 100,
				...(cursor ? { start_cursor: cursor } : {}),
			});
			for (const page of resp.results ?? []) {
				const primary = page.properties?.[PRIMARY_EMAIL_PROPERTY]?.email;
				if (primary && !map.has(String(primary).toLowerCase())) {
					map.set(String(primary).toLowerCase(), page.id);
				}
				const secondary =
					page.properties?.[SECONDARY_EMAIL_PROPERTY]?.multi_select ?? [];
				for (const option of secondary) {
					const value = String(option?.name ?? "").toLowerCase();
					if (value && !map.has(value)) {
						map.set(value, page.id);
					}
				}
			}
			cursor = resp.has_more ? resp.next_cursor : null;
		} while (cursor);
	}
	return map;
}

async function classifyEmails(
	zapier: Zapier,
	emails: string[],
): Promise<Set<string>> {
	const { data } = await zapier.runAction({
		appKey: "AICLIAPI",
		actionType: "write",
		actionKey: "get_completion",
		inputs: {
			provider_id: AI_PROVIDER_ID,
			authentication_id: AI_AUTHENTICATION_ID,
			model_id: AI_MODEL_ID,
			instructions: CLASSIFIER_INSTRUCTIONS,
			inputFields: { Emails: emails.join("\n") },
			outputSchema: {
				Email:
					"The email address being classified, copied verbatim from the input.",
				"Is Individual":
					"Indicates whether the email address belongs to a real individual person (true) or a service/organisational account (false).",
				Rationale: "Brief reasoning for the classification.",
			},
			required_Email: true,
			type_Email: "text",
			"required_Is Individual": true,
			"type_Is Individual": "boolean",
			required_Rationale: true,
			type_Rationale: "text",
			isOutputArray: true,
		},
	} as any);

	const outer: any[] = Array.isArray(data) ? data : data ? [data] : [];
	const items = outer.flatMap((entry) => {
		const result = entry?.result;
		// Zapier's AI action wraps array outputs under `result.items`.
		if (Array.isArray(result?.items)) return result.items;
		if (Array.isArray(result)) return result;
		return [entry];
	});
	const individuals = new Set<string>();
	for (const item of items) {
		const verdict = item?.["Is Individual"];
		if (verdict === true || verdict === "true") {
			const email = String(item?.Email ?? "").toLowerCase().trim();
			if (email) individuals.add(email);
		}
	}
	return individuals;
}

async function createNotionContact(
	dataSourceId: string,
	email: string,
): Promise<string | null> {
	const page = await createPage({
		parent: { data_source_id: dataSourceId },
		properties: {
			[PRIMARY_EMAIL_PROPERTY]: { email },
		},
	});
	return page?.id ?? null;
}

/**
 * Resolve raw email addresses to Notion Contact page ids:
 *  1. Drop internal-domain and blocklisted addresses (Zapier table blocklist).
 *  2. Match remaining addresses against Contacts (Primary or Secondary Email).
 *  3. Classify unknown addresses (individual vs. service) with AI by Zapier.
 *  4. Create Contact pages for individuals, capped per run.
 */
export async function resolveContactPageIds(
	_notion: Client,
	zapier: Zapier,
	rawEmails: string[],
	options: ResolveContactsOptions = {},
): Promise<string[]> {
	const {
		blocklistTableId = DEFAULT_BLOCKLIST_TABLE_ID,
		contactsDataSourceId = DEFAULT_CONTACTS_DATA_SOURCE_ID,
		newContactCap = DEFAULT_NEW_CONTACT_CAP,
		internalDomain = DEFAULT_INTERNAL_DOMAIN,
	} = options;

	const blocklist = await loadBlocklist(zapier, blocklistTableId);
	const filtered = dedupeExternal(rawEmails, blocklist, internalDomain);
	if (filtered.length === 0) return [];

	const existing = await lookupExistingContacts(filtered, contactsDataSourceId);
	const existingPageIds = [
		...new Set(
			filtered
				.map((e) => existing.get(e))
				.filter((id): id is string => Boolean(id)),
		),
	];

	const newEmails = filtered
		.filter((e) => !existing.has(e))
		.slice(0, newContactCap);

	if (newEmails.length === 0) return existingPageIds;

	const individuals = await classifyEmails(zapier, newEmails);
	const toCreate = newEmails.filter((e) => individuals.has(e));

	const results = await Promise.allSettled(
		toCreate.map((email) => createNotionContact(contactsDataSourceId, email)),
	);

	const created: string[] = [];
	results.forEach((r, i) => {
		if (r.status === "fulfilled" && r.value) {
			created.push(r.value);
		} else if (r.status === "rejected") {
			console.log(
				`Creating Contact for ${toCreate[i]} failed: ${(r.reason as any)?.message ?? r.reason}`,
			);
		}
	});

	return [...existingPageIds, ...created];
}
