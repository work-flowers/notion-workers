import type { createZapierSdk } from "@zapier/zapier-sdk";

type Zapier = ReturnType<typeof createZapierSdk>;

/**
 * Jev (TypeSafe's typed-judgement model), called through Zapier's authenticated
 * fetch so the TypeSafe key stays in the `Jev` API-by-Zapier connection rather
 * than in this repo or the worker's env. Same connection the zapier-sdk
 * `gmail-attachments-to-drive-by-type` and `merge-duplicate-contacts` Zaps use.
 * Each call is a Zapier task plus ~$0.0001 of TypeSafe usage.
 */
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_JEV_CONNECTION_ID = "02c36cbc-669d-8c82-9c72-7b7813e5cde0";
// `jev-latest` moves when TypeSafe ships a release; the answering model is
// logged on every call so a behaviour change can be traced to a version.
const JEV_MODEL = "jev-latest";

/**
 * Below this, Type is left empty for a human to set. An empty Type is
 * recoverable at a glance; a confidently wrong one quietly skews every view
 * grouped by Type. See the README's "Meeting Type classification" section for
 * how it was chosen.
 */
export const MIN_TYPE_PROBABILITY = 0.5;

const DESCRIPTION_CAP = 1500;

/**
 * Meeting Notes `Type` option -> what it means. The keys must match the select
 * options byte-for-byte: Notion creates a new option for any unknown name. These
 * criteria are the reviewable "prompt" for this step; they're tabulated in the
 * README too, so update both together.
 */
export const TYPE_CRITERIA: Record<string, string> = {
	"1:1":
		"A one-on-one between two workFlowers team members (both on the work.flowers domain), e.g. 'Dennis x Peter', a huddle or lunch with one colleague.",
	Team: "An internal workFlowers meeting with three or more of our own team, such as the weekly team meeting or our own stand-up.",
	Client:
		"A meeting with an existing client's people about ongoing paid work: recurring syncs, stand-ups, planning or scoping sessions with the client team. Includes meetings mirrored from a client's calendar (description begins '[gcal-block]' or 'Mirrored from …').",
	Project:
		"A focused working session on one specific piece of delivery — a proposal, a test run, a rollout, a training agenda — rather than a routine client sync.",
	Discovery:
		"A first or introductory call with a potential new client to understand their needs: 'Discovery call', 'Intro call', a booked first meeting about possible work.",
	Prospect:
		"A follow-up sales conversation with a potential client already in discussion — a regroup, follow-up or options discussion about a proposal not yet won.",
	Onboarding:
		"A kick-off call that starts a newly signed client engagement.",
	"Notion Setup Session":
		"A '1:1 Notion Expert Session' booked through the Notion expert programme, where Dennis helps someone set up their Notion workspace.",
	Partner:
		"A meeting with a business partner rather than a client: a referral partner, a fellow consultant or agency, or Zapier/Notion staff about working together.",
	"Zapier Solution Partners":
		"A Zapier Solution Partner programme session: partner office hours, town halls, or partner-programme syncs run by Zapier.",
	Community:
		"A community gathering we take part in: Notion ambassador or community calls, cohort sessions, community hangouts.",
	Coffee:
		"An informal catch-up or networking chat with an external person, with no client work or sale on the table — often a booked '30min Meeting'.",
	"Product Demo":
		"A demo or walkthrough of someone's product, a vendor onboarding session, or a user-research interview about a product.",
	Training:
		"A training or enablement session delivered or attended: a walkthrough, office hours on a tool, a '101', an enablement session.",
	Webinar:
		"An online webinar, livestream or broadcast-style session with many attendees, typically on Luma, Goldcast or a Zoom webinar link.",
	Event: "An in-person event, conference, meetup or gathering attended, rather than a working meeting.",
	Vendor:
		"A meeting with a supplier or service provider to workFlowers itself: accountant, corporate secretary, subcontractor, software vendor account manager.",
	Legal: "A meeting about legal matters: contracts, agreements, or advice from a lawyer.",
};

const TYPE_QUESTION = {
	type: "choice",
	instructions:
		"workFlowers is a small Notion and Zapier automation consultancy (domain work.flowers). Which kind of meeting is `meeting`, from workFlowers' point of view, based on its calendar details and the people and CRM records linked to it?",
	criteria: TYPE_CRITERIA,
};

/** What the classifier sees about a meeting. All of it is known at enrichment time. */
export interface MeetingContext {
	title: string;
	description?: string;
	internalAttendeeCount: number;
	externalAttendees: { email: string; name?: string }[];
	companyNames: string[];
	openDealNames: string[];
}

export interface TypeClassification {
	/** The option to write, or null when the top pick is under the threshold. */
	type: string | null;
	top: string;
	probability: number;
	model: string;
}

/** The decision from a Jev response body; null when it carries no usable answer. */
export function readTypeAnswer(body: any): TypeClassification | null {
	const answer = body?.answers?.meeting_type;
	const top = answer?.choice;
	if (typeof top !== "string" || !(top in TYPE_CRITERIA)) return null;
	const probability = Number(answer?.probabilities?.[top] ?? 0);
	return {
		type: probability >= MIN_TYPE_PROBABILITY ? top : null,
		top,
		probability,
		model: String(body?.model ?? "?"),
	};
}

export function meetingState(m: MeetingContext): Record<string, unknown> {
	return {
		meeting: {
			title: m.title,
			description: m.description?.slice(0, DESCRIPTION_CAP) || "(none)",
			workflowers_attendees: m.internalAttendeeCount,
			external_attendees: m.externalAttendees.length
				? m.externalAttendees.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
				: "(none)",
			linked_companies: m.companyNames.length ? m.companyNames : "(none)",
			linked_open_deals: m.openDealNames.length ? m.openDealNames : "(none)",
		},
	};
}

/**
 * Ask Jev for the meeting's Type. Throws on any failure; the caller treats
 * classification as best-effort, since the enrichment has already been written.
 */
export async function classifyMeetingType(
	zapier: Zapier,
	meeting: MeetingContext,
): Promise<TypeClassification | null> {
	const res = await zapier.fetch(JEV_URL, {
		connection:
			process.env.ZAPIER_TYPESAFE_CONNECTION_ID || DEFAULT_JEV_CONNECTION_ID,
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: JEV_MODEL,
			state: meetingState(meeting),
			questions: { meeting_type: TYPE_QUESTION },
		}),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new Error(`Jev ${res.status}: ${text.slice(0, 500)}`);
	}
	return readTypeAnswer(JSON.parse(text));
}
