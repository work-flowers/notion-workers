# notion-worker-ga4-sync

A [Notion Worker](https://www.notion.so/) that syncs Google Analytics 4 reports
for **work.flowers — Website** into Notion databases on a schedule, and links
each page back to the Notion record that is the source of its content.

## Reports

| Database | Grain | Metrics |
| --- | --- | --- |
| **Pages Path Report** 📄 | `date` × `pagePath` | Screen Page Views, Active Users, Total Users, Event Count, Scrolled Users, User Engagement Duration |
| **Traffic Session Source Medium Report** 🚥 | `date` × channel group × source × medium | Sessions, Engaged Sessions, Users, New Users, Key Events, User Engagement Duration |
| **Landing Page Report** 🛬 | `date` × `landingPage` × channel group | Sessions, Engaged Sessions, Bounce Rate, Avg Session Duration, Key Events |
| **Site Daily Summary** 📈 | `date` | Sessions, Engaged Sessions, Engagement Rate, Total/New/Active Users, Screen Page Views, Key Events, Avg Session Duration |
| **Page Performance** 🗂️ | `pagePath` | Lifetime and last-28-day views, users and engagement — plus the relation to the source page in Notion |

Page-scoped and session-scoped metrics are kept apart on purpose. `sessions`,
`bounceRate` and `averageSessionDuration` are attributes of a whole visit, so
they sit on **Landing Page Report** — attributing them to every page in a session
would be misleading. Likewise `newUsers` is absent from the page report: at page
grain GA4 counts users whose *first ever session* touched the page, which is not
"new visitors to this page".

All reports are filtered to `hostName == www.work.flowers`, which excludes the
Bullet CMS admin, preview deploys and localhost — about 5% of raw traffic.

## How it works

Each report has a **backfill + delta** pair writing to the same database:

- **Backfill** (`mode: "replace"`, `schedule: "manual"`) — walks the full history
  from `2026-04-01`. Run it for the initial load, after a schema change, or to
  repair drift; its mark-and-sweep also removes rows no longer present upstream.
- **Delta** (`mode: "incremental"`, `schedule: "6h"`) — re-reads the last
  `DELTA_LOOKBACK_DAYS = 4` days. GA4 keeps revising recent days as late hits and
  attribution settle, so those days are re-upserted every run.

Both stop at the last **complete** property-local day, computed in the property's
own timezone (`Asia/Singapore`) rather than UTC.

Syncs page by **date window**, not row offset, and every cycle is sized to
complete in a single `execute` so no pagination cursor is ever persisted — see
`CLAUDE.md` for why both of those matter for correctness.

| Sync key | Database | Mode | Schedule |
| --- | --- | --- | --- |
| `pagesPathBackfill` | Pages Path Report | replace | manual |
| `pagesPathDelta` | Pages Path Report | incremental | 6h |
| `trafficSourceMediumBackfill` | Traffic Session Source Medium Report | replace | manual |
| `trafficSourceMediumDelta` | Traffic Session Source Medium Report | incremental | 6h |
| `landingPageBackfill` | Landing Page Report | replace | manual |
| `landingPageDelta` | Landing Page Report | incremental | 6h |
| `siteDailyBackfill` | Site Daily Summary | replace | manual |
| `siteDailyDelta` | Site Daily Summary | incremental | 6h |
| `pagePerformanceSync` | Page Performance | replace | 6h |
| `pagePerformanceRelink` | Page Performance | incremental | 6h |

GA4 calls share the `ga4Api` pacer (60/min); Notion writes share `notionApi`
(3/sec).

## Authentication

GA4 is reached through the **Zapier connection**, using the `API Request (Beta)`
action so Zapier supplies the Google OAuth credentials. No Google service-account
key lives in this worker.

### Environment variables

| Variable | Description |
| --- | --- |
| `ZAPIER_CLIENT_ID` | Zapier SDK client ID (shared across workers). |
| `ZAPIER_CLIENT_SECRET` | Zapier SDK client secret (shared across workers). |
| `ZAPIER_GA4_CONNECTION_ID` | The stored Google Analytics 4 connection. |
| `GA4_PROPERTY_ID` | The numeric GA4 property ID. |
| `NOTION_API_TOKEN` | Used by the relation pass. |
| `PAGE_PERFORMANCE_DATA_SOURCE_ID` | Set after the first deploy (see below). |

```shell
ntn workers env set ZAPIER_GA4_CONNECTION_ID=021bc3c4-464a-8cd5-b99d-21644f733dc4
```

For local runs, pull them into a `.env` file with `ntn workers env pull`.

## Setup & deploy

Deploy from the repo root — this worker depends on the shared package, which the
ntn cloud build cannot resolve on its own:

```shell
./scripts/deploy.sh ga4-sync
```

Type-check first:

```shell
npm run check --workspace=notion-worker-ga4-sync
```

### First deploy: three manual steps

The first deploy creates the databases but cannot finish the relation wiring.

1. **Add the two relation properties by hand** to the **Page Performance** data
   source in Notion:
   - `Website Page` → relation to **Pages List**
   - `Blog Post` → relation to **Blog Posts**

   They are deliberately not in the worker's schema — declaring a property makes
   it read-only, and `Schema.relation` cannot target a database this worker does
   not manage. `CLAUDE.md` explains the trade-off in full.

2. **Give the Notion connection access** to Pages List, Blog Posts and Page
   Performance, then set the data source ID:

   ```shell
   ntn workers env set PAGE_PERFORMANCE_DATA_SOURCE_ID=<id>
   ```

3. **Run the backfills**, then let the deltas keep things current:

   ```shell
   for s in pagesPathBackfill trafficSourceMediumBackfill landingPageBackfill siteDailyBackfill; do ntn workers sync trigger "$s"; done
   ```

> [!IMPORTANT]
> The page and acquisition reports changed their primary keys in the 2026-08-02
> rework — paths are now normalised, and the acquisition key gained a
> channel-group segment. Existing rows carry the old keys and the incremental
> deltas will not remove them. Reset and re-run those two backfills so
> replace-mode sweeps the stale rows:
> ```shell
> ntn workers sync state reset pagesPathBackfill && ntn workers sync trigger pagesPathBackfill
> ```
> The old `New Users` column on Pages Path Report is no longer declared. It keeps
> its historical values and becomes editable; delete it by hand when convenient.

## Operating

```shell
# Live sync health for every sync
ntn workers sync status
```

```shell
# Preview a sync's output without writing to Notion
ntn workers sync trigger pagesPathDelta --preview
```

```shell
# Repair the relations without touching GA4
ntn workers sync state reset pagePerformanceRelink && ntn workers sync trigger pagePerformanceRelink
```

```shell
# Inspect run logs
ntn workers runs list
```

Rows in Page Performance with **Matched** unchecked are URLs with no Notion
record — usually a renamed slug that needs a redirect, or a 404. It makes a
useful triage view.

## Project layout

- `src/index.ts` — worker definition: databases, syncs, row mapping.
- `src/ga4.ts` — Zapier transport, retries, report helper, property-timezone dates.
- `src/paths.ts` — URL normalisation and page classification.
- `src/sourcePages.ts` — reads Pages List and Blog Posts, builds the path index.
- `src/relink.ts` — writes the relation over the Notion REST API.
- `.agents/skills/` — shared agent skills (`.claude/skills` is a compatibility symlink).
- `workers.json` — `ntn` CLI config (workspace/worker IDs).

## Have a question?

Join the [Notion Dev Slack](https://join.slack.com/t/notiondevs/shared_invite/zt-3u9oid9q8-HLUBmMVWYK~g9HFo4U4raA).
