import { Worker } from "@notionhq/workers";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";

const worker = new Worker();
export default worker;

const LUMA_API_BASE = "https://public-api.luma.com";
// Notion Build Bar Singapore, 22 Oct 2026 — https://luma.com/buildbar-sg-oct
// (NotionSG Luma calendar). This worker is built for this one event: its
// registration questions are hard-coded below, so it is not reusable by
// swapping the ID.
const LUMA_EVENT_ID = "evt-WCXl3pOH3lRap1F";
const PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Luma API types (list guests endpoint)
// ---------------------------------------------------------------------------

type RegistrationAnswerValue =
	| string
	| boolean
	| string[]
	| { company?: string | null; job_title?: string | null }
	| null
	| undefined;

interface RegistrationAnswer {
	label: string;
	question_id: string;
	question_type: string;
	value?: RegistrationAnswerValue;
}

interface EventTicket {
	id: string;
	checked_in_at: string | null;
	event_ticket_type_id: string;
	is_captured: boolean;
	name: string;
	// Monetary fields (amount, amount_discount, amount_tax, currency) are
	// intentionally ignored — the event is free.
}

interface LumaGuest {
	id: string;
	user_id: string;
	// user_email is returned but deliberately not synced (PII).
	user_email: string;
	user_name: string | null;
	user_first_name: string | null;
	user_last_name: string | null;
	approval_status:
		| "approved"
		| "session"
		| "pending_approval"
		| "invited"
		| "declined"
		| "waitlist";
	check_in_qr_code: string;
	invited_at: string | null;
	joined_at: string | null;
	// phone_number is returned but deliberately not synced (PII).
	phone_number: string | null;
	registered_at: string | null;
	registration_answers: RegistrationAnswer[] | null;
	utm_source: string | null;
	attribution_params?: Record<string, string> | null;
	event_tickets: EventTicket[];
}

interface ListGuestsResponse {
	entries: LumaGuest[];
	has_more: boolean;
	next_cursor?: string;
}

// ---------------------------------------------------------------------------
// Registration questions, keyed on Luma's question_id (stable when the host
// rewords a label). Each answer is un-nested into its own property; the
// company question yields two (Company, Job Title).
// ---------------------------------------------------------------------------

const Q = {
	company: "nhidmktb", // What company do you work for? (+ job title)
	// 1uc5woee "What email do you use for Notion?" is deliberately not synced (PII).
	notionPlan: "ialukd7h", // What type of Notion plan are you on?
	notionExperience: "mve7yzuu", // How would you rate your experience level with Notion?
	// Why do you want to come to Build Bar? — multi-select. Since removed from
	// the form, but early registrants answered it.
	reason: "lxz8zp1m",
	helpNeeded: "r3ba361b", // What would you need help with building?
	timeSlot: "q8yif6jr", // Requested time slot for 1:1 help
	terms: "tmt4xyku", // Terms and Conditions (marketing consent)
} as const;

const NOTION_PLANS = ["Enterprise", "Business", "Plus", "Free"];
const NOTION_EXPERIENCE = [
	"Power user - I use advanced features regularly",
	"Confident - I know my way around",
	"Somewhat familiar - I know the basics",
	"Beginner - I'm just getting started",
];
const REASONS = ["I need 1:1 help", "I want to cowork", "Just checking it out"];
// "6:30-7:00PM" is a retired slot that some guests still hold.
const TIME_SLOTS = [
	"5:40-6:00PM",
	"6:00-6:20PM",
	"6:20-6:40PM",
	"6:30-7:00PM",
	"6:40-7:00PM",
	"7:00-7:20PM",
	"7:20-7:40PM",
	"7:40-8:00PM",
];

const options = (names: string[]) => names.map((name) => ({ name }));

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const guests = worker.database("buildBarSgGuests", {
	type: "managed",
	initialTitle: "Build Bar SG Registrations",
	primaryKeyProperty: "Guest ID",
	schema: {
		properties: {
			Name: Schema.title(),
			"Guest ID": Schema.richText(),
			"User ID": Schema.richText(),
			"First Name": Schema.richText(),
			"Last Name": Schema.richText(),
			"Approval Status": Schema.select([
				{ name: "approved", color: "green" },
				{ name: "session", color: "blue" },
				{ name: "pending_approval", color: "yellow" },
				{ name: "invited", color: "purple" },
				{ name: "declined", color: "red" },
				{ name: "waitlist", color: "orange" },
			]),
			"Registered At": Schema.date(),
			"Invited At": Schema.date(),
			"Joined At": Schema.date(),
			"Check-in QR Code": Schema.richText(),
			// registration_answers, un-nested
			Company: Schema.richText(),
			"Job Title": Schema.richText(),
			"Notion Plan": Schema.select(options(NOTION_PLANS)),
			"Notion Experience": Schema.select(options(NOTION_EXPERIENCE)),
			"Reason for Attending": Schema.multiSelect(options(REASONS)),
			"Help Needed": Schema.richText(),
			"1:1 Time Slot": Schema.select(options(TIME_SLOTS)),
			"Marketing Consent": Schema.checkbox(),
			// utm_source + attribution_params
			"UTM Source": Schema.richText(),
			"UTM Medium": Schema.richText(),
			"UTM Campaign": Schema.richText(),
			"UTM Content": Schema.richText(),
			// event_tickets, flattened (monetary fields ignored — event is free)
			"Ticket Names": Schema.richText(),
			"Ticket Count": Schema.number(),
			"Checked In": Schema.checkbox(),
			"Checked In At": Schema.date(),
		},
	},
});

// ---------------------------------------------------------------------------
// Pacer — Luma allows 200 req/min per calendar API key; use half the budget.
// ---------------------------------------------------------------------------

const lumaApi = worker.pacer("lumaApi", {
	allowedRequests: 100,
	intervalMs: 60_000,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_RICH_TEXT = 1_900;

function text(value: string | null | undefined) {
	const s = (value ?? "").trim();
	return Builder.richText(s.length > MAX_RICH_TEXT ? `${s.slice(0, MAX_RICH_TEXT)}…` : s);
}

/** Select option names cannot contain commas. */
function optionName(value: string): string {
	return value.replace(/,/g, "").trim();
}

function asString(value: RegistrationAnswerValue): string {
	return typeof value === "string" ? value.trim() : "";
}

function answerProperties(answers: RegistrationAnswer[] | null) {
	const byId = new Map((answers ?? []).map((a) => [a.question_id, a.value]));

	const company = byId.get(Q.company);
	const companyObj = company && typeof company === "object" && !Array.isArray(company) ? company : {};

	const reason = byId.get(Q.reason);
	const reasons = (Array.isArray(reason) ? reason : typeof reason === "string" ? [reason] : [])
		.map(optionName)
		.filter(Boolean);

	const plan = asString(byId.get(Q.notionPlan));
	const experience = asString(byId.get(Q.notionExperience));
	const timeSlot = asString(byId.get(Q.timeSlot));

	// Every property is written on every run (empty when unanswered) so a
	// guest who clears an answer on Luma is cleared in Notion too.
	return {
		Company: text(companyObj.company),
		"Job Title": text(companyObj.job_title),
		...(plan ? { "Notion Plan": Builder.select(optionName(plan)) } : {}),
		...(experience ? { "Notion Experience": Builder.select(optionName(experience)) } : {}),
		"Reason for Attending": Builder.multiSelect(...reasons),
		"Help Needed": text(asString(byId.get(Q.helpNeeded))),
		...(timeSlot ? { "1:1 Time Slot": Builder.select(optionName(timeSlot)) } : {}),
		"Marketing Consent": Builder.checkbox(byId.get(Q.terms) === true),
	};
}

async function fetchGuestsPage(cursor: string | undefined): Promise<ListGuestsResponse> {
	const apiKey = process.env.LUMA_API_KEY;
	if (!apiKey) throw new Error("LUMA_API_KEY environment variable is not set");

	const url = new URL("/v1/events/guests/list", LUMA_API_BASE);
	url.searchParams.set("event_id", LUMA_EVENT_ID);
	url.searchParams.set("pagination_limit", String(PAGE_SIZE));
	if (cursor) url.searchParams.set("pagination_cursor", cursor);

	await lumaApi.wait();
	const response = await fetch(url, {
		headers: { "x-luma-api-key": apiKey, accept: "application/json" },
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Luma API error ${response.status}: ${body.slice(0, 500)}`);
	}
	return (await response.json()) as ListGuestsResponse;
}

/**
 * Email addresses are PII and are not synced, so the title must never fall
 * back to one. Some guests' Luma name *is* their email address.
 */
function displayName(guest: LumaGuest): string {
	const candidates = [
		guest.user_name,
		[guest.user_first_name, guest.user_last_name].filter(Boolean).join(" "),
	];
	const name = candidates.map((c) => (c ?? "").trim()).find((c) => c && !c.includes("@"));
	return name ?? "(no name)";
}

function guestToChange(guest: LumaGuest) {
	const tickets = guest.event_tickets ?? [];
	const checkedInAt =
		tickets
			.map((t) => t.checked_in_at)
			.filter((t): t is string => Boolean(t))
			.sort()[0] ?? null;
	const attribution = guest.attribution_params ?? {};

	return {
		type: "upsert" as const,
		// Must stay byte-identical to the "Guest ID" value below.
		key: guest.id,
		properties: {
			Name: Builder.title(displayName(guest)),
			"Guest ID": Builder.richText(guest.id),
			"User ID": Builder.richText(guest.user_id),
			"First Name": text(guest.user_first_name),
			"Last Name": text(guest.user_last_name),
			"Approval Status": Builder.select(guest.approval_status),
			...(guest.registered_at
				? { "Registered At": Builder.dateTime(guest.registered_at) }
				: {}),
			...(guest.invited_at ? { "Invited At": Builder.dateTime(guest.invited_at) } : {}),
			...(guest.joined_at ? { "Joined At": Builder.dateTime(guest.joined_at) } : {}),
			"Check-in QR Code": text(guest.check_in_qr_code),
			...answerProperties(guest.registration_answers),
			"UTM Source": text(guest.utm_source ?? attribution.utm_source),
			"UTM Medium": text(attribution.utm_medium),
			"UTM Campaign": text(attribution.utm_campaign),
			"UTM Content": text(attribution.utm_content),
			"Ticket Names": text(tickets.map((t) => t.name).join(", ")),
			"Ticket Count": Builder.number(tickets.length),
			"Checked In": Builder.checkbox(checkedInAt !== null),
			...(checkedInAt ? { "Checked In At": Builder.dateTime(checkedInAt) } : {}),
		},
	};
}

// ---------------------------------------------------------------------------
// Sync — simple replace: the list-guests endpoint has no change tracking, and
// a single event's guest list is small. Replace mode also removes guests no
// longer returned by Luma.
//
// Credits are billed mostly per *execution* (~0.2 each), not per API call, so
// one execution drains every page rather than returning after each one. Luma
// caps pages at 50 guests whatever `pagination_limit` says, so one page per
// execution made a ~250-guest cycle cost 5 executions. The cap below only
// bounds a single execution; past it the cycle continues via `hasMore`.
// ---------------------------------------------------------------------------

const MAX_PAGES_PER_EXECUTION = 20; // ~1,000 guests

worker.sync("buildBarSgGuestsSync", {
	database: guests,
	mode: "replace",
	schedule: "15m",
	execute: async (state: { cursor?: string } | undefined) => {
		let cursor = state?.cursor;
		const entries: LumaGuest[] = [];
		for (let i = 0; i < MAX_PAGES_PER_EXECUTION; i++) {
			const page = await fetchGuestsPage(cursor);
			entries.push(...page.entries);
			cursor = page.has_more ? page.next_cursor : undefined;
			if (!cursor) break;
		}
		return {
			changes: entries.map(guestToChange),
			hasMore: cursor !== undefined,
			nextState: cursor ? { cursor } : undefined,
		};
	},
});
