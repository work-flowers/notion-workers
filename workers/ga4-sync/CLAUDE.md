# ga4-sync — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## What it touches

- **GA4 property `532585399`** — "work.flowers — Website", account `391009717`.
  One web data stream, `G-6FPQKF7KR9`, `https://www.work.flowers`. Read-only.
- **Notion Pages List** `1d791b07-11ac-8140-bb4e-000b76786676` — parent-level
  static pages, keyed on a `Path` property. Human-owned. Read-only.
- **Notion Blog Posts** `1d791b07-11ac-8146-9124-000b0d6dbcc8` — blog articles,
  keyed on a `Slug` property (no `/blog` prefix). Human-owned. Read-only.

The property was created **2026-04-12**; there is no data before then, which is
why `DATA_START_DATE` is `2026-04-01` and not something safely ancient. Property
timezone is **Asia/Singapore**, currency **SGD**.

## Auth: Zapier, not a service account

GA4 is reached through the Zapier **API Request (Beta)** action
(`google-analytics-4` / `write` / `_zap_raw_request`), which injects Zapier's
stored Google OAuth credentials. There is no Google service-account key here —
the previous `GOOGLE_SERVICE_ACCOUNT_JSON` JWT flow was removed on 2026-08-02.

Two things about that action matter before touching `src/ga4.ts`:

- **`fail_on_errors` must stay `false`.** With `true`, Zapier discards the
  upstream response and returns an opaque `HTTP 503: upstream connect error` —
  a bad metric name becomes undiagnosable. With `false` the real status and GA4
  error body come back, and `callDataApi` raises its own error from them.
- **`true` is what triggers Zapier's OAuth refresh.** Since we run with `false`,
  a `401` is retried once with `fail_on_errors: true` purely to force the
  refresh, then the normal retry loop continues.

Both `analyticsdata.googleapis.com` and `analyticsadmin.googleapis.com` are
reachable — the Zapier integration's domain allowlist covers them, so the Admin
API is available for ad-hoc inspection too.

## Environment variables

| Variable | Notes |
| --- | --- |
| `ZAPIER_CLIENT_ID` | Shared across workers — see the rotation checklist in the root `CLAUDE.md`. |
| `ZAPIER_CLIENT_SECRET` | Same. |
| `ZAPIER_GA4_CONNECTION_ID` | `021bc3c4-464a-8cd5-b99d-21644f733dc4`. Per-worker, names a stored connection; not a secret. |
| `GA4_PROPERTY_ID` | `532585399`. |
| `NOTION_API_TOKEN` | For the relation pass. 1Password `notion-worker-ga4-sync`. |
| `PAGE_PERFORMANCE_DATA_SOURCE_ID` | `5e775afc-5dfb-44fa-b584-c46b9b24bcdc`. Only knowable **after** the first deploy creates the database. |

`NOTION_` is a **reserved env-var prefix** — `ntn workers env set` rejects any
name starting with it (`NOTION_API_TOKEN` itself is allowlisted). That is why the
data-source variable is not called `NOTION_PAGE_PERFORMANCE_DATA_SOURCE_ID`.

Credentials in 1Password follow the workspace convention: `notion-worker-<name>`
holds a Notion integration token, `zapier-<name>` holds a Zapier SDK client
ID + secret (fields `client id` / `client secret`). This worker uses
`notion-worker-ga4-sync` and `zapier-ga4-sync`.

The three Notion databases created on 2026-08-02 all live in the **Website
Analytics** database (`34191b07-11ac-800f-84d8-ce3763ef0108`) alongside the two
originals:

| Data source | ID |
| --- | --- |
| 📄 Pages Path Report | `586c5724-6129-4e04-b2f6-986d80248392` |
| 🚥 Traffic Session Source Medium Report | `dd99b9e0-17a4-4a02-bd9a-6573c4faa1f7` |
| 🛬 Landing Page Report | `83ecca30-3088-499d-b18c-9868d9135f73` |
| 📈 Site Daily Summary | `63e21b6e-04db-4af4-9f64-e3bbe9b793e4` |
| 🗂️ Page Performance | `5e775afc-5dfb-44fa-b584-c46b9b24bcdc` |

## Path normalisation is load-bearing

GA4 reports `/blog/x` and `/blog/x/` as two separate pages and the site emits
both — six URLs were being double-counted before `src/paths.ts` existed, plus
`/inviting-us-to-zapier/` against `/inviting-us-to-Zapier`. Notion is no more
consistent: most blog `Slug` values read `/slug`, five read `slug`, and one reads
`slug/`.

Everything on both sides goes through `normalizePath` — lower-cased, query and
fragment dropped, slashes collapsed, one leading slash, no trailing slash — before
it is compared or used as a sync key. `mapPageRows` then **aggregates** rows that
collapse to the same key; two GA4 rows becoming one primary key within a single
batch would otherwise be two upserts fighting each other.

Measured against the real data: 117 GA4 paths collapse to 111, and 86% of
lifetime views resolve to a Notion source page. Nearly all of the remainder is
`/blog/tags/*` and `/blog/authors/*`, which correctly have no source record.

## A change's `key` must equal the primary key property's value

Every mapper writes its `key` verbatim into `Name` (the `primaryKeyProperty`).
That is not stylistic — it is what makes a row identifiable at all. The platform
resolves an upsert's `key` through the *value* of the primary key property, so a
key that differs from the string written into that property matches nothing and
**inserts on every run**.

`mapSiteRows` got this wrong: `key` was GA4's raw `20260729` while `Name` was
`isoDate(...)` → `2026-07-29`. Consequences, found 2026-08-03:

- `siteDailyDelta` re-reads `DELTA_LOOKBACK_DAYS` = 4 days every 6h, so Site
  Daily Summary gained **four new rows every run** — 124 rows for 112 dates
  after barely a day. Nothing looked wrong: `sync status` showed `healthy`, and
  every run legitimately reported four upserts.
- Every duplicate was byte-identical across all nine metrics, and **no row in the
  database had `last_edited_time != created_time`** — the tell that the sync had
  never once updated anything.
- The other three reports were unaffected because their key *is* their title
  (`${date}::${path}` etc.). Pages Path Report proves the same point from the
  other direction: 177 rows created by an earlier deployment between April and
  2026-08-02 were silently *adopted* by the new backfill, because their titles
  matched the keys it emitted.

Mark-and-sweep cannot clean this up. Replace mode only removes keys absent from
the batch, and duplicates share a key: a `siteDailyBackfill` run over 113 keys
with two duplicated dates still present reported **113 upserts, 0 deletes**.

### Fixing duplicates by hand

Two behaviours make this fiddlier than it looks, both verified on 2026-08-03:

- The key→row resolution is **remembered**, and an upsert will **un-archive a
  trashed row** to write to it. Trashing all but one copy is not enough — the
  next delta run revived two of the eleven rows that had been trashed.
- **Renaming a trashed row over the REST API does not repoint it.** The renamed
  rows were revived again *and had their titles rewritten* on the next run.

What works: trash the copies the syncs are *not* writing to (the ones whose
`last_edited_time` did not move on a triggered run), then trigger both the delta
and the backfill and confirm nothing is revived and nothing is created. Site
Daily settled at 113 rows for 113 contiguous dates, 2026-04-12 … 2026-08-02.

## Syncs page by date window, not row offset — and finish in one call

`windowedSync` walks a date range `windowDays` at a time, fetching each window in
a single request. Date windows rather than row offsets, because:

- GA4 leaves row ordering **unspecified** unless `orderBys` is set, so an
  `offset`/`limit` scheme can overlap or skip rows between pages as data settles.
  `runReport` always sorts by every dimension, but windowing removes the hazard
  rather than mitigating it.
- Every row for a given day arrives in one response, so normalisation can merge
  duplicate paths with certainty. A row-offset scheme could split `/blog/x` and
  `/blog/x/` across two pages and write both halves.

**`BACKFILL_WINDOW_DAYS` is 1500 on purpose** — wide enough that every cycle
completes in a single `execute`. This is a correctness requirement, not a
performance choice:

> The runtime ignores `nextState` when `hasMore` is false, so the last cursor a
> multi-call cycle persists is the one from its *second-to-last* call. Whether
> the platform hands that cursor to the next cycle or discards it is not
> observable from the SDK, the CLI, or `sync status --json` — and the two
> behaviours differ catastrophically for a replace-mode sync, where resuming
> mid-range reports a partial dataset as complete and lets mark-and-sweep delete
> the rest.

Sizing the window to cover the whole range means no cursor is ever persisted, so
the question never arises. The windowing machinery is kept because the property
will outgrow one call; `MAX_CHANGES_PER_EXECUTE` (2,500) is the tripwire, and the
`from`/`end` guard on `WindowState` makes a resumed cursor safe for the
*incremental* deltas, where a partial batch deletes nothing.

**This is a dated workaround, not a permanent fix.** The largest report (landing
page) was ~1,160 rows for four months on 2026-08-02 and grows ~290/month, so the
ceiling lands around mid-2027. Before then, settle the state question — the
cheapest way is a scratch worker with a two-call replace sync that logs the
`state` it receives: trigger it twice and see whether the second cycle's first
call gets `undefined` or the penultimate cursor. If it resets, delete this
workaround and page normally. The paginated path is already verified contiguous
and gap-free; it is only the replace-mode sweep that makes it unsafe today.

`runReport` throws when `rowCount` exceeds the rows returned. That means a window
has outgrown the API row limit and must not truncate quietly.

All date arithmetic uses `todayInPropertyTz()`, not `new Date().toISOString()`.
GA4's `date` dimension resolves in property time; computing "yesterday" in UTC
lands on the wrong day for eight hours out of every twenty-four.

## Hostname filter

Every report is filtered to `hostName == www.work.flowers`. Without it, roughly
5% of traffic is not the website: `app.bullet.so` (the Bullet CMS admin — its
`/site/Isbw6XlCS35Ea2JF9Kaj/pages` was the 4th most-viewed "page" in Notion),
`*.workflowers-bullet.pages.dev` preview deploys, and `localhost`.

## Hand-added relation properties (not reproducible from code)

The **Page Performance** data source has two relation properties that are
**deliberately not declared** in `worker.database()`:

| Property | Target data source |
| --- | --- |
| `Website Page` | Pages List — `1d791b07-11ac-8140-bb4e-000b76786676` |
| `Blog Post` | Blog Posts — `1d791b07-11ac-8146-9124-000b0d6dbcc8` |

They must be added by hand in Notion. Declaring them is not an option:
`Schema.relation(key)` requires the related database to be declared in the same
worker, and `worker.database()` only supports `type: "managed"` — so declaring
them would mean making two human-owned content databases worker-managed, marking
their properties read-only and putting a generated schema in charge of the
website's content. Leaving them undeclared keeps them writable, which is exactly
what lets `pagePerformanceRelink` fill them in over the REST API.

`ntn workers databases attach` would bind a declared key to an existing data
source and make `Schema.relation` work natively. It was rejected for the same
reason.

The mapping is a pure function of the page path, so the relink pass is idempotent
and self-healing — re-running it repairs anything a replace-mode sweep removed.
`Source URL` and `Matched` are declared and written by `pagePerformanceSync` from
the same lookup, so the relation can always be checked against a value the sync
owns. `relinkPage` skips any row whose relation property does not exist yet,
rather than 400-ing on every row of every run before the properties are added.

## Reports

| Sync | Database | Grain | Notes |
| --- | --- | --- | --- |
| `pagesPath*` | Pages Path Report | `date` × `pagePath` | Page-scoped metrics only. |
| `trafficSourceMedium*` | Traffic Session Source Medium Report | `date` × channel × source × medium | |
| `landingPage*` | Landing Page Report | `date` × `landingPage` × channel | Session-scoped metrics. |
| `siteDaily*` | Site Daily Summary | `date` | One row per day. |
| `pagePerformanceSync` | Page Performance | `pagePath` | Lifetime + 28d rollup. Carries the relation. |
| `pagePerformanceRelink` | Page Performance | — | Writes the relation. Emits no changes. |

**`newUsers` is deliberately absent from the page report.** At page grain GA4
counts users whose *first ever session* touched the page, which is not "new
visitors to this page" but reads as if it were. Session-scoped measures
(`sessions`, `bounceRate`, `averageSessionDuration`) live on `landingPage`
instead, where attributing them to the page the session *started* on is
meaningful. Note GA4 emits `landingPage` **without** a trailing slash, unlike
`pagePath`.

Rate metrics (`bounceRate`, `engagementRate`) cannot be summed when rows merge —
`weightedMean` re-weights them by sessions.

`pagePerformanceRelink` is a sync that returns `changes: []` and does its work as
a side effect. That is off-pattern, but `worker.sync` is the only scheduled
primitive in the SDK — `worker.tool` is on-demand and `worker.workflow` is
trigger-based — and this way the pass gets scheduling, run logs and health
monitoring for free.

## The website-dashboard custom block

This worker also ships a **custom block** — `blocks/website-dashboard`, declared
by `worker.customBlock("websiteDashboard", …)` at the bottom of `src/index.ts`.

**How custom blocks work in general — project shape, the Vite `root` pin, the
`.mts` config requirement, block-vs-view placement, manifest binding, what the
sandbox forbids, chart colour against Notion's surfaces — lives in
[`docs/custom-blocks.md`](../../docs/custom-blocks.md).** Read that first; this
section only records what's specific to this worker.

### Why it's in here and not its own worker

The manifest mirrors the schemas declared above. `New Users` was dropped from
Pages Path Report on 2026-08-02; the same change to a property this block binds
would silently leave it `undefined`, and nothing but a comment would connect the
two. Co-locating makes that one PR. The dashboard is also the primary way this
data gets consumed, so shared fate on deploy is acceptable rather than merely
tolerable.

The cost is that `./scripts/deploy.sh ga4-sync` now vendors the shared package
**and** runs a Vite build in the same cloud sandbox. That combination was
verified by hand on 2026-08-03 (fresh `npm install` from the vendored tarball,
then `npx vite build` from the block directory), but a frontend error will now
fail a sync deploy. Run `npm run build:block --workspace=notion-worker-ga4-sync`
before deploying.

### Which properties it binds — keep this in sync with the schemas

Renaming or dropping any of these unbinds a slot in every inserted instance.
The config panel reflects the *deployed* manifest, so a change only shows up
after a redeploy.

| Key | Data source | Properties |
| --- | --- | --- |
| `daily` | 📈 Site Daily Summary | `Date`, `Sessions`, `Engaged Sessions`, `Avg Session Duration`, `Screen Page Views`, `Total Users`, `New Users`, `Key Events` |
| `acquisition` | 🚥 Traffic Session Source Medium Report | `Date`, `Channel Group`, `Session Source`, `Session Medium`, `Sessions`, `Engaged Sessions`, `New Users`, `User Engagement Duration` |
| `pages` | 🗂️ Page Performance | `Page`, `Page Type`, `Views`, `Users`, `Engagement (s)`, `Views (28d)`, `Users (28d)`, `Engagement (28d)`, `Matched`, `Source Title` |
| `pageDays` | 📄 Pages Path Report | `Date`, `Page Path`, `Page Type`, `Screen Page Views`, `Total Users`, `User Engagement Duration` |

**`useDataSource` caps a query at 999 rows**, so how each key loads depends on
its size:

- `daily`, `pages` — loaded whole. Site Daily grows one row a day, Page
  Performance one per URL; years of headroom.
- `acquisition` — loaded whole, **and about to outgrow it**: 865 rows on
  2026-09-30, growing ~6 a day, so it reaches the cap around late October 2026.
  After that the host returns an arbitrary 999 and the Acquisition tab and the
  drill-down's channel split silently lose rows. Needs a range-filtered,
  date-sorted query (or per-period queries like `pageDays`) before then.
- `pageDays` — already far past it (1,917 rows on 2026-09-30), so it is **never
  loaded whole**. The drill-down queries one period at a time with a
  server-side date filter (custom-blocks ≥ 0.1.35) sorted by views; a month is a
  few hundred rows. See `useNotionPeriodPages` in `index.tsx`. **Optional**, and
  added after the block was first inserted: an existing instance shows a "map
  `pageDays`" hint in the drill-down until someone binds it in the config panel.
- Landing Page Report is not bound.

### The analytics, which are the whole point

- **Rates come from summed counts, never averaged row ratios.** `Engagement Rate`
  and `Avg Session Duration` are stored as per-day means; averaging them across
  days — all a native Notion chart can do — weights a 3-session Sunday the same
  as a 78-session Tuesday. All of it lives in
  `blocks/website-dashboard/src/aggregate.ts`, kept free of React and SDK imports
  so `test/aggregate.test.ts` can exercise it.
- On the 2026-08-03 snapshot the engagement-rate correction is small (32.94%
  weighted vs 32.67% naive) but the **duration correction is not**: 125.5s vs
  119.0s site-wide, and 134.5s vs 112.4s in May. The tests assert both, so the
  premise can't rot silently.
- **`dedupeByDay` is load-bearing, not defensive tidiness.** Site Daily Summary
  accumulates a duplicate of each of the last four days on every delta run — see
  the bug below. Summing blindly quadruple-counts the most recent days.
- **`Total Users` is never totalled.** It is a per-day unique count, so Σ across
  days is user-*days*. It is carried as `userDays` so the name blocks the misuse,
  and no tile shows it. Same for `Users` on a page row, which is unique per page.
- **Key Events is shown as a muted `0` with a footnote**, not hidden. No GA4 key
  event has ever fired here, and dropping the metric would read as "not measured"
  rather than "measured, and it's nothing".
- The prior-window comparison is **withheld** when the data doesn't span it. The
  property was created 2026-04-12, so "the previous 90 days" reaches back before
  any data exists and would report a +296% jump that is purely the data starting.
- **Clicking a bar on *Traffic over time* opens a drill-down** for that period
  (`breakdownBucket` in `aggregate.ts`, `DrillDown` in `App.tsx`): its own
  tiles, a day-by-day split, and the channels and source/medium pairs behind
  it. Counts are compared *per day* against the window's per-day average, so
  a partial week or month doesn't read as a collapse, and the header says when
  a period is partial. The channel split comes from 🚥 Traffic, a separate GA4
  report, so its session total can differ from Site Daily's — on the snapshot
  the last week reads 128 vs 115 — and the panel says so rather than passing
  the split off as the whole bar. That report has no page views, so in
  page-view mode channels are split by sessions, with a note. On the snapshot
  the tallest week (29 Jun, 274 sessions) comes apart into the 30 Jun
  newsletter (54 `workflowers / email` sessions) plus a LinkedIn/direct spike
  on 2 Jul; the tests assert both.
- **The drill-down also ranks the pages behind a period**, from `pageDays`,
  titled via Page Performance's `Source Title` (falling back to the URL).
  Clicking a day in its *Day by day* chart narrows the pages, channels and
  sources to that day (tiles stay on the period; Escape backs out one level).
  It subscribes once per period and narrows client-side, so clicking between
  days doesn't reload. Page views reconcile with Site Daily on 111 of the
  snapshot's 113 days — only the last two, unsettled when Site Daily was
  snapshotted, differ, and the panel notes when they do. Unique users are shown
  only for a single day; summed across days they are user-days. On the
  snapshot, 2 Jul's spike is the AI-coding-agents post (31 views).
- **`summarizePeriodPages` re-checks every row's date** even though the query
  filtered on it. Old Notion clients ignore filters silently and return an
  arbitrary 999 rows; a non-zero `outOfRange` is the only way to tell, and the
  panel says so instead of ranking a random slice.
- Page triage splits unmatched URLs into `missingSource` (19 rows, 165 views — a
  real worklist of renamed slugs, missing inventory and broken links) and
  `generated` (28 rows — Bullet's tag and author pages, which correctly have no
  source record). Lumping them together turns a short worklist into noise.

### Working on it

```shell
npm run dev:block --workspace=notion-worker-ga4-sync
```

Then open `?mock` — `blocks/website-dashboard/src/mock.ts` holds a verbatim
snapshot of all four data sources taken 2026-08-03 (Pages Path Report on
2026-09-30, cut at 2026-08-02 to match), so layout and chart work needs no
binding, no deploy and no Notion. `?mock&theme=dark` for dark mode;
`?mock&nopages` for the drill-down with `pageDays` unmapped.
`.claude/launch.json` at the repo root wires the same server up for the preview
pane. Refresh the snapshot with the SQL in the fixture's own header comment.

### Known bug in the data it reads

**`siteDailyDelta` inserts instead of upserting**, so Site Daily Summary grows by
`DELTA_LOOKBACK_DAYS` (4) rows every six hours. `siteDailyDb` declares
`primaryKeyProperty: "Name"`, and row identity is matched on that property's
value — but `mapSiteRows` emits `key: date` (GA4's raw `20260801`) while writing
`Name: Builder.title(isoDate(date))` (`2026-08-01`), so no change ever matches an
existing row. Every other mapper in the file sets `Name: Builder.title(key)` and
is unaffected; 🚥 Traffic was verified clean (501 rows, 501 distinct keys).

As of 2026-08-03 that is 124 rows for 113 distinct dates. The fix is `key:
isoDate(date)` plus deleting the stale rows and re-running `siteDailyBackfill`.
The block dedupes regardless — historical duplicates outlive the fix.

## Known data problems (site-side, not worker bugs)

As of 2026-08-02:

- **No conversions are measured.** The only key events are the setup wizard's
  untouched `purchase`, `qualify_lead` and `close_convert_lead`, none of which
  has ever fired. `form_start` and `form_submit` do fire and are *not* key
  events, so `keyEvents` is `0` across all four months. Every `Key Events`
  column will read zero until that is fixed in GA4 admin.
- The site emits both slashed and unslashed URLs for the same page.
- `/blog/slackgpt` (16 views) and `/blog/ordinary-folk-data-stack` (3) get
  traffic but have no Notion record — renamed slugs needing redirects.
- `/notion-builders](https://www.work.flowers/notion-builders` gets 3 views: a
  broken markdown link in published content.
- Direct is ~61% of sessions, which is high — worth more UTM tagging on
  newsletter and social links.
