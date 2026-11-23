# outbound-sync

Keeps **🎯 Outbound Leads** in step with Apollo (who is in it) and, from Stage 2, Smartlead (what has happened to them). Spec: TKT-1051, "Set up Apollo and connect the Outbound Leads database". Outbound Leads stays the system of record. Saving a contact to a mapped Apollo list is the go/no-go for contacting them (auto-enrolment, decided 20 Nov 2026); Dennis decides who moves into the CRM.

**Stage 1:** sync `apolloLeads`. **Stage 2:** syncs `smartleadLeads`, `smartleadCampaignsSync` and `autoEnrol`, and the webhook `promoteToContact`. The `pushToSmartlead` webhook (Status → Sequenced) was removed on 20 Nov 2026 when `autoEnrol` replaced it.

## Data sources

| | id |
|---|---|
| Outbound Leads | data source `61a01f87-741b-4dbd-a98e-ada01e07eb3b` (database `92d79468-07fa-4aee-8d54-99e60b3dbd5e`), attached |
| Smartlead Campaigns | data source `5484e931-dbc6-45a5-84bb-3622ed5bab0e`, managed (created by this worker, moved under CRM > Databases by hand) |
| Contacts (`autoEnrol` pre-flight, `promoteToContact`) | data source `21991b07-11ac-81a6-a894-000be4a09a67` |

## Two campaign relations, on purpose

Both point at Smartlead Campaigns, and they mean different things (decided with Dennis 2026-10-30):

- **Push to campaign** (human, one-way, one page; spelled with a lowercase "c") is an **optional override** for `autoEnrol`. Normally the campaign comes from the lead's Apollo list (see *List → campaign mapping*), and this stays empty. Set it only to choose for a contact on more than one mapped list, or to send a lead somewhere else. It used to be called Campaign. After a push, Smartlead is the source of truth, and moving a lead between campaigns happens in Smartlead, not here. It's undeclared, so a rename in Notion silently stops the override from being read: keep `src/enrol.ts` in step.
- **In campaign** (synced by `smartleadLeads`, two-way) is the **fact**: which campaign Smartlead has the lead in. Its reverse, **Outbound Leads** on each Smartlead Campaigns page, is a read-only list of that campaign's actual members. It can't be called "Leads": that name is taken by the lead-count column, and the deploy rejects a reciprocal that collides with an existing property.
- **Why it's called "In campaign":** it started as a one-way `Smartlead Campaign`. Declaring that existing relation `twoWay` deployed fine and every sync stayed healthy, but **the platform never converted it**: it stayed `single_property` with no reverse column (2026-10-30). Declaring a *new* relation name with `twoWay` created it two-way at once. To make any relation two-way, rename it. The old `Smartlead Campaign` column is now undeclared, editable and stale, and is deleted by hand.

## List → campaign mapping

**One Smartlead campaign per Apollo list**, one list per target segment, e.g. "Zapier People List" → "Zapier Campaign" (agreed with Seth 31 Oct 2026; built 13 Nov 2026). Nobody picks a campaign per lead, and nobody reviews leads in Notion: `autoEnrol` enrols every new lead on a mapped list.

- **Apollo Lists** is a managed database, one row per Apollo *contact* list (account lists are skipped), keyed on List ID. `apolloListsSync` refreshes it hourly from `GET /api/v1/labels`, in **incremental** mode. It was replace mode until 20 Nov 2026, but on 15 Nov the Zapier People List row was replaced by a new page and its campaign mapping was lost with it. Under auto-enrolment that silently stops enrolment for the list. Incremental upserts by List ID update the same page in place; the cost is that a list deleted in Apollo stays as a stale row, to archive by hand.
- **Apollo Lists** on Outbound Leads is a synced, two-way relation written by `apolloLeads`. The reverse, **Leads**, is on each Apollo Lists page. It was declared two-way from the start, because converting an existing relation is silently ignored.
- **Smartlead Campaign** on Apollo Lists is the mapping. It's **human-edited and added by hand** (a relation to Smartlead Campaigns, limited to one page), so it stays outside the schema and editable. As set up on 13 Nov 2026 it's two-way, and its reverse, **Apollo List** on Smartlead Campaigns, is also limited to one page. That makes the mapping strictly one-to-one: pointing a second list at a campaign silently clears the first list's link. If a campaign ever needs to take more than one list, lift the limit on the reverse.
- Adding columns to these worker-owned databases works from the Notion UI, but it can take a minute to show up through the API.
- `apolloListsSync` only writes its declared columns, so the hand-set mapping survives an upsert (checked 13 Nov 2026).
- `autoEnrol` follows lead → Apollo Lists → Smartlead Campaign.
  - One distinct campaign: enrol there.
  - None: the lead waits in Backlog with no comment, and is enrolled on the first run after its list is mapped. Mapping a new list (e.g. Notion People List → Notion campaign) is a manual step.
  - Different campaigns: `Blocked:` with each list → campaign pair.
  - **Push to campaign**, when set, skips this lookup.
  - The relation is up to an hour old, as of the last `apolloLeads` run. A contact added to a list since then gets its new list after the next hourly run.
- Apollo Lists must be shared with the `notion-worker-automations` integration, or the push can't read the list pages. Moving it into the **📣 Outbound Leads and Campaigns** database as a data source does this.
- Tested live on 13 Nov 2026 against draft campaign 4276123, through the since-removed push webhook, which used the same lookup:
  - Grace (one mapped list): pushed.
  - Ada (two lists, one mapped): pushed.
  - Ada (lists mapped to different campaigns): blocked with the pairs, and nothing reached Smartlead.
  - Ada with **Push to campaign** set: pushed "(from Push to campaign)".
  - Before the mapping existed, a push blocked with "no campaign mapped".
- **Retired along the way:** the plain-text **Apollo List** column (a first cut, replaced the same day by the relation) and the **Subject Line** and **Message** columns. Delete the first by hand if it's still there.

## Two syncs share Outbound Leads rows

`apolloLeads` writes only the Apollo columns and `smartleadLeads` writes only the Smartlead columns, on the same rows. **An upsert that omits declared columns leaves them untouched.** This was verified live on 2026-10-30 in both directions: a Smartlead-only upsert kept the Apollo columns, and a full `apolloLeads` re-run kept the Smartlead Status. The SDK's types still demand every declared column, so the cast lives in one place, `partial()` in `src/index.ts`. If a future SDK version starts clearing omitted columns, the Smartlead columns will blank out on every Apollo run; that's the tell.

## Attached, not managed

`outboundLeads` is `type: "attached"`, which needs `@notionhq/workers` ≥ 0.8.5 (the repo bumped to 0.8.12 for this). Bound on 2026-10-30 with `ntn workers databases attach outboundLeads 61a01f87-741b-4dbd-a98e-ada01e07eb3b` (it takes the data source ID or a database link).

**Attaching runs a real sync immediately, not on the next scheduled run.** A `--preview` after attaching is not a safeguard: on 2026-10-30 the first real cycle wrote the three test contacts about 5 seconds after the attach, before the preview ran. Get everything right *before* attaching: the env vars, which Apollo lists exist, and the mapping. The same applies to re-attaching after a detach.

While attached:

- **Declared properties are read-only in Notion.** Declared from Apollo: Lead (title), Apollo ID (primary key), Role, Company, Email, LinkedIn Profile URL, Location, Apollo Lists. Declared from Smartlead: Smartlead Status, Sequence Step, Last Event, Latest Reply, Smartlead Lead ID, In campaign. Everything a human edits stays undeclared: Status, **Push to campaign**, **Push blocked**, Notes, Owner, Contacts, Follow-up Date, Date Sent, Outreach Method, Phone, JD Summary, Job Listing.
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
| `NOTION_API_TOKEN` | Used by `autoEnrol` and `promoteToContact` (querying leads, comments, Status, Push blocked, Contacts). The repo-default `notion-worker-automations` integration, which needs access to Outbound Leads, Contacts and Smartlead Campaigns. |

Set secrets straight from 1Password so the value never lands in the shell history or a file (run from `workers/outbound-sync`):

```shell
ntn workers env set "APOLLO_API_KEY=$(op read --account work-flowers.1password.com 'op://Private/apollo-api/credential')"
```

If the relay is ever reinstated, **don't use the Apollo.io app connection** (`02be390b…`). Its auth template injects `name = "Zapier Master Key"` into every contact search, so every search returns zero contacts with a 200, and the request can't override it. The API by Zapier connection `apollo-api` (`02b3ee04…`, `X-Api-Key` header) works.

## `smartleadLeads` sync

- **Incremental, hourly.** Each cycle lists campaigns, then makes two passes per campaign (25 per page): leads with activity (sent or reply) after the cursor (`event_time_gt`), then leads *added* after it (`created_at_gt`). A freshly pushed lead has no activity until its first send; before the second pass existed, Alan sat for an hour with no Smartlead state. Each campaign's bounced leads are fetched too. It reads each lead's `GET /campaigns/{id}/leads/{lead_id}/message-history`. The first run has no cursor and walks every lead.
- Rows are keyed by the lead's **`apollo_id` custom field**, which `autoEnrol` sets. Leads added in Smartlead directly have none and are skipped.
- Smartlead Status precedence: Unsubscribed > Bounced > Replied (any inbound message) > Completed (lead status COMPLETED or STOPPED) > In sequence. A **paused** lead (including one stopped by `promoteToContact`'s fallback) still reads In sequence.
- Sequence Step = outbound messages in the history; Latest Reply = the last inbound body as plain text with the quoted thread dropped, capped at 1,900 characters; Last Event = the newest message time.
- **Unverified until real sends:** message history was `{"history": []}` on the draft test campaign, so the per-message field names are read defensively (`type: SENT/REPLY` or `direction`; `time` / `sent_at` / `received_at`; `email_body` / `body`). Check one Replied lead after the first real campaign. The response key is `history`; the docs say `messages`.
- Rate limits (Standard plan): 60/min and 1,000/hour per key across everything; the shared `smartlead` pacer takes 40/min.

## `smartleadCampaignsSync`

Replace mode, hourly: one row per campaign with Campaign Status, Leads, Sent, Opened, Replies, Bounces, Unsubscribes and Created, from `GET /campaigns/` and `GET /campaigns/{id}/analytics`. Replace mode only removes campaigns deleted in Smartlead. Human columns (Segment, Notes) go on by hand, outside the schema.

`Schema.relation()` takes the **database key** (`smartleadCampaigns`), not the sync key; the scaffold's sync-guide is wrong on this, and the deploy rejects the sync key.

## `autoEnrol`

Auto-enrolment on arrival (decided 20 Nov 2026 at the weekly sync with Seth). Seth only saves an Apollo list once he's happy with the set, so saving it is the go/no-go and there is no manual review in Notion. Code: `src/enrol.ts`.

- **A sync that writes nothing through the sync.** It's registered as an hourly incremental sync on Outbound Leads only to get a schedule. It returns no changes and writes through the REST API instead, because Status and Push blocked are human columns and must stay undeclared.
- **Candidates:** Status = Backlog, Apollo ID set, Smartlead Lead ID empty, Push blocked empty. The 20 hand-made rows from before the worker (formerly Status Sent) are Backlog now but have no Apollo ID, so they're never picked.
- **Pre-flight:** Email, Lead name and Company set; if the email matches a Contact (Primary or Secondary Email), that Contact isn't warm, do-not-sequence or unsubscribed (see *Existing Contacts* below); exactly one campaign (see *List → campaign mapping*; **Push to campaign** overrides).
- **Existing Contacts** (TKT-1073, 23 Nov 2026). Being in Contacts used to block a lead outright, which also blocked people Dennis had only cold-emailed (Gladys Lim, Zapier People List). Now a matched Contact blocks only if:
  - **Unsubscribed on** is set → `unsubscribed: …`
  - **Do not sequence** (checkbox) is ticked → `do not sequence: …`
  - **Warm** (formula) is true → `warm contact: …`. Warm is true when the Contact has any Meeting Notes, Deals, Deals Referred, Event attendees, Contact Form, Signed Legal Agreements or Customer Reviews; is on the Mailing List; has sent us an email (a sender in the **Email senders** rollup of 📥 Emails that isn't @work.flowers); or has a Lead Source other than Outbound or LinkedIn. The rule lives in the formula, not here, so tune it in Notion without a redeploy. If Warm can't be read (renamed, deleted, not a boolean), the lead is blocked as warm: it fails closed.
  - Otherwise the Contact is cold and the lead is enrolled. **Email senders** is a helper rollup (From of each linked email): Notion rejected a formula that read From through the 📥 Emails relation directly, so Warm reads the rollup instead. Don't delete it.
  - All three Contacts columns are human-owned and read by exact name in `src/enrol.ts`; a rename silently changes behaviour.
  - Known gap: a reply only counts if it reached the Emails database. Someone who answered from another address, or only on LinkedIn or Slack, looks cold. Tick **Do not sequence** for them.
- **Contacts link:** whenever the email matches a Contact, the lead's **Contacts** relation is set to it in the same page update as the outcome (enrolled, blocked, or waiting on an unmapped list), keeping any existing links. `promoteToContact` then finds and links the same Contact instead of creating a duplicate, and leaves its Lead Source alone.
- **Enrolling:** one `POST /campaigns/{id}/leads` per campaign per batch of 25 leads (Smartlead takes up to 400), with `notion_page_id`, `apollo_id` and `job_title` (Role) as custom fields alongside first and last name, company, location and LinkedIn. **Copy lives in Smartlead** (decided 30 Oct 2026). Smartlead returns 200 even when it skips leads and reports only totals, so a batch whose `upload_count + already_added_to_campaign` falls short is redone lead by lead to find which were refused and why. Already being in the campaign counts as success, so a re-run is harmless.
- **On success:** Status → Sequenced and a `Done: added to <campaign>` comment. `smartleadLeads` fills in the Smartlead columns within the hour (its `created_at_gt` pass).
- **Blocked** (missing data, a warm / do-not-sequence / unsubscribed Contact, lists mapping to different campaigns, Smartlead refused it): one `Blocked:` comment and the reason in **Push blocked**, and Status stays Backlog. It isn't retried until someone clears Push blocked. A lead blocked for a missing email (Apollo hadn't revealed it) needs that clearing by hand once the email arrives.
- **Unmapped:** no comment, no Push blocked; it's picked up once its list is mapped.
- **The go-live gate is the Smartlead campaign.** Enrolled leads in a campaign that hasn't been started get no email, so keep a campaign unstarted until its copy is signed off. The first deploy enrols every waiting lead on a mapped list at once (122 on the Zapier People List as of 20 Nov 2026).
- Pacing: Smartlead calls share the `smartlead` pacer; the two Notion writes per lead (one page update, one comment) go through `notionWrites` (120/min). A waiting lead with a Contact to link costs one write, once.

## Webhook

`promoteToContact` is fired by a Notion database automation on Outbound Leads ("Send webhook" with the default body; get the URL with `ntn workers webhooks list`, which is a secret). It re-reads the page and acts only if Status is still Interested, so late or retried deliveries are harmless. It leaves a `Done:` or `Blocked:` page comment. Unexpected errors also become a `Blocked:` comment, with the message.

- **`promoteToContact`, Status → Interested.** Finds the Contact by email or creates one: Name, First/Last Name, Primary Email, Job Title, Location, Linkedin, Lead Source = **Outbound** (the option was created on first use). It links the Contact and stops the lead in every Smartlead campaign: `manual-complete`, falling back to `pause` because manual-complete 404s ("No sequences found for campaign") on a campaign with no sequences. `link-contact-to-company` then links the company.
- **Status options** (cleaned up 20 Nov 2026): Backlog, Sequenced, Interested. Sent, Not interested and Disqualfied were removed; Smartlead Status covers sends, replies and unsubscribes.
- **Automations don't fire on a net-zero change.** Flipping Status away and back within a few seconds produced no delivery. Leave a gap when re-triggering by hand.
- Comments posted by the API on a page that already has a discussion are appended to that discussion, not started as a new thread.

Tested live on 2026-10-30 against draft campaign 4276123 ("Outbound Sync Test (draft, do not start)"): Ada was promoted to a new Contact, re-promoted to the same Contact, and paused. The test Contact was trashed afterwards.
