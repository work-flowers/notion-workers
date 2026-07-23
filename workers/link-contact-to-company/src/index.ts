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
 * The automation posts a small JSON body containing the contact's email(s)
 * (see the recommended payload in the project notes).
 *
 * Behaviour (mirrors the old zap, minus the Zapier-Tables dependency):
 *   1. Collect the email address(es) from the webhook payload.
 *   2. Pick the first *business* email domain (skip personal providers).
 *   3. Resolve the contact page (by explicit id if provided, else by looking
 *      the email up directly in the Contacts data source).
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
		body: { properties },
	});
}

function createPage(dataSourceId: string, properties: unknown): Promise<any> {
	return notionFetch(`/pages`, {
		method: "POST",
		body: {
			parent: { type: "data_source_id", data_source_id: dataSourceId },
			properties,
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

/** An explicit contact page id, if the payload happens to carry one. Optional. */
function extractContactPageId(body: Record<string, unknown>): string | null {
	for (const key of [
		"contactPageId",
		"contactId",
		"pageId",
		"page_id",
		"pageUrl",
		"contactUrl",
		"url",
		"id",
	]) {
		const value = body[key];
		if (typeof value === "string") {
			const m = value.match(UUID_RE);
			if (m) return normalizeUuid(m[0]);
		}
	}
	return null;
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
	const emails = collectEmails(event.body ?? {}, event.rawBody ?? "");
	const explicitId = extractContactPageId(event.body ?? {});
	console.log(`${tag} emails=${JSON.stringify(emails)} pageId=${explicitId ?? "none"}`);

	if (emails.length === 0) {
		console.log(`${tag} no email in payload — skipping`);
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

	const contacts = await findContactPages(emails, explicitId);
	if (contacts.length === 0) {
		console.log(`${tag} no matching contact found — skipping`);
		return;
	}

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
