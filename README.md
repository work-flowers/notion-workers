# notion-worker-ga4-sync

A [Notion Worker](https://www.notion.so/) that syncs Google Analytics 4 (GA4) report data into Notion databases on a schedule.

It pulls two GA4 reports and keeps a Notion database for each in sync:

| Report | Notion database | Dimensions | Metrics |
| --- | --- | --- | --- |
| Pages Path | **Pages Path Report** 📄 | `date`, `pagePath` | Screen Page Views, New Users, Total Users, User Engagement Duration |
| Traffic Source/Medium | **Traffic Session Source Medium Report** 🚥 | `date`, `sessionSource`, `sessionMedium` | Sessions, Users |

All worker code lives in [`src/index.ts`](src/index.ts).

## How it works

Each report is synced by a **backfill + delta** pair of syncs writing to the same database:

- **Backfill** (`mode: "replace"`, `schedule: "manual"`) — paginates the full GA4 history from `2020-01-01` to yesterday. Run it manually for the initial load, after schema changes, or to repair drift. Its replace-mode mark-and-sweep also cleans up rows no longer present upstream.
- **Delta** (`mode: "incremental"`, `schedule: "1h"`) — every hour, re-fetches just the last few days (`DELTA_LOOKBACK_DAYS = 3`) up to yesterday. GA4 metrics for recent days keep settling (late hits, attribution), so the lookback re-upserts those days to stay accurate.

Both syncs end at **yesterday** (`getDateNDaysAgo(1)`) rather than today, since the current day's GA4 data is incomplete.

| Sync key | Database | Mode | Schedule |
| --- | --- | --- | --- |
| `pagesPathBackfill` | Pages Path Report | replace | manual |
| `pagesPathDelta` | Pages Path Report | incremental | 1h |
| `trafficSourceMediumBackfill` | Traffic Session Source Medium Report | replace | manual |
| `trafficSourceMediumDelta` | Traffic Session Source Medium Report | incremental | 1h |

Both report families share one pacer, `ga4Api` (`100` requests / `60s`), to stay within GA4's quotas. Pages are fetched in batches of `250` rows via the GA4 Data API `runReport` `offset`/`limit`.

## Authentication

GA4 is accessed with a **Google service account** (JWT bearer flow — no interactive OAuth). The worker signs a JWT with the service account's private key, exchanges it for an access token scoped to `analytics.readonly`, and caches the token until shortly before it expires.

To set this up:

1. Create a Google Cloud service account and download its JSON key.
2. In Google Analytics, grant that service account **Viewer** access to the GA4 property.
3. Push the secrets to the worker (see below).

### Required secrets

| Secret | Description |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The full service account key JSON, as a single-line string. |
| `GA4_PROPERTY_ID` | The numeric GA4 property ID (e.g. `123456789`). |

```shell
ntn workers env set GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"...","private_key":"..."}'
ntn workers env set GA4_PROPERTY_ID=123456789
```

For local runs, pull them into a `.env` file:

```shell
ntn workers env pull
```

## Setup & deploy

```shell
npm install
npm run check          # type-check
ntn login              # connect your Notion workspace
ntn workers deploy     # build and publish
```

After deploying, run the backfills once to populate the databases, then let the deltas keep them current:

```shell
ntn workers sync trigger pagesPathBackfill
ntn workers sync trigger trafficSourceMediumBackfill
```

> [!NOTE]
> Deploying does **not** reset sync state — syncs resume from their last cursor. To re-run a backfill from scratch:
> ```shell
> ntn workers sync state reset pagesPathBackfill && ntn workers sync trigger pagesPathBackfill
> ```

## Operating

```shell
# Live sync health for all four syncs
ntn workers sync status

# Preview a sync's output without writing to Notion
ntn workers sync trigger pagesPathDelta --preview

# Trigger a real sync immediately (bypass schedule)
ntn workers sync trigger pagesPathDelta

# Inspect run logs
ntn workers runs list
ntn workers runs logs <runId>

# Pause / resume a sync
ntn workers capabilities disable pagesPathDelta
ntn workers capabilities enable pagesPathDelta
```

## Project layout

- `src/index.ts` — worker definition: service-account auth, GA4 fetch helper, databases, and the four syncs.
- `.agents/skills/` — shared agent skills (`.claude/skills` is a compatibility symlink).
- `dist/` — build output (generated).
- `workers.json` — `ntn` CLI config (workspace/worker IDs).

## Local development

```shell
npm run check   # type-check only
npm run build   # emit dist/
```

Local execution loads `.env` automatically, so secrets pulled with `ntn workers env pull` are available via `process.env`.

## Have a question?

Join the [Notion Dev Slack](https://join.slack.com/t/notiondevs/shared_invite/zt-3u9oid9q8-HLUBmMVWYK~g9HFo4U4raA).
