# outbound-sync

Keeps **🎯 Outbound Leads** in step with Apollo (who is in it) and, from Stage 2, Smartlead (what has happened to them). Spec: TKT-1051, "Set up Apollo and connect the Outbound Leads database". Outbound Leads stays the system of record; Dennis decides who gets contacted and who moves into the CRM.

**Stage 1:** sync `apolloLeads`. **Stage 2:** syncs `smartleadLeads` and `smartleadCampaignsSync`, and webhooks `pushToSmartlead` and `promoteToContact`.

## Data sources

| | id |
|---|---|
| Outbound Leads | data source `61a01f87-741b-4dbd-a98e-ada01e07eb3b` (database `92d79468-07fa-4aee-8d54-99e60b3dbd5e`), attached |
| Smartlead Campaigns | data source `5484e931-dbc6-45a5-84bb-3622ed5bab0e`, managed (created by this worker, moved under CRM > Databases by hand) |
| Contacts (webhooks) | data source `21991b07-11ac-81a6-a894-000be4a09a67` |

## Two campaign relations, on purpose

Both point at Smartlead Campaigns, and they mean different things (decided with Dennis 2026-10-30):

- **Push to campaign** (human, one-way, one page; spelled with a lowercase "c") is only the **input** to `pushToSmartlead`. It used to be called Campaign. After a push, Smartlead is the source of truth, and moving a lead between campaigns happens in Smartlead, not here. It's hidden on already-sequenced leads. It's undeclared, so a rename in Notion silently breaks the push ("missing Push to campaign"): keep `src/webhooks.ts` in step.
- **In campaign** (synced by `smartleadLeads`, two-way) is the **fact**: which campaign Smartlead has the lead in. Its reverse, **Outbound Leads** on each Smartlead Campaigns page, is a read-only list of that campaign's actual members. It can't be called "Leads": that name is taken by the lead-count column, and the deploy rejects a reciprocal that collides with an existing property.
- **Why it's called "In campaign":** it started as a one-way `Smartlead Campaign`. Declaring that existing relation `twoWay` deployed fine and every sync stayed healthy, but **the platform never converted it**: it stayed `single_property` with no reverse column (2026-10-30). Declaring a *new* relation name with `twoWay` created it two-way at once. To make any relation two-way, rename it. The old `Smartlead Campaign` column is now undeclared, editable and stale, and is deleted by hand.

## Two syncs share Outbound Leads rows

`apolloLeads` writes only the Apollo columns and `smartleadLeads` writes only the Smartlead columns, on the same rows. **An upsert that omits declared columns leaves them untouched.** This was verified live on 2026-10-30 in both directions: a Smartlead-only upsert kept the Apollo columns, and a full `apolloLeads` re-run kept the Smartlead Status. The SDK's types still demand every declared column, so the cast lives in one place, `partial()` in `src/index.ts`. If a future SDK version starts clearing omitted columns, the Smartlead columns will blank out on every Apollo run; that's the tell.

## Attached, not managed

`outboundLeads` is `type: "attached"`, which needs `@notionhq/workers` ≥ 0.8.5 (the repo bumped to 0.8.12 for this). Bound on 2026-10-30 with `ntn workers databases attach outboundLeads 61a01f87-741b-4dbd-a98e-ada01e07eb3b` (it takes the data source ID or a database link).

**Attaching runs a real sync immediately, not on the next scheduled run.** A `--preview` after attaching is not a safeguard: on 2026-10-30 the first real cycle wrote the three test contacts about 5 seconds after the attach, before the preview ran. Get everything right *before* attaching: the env vars, which Apollo lists exist, and the mapping. The same applies to re-attaching after a detach.

While attached:

- **Declared properties are read-only in Notion.** Declared from Apollo: Lead (title), Apollo ID (primary key), Role, Company, Email, LinkedIn Profile URL, Location. Declared from Smartlead: Smartlead Status, Sequence Step, Last Event, Latest Reply, Smartlead Lead ID, In campaign. Everything a human edits stays undeclared: Status, **Push to campaign**, Subject Line, Message, Notes, Owner, Contacts, Follow-up Date, Date Sent, Outreach Method, Phone, JD Summary, Job Listing.
- **Rows can't be added or deleted by hand** or by other integrations. Every lead enters through an Apollo list. Deleting is blocked both in the UI and through the API (the Notion connector's trash call failed with a bare validation error, 2026-10-30). **Archiving a row does work in the UI.** For a hand-made row with no Apollo ID, that's permanent. For a synced row, the next upsert of that contact un-archives it: a change in Apollo, or a state reset and re-run. To drop a synced lead for good, remove it from the Apollo list first. To trash rows, detach, trash them, then re-attach (re-attaching runs a sync immediately).
- **Detach before decommissioning.** Run `ntn workers databases detach outboundLeads` first. That releases the read-only locks and leaves every row. Deleting the worker or removing the declaration does *not* release the database; it stays locked with nothing able to release it.
- Rows from before the worker have no Apollo ID. Incremental mode leaves them alone, but their titles become read-only.

## `apolloLeads` sync

- **Incremental, hourly. Never replace mode.** Replace mode would delete the row (with its notes and status) of anyone dropped from an Apollo list.
- Pages through `POST /api/v1/contacts/search` filtered by `contact_label_ids` (**every** Apollo contact list, from `GET /api/v1/labels` at the start of each cycle), newest-updated first, and stops at the first contact not newer than the cursor. Apollo has no updated-since filter. The cursor trails the high-water mark by 5 minutes, so late-indexed contacts aren't skipped.
- **Any contact on any Apollo list is a lead**; contacts on no list (saved ad hoc, or added by Apollo itself) stay out. A new list needs no config. Adding a contact to a list bumps its `updated_at` (verified 2026-10-30), so older contacts put on a new list still come through without a state reset. With no lists at all the sync does nothing: an empty `contact_label_ids` filter would match every contact in the account. `APOLLO_LIST_IDS` was removed on 2026-10-30 in favour of this.
- `key` is the Apollo contact ID, byte-identical to the `Apollo ID` value (see the root CLAUDE.md on why this matters).
- **No `upstreamUpdatedAt` on upserts.** With it, Notion skipped every upsert whose Apollo `updated_at` hadn't moved, so a Location fix never reached the existing rows (see the root CLAUDE.md). It would also hide Smartlead state in Stage 2, since a reply doesn't change the Apollo contact. To re-apply a mapping change to every row: `ntn workers sync state reset apolloLeads && ntn workers sync trigger apolloLeads`. Rows are matched on Apollo ID, so this updates them in place without duplicating.
- Location drops repeated parts: Apollo gives Singapore as city, state and country.
- Unrevealed emails arrive as `email_not_unlocked@…` and are written as empty.
- Status isn't declared, so the sync can't set it. New rows get **Backlog** from the Status property's default option, which is set by hand in Notion.

## Environment

The worker calls Apollo and Smartlead directly with their API keys, **not** through the Zapier SDK relay. They're plain REST calls, so the relay adds nothing and could start costing Zapier tasks once the SDK beta ends (decided 2026-10-30, overriding the spec's relay rule).

| Variable | What |
|---|---|
| `APOLLO_API_KEY` | Apollo **master** API key, sent as `X-Api-Key`. 1Password item `apollo-api`. A non-master key can't search contacts. |
| `SMARTLEAD_API_KEY` | Smartlead API key, sent as the `api_key` query parameter. 1Password item `smartlead-api`. |
| `NOTION_API_TOKEN` | Used by the webhooks only (comments, Status, Contacts). The repo-default `notion-worker-automations` integration, which needs access to Outbound Leads, Contacts and Smartlead Campaigns. |

Set secrets straight from 1Password so the value never lands in the shell history or a file (run from `workers/outbound-sync`):

```shell
ntn workers env set "APOLLO_API_KEY=$(op read --account work-flowers.1password.com 'op://Private/apollo-api/credential')"
```

If the relay is ever reinstated, **don't use the Apollo.io app connection** (`02be390b…`). Its auth template injects `name = "Zapier Master Key"` into every contact search, so every search returns zero contacts with a 200, and the request can't override it. The API by Zapier connection `apollo-api` (`02b3ee04…`, `X-Api-Key` header) works.

## `smartleadLeads` sync

- **Incremental, hourly.** Each cycle lists campaigns, then makes two passes per campaign (25 per page): leads with activity (sent or reply) after the cursor (`event_time_gt`), then leads *added* after it (`created_at_gt`). A freshly pushed lead has no activity until its first send; before the second pass existed, Alan sat for an hour with no Smartlead state. Each campaign's bounced leads are fetched too. It reads each lead's `GET /campaigns/{id}/leads/{lead_id}/message-history`. The first run has no cursor and walks every lead.
- Rows are keyed by the lead's **`apollo_id` custom field**, which the push webhook sets. Leads added in Smartlead directly have none and are skipped.
- Smartlead Status precedence: Unsubscribed > Bounced > Replied (any inbound message) > Completed (lead status COMPLETED or STOPPED) > In sequence. A **paused** lead (including one stopped by `promoteToContact`'s fallback) still reads In sequence.
- Sequence Step = outbound messages in the history; Latest Reply = the last inbound body as plain text with the quoted thread dropped, capped at 1,900 characters; Last Event = the newest message time.
- **Unverified until real sends:** message history was `{"history": []}` on the draft test campaign, so the per-message field names are read defensively (`type: SENT/REPLY` or `direction`; `time` / `sent_at` / `received_at`; `email_body` / `body`). Check one Replied lead after the first real campaign. The response key is `history`; the docs say `messages`.
- Rate limits (Standard plan): 60/min and 1,000/hour per key across everything; the shared `smartlead` pacer takes 40/min.

## `smartleadCampaignsSync`

Replace mode, hourly: one row per campaign with Campaign Status, Leads, Sent, Opened, Replies, Bounces, Unsubscribes and Created, from `GET /campaigns/` and `GET /campaigns/{id}/analytics`. Replace mode only removes campaigns deleted in Smartlead. Human columns (Segment, Notes) go on by hand, outside the schema.

`Schema.relation()` takes the **database key** (`smartleadCampaigns`), not the sync key; the scaffold's sync-guide is wrong on this, and the deploy rejects the sync key.

## Webhooks

Both are fired by Notion database automations on Outbound Leads ("Send webhook" with the default body; get the URLs with `ntn workers webhooks list`, which are secrets). Each re-reads the page and acts only if Status still has the triggering value, so late or retried deliveries are harmless. Each leaves a `Done:` or `Blocked:` page comment. Unexpected errors also become a `Blocked:` comment, with the message.

- **`pushToSmartlead`, Status → Sequenced.** Pre-flight checks Email, Lead name, Company, Apollo ID and **Push to campaign**, and that the email isn't already a Contact (Primary or Secondary Email). Any failure sets Status back to Backlog with a `Blocked:` reason. On success it adds the lead to that campaign with `notion_page_id`, `apollo_id`, `subject_line` (Subject Line) and `opener` (Message). Smartlead returns 200 even when it skips a lead, so its counters decide; already being in the campaign counts as success.
- **`promoteToContact`, Status → Interested.** Finds the Contact by email or creates one: Name, First/Last Name, Primary Email, Job Title, Location, Linkedin, Lead Source = **Outbound** (the option was created on first use). It links the Contact and stops the lead in every Smartlead campaign: `manual-complete`, falling back to `pause` because manual-complete 404s ("No sequences found for campaign") on a campaign with no sequences. `link-contact-to-company` then links the company.
- **Automations don't fire on a net-zero change.** Flipping Status away and back within a few seconds produced no delivery. Leave a gap when re-triggering by hand.
- Comments posted by the API on a page that already has a discussion are appended to that discussion, not started as a new thread.

Tested live on 2026-10-30 against draft campaign 4276123 ("Outbound Sync Test (draft, do not start)"): a lead with no campaign was blocked and reset; Alan was added with all four custom fields; Ada was promoted to a new Contact, re-promoted to the same Contact, and paused. The test Contact was trashed afterwards.
