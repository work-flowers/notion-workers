# Luma Guest Sync — Notion Worker

A [Notion Worker](https://developers.notion.com/workers) that keeps a Notion
database in sync with the latest [Luma](https://luma.com) guest-registration
export. On a schedule it reaches into a Google Drive folder **via the Zapier
SDK**, picks the newest `Guests` CSV, parses it, and upserts each guest into a
Worker-managed Notion database.

```
┌────────────┐   Zapier SDK      ┌──────────────┐   parse + map    ┌────────────────┐
│ Google     │  (Drive v3 API,   │  this Worker │  upsert (replace │  Notion DB     │
│ Drive      │──► newest CSV ───►│  sync, hourly│──► mode, keyed ─►│ "Luma Event    │
│ folder     │   zapier.fetch)   │              │   on guest_id)   │  Guests"       │
└────────────┘                   └──────────────┘                  └────────────────┘
```

## How it works

- **Trigger:** a Worker `sync` capability on an **hourly** schedule.
- **Source:** the Zapier SDK holds your Google Drive OAuth connection. The Worker
  calls the Drive v3 REST API through `zapier.fetch`, so it never handles Google
  tokens. Shared Drives are supported (`supportsAllDrives`).
- **File selection:** among CSVs in the folder, it picks the **latest export**,
  preferring the timestamp embedded in Luma's filename
  (`… - Guests - YYYY-MM-DD-HH-MM-SS.csv`) and falling back to Drive's
  `modifiedTime`.
- **Destination:** a Worker-**managed** database named *Luma Event Guests*. The
  schema is defined in code ([`src/index.ts`](src/index.ts)) and created/migrated
  on deploy.
- **Mode:** `replace` — the database mirrors the newest export. Guests that
  disappear from the latest CSV are removed on the mark-and-sweep. The primary
  key is `guest_id`, so re-syncing updates rows in place.
- **All guests** are synced regardless of `approval_status`; the status is a
  filterable Notion property.

### Safety guard against accidental wipes

In `replace` mode, an empty result on a completed cycle would delete every row.
To prevent a transient Drive/Zapier hiccup from wiping the database, the sync
**throws (never returns an empty success)** when it can't find a CSV, can't
download it, the file isn't a Luma export, or has zero data rows. An errored
cycle skips the mark-and-sweep, so no deletions happen — and the failure is
visible in `ntn workers sync status` / run logs rather than silently doing
nothing. (The `SyncExecutionResult` type has no `error` field; throwing is the
real failure channel.)

## Project layout

| File | Purpose |
|------|---------|
| [`src/index.ts`](src/index.ts) | Worker entry: managed-DB schema + the `lumaGuestSync` sync (batched pagination, safety guards). |
| [`src/drive.ts`](src/drive.ts) | Google Drive access through the Zapier SDK (list folder, download file). |
| [`src/luma.ts`](src/luma.ts) | CSV parsing, Luma-format validation, latest-file ranking, and row → Notion property mapping. |

## Column mapping

| Luma CSV column | Notion property | Type |
|-----------------|-----------------|------|
| `name` (→ first/last/email/id fallback) | Name | Title |
| `guest_id` | Guest ID | Text (**primary key**) |
| `email` | Email | Email |
| `first_name` / `last_name` | First Name / Last Name | Text |
| `phone_number` | Phone | Phone |
| `created_at` | Registered At | Date (datetime) |
| `approval_status` | Approval Status | Select |
| `checked_in_at` | Checked In At | Date (datetime) |
| `utm_source` | UTM Source | Select |
| `ticket_name` | Ticket Name | Select |
| `amount` (`$0.00` → `0`) | Amount | Number (dollar) |
| `qr_code_url` | QR Check-In URL | URL |
| `survey_response_rating` | Survey Rating | Number |
| `survey_response_feedback` | Survey Feedback | Text |
| *What company do you work for?* | Company | Text |
| *What is your job title?* | Job Title | Text |
| *What is your LinkedIn profile?* | LinkedIn | URL |
| *Which best describes how you use Notion today?* | Notion Usage | Select |
| *Have you used Zapier before?* | Used Zapier Before | Select |
| *Work email address* | Work Email | Email |
| *Stay connected… mailing list* (Yes/No) | Mailing List Opt-In | Checkbox |

Blank or junk values (e.g. an email of `"Na"`, a non-URL LinkedIn field) are
omitted so the cell is simply left blank. Custom-question columns are matched by
prefix, so minor wording changes upstream won't silently drop data.

## Prerequisites

- A Notion **Business or Enterprise** workspace with Workers opted in at
  <https://www.notion.so/?target=ai>.
- The `ntn` CLI: `curl -fsSL https://ntn.dev | bash` then `ntn login`.
- A **Zapier** account with a connected **Google Drive** account
  (<https://zapier.com/app/assets/connections>) and the Zapier SDK in open beta.

## Setup

### 1. Register the Worker

This repo already contains the source. Generate a Worker ID / `workers.json`
(the CLI provisions the Worker), then install deps:

```bash
ntn login
ntn workers new          # creates workers.json in this project (accept defaults)
npm install
```

> If `ntn workers new` insists on an empty directory, run it in a scratch folder
> and copy the generated `workers.json` here — it only holds the Worker ID.

### 2. Generate Zapier client credentials (headless auth)

The sync runs on Notion's servers with no browser, so it authenticates to Zapier
with client credentials. Generate them once locally:

```bash
npx zapier-sdk create-client-credentials "notion-luma-worker"
```

Save the `client_id` and `client_secret` — **the secret is shown only once.**

### 3. Set secrets

```bash
ntn workers env set NOTION_API_TOKEN=ntn_xxx          # personal access token or internal integration
ntn workers env set ZAPIER_CLIENT_ID=xxx ZAPIER_CLIENT_SECRET=yyy
ntn workers env set GDRIVE_FOLDER_ID=<drive-folder-id>
```

- `NOTION_API_TOKEN` — a sync isn't called by an agent, so it needs its own
  token. If you use an internal integration, connect it to the *Luma Event
  Guests* database after the first deploy.
- `GDRIVE_FOLDER_ID` — open the Drive folder; the ID is the last URL segment:
  `https://drive.google.com/drive/folders/<FOLDER_ID>`.

See [`.env.example`](.env.example) for the full list (used for local testing too).

### 4. Deploy and run

```bash
npm run check                 # type-check
ntn workers deploy            # create the managed DB + schedule the sync

ntn workers sync trigger lumaGuestSync --preview   # dry run — inspect changes, no writes
ntn workers sync trigger lumaGuestSync             # run for real now
ntn workers sync status                            # live status
```

The managed database appears in your workspace after the first deploy. Hourly
runs start automatically.

## Local testing

```bash
ntn workers env pull          # write remote secrets into a local .env
npm run build
ntn workers sync trigger lumaGuestSync --preview
```

## Operational notes

- **Change the schedule** in [`src/index.ts`](src/index.ts) (`schedule: "1h"`):
  allowed values `5m`, `15m`, `30m`, `1h`, `6h`, `12h`, `1d`, `7d`,
  `continuous`, `manual`.
- **Filter to approved-only:** filter `rows` in the sync before mapping (e.g.
  `rows.filter(r => ["approved"].includes(r.approval_status))`). Note: in
  `replace` mode, filtered-out guests are then treated as absent and removed.
- **Reset after a schema change:** `ntn workers sync state reset lumaGuestSync`.
- **Logs:** `ntn workers runs list` then `ntn workers runs logs <runId>`.

## Caveats to verify on first deploy

- **Zapier → Google API scope.** `zapier.fetch` injects the Google Drive
  connection's OAuth token. If a `403 insufficient scopes` appears in the logs,
  re-authorize the Drive connection in Zapier (or switch `ZAPIER_GDRIVE_APP`).
- **Native CSVs only.** The Worker downloads `text/csv` via `alt=media`. If your
  Luma exports get auto-converted to Google Sheets on upload, they'd need the
  Sheets export endpoint instead — keep them as raw `.csv` in Drive.
- **Pre-release SDK.** `@notionhq/workers` and the Workers platform are
  pre-release; pin versions and expect occasional breaking changes.
