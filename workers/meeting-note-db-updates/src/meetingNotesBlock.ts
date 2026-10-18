import type { Client } from "@notionhq/client";

export interface MeetingNotesCalendarEvent {
	start_time: string;
	end_time?: string;
	attendees?: string[];
}

export interface MeetingNotesBlock {
	id: string;
	/**
	 * The block's own title. This is NOT the Google event summary: Notion leaves
	 * it as a placeholder (`Meeting <date>`) until the meeting actually runs, and
	 * only then syncs it from the event. For disambiguating same-start calendar
	 * events, use the parent page title instead (the calendar integration sets it
	 * to `<summary> <ISO timestamp>` from creation) — see fetchPageTitle /
	 * stripTrailingTimestamp in handler.ts. This is kept only as a fallback.
	 */
	title: string;
	calendar_event: MeetingNotesCalendarEvent;
}

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 90_000;

export async function waitForMeetingNotesBlock(
	notion: Client,
	pageId: string,
): Promise<MeetingNotesBlock | null> {
	const deadline = Date.now() + MAX_WAIT_MS;
	while (Date.now() < deadline) {
		const block = await findMeetingNotesBlock(notion, pageId);
		if (block) return block;
		await sleep(POLL_INTERVAL_MS);
	}
	return null;
}

async function findMeetingNotesBlock(
	_notion: Client,
	pageId: string,
): Promise<MeetingNotesBlock | null> {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) throw new Error("NOTION_API_TOKEN is not configured");

	// In a typed Meetings database the page itself is the meeting note: the
	// page id is a `meeting_note_page` block id, and its children are only the
	// note's contents.
	const pageRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			"Notion-Version": "2026-03-11",
		},
	});
	if (!pageRes.ok) {
		throw new Error(`Notion blocks.retrieve failed: ${pageRes.status} ${await pageRes.text()}`);
	}
	const pageBlock = (await pageRes.json()) as any;
	if (isMeetingNotePage(pageBlock)) {
		return toMeetingNotesBlock(await queryMeetingNoteBlock(token, pageBlock));
	}

	let cursor: string | undefined;
	do {
		const query = new URLSearchParams({ page_size: "100" });
		if (cursor) query.set("start_cursor", cursor);
		const url = `https://api.notion.com/v1/blocks/${pageId}/children?${query.toString()}`;
		const res = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				"Notion-Version": "2026-03-11",
			},
		});
		if (!res.ok) {
			throw new Error(`Notion blocks.children.list failed: ${res.status} ${await res.text()}`);
		}
		const resp = (await res.json()) as any;
		for (const raw of resp.results ?? []) {
			const block = isMeetingNotePage(raw)
				? await queryMeetingNoteBlock(token, raw)
				: raw;
			const found = toMeetingNotesBlock(block);
			if (found) return found;
		}
		cursor = resp.has_more ? resp.next_cursor : undefined;
	} while (cursor);
	return null;
}

function isMeetingNotePage(block: any): boolean {
	return (
		block?.type === "unsupported" &&
		block.unsupported?.block_type === "meeting_note_page"
	);
}

function toMeetingNotesBlock(block: any): MeetingNotesBlock | null {
	if (block?.type !== "meeting_notes") return null;
	const calendarEvent = block.meeting_notes?.calendar_event;
	if (!calendarEvent?.start_time) return null;
	return {
		id: block.id,
		title: (block.meeting_notes?.title ?? [])
			.map((t: any) => t.plain_text ?? "")
			.join(""),
		calendar_event: calendarEvent,
	};
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Meeting notes in a typed Meetings database are stored as a
 * `meeting_note_page` block (the page itself; also seen once as a child block
 * just before the database was converted), which
 * `GET /v1/blocks/{id}/children` and `GET /v1/blocks/{id}` return as
 * `unsupported` with no calendar data — even though the note is linked to a
 * calendar event in the app. `POST /v1/blocks/meeting_notes/query` returns the
 * same block as a full `meeting_notes` block, calendar_event included. That
 * endpoint has no id filter, so narrow to the block's creation date (±1 day,
 * since the filter takes a bare date) and match on id. It only returns notes
 * the integration can see; the worker's token can. (Seen first 2026-10-18.)
 */
async function queryMeetingNoteBlock(token: string, block: any): Promise<any> {
	const created = new Date(block.created_time).getTime();
	const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
	const dateFilter = (operator: string, ms: number) => ({
		property: "created_time",
		filter: {
			operator,
			value: { type: "exact", value: { type: "date", start_date: day(ms) } },
		},
	});
	const res = await fetch("https://api.notion.com/v1/blocks/meeting_notes/query", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Notion-Version": "2026-03-11",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			// A single property filter at the root is rejected (400 "filter.operator
			// should be defined"), despite the docs; wrap it in a combinator.
			filter: {
				operator: "and",
				filters: [
					dateFilter("date_is_on_or_after", created - DAY_MS),
					dateFilter("date_is_on_or_before", created + DAY_MS),
				],
			},
			limit: 50,
		}),
	});
	if (!res.ok) {
		throw new Error(`Notion meeting_notes query failed: ${res.status} ${await res.text()}`);
	}
	const resp = (await res.json()) as any;
	const match = (resp.results ?? []).find((b: any) => b.id === block.id);
	if (!match) {
		console.log(
			`meeting_note_page block ${block.id} not returned by meeting_notes query`,
		);
	}
	return match ?? block;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
