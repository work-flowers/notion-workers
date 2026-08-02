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
