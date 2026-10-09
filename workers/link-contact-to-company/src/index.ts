import crypto from "crypto";
import { Worker, WebhookVerificationError } from "@notionhq/workers";

const worker = new Worker();
export default worker;

/**
 * Associate Contact with Company
 * ------------------------------
 * Notion-Worker replacement for the Zapier zap of the same name.
 *
 * Trigger: a Notion database automation on the Contacts data source fires a
 * "Send webhook" action when a contact's Primary or Secondary Email changes.
 * The automation should post the edited contact's page id (e.g.
 * `{ "pageId": "{{Page id}}" }`); an email-only payload is still accepted for
 * backwards compatibility.
 *
 * Behaviour (mirrors the old zap, minus the Zapier-Tables dependency):
 *   1. Resolve the contact page: by explicit page id if the payload carries
 *      one (acts on exactly the edited record), else by looking the email up
 *      in the Contacts data source.
 *   2. Determine the email(s): read straight off the resolved page when we had
 *      a page id (source of truth), else use the payload's email(s).
 *   3. Pick the first *business* email domain (skip personal providers).
 *   4. Find a Company whose Website matches that domain; create one if none.
 *   5. Link the contact to the company (append to "Related Company" if not
 *      already linked).
 *
 * The old zap's Zapier "Company IDs" lookup table, its stale-record error
 * path, and its 1-minute domain delay-queue are all gone: we query the live
 * Companies data source directly, so a match can never point at a deleted page.
 */

// --- Configuration ---------------------------------------------------------

/** Contacts data source. Trigger source + where the contact↔company link is set. */
const CONTACTS_DS = "21991b07-11ac-81a6-a894-000be4a09a67";
/** Companies data source. Looked up / created from the email domain. */
const COMPANIES_DS = "21991b07-11ac-80b0-b787-000b3d3995f6";

const NOTION_API = "https://api.notion.com/v1";
// Use the data-sources API (preferred targeting primitive since 2026-03-11).
const NOTION_VERSION = "2026-03-11";

/**
 * Personal email providers to ignore — a personal address tells us nothing
 * about which company a contact belongs to. Matched as substrings against the
 * domain, exactly like the old zap's "icontains" filters ("hotmail" therefore
 * covers hotmail.com, hotmail.co.uk, etc.).
 */
const PERSONAL_DOMAIN_TOKENS = [
	"gmail.com",
	"outlook.com",
	"yahoo.com",
	"hotmail",
	"icloud.com",
	"privaterelay.appleid.com",
];

// --- Notion REST helpers ---------------------------------------------------

function notionToken(): string {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) {
		throw new Error(
			"NOTION_API_TOKEN is not configured. Set it with `ntn workers env set NOTION_API_TOKEN=ntn_...`",
		);
	}
	return token;
}

async function notionFetch(
	path: string,
	init: { method: string; body?: unknown },
): Promise<any> {
	const res = await fetch(`${NOTION_API}${path}`, {
		method: init.method,
		headers: {
			Authorization: `Bearer ${notionToken()}`,
			"Notion-Version": NOTION_VERSION,
			"Content-Type": "application/json",
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});

	const text = await res.text();
	const data = text ? JSON.parse(text) : {};
	if (!res.ok) {
		throw new Error(
			`Notion ${init.method} ${path} -> ${res.status} ${data?.code ?? ""} ${data?.message ?? text}`.trim(),
		);
	}
	return data;
}

function queryDataSource(
	dataSourceId: string,
	filter: unknown,
	pageSize = 25,
): Promise<any> {
	return notionFetch(`/data_sources/${dataSourceId}/query`, {
		method: "POST",
		body: { filter, page_size: pageSize },
	});
}

function retrievePage(pageId: string): Promise<any> {
	return notionFetch(`/pages/${pageId}`, { method: "GET" });
}

function updatePage(pageId: string, properties: unknown): Promise<any> {
	return notionFetch(`/pages/${pageId}`, {
		method: "PATCH",
		// Silent: suppresses page-update notifications for the change.
		body: { properties, notifications: { mode: "silent" } },
	});
}

function createPage(dataSourceId: string, properties: unknown): Promise<any> {
	return notionFetch(`/pages`, {
		method: "POST",
		body: {
			parent: { type: "data_source_id", data_source_id: dataSourceId },
			properties,
			notifications: { mode: "silent" },
		},
	});
}

// --- Email / domain parsing ------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;
const UUID_RE =
	/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;

function normalizeUuid(raw: string): string {
	const h = raw.replace(/-/g, "").toLowerCase();
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** The domain portion of an email address, lowercased. "" if not an email. */
function emailDomain(email: string): string {
	const at = email.lastIndexOf("@");
	if (at < 0) return "";
	return email
		.slice(at + 1)
		.trim()
		.toLowerCase()
		.replace(/[>.,;)\]]+$/, "");
}

function isPersonalDomain(domain: string): boolean {
	return PERSONAL_DOMAIN_TOKENS.some((token) => domain.includes(token));
}

/**
 * Pull every email address out of the webhook payload, in priority order:
 * Primary-Email fields first, then Secondary-Email fields, then anything else
 * found anywhere in the JSON, then the raw request body as a last resort.
 * De-duplicated while preserving first-seen order.
 */
function collectEmails(body: Record<string, unknown>, rawBody: string): string[] {
	const ordered: string[] = [];

	const pushFrom = (value: unknown): void => {
		if (typeof value !== "string") return;
		const matches = value.match(EMAIL_RE);
		if (matches) for (const m of matches) ordered.push(m.toLowerCase());
	};

	const pushField = (value: unknown): void => {
		if (Array.isArray(value)) value.forEach(pushFrom);
		else pushFrom(value);
	};

	// 1. Primary-email fields (highest priority).
	for (const key of ["primaryEmail", "primary_email", "email"]) {
		pushField(body[key]);
	}
	// 2. Secondary-email fields.
	for (const key of ["secondaryEmail", "secondary_email", "secondaryEmails", "emails"]) {
		pushField(body[key]);
	}
	// 3. Recursively scan the rest of the structured body.
	const scan = (value: unknown): void => {
		if (typeof value === "string") pushFrom(value);
		else if (Array.isArray(value)) value.forEach(scan);
		else if (value && typeof value === "object") Object.values(value).forEach(scan);
	};
	scan(body);
	// 4. Fall back to the raw body (handles non-JSON / unexpected encodings).
	pushFrom(rawBody);

	return [...new Set(ordered)];
}

/**
 * Read the contact's email address(es) directly off a retrieved page, in
 * priority order (Primary first, then Secondary). This is the source of truth
 * when the webhook resolves a contact by page id, so the automation only needs
 * to send the page id — not the email. Mirrors the Contacts schema: "Primary
 * Email" is an `email` property, "Secondary Email" is a `multi_select` whose
 * option names are addresses.
 */
function emailsFromContactPage(page: any): string[] {
	const props = page?.properties ?? {};
	const ordered: string[] = [];

	const primary = props["Primary Email"]?.email;
	if (typeof primary === "string") {
		const m = primary.match(EMAIL_RE);
		if (m) for (const email of m) ordered.push(email.toLowerCase());
	}

	const secondary = props["Secondary Email"]?.multi_select;
	if (Array.isArray(secondary)) {
		for (const option of secondary) {
			if (typeof option?.name !== "string") continue;
			const m = option.name.match(EMAIL_RE);
			if (m) for (const email of m) ordered.push(email.toLowerCase());
		}
	}

	return [...new Set(ordered)];
}

const CONTACT_ID_KEYS = [
	"contactPageId",
	"contactId",
	"pageId",
	"page_id",
	"pageUrl",
	"contactUrl",
	"url",
	"id",
];

/** First value under `keys` that contains a UUID, normalized. */
function pageIdFromRecord(
	record: Record<string, unknown>,
	keys: string[],
): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string") {
			const m = value.match(UUID_RE);
			if (m) return normalizeUuid(m[0]);
		}
	}
	return null;
}

/**
 * The triggering contact's page id. Notion's automation "Send webhook" action
 * nests the page under `data` ({ "object": "page", "id": "<page-id>", ... }),
 * so we check there first; a custom body may instead carry the id at the top
 * level (e.g. `{ "pageId": "..." }`). Returns null if no page id is present.
 */
function extractContactPageId(body: Record<string, unknown>): string | null {
	// Notion's default envelope: the triggering page lives under `data`.
	const data = body["data"];
	if (data && typeof data === "object" && !Array.isArray(data)) {
		const d = data as Record<string, unknown>;
		if (d["object"] === "page" && typeof d["id"] === "string") {
			const m = d["id"].match(UUID_RE);
			if (m) return normalizeUuid(m[0]);
		}
		const nested = pageIdFromRecord(d, ["pageId", "page_id", "contactPageId"]);
		if (nested) return nested;
	}
	// A custom automation body may put the id at the top level instead.
	return pageIdFromRecord(body, CONTACT_ID_KEYS);
}

// --- CRM operations --------------------------------------------------------

/** Build an OR filter that matches a contact by any of its email addresses. */
function contactEmailFilter(emails: string[]): unknown {
	const or = emails.flatMap((email) => [
		{ property: "Primary Email", email: { equals: email } },
		{ property: "Secondary Email", multi_select: { contains: email } },
	]);
	return or.length === 1 ? or[0] : { or };
}

async function findContactPages(
	emails: string[],
	explicitId: string | null,
): Promise<any[]> {
	if (explicitId) {
		try {
			return [await retrievePage(explicitId)];
		} catch (err) {
			console.warn(`Could not retrieve page ${explicitId}: ${String(err)}`);
		}
	}
	// No page id (or its retrieval failed): fall back to an email lookup. With
	// no emails there's nothing to look up — avoid an empty-OR filter.
	if (emails.length === 0) return [];
	const res = await queryDataSource(CONTACTS_DS, contactEmailFilter(emails), 25);
	return res.results ?? [];
}

/** First Company whose Website contains the domain, or null. */
async function findCompanyByDomain(domain: string): Promise<any | null> {
	const res = await queryDataSource(
		COMPANIES_DS,
		{ property: "Website", url: { contains: domain } },
		5,
	);
	return res.results?.[0] ?? null;
}

/** Create a Company carrying just the Website (parity with the old zap). */
function createCompany(domain: string): Promise<any> {
	return createPage(COMPANIES_DS, { Website: { url: domain } });
}

/**
 * Append the company to the contact's "Related Company" relation if it isn't
 * already there. Returns true if a write happened. The relation is two-way, so
 * this also surfaces on the company's "Contacts" side.
 */
async function linkContactToCompany(
	contact: any,
	companyId: string,
): Promise<boolean> {
	const current: Array<{ id: string }> =
		contact.properties?.["Related Company"]?.relation ?? [];
	const target = normalizeUuid(companyId);
	if (current.some((rel) => normalizeUuid(rel.id) === target)) {
		return false;
	}
	const relation = [...current.map((rel) => ({ id: rel.id })), { id: companyId }];
	await updatePage(contact.id, { "Related Company": { relation } });
	return true;
}

// --- Webhook security (optional shared secret) -----------------------------

/**
 * If WEBHOOK_SECRET is set, require the automation to send a matching token in
 * an `X-Webhook-Token` (or `Authorization: Bearer`) header. If it's not set,
 * we rely on the secrecy of the webhook URL alone.
 */
function verifyWebhook(headers: Record<string, string>): void {
	const secret = process.env.WEBHOOK_SECRET;
	if (!secret) return;

	const bearer = headers["authorization"]?.replace(/^Bearer\s+/i, "");
	const provided = headers["x-webhook-token"] ?? bearer ?? "";

	const a = Buffer.from(provided);
	const b = Buffer.from(secret);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
		throw new WebhookVerificationError("Invalid webhook token");
	}
}

// --- Handler ---------------------------------------------------------------

async function handleEvent(event: {
	deliveryId: string;
	body: Record<string, unknown>;
	rawBody: string;
}): Promise<void> {
	const tag = `[${event.deliveryId}]`;
	const explicitId = extractContactPageId(event.body ?? {});
	const payloadEmails = collectEmails(event.body ?? {}, event.rawBody ?? "");

	// Structural log (no values) to confirm the webhook envelope shape.
	const data = (event.body ?? {})["data"];
	console.log(
		`${tag} bodyKeys=${JSON.stringify(Object.keys(event.body ?? {}))}` +
			(data && typeof data === "object"
				? ` dataKeys=${JSON.stringify(Object.keys(data as object))}`
				: ""),
	);

	// Resolve the contact first. With a page id we act on exactly the edited
	// page; without one we fall back to an email lookup against the payload.
	const contacts = await findContactPages(payloadEmails, explicitId);
	if (contacts.length === 0) {
		console.log(`${tag} no matching contact found — skipping`);
		return;
	}

	// Emails used to resolve the company domain. When we resolved by page id the
	// page itself is the source of truth (the payload need only carry the id);
	// otherwise the payload emails are all we have.
	const emails = explicitId
		? contacts.flatMap(emailsFromContactPage)
		: payloadEmails;
	console.log(`${tag} emails=${JSON.stringify(emails)} pageId=${explicitId ?? "none"}`);

	if (emails.length === 0) {
		console.log(`${tag} no email found on contact — skipping`);
		return;
	}

	// Pick the first business domain (personal providers tell us nothing).
	let domain = "";
	for (const email of emails) {
		const d = emailDomain(email);
		if (d && !isPersonalDomain(d)) {
			domain = d;
			break;
		}
	}
	if (!domain) {
		console.log(`${tag} only personal/blank domains — skipping`);
		return;
	}
	console.log(`${tag} business domain = ${domain}`);

	let company = await findCompanyByDomain(domain);
	if (company) {
		console.log(`${tag} matched company ${company.id}`);
	} else {
		company = await createCompany(domain);
		console.log(`${tag} created company ${company.id} for ${domain}`);
	}

	for (const contact of contacts) {
		const linked = await linkContactToCompany(contact, company.id);
		console.log(
			`${tag} contact ${contact.id} ${linked ? "linked to" : "already linked to"} company ${company.id}`,
		);
	}
}

worker.webhook("onContactEmailUpdated", {
	title: "Contact Email Updated",
	description:
		"Associates a contact with a company based on their business email domain. Triggered by a Notion database automation on the Contacts data source when Primary or Secondary Email changes.",
	execute: async (events) => {
		for (const event of events) {
			verifyWebhook(event.headers);
			await handleEvent(event);
		}
	},
});
