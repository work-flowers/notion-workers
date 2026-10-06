# meeting-note-db-updates

A [Notion Worker](https://developers.notion.com/workers) that enriches newly created pages in the **Meeting Notes** data source with the meeting date, resolved attendees, and calendar-event metadata. Attendees come primarily from the page's embedded `meeting_notes` block; a Google **service account with domain-wide delegation** fills in what Notion can't expose — no individual user's calendar connection required. Replaces a production Zap + sub-Zap that previously did this job (the originals are kept in `exported-zap-*.json` for reference).

## What it does

When a page is added to the Meeting Notes data source, a Notion DB automation calls this Worker's webhook. The Worker then:

1. Polls the page for a populated `meeting_notes` block and reads `calendar_event` (`start_time`, `end_time`, and `attendees` — an array of Notion user IDs).
2. Resolves each attendee user ID via `notion.users.retrieve`:
   - Internal (`@work.flowers`) people → used directly as **Internal Attendees** (their user ID *is* the people-property value).
   - External people resolve **only if they are workspace members or guests** — anyone else 404s (Notion deliberately won't dereference arbitrary user IDs to emails).
3. Looks up the calendar event: impersonates the first resolved internal attendee via the service account (domain-wide delegation, scope `calendar.events.readonly`) and finds the event on their primary calendar whose start matches the block's `start_time` exactly. This supplies the emails of attendees Notion couldn't resolve, plus `hangoutLink`, `description`, event `id`, and `iCalUID`. Because the subject is *whichever* internal attendee is on the note, this works for meetings no particular person attends.
4. Resolves all collected external emails → Notion **Contacts** page IDs (via [`@work-flowers/notion-worker-shared`](https://github.com/work-flowers/notion-worker-shared)), matching on **Primary Email or Secondary Email**. Uses a Zapier-table blocklist, classifies unknown addresses with AI by Zapier (individual vs. service account), and creates new Contact pages for individuals (capped at 10 per run).
5. Patches the page with `Date`, `Google Calendar Event ID`, `Description`, `Call Link`, `Contacts`, `Internal Attendees` — plus `Companies` and `Deals`, copied from each resolved Contact's `Related Company` / `Deals` relations (the native "link from Contacts" DB automation doesn't fire on API-driven updates). Deals are filtered to **open stages only**: a deal whose `Status` sits in the status property's "Complete" group (Closed Won / Closed Lost / Declined) is skipped. The closed set is read from the Deals schema at run time, and every failure in the filter (schema unreadable, deal page unreadable, empty Status) fails open — the deal stays linked — so an open deal is never silently dropped.
6. Find-or-creates a row in the Zapier `[Table] Meeting Note IDs` (`01JZCVG73MBWWB0357CEPS4903`) keyed on the calendar event's **occurrence** id (`event.id`), storing the `iCalUID` alongside it in the `iCal UID` column. **The key must stay the occurrence id** — see [Operating notes](#operating-notes).

7. Classifies the meeting into the **Type** select with [Jev](#meeting-type-classification), in a second, separate write — only when Type is still empty, and only when Jev's top pick clears the confidence threshold.

If the calendar lookup fails or finds nothing, the run still completes with whatever the block resolved (Date, internal attendees, guest-visible contacts).

## Layout

```
src/
├── index.ts               # Worker + webhook registration
├── handler.ts             # handlePageCreated orchestration + attendee resolution
├── meetingNotesBlock.ts   # Poll for the populated meeting_notes child block
├── googleCalendar.ts      # Service-account JWT auth (DWD) + exact-start event lookup
├── classifyMeetingType.ts # Jev question + criteria for the Type select
└── meetingNoteIdsTable.ts # Find-or-create Zapier Table row mapping pageId ↔ occurrence event id
```

Contact resolution, internal-user lookup, and raw data-source helpers live in [`@work-flowers/notion-worker-shared`](https://github.com/work-flowers/notion-worker-shared), shared with [notion-worker-email-db-updates](https://github.com/work-flowers/notion-worker-email-db-updates).

```
```

## Setup

Prerequisites: Node 22+, the [`ntn` CLI](https://ntn.dev), and Notion Business/Enterprise with Workers enabled.

```bash
npm install
npm run check                      # type-check
```

Generate Zapier client credentials once (locally, since it needs a browser):

```bash
npx zapier-sdk login
npx zapier-sdk create-client-credentials "notion-worker"
```

Create the Google service account (one-time):

1. In [Google Cloud Console](https://console.cloud.google.com): create a project, enable the **Google Calendar API**, create a service account (no roles needed), and download a JSON key.
2. In the [Google Admin console](https://admin.google.com): Security → Access and data control → API controls → **Manage Domain Wide Delegation** → Add new, with the service account's numeric **Unique ID** as the Client ID and the single scope `https://www.googleapis.com/auth/calendar.events.readonly`.
3. Store the JSON key in 1Password (`google-sa-notion-workers`) and delete the downloaded file.

Set Worker secrets:

```bash
ntn workers env set \
  ZAPIER_CLIENT_ID=... \
  ZAPIER_CLIENT_SECRET=... \
  NOTION_API_TOKEN=ntn_... \
  GOOGLE_SA_KEY_BASE64="$(op document get google-sa-notion-workers | base64 | tr -d '\n')"
```

`NOTION_API_TOKEN` is an internal integration token (or PAT) that must have access to the Meeting Notes data source, the Contacts data source, and workspace users. The integration also needs to be connected to both data sources from the Notion UI. `GOOGLE_SA_KEY_BASE64` is the base64-encoded service-account JSON key.

## Deploy

```bash
ntn workers deploy
ntn workers webhooks list   # copy the URL for onMeetingNoteCreated
```

Wire it up in Notion: open the Meeting Notes data source → automations → trigger **When page added** → action **Send to webhook** → paste the URL above.

## Local testing

```bash
ntn workers env pull        # write secrets to .env for local runs

# Via the CLI — webhook capabilities take an ARRAY of event objects
# (a bare '{"pageId": ...}' object exits silently without running the handler):
ntn workers exec onMeetingNoteCreated --local \
  -d '[{"deliveryId":"test-1","body":{"pageId":"<real-meeting-page-id>"},"rawBody":"{}","headers":{},"method":"POST"}]'

# Or drive the handler directly (inject secrets from 1Password if not in .env):
NOTION_API_TOKEN=$(op read "op://Employee/notion-worker-automations/credential") \
GOOGLE_SA_KEY_BASE64=$(op document get google-sa-notion-workers | base64 | tr -d '\n') \
  npx tsx --env-file=.env ./test-handler.ts <real-meeting-page-id>
```

## Meeting Type classification

After enrichment the Worker asks **Jev** (TypeSafe's typed-judgement model) one `choice` question — which `Type` option this meeting is — and writes the answer as a separate `pages.update`. Jev returns a probability per option, never generated text, so it can't invent an option. The call goes through `zapier.fetch` with the `Jev` *API by Zapier* connection (`02c36cbc-669d-8c82-9c72-7b7813e5cde0`, overridable with `ZAPIER_TYPESAFE_CONNECTION_ID`), the same one the zapier-sdk `gmail-attachments-to-drive-by-type` and `merge-duplicate-contacts` Zaps use, so the TypeSafe key never sits in this Worker's env. Each call costs one Zapier task plus ~$0.0001 of TypeSafe usage.

- **Never overwrites.** A Type that's already set (by hand or a template) is left alone; if the page can't be read, classification is skipped rather than risk overwriting.
- **Leaves Type empty below `MIN_TYPE_PROBABILITY` (0.5).** A blank Type is visible and easy to fill; a confidently wrong one skews every view grouped by Type.
- **Best effort.** Any Jev or Notion failure is logged and swallowed — the enrichment has already been written.
- **What Jev sees** is only what's known at enrichment time: the event title, the description (HTML-stripped, first 1,500 chars), the number of work.flowers attendees, external attendees' names and emails, linked Company names and linked open Deal names. There's no transcript yet when the page is created.

The option criteria live in `TYPE_CRITERIA` in [`src/classifyMeetingType.ts`](src/classifyMeetingType.ts) and are the reviewable "prompt". **Keys must match the select options exactly** — Notion creates a new option for any unknown name, and a unit test pins the list. Update the table below with the code.

| Type | Means |
| --- | --- |
| 1:1 | A one-on-one between two workFlowers team members (both on the work.flowers domain), e.g. 'Dennis x Peter', a huddle or lunch with one colleague. |
| Team | An internal workFlowers meeting with three or more of our own team, such as the weekly team meeting or our own stand-up. |
| Client | A meeting with an existing client's people about ongoing paid work: recurring syncs, stand-ups, planning or scoping sessions with the client team. Includes meetings mirrored from a client's calendar (description begins '[gcal-block]' or 'Mirrored from …'). |
| Project | A focused working session on one specific piece of delivery — a proposal, a test run, a rollout, a training agenda — rather than a routine client sync. |
| Discovery | A first or introductory call with a potential new client to understand their needs: 'Discovery call', 'Intro call', a booked first meeting about possible work. |
| Prospect | A follow-up sales conversation with a potential client already in discussion — a regroup, follow-up or options discussion about a proposal not yet won. |
| Onboarding | A kick-off call that starts a newly signed client engagement. |
| Notion Setup Session | A '1:1 Notion Expert Session' booked through the Notion expert programme, where Dennis helps someone set up their Notion workspace. |
| Partner | A meeting with a business partner rather than a client: a referral partner, a fellow consultant or agency, or Zapier/Notion staff about working together. |
| Zapier Solution Partners | A Zapier Solution Partner programme session: partner office hours, town halls, or partner-programme syncs run by Zapier. |
| Community | A community gathering we take part in: Notion ambassador or community calls, cohort sessions, community hangouts. |
| Coffee | An informal catch-up or networking chat with an external person, with no client work or sale on the table — often a booked '30min Meeting'. |
| Product Demo | A demo or walkthrough of someone's product, a vendor onboarding session, or a user-research interview about a product. |
| Training | A training or enablement session delivered or attended: a walkthrough, office hours on a tool, a '101', an enablement session. |
| Webinar | An online webinar, livestream or broadcast-style session with many attendees, typically on Luma, Goldcast or a Zoom webinar link. |
| Event | An in-person event, conference, meetup or gathering attended, rather than a working meeting. |
| Vendor | A meeting with a supplier or service provider to workFlowers itself: accountant, corporate secretary, subcontractor, software vendor account manager. |
| Legal | A meeting about legal matters: contracts, agreements, or advice from a lawyer. |

**Not yet validated offline.** 680 existing notes carry a hand-set Type, but the labels are noisy (the same recurring stand-up is labelled Client, Event and Team on different occurrences), so expect agreement well short of 100%. Before trusting the threshold, replay a sample of labelled notes through Jev and record the agreement and the threshold's coverage here.

## Operating notes

- The Worker waits up to ~90s for the `meeting_notes` block to appear (Notion populates it asynchronously after page creation). If the block never appears, the run is a no-op — same behaviour as the Zap's "Only continue if found" filter.
- The `meeting_notes` block's attendee user IDs are **global** Notion user IDs; `users.retrieve` only dereferences workspace members and guests (this is Notion policy — it prevents email harvesting). The service-account calendar lookup is what makes non-guest external attendees resolvable.
- The event match is by **exact start time, with the block title as a tiebreak**, on the impersonated attendee's primary calendar. The API is queried on a 60-second window around the start (which catches overlapping and all-day events) and filtering happens locally on the returned array — one request, no `q` search. `q` is deliberately avoided: it is a fuzzy AND across summary, description, location and attendees, so it guarantees neither exactness nor uniqueness.

  **One event at that start → take it.** **Several → the block title picks between them**, compared against each event's `summary`. **Several and none matches the title → return null**, degrading the run to block-resolved data only; enriching a page from the wrong event is worse than leaving it unenriched.

  The tiebreak exists because start time alone is not unique: on 2026-08-26 a Goldcast webinar and the *Notion APAC Ambassadors Co-working* session both started at 12:00, and a start-only matcher took whichever the API returned first — enriching the note with the webinar's id, description and (empty) attendee list, so Contacts came out at 0.

  **The title must stay a tiebreak and never become a filter.** A first attempt at this fix applied it unconditionally and immediately regressed a note that had exactly one, plainly correct, event at its start time. `meeting_notes.title` is not dependable:

  - **A note created ahead of its meeting gets a placeholder title and keeps it forever** — literally `"Meeting " + <date mention>`, where the date is the note's *creation* date, not the meeting's. Only notes created *at* the meeting take the event's name. The placeholder is never rewritten from the event afterwards: sampling the 14 most recent notes found `Meeting 2026-08-24` on a note whose meeting ran on the 25th and reached `notes_ready`, and `Meeting 2026-08-19` on one whose meeting ran on the 24th. **4 of those 14 — 29% — carried a permanent placeholder**, so a hard title filter drops enrichment on roughly a third of all notes.
  - **The API and the UI disagree, invisibly.** Notion renders the *linked event's* name in the block header, so a block looks correctly titled on screen while the API returns the placeholder. Never check this by eye in Notion; read the block over the API. (The [block docs](https://developers.notion.com/reference/block#meeting-notes) show `title` holding a real meeting name, which is accurate — their example is simply a note created at its meeting.)
  - **There is no better field to reach for.** The block's `calendar_event` exposes only `attendees`, `start_time` and `end_time`; the event's `summary` and `id` are not in the public API payload at all.
- **`[Table] Meeting Note IDs` is keyed on the occurrence id, and must stay that way.** A Google event carries two identifiers and they are not interchangeable:

  | | `id` — the **occurrence** | `iCalUID` — the **series** |
  | --- | --- | --- |
  | One-off event | `020m73h4pol31v2vml5scfchmp` | `020m73h4pol31v2vml5scfchmp@google.com` |
  | Recurring occurrence | `48759896…_20260730T033000Z` | `48759896…@google.com` |
  | Recurring, series since revised | `rljatc0qotko…_20260730T033000Z` | `rljatc0qotko…_R20260622T033000@google.com` |

  Only `event.id` is unique per meeting note. From 2026-05 to 2026-07 this Worker wrote the `iCalUID` into the `Event ID` column, which broke two things silently and simultaneously:

  1. The [`gcal-event-updated-to-meeting-note`](https://github.com/work-flowers/zapier-sdk/tree/main/gcal-event-updated-to-meeting-note) Zap looks the page up by the occurrence id Google's `event_updated` trigger gives it. `<id>@google.com` never equals `<id>` — not even for one-off events — so its "only continue if found" filter stopped **every** run, with no error and no alert. Meeting notes quietly stopped tracking rescheduled meetings for five months (92 of 849 rows).
  2. One iCalUID covers every occurrence of a series, so the find-or-create kept matching the *same* row and overwriting its `Page ID`. A year of weekly standups became one row; `AI COE Daily Sync` became one row overwritten daily since 14 May.

  A trap worth knowing: **you cannot tell recurring from one-off by looking at an iCalUID** — a recurring series that has never been revised gets a bare `<seriesId>@google.com`, identical in shape to a one-off's. The existing rows were re-keyed by [`backfill-meeting-note-event-ids.mjs`](https://github.com/work-flowers/zapier-sdk/blob/main/scripts/backfill-meeting-note-event-ids.mjs), which preserved every iCalUID into the new `iCal UID` (f9) column.
- The Zapier table `01KQY6RB1TJ9X7BAYBRRRKB35S` is still the source of truth for the email blocklist. Moving it into Notion is a follow-up.
- Existing-contact lookup queries the Notion Contacts data source (`21991b07-11ac-81a6-a894-000be4a09a67`) directly via `POST /v1/data_sources/{id}/query` (Notion-Version `2026-03-11`), matching `Primary Email` (email) or `Secondary Email` (multi-select).
- New Contact creation is capped at `NEW_CONTACT_CAP = 10` per run to match the original sub-Zap.

## References

- [`exported-zap-2026-05-14T00_17_10.836Z.json`](exported-zap-2026-05-14T00_17_10.836Z.json) — original parent Zap export.
- [`exported-zap-2026-05-14T00_17_43.957Z.json`](exported-zap-2026-05-14T00_17_43.957Z.json) — original contact-resolution sub-Zap export.
- [Notion Workers docs](https://developers.notion.com/workers)
- [Zapier SDK docs](https://docs.zapier.com/platform/sdk)
