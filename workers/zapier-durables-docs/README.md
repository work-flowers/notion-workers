# Zapier Durables → Notion database (Worker sync)

Documents every **deployed Zapier Durable** in the work.flowers Zapier account
as a row in a managed Notion database: metadata as properties, the Zap's README
from [`work-flowers/zapier-sdk`](https://github.com/work-flowers/zapier-sdk) as
the page body.

Feasibility notes and the empirical testing behind these design decisions live
in [`docs/zapier-durables-docs-worker.md`](../../docs/zapier-durables-docs-worker.md).

Two databases: **Zapier Zaps** (one row per deployed durable) and **Zapier Zap
Runs** (one row per run, related back to its Zap). Error triage tickets used to
live here too and moved out on 2026-10-03; see *Error triage* below.

## What it does

### `zapsSync` — incremental, every 6 hours

1. `listWorkflows()` (experimental Zapier SDK) — the row set is exactly what is
   deployed, so non-deployed repo directories and classic Code-step Zaps never
   appear.
2. `getWorkflow()` per durable for `current_version` — the only place
   `connections`, `dependencies` and `zapier_durable_version` are exposed.
   Plus, once per cycle, `listConnections` and one `getApp` per distinct app
   key, to resolve the `Apps` column.
3. GitHub, for each directory's `zap.json` and `README.md`.
4. The People database, to resolve the creator's Zapier id to a Notion person.

It runs **every 6 hours**, and a cycle costs upstream calls only for durables that
have *changed*. Three caches in sync state, each keyed on an identity the cheap
listing calls already return:

- `versions`, keyed on `current_version_id`, skips `getWorkflow` — and with it
  the `listConnections` / `getApp` lookups — until the Zap is republished.
- `dirs`, keyed on each repo directory's tree sha, skips the `zap.json` and
  `README.md` reads until someone edits that directory.
- `rows`, a fingerprint of each row's properties as last emitted, skips the
  write itself when nothing moved.

So a quiet cycle is one execution and three calls (`listWorkflows`, the repo
listing, one People query) and emits nothing. A cycle after one republish pays
for, and writes, that one Zap. Measured on 2026-10-03: a quiet cycle is one
execution of ~10s writing 0 rows, against 8–10 executions and ~395s for every
daily cycle before. Every 7 days a cycle re-emits every row's
properties as a self-heal, at no upstream cost. A state reset costs one cold
cycle and nothing more.

**It is incremental, not replace, because replace mode throws state away.** The
platform resets a replace sync's state at the end of every cycle, so until
2026-10-03, when this was a replace sync, none of the caches above ever survived
to the next cycle. Every daily cycle was cold (8–10 executions, ~395s), and every
README body was re-sent daily, wiping hand-added blocks. Incremental mode keeps
state, but it also means nothing sweeps: the execution that completes a cycle
deletes, explicitly, any row whose workflow `listWorkflows` no longer returns.

A cold cycle is **spread over several executions**, walking repo directories
first and then any workflow no directory claimed. That pagination is not a
nicety: doing it all in one execution is what pushed this sync past the ~300s
timeout in August 2026, where it failed 325 times in a row. A timed-out handler
never commits its state, so without committable slices the memoisation above
could never take hold — every retry would be another cold start.

### `runsBackfill` / `runsDelta` — run history

`runsBackfill` (manual) walks all history, one page per execution chain.
`runsDelta` (daily) re-scans the recent window. Both write to **Zapier Zap
Runs**, and the `Zap` relation sets itself: it matches on the Zaps primary key,
which is `Workflow ID`.

Three things about `listWorkflowRuns` drive the design, all probed rather than
assumed:

- **`workflow` is required** — no account-wide listing, so every cycle makes at
  least one call per durable.
- **Only `pageSize` is honoured.** `limit`, `status`, `since` and `updatedAfter`
  are accepted and then silently ignored, each returning the full unfiltered
  set. There is no server-side date filter.
- **Rows come back newest-first**, which is what makes the previous point
  workable: the delta pages from the newest end and stops client-side.

A run also mutates after creation — `updated_at != created_at` on every row
observed, typically ~20s later as it reaches `finished`. So the delta re-scans a
one-hour overlap and re-upserts, rather than taking only strictly newer rows;
otherwise runs would freeze at whatever status they held mid-flight.

Measured against live data (211 runs across the nine durables deployed at the
time; the figures scale with run volume, not with this snapshot):

| Scenario | Rows emitted | API calls |
|---|---|---|
| Cold start, no watermarks | 211 | 9 |
| Warm, watermarks set | 12 | 9 |
| Watermarks 30 days stale | 211 (full recovery) | 9 |

**Both run syncs are incremental, not replace — deliberately.** The usual
backfill pattern uses replace mode so mark-and-sweep cleans up drift, but Zapier
ages runs out of its own history. A replace-mode pass would then delete exactly
the records this database exists to preserve. Nothing in either sync ever emits
a delete.

### Error triage — moved to a durable

Until 2026-10-03 an hourly `errorsDelta` sync here walked every durable's run
history and upserted **Zapier Error Triage** tickets. Zapier now emails the Zap
owner on every failed Code Zap run, so the
[`zapier-error-email-to-triage`](https://github.com/work-flowers/zapier-sdk/tree/main/zapier-error-email-to-triage)
durable builds tickets from those emails instead. The triage database was
detached from this worker (`ntn workers databases detach errors`) rather than
deleted, so its 57 historical tickets and their relations are intact. See
*Error triage (moved out)* in this worker's `CLAUDE.md`.

#### Run intensity — the operations journal

`getDurableRun` (keyed on `durable_run_id`, not the workflow run id) is the only
place Zapier exposes what a run *actually did*: an operations journal, one entry
per executed step or wait, each with its own `retry_count`, plus an execution
summary. It returns `output` in the same call, so four columns come from one
request:

| Column | Source |
|---|---|
| `Output` | the run's return value |
| `Operations` | executed operations — steps and waits |
| `Retries` | summed `retry_count` across operations |
| `Attempts` | `execution.summary.total_attempts` — whole-execution retries |

**This is the closest thing to a usage signal Zapier exposes**, and unlike the
Zaps database's static call-site counts it varies run to run:

| Zap | Ops per run (3 samples) | Static `Steps` |
|---|---|---|
| `enrich-contact-records` | 5, 4, 4 | 6 |
| `luma-guest-updated` | 2, 4, 2 | 7 |
| `luma-guest-registered` | 6, 6, 6 | 12 |

The gap is branching: a Zap with 6 step call sites runs 4–5 of them depending on
which path it takes. Zero operations is legitimate — a run can fail before any
step executes.

Run status is therefore up to a day stale, which is the trade for the lighter
cadence — failures are not, because Zapier's alert emails feed triage directly. The delta
caps the fetch at the newest 60 rows per durable and logs the
shortfall rather than passing silently. The **backfill fetches detail for every
row**, so a one-off re-run populates these columns across all history — at the
cost of one extra call and ~12 KB per run (26 KB observed), which is why it
takes a small page (25) one page at a time and spreads the work over more
executions. Everything but the counts and `output` is discarded.

`input` is **not** synced. It carries the whole trigger payload — up to ~10.6 KB,
and for the Notion-webhook durables it is full page objects including property
values. Mirroring that would duplicate CRM content into a second place for no
documentation value.

## Design decisions worth knowing

- **Join on `workflow_id` from `zap.json`**, not on names and not on the
  `// Source of truth:` header (missing from three directories).
  `luma-event-to-notion/zap.json` uses a `deployments[]` array — one directory,
  two workflows — so both rows share one README body.
- **`trigger_url` is never synced.** It embeds a secret token. The synced link
  is `https://zapier.com/durables-editor/<workflow-id>`.
- **Explicit deletes with a non-empty guard.** The completing execution deletes
  rows whose workflow is gone, but an empty `listWorkflows` is far more likely
  to be an upstream blip than a genuine "all Zaps deleted", so the sync throws
  rather than deleting every row.
- **`Creator ID` sits next to `Creator`.** Only Dennis's People record has a
  `Zapier User ID` so far; keeping the raw id visible makes an unresolved
  creator obvious rather than silently blank. The lookup returns an *email*
  because `Builder.people()` takes email addresses.
- **`Connections` and `Apps` are multi-selects.** `Connections` holds the alias
  each connection is bound to in the source (`notion_wf`, `apollo`); `Apps`
  holds the apps the durable actually touches, which has no single source
  field — `current_version.app_versions` is null on every workflow, so it is
  assembled from the trigger's `selected_api` plus the `app_key` of every bound
  connection, then resolved to display titles via `getApp` (a private app's key
  is `App243984CLIAPI`, whose title is "Ninjapear (Unofficial)"). Both lookups
  are cached for the whole cycle.

  **The declared options in `src/options.ts` are the whole allowed set, not
  seeds.** Verified 2026-07-26: the platform *silently drops* a multi-select
  value that is not a declared option — no error, the cell is just written
  empty. `gmail-attachments-to-drive-by-type` synced with both columns blank for
  exactly this reason. So **a new app or connection alias needs a code change
  and a deploy**; `assertDeclared` logs the offending value so the next one shows
  up in the run logs rather than as a mystery blank cell. Colours are per app,
  and a connection alias takes the colour of the app it binds, so `apollo` and
  `Apollo` read as a pair.
- **`Steps` and `Action Call Sites` are complexity, not usage.** They count
  *call sites* — places in the source where a call is written — off
  `current_version.source_files`, so they cost no extra API call. A `ctx.step()`
  inside a loop is one call site and N executions, and a step usually wraps one
  or more actions, so the two columns nest and must not be summed. Zapier
  exposes no per-run task or step counts, so there is nothing better to derive
  usage from; treat these as "which Zaps are heavy", not as billing.
- **The content hash covers the page body alone.** `pageContentMarkdown`
  replaces the *entire* page body, and that includes anything a person added by
  hand — verified 2026-07-26: an appended block is wiped and a child page is
  moved to trash. So the body must be re-sent as rarely as possible. Hashing
  every field meant any property change re-sent it, and `Updated` moves whenever
  the Zap is edited, so hand-added blocks rarely survived a day. Keyed on the
  body, they survive until the README itself changes. (Until 2026-10-03 that
  protection only held *within* a cycle — see the `zapsSync` section.)

## Markdown handling

Notion's markdown conversion was tested empirically rather than assumed. Mermaid
fences are verbatim (`<br/>` is fine), pipe tables convert to real Notion
tables, and code spans, bold and links inside cells become genuine annotations.

Three real defects are fixed in `src/markdown.ts`; see its header comments for
the tested behaviour and the alternatives that were rejected. All three share
one root cause: **Notion makes one block per source line.**

**Soft line wraps.** A hard-wrapped README paragraph arrives as a stack of
one-line paragraph blocks, and the blank line between two paragraphs is lost
entirely; list continuations split off from their item. Standard Markdown treats
a single newline inside a paragraph as a soft wrap, so paragraphs and list items
are reflowed onto one line each. Headings, rules, table markup, raw HTML and
indented code are never reflowed. On `enrich-contact-records` this takes 178
source lines to 135.

**Escaped pipes in tables.** `\|` inside a cell splits the cell, drops content
and shifts every later column. All five READMEs with tables contain exactly one.
Only affected tables are re-emitted as native table XML, where a literal `|` is
safe.

**Blockquotes.** Notion turns *every* `>` line into its own quote block, so a
soft-wrapped paragraph shatters into a stack of one-line bars, a bare `>`
renders as a visible "Empty quote", and a fenced code block inside a quote is
destroyed — the ``` collapses to an escaped backtick and the code becomes
quoted prose.

A whole quote is therefore collapsed onto **one `>` line**, with its internal
structure carried by `<br>`: a single break between logical lines, a double
between paragraphs. That renders as one quote block rather than a stack.
`<br>` is a real line break, not literal text — the serializer round-trips
literal markup escaped (`\<br\>`, `&lt;br&gt;`) and parsed markup bare, and a
bare `<br>` stays bare. Two trailing spaces and a backslash line break were both
tested and rejected: the first collapses back to separate lines, the second is
escaped to visible text.

Fenced code is lifted out of the quote to top level, since Notion cannot nest a
code block in a quote. Six of the READMEs use blockquotes;
`internal-user-ids-to-table-and-notion` was worst hit, with 4 bare separators
and 4 fences inside quotes — its five quote blocks collapse to two.

## Adding your own content to a Zap page

**Don't — it will be lost when the README changes.** The page body belongs to
the sync. Tested: an appended block is deleted and a child page is trashed the
next time the body is written.

The hash change above means that only happens when the README itself changes
rather than on every property update, so notes can survive a while. But nothing
inside a synced page is safe long term. Put durable commentary in the README
itself (it is the source of truth and syncs automatically), or in a separate
page that links to the Zap row rather than living inside it.

## Configuration

`NOTION_API_TOKEN` is required by the platform to write sync rows — it is not
read by application code. Everything else routes through Zapier connections, so
there is no GitHub PAT and no second Notion credential.

```shell
ntn workers env set NOTION_API_TOKEN=ntn_xxx
ntn workers env set ZAPIER_CLIENT_ID=xxx
ntn workers env set ZAPIER_CLIENT_SECRET=xxx
ntn workers env set ZAPIER_GITHUB_CONNECTION_ID=02581386-b46a-8abe-ad7a-bb264a3bd2ff
ntn workers env set ZAPIER_NOTION_CONNECTION_ID=02b73654-15c8-85c3-b16a-07304d2beb17
```

Optional overrides: `ZAP_DOCS_REPO` (default `work-flowers/zapier-sdk`) and
`NOTION_PEOPLE_DATA_SOURCE_ID` (default is the work.flowers People data source).

> **`@zapier/zapier-sdk` is pinned to `^0.91.0` on purpose.** The Code Workflows
> methods do not exist in `0.53.x` (what most of this repo pins), and `1.x`
> removes the `./experimental` export entirely.

The Notion connection must be the work.flowers one. Never bind
`02b95b31-c152-8800-9036-1107e08f70da` — that is the Knoxx client workspace and
cannot see work.flowers databases.

## Develop

```shell
npm run check --workspace=notion-worker-zapier-durables-docs
npm test --workspace=notion-worker-zapier-durables-docs
```

## Deploy

Use the script rather than a bare `ntn workers deploy` — the script resolves the
repo root from its own path, so it works from any directory:

```shell
./scripts/deploy.sh zapier-durables-docs          # from the repo root
../../scripts/deploy.sh zapier-durables-docs      # from this worker directory
```

The `ntn workers sync ...` commands below must run **inside** this worker
directory — `ntn` finds `workers.json` by walking up from the CWD.

Then preview before letting anything write:

```shell
ntn workers sync trigger zapsSync    --preview
ntn workers sync trigger runsDelta   --preview
```

> Preview renders **properties only** — page content is never shown, so an empty
> body in a preview is not a bug. Verified against `api-changelog-sync`, which
> definitely writes bodies and previews the same way.

Run history needs one manual backfill before the delta is meaningful.
The backfill also populates `Output`/`Operations`/`Retries`/`Attempts` on every
historical row, so re-run it after a deploy that adds those columns:

```shell
ntn workers sync trigger runsBackfill
```

To redo it from scratch:

```shell
ntn workers sync state reset runsBackfill && ntn workers sync trigger runsBackfill
```

