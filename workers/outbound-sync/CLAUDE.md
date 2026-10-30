# outbound-sync

Keeps **🎯 Outbound Leads** in step with Apollo (who is in it) and, from Stage 2, Smartlead (what has happened to them). Spec: TKT-1051, "Set up Apollo and connect the Outbound Leads database". Outbound Leads stays the system of record; Dennis decides who gets contacted and who moves into the CRM.

**Stage 1 (built):** sync `apolloLeads`. **Stage 2 (not built):** Smartlead state columns, `smartlead-campaigns` sync, `push-to-smartlead` and `promote-to-contact` webhooks.

## Data sources

| | id |
|---|---|
| Outbound Leads | data source `61a01f87-741b-4dbd-a98e-ada01e07eb3b` (database `92d79468-07fa-4aee-8d54-99e60b3dbd5e`) |
| Contacts (Stage 2 pre-flight) | data source `21991b07-11ac-81a6-a894-000be4a09a67` |

## Attached, not managed

`outboundLeads` is `type: "attached"`, which needs `@notionhq/workers` ≥ 0.8.5 (the repo bumped to 0.8.12 for this). After the first deploy, bind it with `ntn workers databases attach outboundLeads 61a01f87-741b-4dbd-a98e-ada01e07eb3b` (it takes the data source ID or a database link), then run `ntn workers sync trigger apolloLeads --preview` before any real run, because attaching lets the sync overwrite rows.

While attached:

- **Declared properties are read-only in Notion.** Declared: Lead (title), Apollo ID (primary key), Role, Company, Email, LinkedIn Profile URL, Location. Everything a human edits stays undeclared: Status, Campaign, Subject Line, Message, Notes, Owner, Contacts, Follow-up Date, Date Sent, Outreach Method, Phone, JD Summary, Job Listing.
- **Rows can't be added or deleted by hand** or by other integrations. Every lead enters through an Apollo list.
- **Detach before decommissioning.** Run `ntn workers databases detach outboundLeads` first. That releases the read-only locks and leaves every row. Deleting the worker or removing the declaration does *not* release the database; it stays locked with nothing able to release it.
- Rows from before the worker have no Apollo ID. Incremental mode leaves them alone, but their titles become read-only.

## `apolloLeads` sync

- **Incremental, every 15 min. Never replace mode.** Replace mode would delete the row (with its notes and status) of anyone dropped from an Apollo list.
- Pages through `POST /api/v1/contacts/search` filtered by `contact_label_ids` (the lists in `APOLLO_LIST_IDS`), newest-updated first, and stops at the first contact not newer than the cursor. Apollo has no updated-since filter. The cursor trails the high-water mark by 5 minutes, so late-indexed contacts aren't skipped.
- Adding a list to `APOLLO_LIST_IDS` only picks up contacts updated after the cursor. To pull a new list in full, run `ntn workers sync state reset apolloLeads`.
- `key` is the Apollo contact ID, byte-identical to the `Apollo ID` value (see the root CLAUDE.md on why this matters).
- Unrevealed emails arrive as `email_not_unlocked@…` and are written as empty.
- Status isn't declared, so the sync can't set it. New rows get **Backlog** from the Status property's default option, which is set by hand in Notion.

## Environment

| Variable | What |
|---|---|
| `ZAPIER_CLIENT_ID`, `ZAPIER_CLIENT_SECRET` | Zapier SDK credentials (secrets; `ntn workers env set`) |
| `APOLLO_CONNECTION_ID` | `02b3ee04-e9e5-88ba-929d-5fc5f76b65b1`, API by Zapier connection `apollo-api` (`X-Api-Key`, Apollo master key, domain filter `api.apollo.io`) |
| `APOLLO_LIST_IDS` | Comma-separated Apollo list (label) IDs for this programme |
| `SMARTLEAD_CONNECTION_ID` (Stage 2) | `026b0294-a57f-860d-a074-70574d40aa52`, API by Zapier connection `Smartlead` |

**Don't use the Apollo.io app connection** (`02be390b…`). Its auth template injects `name = "Zapier Master Key"` into every contact search, so every search returns zero contacts with a 200. The relay call can't override it.

## Smartlead notes for Stage 2 (verified 2026-10-30)

- `GET /campaigns/{id}/leads` (limit ≤ 100, `offset`, `event_time_gt`) returns status, `lead_category_id`, lead fields and `custom_fields` only: no sequence step, no reply text.
- Sequence step and replied/bounced/unsubscribed flags come from `GET /campaigns/{id}/statistics` (per-email rows, limit ≤ 1000).
- Latest reply text needs a per-lead message-history call, which isn't in Smartlead's current API index. Confirm it against a real campaign.
- Add leads: `POST /campaigns/{id}/leads` (≤ 400 per call, `custom_fields`). Stop a lead: `PATCH /campaigns/{id}/leads/{lead_id}/status`.
