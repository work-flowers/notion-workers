import type { Client } from "@notionhq/client";
import type { createZapierSdk } from "@zapier/zapier-sdk";
import {
	DEFAULT_INTERNAL_DOMAIN,
	type EmailCandidate,
	extractAddresses,
	resolveContactPageIds,
	retrieveDataSource,
} from "@work-flowers/notion-worker-shared";
import { classifyMeetingType } from "./classifyMeetingType";
import { findCalendarEvent, type CalendarEvent } from "./googleCalendar";
import { upsertMeetingNoteIdRow } from "./meetingNoteIdsTable";
import { waitForMeetingNotesBlock } from "./meetingNotesBlock";

type Zapier = ReturnType<typeof createZapierSdk>;

interface AutomationPayload {
	pageId?: string;
	page_id?: string;
	data?: { id?: string };
	source?: { id?: string };
	[k: string]: unknown;
}

function extractPageId(body: unknown): string | null {
	if (!body || typeof body !== "object") return null;
	const b = body as AutomationPayload;
	return (
		b.pageId ??
		b.page_id ??
		b.data?.id ??
		b.source?.id ??
		null
	);
}

/**
 * Notion's Google Calendar integration names a meeting note's parent page
 * `<event summary> <ISO start timestamp>` — e.g.
 * `[ZC26 Session Recording] … weigh in 2026-09-03T21:30:00.000+08:00`. Stripping
 * that trailing timestamp recovers the event summary byte-for-byte, which the
 * `meeting_notes` block title does NOT give us: the block title stays Notion's
 * placeholder (`Meeting <date>`) until the meeting happens, so it can't
 * disambiguate same-start events for notes enriched ahead of time. The page
 * title carries the real summary from creation, in both phases.
 *
 * The trailing token may be a full datetime (with optional fractional seconds
 * and `Z`/`±HH:MM` offset) or a bare date for all-day events; anything else is
 * left untouched, so a manually-titled page passes through unchanged.
 */
const TRAILING_TIMESTAMP =
	/\s+\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function stripTrailingTimestamp(title: string): string {
	return title.replace(TRAILING_TIMESTAMP, "").trim();
}

function titleOf(page: any): string | null {
	for (const prop of Object.values(page?.properties ?? {})) {
		if ((prop as any)?.type === "title") {
			const text = ((prop as any).title ?? [])
				.map((t: any) => t.plain_text ?? "")
				.join("");
			return text || null;
		}
	}
	return null;
}

/**
 * The page's title and current `Type`. A null result means the page couldn't
 * be read, which callers treat as "title unknown, Type unknown" — classification
 * then stays off rather than risk overwriting a Type someone set.
 */
async function fetchPage(
	notion: Client,
	pageId: string,
): Promise<{ title: string | null; type: string | null } | null> {
	let page: any;
	try {
		page = await notion.pages.retrieve({ page_id: pageId });
	} catch (err) {
		console.log(
			`Could not read page ${pageId}: ${(err as Error)?.message ?? err}`,
		);
		return null;
	}
	return {
		title: titleOf(page),
		type: page?.properties?.["Type"]?.select?.name ?? null,
	};
}

/** Titles of related pages, for classifier context. Unreadable pages are skipped. */
async function pageTitles(notion: Client, pageIds: string[]): Promise<string[]> {
	const titles: string[] = [];
	for (const id of pageIds) {
		try {
			const title = titleOf(await notion.pages.retrieve({ page_id: id }));
			if (title) titles.push(title);
		} catch (err) {
			console.log(
				`Could not read title of ${id}: ${(err as Error)?.message ?? err}`,
			);
		}
	}
	return titles;
}

function stripHtml(html: string): string {
	return html
		.replace(/<\s*br\s*\/?\s*>/gi, "\n")
		.replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

const BARE_EMAIL_LINE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

/**
 * Cal.com-booked events list each attendee's name on its own line immediately
 * above their email in the description's "Who:" block, e.g.:
 *   Who:
 *   Dennis Chiuten - Organizer
 *   dennis@work.flowers
 *   Sam Douglass
 *   info@kbdwellness.com.au
 * Google Calendar's attendee objects don't carry a displayName for guests who
 * booked through a business inbox (`info@kbdwellness.com.au` for Sam
 * Douglass), so the classifier only ever saw the bare address and rejected it
 * as a role account. This recovers the name from that free-text block as a
 * fallback when the attendee object itself has none. (Learned 2026-08-14.)
 */
function parseDescriptionAttendeeNames(description: string): Map<string, string> {
	const names = new Map<string, string>();
	const cleaned = stripHtml(description);
	const whoMatch = cleaned.match(/(?:^|\n)Who:\n([\s\S]*?)(?:\n\n|$)/);
	if (!whoMatch) return names;

	const lines = whoMatch[1]
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	let pendingName: string | null = null;
	for (const line of lines) {
		if (BARE_EMAIL_LINE.test(line)) {
			if (pendingName) names.set(line.toLowerCase(), pendingName);
			pendingName = null;
		} else {
			pendingName = line.replace(/\s*-\s*Organizer\s*$/i, "").trim();
		}
	}
	return names;
}

interface ResolvedAttendees {
	/** Notion user IDs of internal-domain attendees (for the people property). */
	internalUserIds: string[];
	/** Emails of internal-domain attendees (candidates for calendar impersonation). */
	internalEmails: string[];
	/** External attendees resolvable through Notion (members/guests), with names. */
	externalContacts: EmailCandidate[];
	/** Attendee user IDs the integration could not resolve (non-guests). */
	unresolvedCount: number;
}

/**
 * Resolve meeting_notes attendee Notion user IDs to workspace people.
 * Only workspace members and guests are visible to the integration;
 * anyone else counts as unresolved and must come from the calendar event.
 */
async function resolveAttendees(
	notion: Client,
	attendeeUserIds: string[],
): Promise<ResolvedAttendees> {
	const internalUserIds = new Set<string>();
	const internalEmails = new Set<string>();
	const externalContacts = new Map<string, EmailCandidate>();
	let unresolvedCount = 0;

	for (const userId of attendeeUserIds) {
		let user: any;
		try {
			user = await notion.users.retrieve({ user_id: userId });
		} catch (err) {
			unresolvedCount++;
			console.log(
				`Could not resolve attendee ${userId}: ${(err as Error)?.message ?? err}`,
			);
			continue;
		}
		if (user?.type !== "person") continue;
		const email = String(user.person?.email ?? "").toLowerCase();
		if (!email) continue;
		if (email.endsWith(DEFAULT_INTERNAL_DOMAIN)) {
			internalUserIds.add(user.id);
			internalEmails.add(email);
		} else {
			externalContacts.set(email, {
				email,
				name: String(user.name ?? "").trim() || undefined,
			});
		}
	}

	return {
		internalUserIds: [...internalUserIds],
		internalEmails: [...internalEmails],
		externalContacts: [...externalContacts.values()],
		unresolvedCount,
	};
}

/**
 * Copy each Contact's `Related Company` and `Deals` relations so they can be
 * written onto the Meeting Note's own `Companies` / `Deals` properties. The
 * native "link Deals/Companies from Contacts" DB automation doesn't fire on
 * this worker's API-driven update (same reason the icon sync below is an
 * explicit webhook call), so the worker does the linking itself.
 *
 * Deals are filtered to open stages only — see filterOpenDeals.
 *
 * `pages.retrieve` returns at most 25 refs per relation — ample for one
 * Contact's companies and deals. Contacts created moments ago by
 * resolveContactPageIds usually have neither relation yet (the
 * link-contact-to-company worker fills Related Company asynchronously), so
 * an empty result for a brand-new Contact is normal, not an error.
 */
async function collectContactRelations(
	notion: Client,
	contactPageIds: string[],
): Promise<{ companyIds: string[]; dealIds: string[] }> {
	const companyIds = new Set<string>();
	const dealIds = new Set<string>();
	for (const contactId of contactPageIds) {
		let page: any;
		try {
			page = await notion.pages.retrieve({ page_id: contactId });
		} catch (err) {
			console.log(
				`Could not read relations from Contact ${contactId}: ${(err as Error)?.message ?? err}`,
			);
			continue;
		}
		for (const rel of page?.properties?.["Related Company"]?.relation ?? []) {
			if (rel?.id) companyIds.add(rel.id);
		}
		for (const rel of page?.properties?.["Deals"]?.relation ?? []) {
			if (rel?.id) dealIds.add(rel.id);
		}
	}
	return {
		companyIds: [...companyIds],
		dealIds: await filterOpenDeals(notion, [...dealIds]),
	};
}

/** work.flowers CRM Deals data source (Core CRM Objects → Deals). */
const DEALS_DATA_SOURCE_ID = "21a91b07-11ac-808d-9657-000b1390d20b";

/**
 * Names of the Deal Status options in the status property's "Complete" group
 * (currently Closed Won / Closed Lost / Declined). Read from the schema on
 * each run rather than hardcoded, so a status later added to the group is
 * picked up with no code change. Returns null when the schema can't be read
 * or parsed; callers must treat null as "don't filter".
 */
async function closedDealStatusNames(): Promise<Set<string> | null> {
	let ds: { properties?: Record<string, any> };
	try {
		ds = await retrieveDataSource(DEALS_DATA_SOURCE_ID);
	} catch (err) {
		console.log(
			`Could not read Deals schema: ${(err as Error)?.message ?? err}`,
		);
		return null;
	}
	const status = ds.properties?.["Status"]?.status;
	const complete = (status?.groups ?? []).find(
		(g: any) => String(g?.name ?? "").toLowerCase() === "complete",
	);
	if (!complete) {
		console.log(
			'Deals Status property has no "Complete" group; not filtering deals.',
		);
		return null;
	}
	const optionIds = new Set<string>(complete.option_ids ?? []);
	const names = new Set<string>();
	for (const opt of status?.options ?? []) {
		if (opt?.id && optionIds.has(opt.id) && opt?.name) names.add(opt.name);
	}
	return names.size > 0 ? names : null;
}

/**
 * Drop deals whose Status sits in the "Complete" group, so a meeting note
 * only links deals that are still open. Every uncertainty fails open —
 * schema unreadable, deal page unreadable, Status empty — because linking a
 * closed deal is a cosmetic nuisance, while silently dropping an open one
 * loses the meeting from that deal's timeline.
 */
async function filterOpenDeals(
	notion: Client,
	dealIds: string[],
): Promise<string[]> {
	if (dealIds.length === 0) return dealIds;
	const closed = await closedDealStatusNames();
	if (!closed) return dealIds;
	const open: string[] = [];
	for (const dealId of dealIds) {
		let statusName: string | undefined;
		try {
			const page: any = await notion.pages.retrieve({ page_id: dealId });
			statusName = page?.properties?.["Status"]?.status?.name;
		} catch (err) {
			console.log(
				`Could not read Status of Deal ${dealId}; keeping it: ${(err as Error)?.message ?? err}`,
			);
			open.push(dealId);
			continue;
		}
		if (statusName && closed.has(statusName)) {
			console.log(`Skipping closed deal ${dealId} (${statusName}).`);
		} else {
			open.push(dealId);
		}
	}
	return open;
}

export async function handlePageCreated(
	body: unknown,
	{ notion, zapier }: { notion: Client; zapier: Zapier },
): Promise<void> {
	const pageId = extractPageId(body);
	if (!pageId) {
		console.log("No pageId in webhook payload; skipping.", body);
		return;
	}

	console.log(`Processing Meeting Note page ${pageId}`);

	const meetingNotesBlock = await waitForMeetingNotesBlock(notion, pageId);
	if (!meetingNotesBlock) {
		console.log(`No meeting_notes block with start_time found on ${pageId}`);
		return;
	}

	const { start_time, end_time, attendees = [] } =
		meetingNotesBlock.calendar_event;
	console.log(
		`meeting_notes block found: title="${meetingNotesBlock.title}", start=${start_time}, attendees=${attendees.length}`,
	);

	const { internalUserIds, internalEmails, externalContacts, unresolvedCount } =
		await resolveAttendees(notion, attendees);

	// The Notion users API only resolves workspace members and guests. The
	// calendar event — read from an internal attendee's calendar via the
	// domain-wide-delegated service account — supplies everyone else's email,
	// plus event metadata (call link, description, iCalUID).
	// The `meeting_notes` block title is a placeholder until the meeting runs, so
	// disambiguate same-start calendar events on the parent page title instead —
	// it holds the event summary (plus a trailing ISO timestamp) from creation.
	// Fall back to the block title if the page title can't be read.
	const page = await fetchPage(notion, pageId);
	const pageTitle = page?.title ?? null;
	const eventTitle =
		(pageTitle && stripTrailingTimestamp(pageTitle)) || meetingNotesBlock.title;
	if (pageTitle) {
		console.log(`Disambiguation title (from page): "${eventTitle}"`);
	}

	let event: CalendarEvent | null = null;
	const subject = internalEmails[0];
	if (subject) {
		try {
			event = await findCalendarEvent(subject, start_time, eventTitle);
			if (!event) {
				console.log(
					`No calendar event titled "${eventTitle}" at ${start_time} on ${subject}'s calendar`,
				);
			}
		} catch (err) {
			console.log(
				`Calendar lookup failed (${subject}): ${(err as Error)?.message ?? err}`,
			);
		}
	} else {
		console.log("No internal attendee resolved; skipping calendar lookup.");
	}
	if (unresolvedCount > 0 && !event) {
		console.log(
			`${unresolvedCount} attendee(s) unresolved and no calendar event found; Contacts may be incomplete.`,
		);
	}

	// Keep each attendee's calendar `displayName` alongside their address: it is
	// what tells the classifier `migas@nus.edu.sg` is Migas Huang Junwei, and it
	// becomes the new Contact's title.
	const descriptionNames = event?.description
		? parseDescriptionAttendeeNames(event.description)
		: new Map<string, string>();
	const eventCandidates: EmailCandidate[] = event
		? [
				{ email: event.organizer?.email, name: event.organizer?.displayName },
				...(event.attendees ?? [])
					.filter((a) => !a.resource)
					.map((a) => ({ email: a.email, name: a.displayName })),
			].flatMap(({ email, name }) => {
				// extractAddresses normalises and validates a single address here.
				const [normalised] = extractAddresses(email);
				if (!normalised) return [];
				// The attendee object itself wins when it has a name; the
				// description's "Who:" block is only a fallback for the ones that
				// booked through a shared inbox with no displayName attached.
				const resolvedName = name?.trim() || descriptionNames.get(normalised);
				if (!name?.trim() && resolvedName) {
					console.log(
						`Recovered name "${resolvedName}" for ${normalised} from event description.`,
					);
				}
				return [{ email: normalised, name: resolvedName }];
			})
		: [];

	// resolveContactPageIds drops internal-domain and blocklisted addresses
	// itself, so the merged list can safely include internal attendees.
	const contactPageIds = await resolveContactPageIds(notion, zapier, [
		...externalContacts,
		...eventCandidates,
	]);

	const properties: Record<string, any> = {
		Date: { date: { start: start_time, end: end_time ?? null } },
	};
	if (event) {
		properties["Google Calendar Event ID"] = {
			rich_text: [{ type: "text", text: { content: event.id } }],
		};
		if (event.description) {
			const cleaned = stripHtml(event.description);
			if (cleaned) {
				properties["Description"] = {
					rich_text: [
						{ type: "text", text: { content: cleaned.slice(0, 2000) } },
					],
				};
			}
		}
		if (event.hangoutLink) {
			properties["Call Link"] = { url: event.hangoutLink };
		}
	}
	let companyIds: string[] = [];
	let dealIds: string[] = [];
	if (contactPageIds.length > 0) {
		properties["Contacts"] = {
			relation: contactPageIds.map((id) => ({ id })),
		};
		({ companyIds, dealIds } = await collectContactRelations(
			notion,
			contactPageIds,
		));
		if (companyIds.length > 0) {
			properties["Companies"] = {
				relation: companyIds.map((id) => ({ id })),
			};
		}
		if (dealIds.length > 0) {
			properties["Deals"] = {
				relation: dealIds.map((id) => ({ id })),
			};
		}
		console.log(
			`Contact relations: ${companyIds.length} company(ies), ${dealIds.length} deal(s)`,
		);
	}
	if (internalUserIds.length > 0) {
		properties["Internal Attendees"] = {
			people: internalUserIds.map((id) => ({ id })),
		};
	}

	await notion.pages.update({ page_id: pageId, properties } as any);
	console.log(
		`Updated ${pageId}: event=${event?.id ?? "none"}, contacts=${contactPageIds.length}, internal=${internalUserIds.length}`,
	);

	// Classify the meeting into `Type` with Jev, as a separate write after the
	// enrichment so a classifier failure can never cost the enrichment. Only an
	// empty Type is filled: one set by hand (or by a template) is left alone.
	if (page && !page.type) {
		try {
			const externalAttendees = new Map<string, { email: string; name?: string }>();
			for (const c of [...externalContacts, ...eventCandidates]) {
				if (!c.email || c.email.endsWith(DEFAULT_INTERNAL_DOMAIN)) continue;
				const existing = externalAttendees.get(c.email);
				if (!existing?.name) externalAttendees.set(c.email, { email: c.email, name: c.name });
			}
			const result = await classifyMeetingType(zapier, {
				title: event?.summary || eventTitle,
				description: event?.description ? stripHtml(event.description) : undefined,
				internalAttendeeCount: internalUserIds.length,
				externalAttendees: [...externalAttendees.values()],
				companyNames: await pageTitles(notion, companyIds),
				openDealNames: await pageTitles(notion, dealIds),
			});
			if (!result) {
				console.log("Jev returned no usable meeting type; Type left empty.");
			} else if (!result.type) {
				console.log(
					`Jev ${result.model}: top type "${result.top}" at ${result.probability.toFixed(2)} is under the threshold; Type left empty.`,
				);
			} else {
				await notion.pages.update({
					page_id: pageId,
					properties: { Type: { select: { name: result.type } } },
				} as any);
				console.log(
					`Jev ${result.model}: Type set to "${result.type}" (${result.probability.toFixed(2)}).`,
				);
			}
		} catch (err) {
			console.log(
				`Meeting type classification failed; Type left empty: ${(err as Error)?.message ?? err}`,
			);
		}
	} else if (page?.type) {
		console.log(`Type already set to "${page.type}"; not classifying.`);
	}

	// Notion DB automations don't reliably fire on API-driven property updates,
	// and the native "set Companies from Contacts" automation can't cascade-trigger
	// other automations. Explicitly POST to the icon-sync worker so it can copy
	// the related Company's icon onto this Meeting Note.
	const iconSyncUrl = process.env.ICON_SYNC_WEBHOOK_URL;
	if (iconSyncUrl) {
		try {
			const res = await fetch(iconSyncUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ page_id: pageId }),
			});
			if (!res.ok) {
				console.log(
					`Icon sync webhook returned ${res.status} for ${pageId}`,
				);
			}
		} catch (err) {
			console.log(
				`Icon sync webhook failed for ${pageId}: ${(err as Error)?.message ?? err}`,
			);
		}
	}

	// Keyed on the occurrence id (`event.id`), never the iCalUID — the iCalUID is
	// shared by every occurrence of a series, and keying on it silently broke the
	// downstream reschedule Zap for five months. See LogRow in meetingNoteIdsTable.
	if (event?.id) {
		try {
			await upsertMeetingNoteIdRow(zapier, {
				eventId: event.id,
				iCalUID: event.iCalUID,
				pageId,
				startDateTime: event.start.dateTime ?? event.start.date,
				endDateTime: event.end.dateTime ?? event.end.date,
				summary: event.summary,
			});
		} catch (err) {
			console.log(
				`Meeting Note IDs table write failed: ${(err as Error)?.message ?? err}`,
			);
		}
	}
}
