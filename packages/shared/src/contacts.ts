import type { Client } from "@notionhq/client";
import type { createZapierSdk } from "@zapier/zapier-sdk";
import { createPage, queryDataSource } from "./notionRaw";

type Zapier = ReturnType<typeof createZapierSdk>;

export const DEFAULT_BLOCKLIST_TABLE_ID = "01KQY6RB1TJ9X7BAYBRRRKB35S";
export const DEFAULT_CONTACTS_DATA_SOURCE_ID =
	"21991b07-11ac-81a6-a894-000be4a09a67";
export const DEFAULT_NEW_CONTACT_CAP = 10;
export const DEFAULT_INTERNAL_DOMAIN = "@work.flowers";

const NAME_PROPERTY = "Name";
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

// These addresses come from calendar attendee lists and email headers, so the
// overwhelming majority belong to real people who accepted an invite or wrote a
// message. The prompt is therefore shaped as a role-account *blocklist* that
// defaults to true. The earlier version asked the model to prove the local part
// looked like a personal name and defaulted to false when unsure, which quietly
// refused to create Contacts for anyone whose name gpt-5-mini didn't recognise
// (`migas@nus.edu.sg` — Migas Huang Junwei — on 2026-08-03), and did so
// systematically for non-Anglophone given names.
const CLASSIFIER_INSTRUCTIONS = `You are classifying email addresses harvested from calendar invitations and email headers. Almost every address in this input belongs to a real person, so true is the default answer.

The "Emails" input has one entry per line, formatted either as \`email\` or as \`email — Display Name\` when a display name was available from the source. For EACH line, produce exactly one output object. Preserve the email's original casing in the Email output field, and do not include the display name in that field.

Classify as false (service/organisational) ONLY when the local part — the text before the @ — is clearly a role, group, or automated mailbox rather than a person. These are the patterns that qualify:

Generic roles: info, contact, hello, hi, enquiries, inquiries, admin, administrator, office, reception
No-reply: noreply, no-reply, donotreply, do-not-reply, bounce, mailer-daemon
Team/group aliases: team, staff, crew, group, all, everyone, members, partners
Operational: billing, invoices, accounts, accounting, finance, payroll, legal, hr, careers, jobs, recruiting, sales, marketing, press, media
Technical: webmaster, postmaster, hostmaster, abuse, security, devops, sysadmin, noc, it-support
Automated: bot, automated, notification, notifications, alerts, alert, mailer, daemon, system, updates, newsletter, digest

Otherwise classify as true. In particular:

A display name that reads like a person's name is strong evidence for true, whatever the local part looks like.
Do NOT answer false merely because the local part is short, is initials, is a username or handle, contains digits, or is a name you do not recognise. Personal names come from every language and writing system, and an unfamiliar local part is still a person.
When you are genuinely uncertain and no role pattern above matches, answer true.

Include a brief rationale for each decision in a separate field.`;

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export interface Blocklist {
	exact: Set<string>;
	substrings: string[];
}

/**
 * An address plus the display name the source attached to it (a calendar
 * attendee's `displayName`, a Notion person's `name`, a mail header's phrase).
 * The name is optional and only ever helps: it steers the individual-vs-service
 * classification and becomes the new Contact's title.
 */
export interface EmailCandidate {
	email: string;
	name?: string;
}

/** Callers may pass bare addresses or addresses carrying a display name. */
export type EmailInput = string | EmailCandidate;

/**
 * Collapse mixed `string | EmailCandidate` input to a lowercase-email → name
 * map. The first non-empty name wins, so a named source (calendar) beats a
 * later bare mention of the same address.
 */
function normaliseCandidates(inputs: EmailInput[]): Map<string, string | undefined> {
	const byEmail = new Map<string, string | undefined>();
	for (const input of inputs) {
		const raw = typeof input === "string" ? input : input?.email;
		if (!raw) continue;
		const email = String(raw).toLowerCase().trim();
		if (!email) continue;
		const name =
			typeof input === "string" ? undefined : input?.name?.trim() || undefined;
		const existing = byEmail.get(email);
		if (!byEmail.has(email) || (!existing && name)) {
			byEmail.set(email, name);
		}
	}
	return byEmail;
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

interface ClassifierVerdict {
	email: string;
	isIndividual: boolean;
	rationale: string;
}

async function classifyEmails(
	zapier: Zapier,
	candidates: Map<string, string | undefined>,
): Promise<ClassifierVerdict[]> {
	// One line per address, with the display name appended when we have one —
	// the prompt treats a person-shaped display name as strong evidence.
	const lines = [...candidates].map(([email, name]) =>
		name ? `${email} — ${name}` : email,
	);

	const { data } = await zapier.runAction({
		appKey: "AICLIAPI",
		actionType: "write",
		actionKey: "get_completion",
		inputs: {
			provider_id: AI_PROVIDER_ID,
			authentication_id: AI_AUTHENTICATION_ID,
			model_id: AI_MODEL_ID,
			instructions: CLASSIFIER_INSTRUCTIONS,
			inputFields: { Emails: lines.join("\n") },
			outputSchema: {
				Email:
					"The email address being classified, copied verbatim from the input. Exclude any display name.",
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
		// Zapier's AI action wraps array outputs under `result.items`, or
		// occasionally under `result` / `items` directly.
		if (Array.isArray(result?.items)) return result.items;
		if (Array.isArray(result)) return result;
		if (Array.isArray(entry?.items)) return entry.items;
		return [entry];
	});

	const verdicts: ClassifierVerdict[] = [];
	for (const item of items) {
		const email = String(item?.Email ?? "")
			.toLowerCase()
			.trim();
		if (!email) continue;
		const raw = item?.["Is Individual"];
		verdicts.push({
			email,
			isIndividual: raw === true || raw === "true",
			rationale: String(item?.Rationale ?? "").trim(),
		});
	}
	return verdicts;
}

async function createNotionContact(
	dataSourceId: string,
	email: string,
	name?: string,
): Promise<string | null> {
	const properties: Record<string, any> = {
		[PRIMARY_EMAIL_PROPERTY]: { email },
	};
	// Without this the Contact's title stays empty and the row reads as its own
	// email address in every view and relation.
	if (name) {
		properties[NAME_PROPERTY] = {
			title: [{ type: "text", text: { content: name.slice(0, 2000) } }],
		};
	}
	const page = await createPage({
		parent: { data_source_id: dataSourceId },
		properties,
	});
	return page?.id ?? null;
}

/**
 * Resolve raw email addresses to Notion Contact page ids:
 *  1. Drop internal-domain and blocklisted addresses (Zapier table blocklist).
 *  2. Match remaining addresses against Contacts (Primary or Secondary Email).
 *  3. Classify unknown addresses (individual vs. service) with AI by Zapier.
 *  4. Create Contact pages for individuals, capped per run.
 *
 * Accepts bare address strings or `{ email, name }` candidates; a display name
 * improves the step-3 classification and becomes the new Contact's title.
 *
 * Every address this drops is logged with the reason. Each stage here can
 * silently swallow an address, and when one did (see CLASSIFIER_INSTRUCTIONS)
 * the only evidence in the run log was a contact count that looked plausible.
 */
export async function resolveContactPageIds(
	_notion: Client,
	zapier: Zapier,
	rawEmails: EmailInput[],
	options: ResolveContactsOptions = {},
): Promise<string[]> {
	const {
		blocklistTableId = DEFAULT_BLOCKLIST_TABLE_ID,
		contactsDataSourceId = DEFAULT_CONTACTS_DATA_SOURCE_ID,
		newContactCap = DEFAULT_NEW_CONTACT_CAP,
		internalDomain = DEFAULT_INTERNAL_DOMAIN,
	} = options;

	const candidates = normaliseCandidates(rawEmails);
	if (candidates.size === 0) {
		console.log("No email addresses to resolve.");
		return [];
	}

	const blocklist = await loadBlocklist(zapier, blocklistTableId);
	const filtered = dedupeExternal(
		[...candidates.keys()],
		blocklist,
		internalDomain,
	);

	const excluded = [...candidates.keys()].filter((e) => !filtered.includes(e));
	if (excluded.length > 0) {
		console.log(
			`Excluded ${excluded.length} internal/blocklisted address(es): ${excluded.join(", ")}`,
		);
	}
	if (filtered.length === 0) return [];
	console.log(`Resolving ${filtered.length} address(es): ${filtered.join(", ")}`);

	const existing = await lookupExistingContacts(filtered, contactsDataSourceId);
	const existingPageIds = [
		...new Set(
			filtered
				.map((e) => existing.get(e))
				.filter((id): id is string => Boolean(id)),
		),
	];

	const unknown = filtered.filter((e) => !existing.has(e));
	console.log(
		`Matched ${existingPageIds.length} existing Contact(s); ${unknown.length} address(es) unknown.`,
	);

	const newEmails = unknown.slice(0, newContactCap);
	if (newEmails.length < unknown.length) {
		console.log(
			`newContactCap=${newContactCap} reached; deferring ${unknown.length - newEmails.length} address(es): ${unknown.slice(newContactCap).join(", ")}`,
		);
	}
	if (newEmails.length === 0) return existingPageIds;

	const newCandidates = new Map(
		newEmails.map((email) => [email, candidates.get(email)] as const),
	);
	const verdicts = await classifyEmails(zapier, newCandidates);

	for (const v of verdicts) {
		console.log(
			`Classifier: ${v.email} → ${v.isIndividual ? "individual" : "service/organisational"}${v.rationale ? ` (${v.rationale})` : ""}`,
		);
	}

	const individuals = new Set(
		verdicts.filter((v) => v.isIndividual).map((v) => v.email),
	);
	// An address the classifier never returned a verdict for is dropped just as
	// silently as one it rejected, so call the two out separately.
	const unjudged = newEmails.filter(
		(e) => !verdicts.some((v) => v.email === e),
	);
	if (unjudged.length > 0) {
		console.log(
			`Classifier returned no verdict for ${unjudged.length} address(es); not creating Contacts for: ${unjudged.join(", ")}`,
		);
	}
	const rejected = newEmails.filter(
		(e) => !individuals.has(e) && !unjudged.includes(e),
	);
	if (rejected.length > 0) {
		console.log(
			`Skipped ${rejected.length} address(es) classified as service/organisational: ${rejected.join(", ")}`,
		);
	}

	const toCreate = newEmails.filter((e) => individuals.has(e));
	const results = await Promise.allSettled(
		toCreate.map((email) =>
			createNotionContact(
				contactsDataSourceId,
				email,
				newCandidates.get(email),
			),
		),
	);

	const created: string[] = [];
	results.forEach((r, i) => {
		const email = toCreate[i];
		if (r.status === "fulfilled" && r.value) {
			created.push(r.value);
			const name = newCandidates.get(email);
			console.log(
				`Created Contact ${r.value} for ${email}${name ? ` (${name})` : " (no display name available)"}`,
			);
		} else if (r.status === "rejected") {
			console.log(
				`Creating Contact for ${email} failed: ${(r.reason as any)?.message ?? r.reason}`,
			);
		} else {
			console.log(`Creating Contact for ${email} returned no page id.`);
		}
	});

	return [...existingPageIds, ...created];
}
