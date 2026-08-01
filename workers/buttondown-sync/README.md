# Buttondown → Notion sync

A [Notion Worker](https://developers.notion.com/workers) that syncs newsletter data from [Buttondown](https://buttondown.com) into Notion managed databases.

## What it does

Two managed databases, two syncs:

| Database | Sync | Schedule | Mode | Description |
|---|---|---|---|---|
| **Buttondown email analytics** | `emailAnalyticsSync` | `6h` | `replace` | One row per sent email with recipients, deliveries, opens, clicks, open/click rate, failures, unsubscriptions, complaints, replies. |
| **Buttondown subscriber counts** | `subscriberCountsSync` | `6h` | `incremental` | One row per day with total, active, and per-status subscriber counts (regular, premium, churned, etc.). |

Plus a standalone script for historical subscriber counts — see below.

### Newsletter issue linking

`emailAnalyticsSync` also keeps a **Newsletter Issue** relation on each analytics
row pointed at the matching page in the *Newsletter Issues* data source, so an
issue page shows its own send stats. The join is on Buttondown's email id —
`Email ID` on the analytics row, `Buttondown ID` on the issue.

Three things about it are deliberate:

- **The property is hand-added, not part of the managed schema.** Declaring it
  would make it read-only, and `Schema.relation()` only relates two syncs —
  *Newsletter Issues* is edited by hand. So the sync writes it through the Notion
  API instead. If the property is missing or isn't a relation, the pass logs and
  skips; the analytics sync is unaffected.
- **A brand-new send is linked on the following cycle, so within 6h.** The
  platform applies a sync's changes *after* the handler returns, so on the cycle
  where a send first appears there is no row yet to relate.
- **Only wrong or missing relations are written**, which makes it cheap to repeat
  and self-healing: if a `replace` cycle ever deletes and re-creates a row, the
  next pass restores its relation.

Sends with no matching issue page are counted and left alone — expected for a
Buttondown resend, which gets its own email id with no issue page behind it.

⚠️ `ntn workers sync trigger emailAnalyticsSync --preview` is **not** side-effect
free for this sync: preview skips writes to the managed database, but the relation
pass writes through the API regardless.

Existing rows can also be linked without waiting for a cycle, with
`workers/newsletter-dashboard/scripts/backfill-issue-relation.ts`.

## Setup

Prerequisites: Notion Business/Enterprise workspace with [Workers opted in](https://www.notion.so/?target=ai), the [`ntn` CLI](https://developers.notion.com/workers) installed, Node 22+.

```bash
npm install

# Set secrets — get the Buttondown key from https://buttondown.com/settings/programming
ntn workers env set BUTTONDOWN_API_KEY=<your-buttondown-key>
ntn workers env set NOTION_API_TOKEN=<your-notion-token>

# Type-check + deploy
npm run check
ntn workers deploy
```

`NOTION_API_TOKEN` is a [personal access token](https://developers.notion.com/guides/get-started/personal-access-tokens) or internal-integration token — required for syncs to write to Notion.

## Operating

```bash
ntn workers sync status                                # live dashboard
ntn workers sync trigger emailAnalyticsSync --preview  # dry-run
ntn workers sync trigger subscriberCountsSync          # run on demand
ntn workers runs list
ntn workers runs logs <runId>
```

Reset a sync's cursor (e.g. after a schema change):

```bash
ntn workers sync state reset <syncKey>
```

## One-off: backfill historical subscriber counts

Buttondown's API doesn't expose historical subscriber snapshots, but each subscriber has a `creation_date`. [`scripts/export-subscriber-history.ts`](scripts/export-subscriber-history.ts) paginates every subscriber, buckets by join date, and emits a CSV with cumulative counts by current type — one row per day from the earliest join through today.

```bash
BUTTONDOWN_API_KEY='<your-key>' npx tsx scripts/export-subscriber-history.ts > subscriber-history.csv
```

Clip the start date if subscribers were imported from another platform (their `creation_date` predates your move to Buttondown):

```bash
BUTTONDOWN_API_KEY='<your-key>' START_DATE=2025-01-01 \
  npx tsx scripts/export-subscriber-history.ts > subscriber-history.csv
```

Subscribers who joined before `START_DATE` still contribute to the day-1 baseline; they just don't get their own row.

Import the CSV into the *Buttondown subscriber counts* database via the `…` menu → **Merge with CSV**, matching on `Snapshot Date`.

**Caveat:** status columns reflect each subscriber's *current* type, not their type on the historical date. Buttondown doesn't expose status-change history, so this is the closest reconstruction available.

## Files

- [`src/index.ts`](src/index.ts) — Worker entry point: both managed databases and syncs, plus the newsletter-issue relation pass.
- [`scripts/export-subscriber-history.ts`](scripts/export-subscriber-history.ts) — Standalone CSV exporter (not part of the Worker).
- `workers.json` — Worker ID for this deploy (gitignored).
