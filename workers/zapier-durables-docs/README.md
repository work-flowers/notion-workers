# Zapier Durables → Notion database (Worker sync)

Documents every **deployed Zapier Durable** in the work.flowers Zapier account
as a row in a managed Notion database: metadata as properties, the Zap's README
from [`work-flowers/zapier-sdk`](https://github.com/work-flowers/zapier-sdk) as
the page body.

Feasibility notes and the empirical testing behind these design decisions live
in [`docs/zapier-durables-docs-worker.md`](../../docs/zapier-durables-docs-worker.md).

Two databases: **Zapier Zaps** (one row per deployed durable) and **Zapier Zap
Runs** (one row per run, related back to its Zap).

## What it does

### `zapsSync` — replace mode, hourly

1. `listWorkflows()` (experimental Zapier SDK) — the row set is exactly what is
   deployed, so non-deployed repo directories and classic Code-step Zaps never
   appear.
2. `getWorkflow()` per durable for `current_version` — the only place
   `connections`, `dependencies` and `zapier_durable_version` are exposed.
3. GitHub, for each directory's `zap.json` and `README.md`.
4. The People database, to resolve the creator's Zapier id to a Notion person.

A cycle is roughly 3 upstream calls per durable plus a repo listing — twelve
durables at the time of writing, so ~40 calls, comfortably inside GitHub's
authenticated 5000/hour even running every hour. The count moves as Zaps are
added; nothing is hardcoded to it.

### `runsBackfill` / `runsDelta` — run history

`runsBackfill` (manual) walks all history, one durable per execution chain.
`runsDelta` (hourly) re-scans the recent window. Both write to **Zapier Zap
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

The delta caps the fetch at the newest 60 rows per execution and logs the
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
- **Replace mode with a non-empty guard.** Mark-and-sweep handles deleted Zaps
  for free at this record count, but an empty `listWorkflows` is far more likely
  to be an upstream blip than a genuine "all Zaps deleted", so the sync throws
  rather than sweeping every row.
- **`Creator ID` sits next to `Creator`.** Only Dennis's People record has a
  `Zapier User ID` so far; keeping the raw id visible makes an unresolved
  creator obvious rather than silently blank. The lookup returns an *email*
  because `Builder.people()` takes email addresses.
- **`Steps` and `Action Call Sites` are complexity, not usage.** They count
  *call sites* — places in the source where a call is written — off
  `current_version.source_files`, so they cost no extra API call. A `ctx.step()`
  inside a loop is one call site and N executions, and a step usually wraps one
  or more actions, so the two columns nest and must not be summed. Zapier
  exposes no per-run task or step counts, so there is nothing better to derive
  usage from; treat these as "which Zaps are heavy", not as billing.
- **Content hashes gate the page body only.** Replace mode sweeps anything not
  emitted, so every row is emitted every cycle; the hash decides whether to
  re-send the README, which is the expensive part of the write.

## Markdown handling

Notion's markdown conversion was tested empirically rather than assumed. Mermaid
fences are verbatim (`<br/>` is fine), pipe tables convert to real Notion
tables, and code spans, bold and links inside cells become genuine annotations.

The one real defect is `\|` inside a table cell: it splits the cell, drops
content and shifts every later column. All five READMEs with tables contain
exactly one. `src/markdown.ts` re-emits only those tables as native table XML,
where a literal `|` is safe. See its header comment for the two rejected
alternatives and why they fail.

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
ntn workers sync trigger zapsSync   --preview
ntn workers sync trigger runsDelta  --preview
```

> Preview renders **properties only** — page content is never shown, so an empty
> body in a preview is not a bug. Verified against `api-changelog-sync`, which
> definitely writes bodies and previews the same way.

Run history needs one manual backfill before the hourly delta is meaningful.
The backfill also populates `Output`/`Operations`/`Retries`/`Attempts` on every
historical row, so re-run it after a deploy that adds those columns:

```shell
ntn workers sync trigger runsBackfill
```

To redo it from scratch:

```shell
ntn workers sync state reset runsBackfill && ntn workers sync trigger runsBackfill
```
