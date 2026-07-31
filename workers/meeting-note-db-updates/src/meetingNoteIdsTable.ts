import type { createZapierSdk } from "@zapier/zapier-sdk";

type Zapier = ReturnType<typeof createZapierSdk>;

const TABLE_ID = "01JZCVG73MBWWB0357CEPS4903";
const FIELD_EVENT_ID = "data__f3";
const NEW_FIELD_PAGE_ID = "new__data__f2";
const NEW_FIELD_EVENT_ID = "new__data__f3";
const NEW_FIELD_START = "new__data__f5";
const NEW_FIELD_END = "new__data__f6";
const NEW_FIELD_FLAG = "new__data__f7";
const NEW_FIELD_SUMMARY = "new__data__f8";
const NEW_FIELD_ICAL_UID = "new__data__f9";

/**
 * A row in `[Table] Meeting Note IDs`, which maps a meeting note to its calendar
 * event.
 *
 * `eventId` — the Google **occurrence** id (`event.id`): `<seriesId>_<originalStartUTC>`
 * for a recurring instance, a bare opaque id for a one-off. This is the key,
 * and it must stay the key.
 *
 * `iCalUID` — the RFC 5545 UID. It identifies the **series**, so it is shared by
 * every occurrence; stored for provenance only.
 *
 * This distinction is load-bearing, and getting it wrong once already cost five
 * months of silent breakage. Until 2026-07 this function keyed the row on
 * `iCalUID`, which broke two things at once:
 *
 *   1. The `gcal-event-updated-to-meeting-note` Zap looks the page up by the
 *      occurrence id it gets from Google's `event_updated` trigger. `<id>@google.com`
 *      never equals `<id>` — not even for one-off events — so its "only continue
 *      if found" filter stopped every run, with no error and no alert. Meeting
 *      notes silently stopped tracking rescheduled meetings.
 *   2. One iCalUID covers every occurrence of a series, so the find-or-create
 *      below kept matching the *same* row and overwriting its Page ID. A year of
 *      weekly standups became one row; a daily sync became one row overwritten
 *      every day.
 *
 * A trap to know: you cannot tell recurring from one-off by looking at an
 * iCalUID. A recurring series that has never been revised gets a bare
 * `<seriesId>@google.com`, identical in shape to a one-off's.
 */
interface LogRow {
	eventId: string;
	iCalUID?: string;
	pageId: string;
	startDateTime?: string;
	endDateTime?: string;
	summary?: string;
}

export async function upsertMeetingNoteIdRow(
	zapier: Zapier,
	row: LogRow,
): Promise<void> {
	const newFields: Record<string, unknown> = {
		[NEW_FIELD_EVENT_ID]: row.eventId,
		[NEW_FIELD_PAGE_ID]: row.pageId,
	};
	if (row.iCalUID) newFields[NEW_FIELD_ICAL_UID] = row.iCalUID;
	if (row.startDateTime) newFields[NEW_FIELD_START] = row.startDateTime;
	if (row.endDateTime) newFields[NEW_FIELD_END] = row.endDateTime;
	if (row.summary) newFields[NEW_FIELD_SUMMARY] = row.summary;

	const { data } = (await zapier.runAction({
		appKey: "TableCLIAPI",
		actionType: "search_or_write",
		actionKey: "find_record",
		inputs: {
			table_id: TABLE_ID,
			filter_count: "1",
			use_stored_order: false,
			field_data_key: FIELD_EVENT_ID,
			operator: "exact",
			lookup_value: row.eventId,
			...newFields,
			[NEW_FIELD_FLAG]: false,
		},
	} as any)) as any;

	const existingRecordId =
		data?.record_id ?? data?.id ?? (Array.isArray(data) ? data[0]?.record_id : null);
	if (!existingRecordId) {
		return;
	}

	await zapier.runAction({
		appKey: "TableCLIAPI",
		actionType: "write",
		actionKey: "update_record",
		inputs: {
			table_id: TABLE_ID,
			record_id: existingRecordId,
			...newFields,
		},
	} as any);
}
