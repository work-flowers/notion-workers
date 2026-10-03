# zapier-durables-docs — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## What it touches

- **Zapier Code Workflows** (`listWorkflows`, `getWorkflow`) — the deployed
  durables. Read-only.
- **GitHub** `work-flowers/zapier-sdk` — `zap.json` and `README.md` per
  directory. Read-only, via the Zapier GitHub connection.
- **Notion People** data source `a0791b07-11ac-8364-9113-07ea21165718` —
  read-only, to resolve a creator.
- **Zapier Code Workflow runs** (`listWorkflowRuns`) — read-only.
- **Managed database "Zapier Zaps"** — written only through `zapsSync`.
- **Managed database "Zapier Zap Runs"** — written through `runsBackfill` and
  `runsDelta`.

**This worker no longer does error triage.** The `errorsDelta` sync and its
managed `errors` database were removed on 2026-10-03; see *Error triage (moved
out)* below before re-adding anything like it.

## Non-obvious constraints

**`@zapier/zapier-sdk` must stay on `^0.91.0`.** The Code Workflows methods do
not exist in `0.53.x` (which most other workers here pin — a caret on a `0.x`
version locks the minor), and `1.x` removes the `./experimental` subpath from
its exports map, so importing it throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. If
`listWorkflows` is suddenly `undefined`, check the resolved version first.

**The same method names exist as Zapier *MCP tools*.** A worker cannot call MCP.
The underlying REST host (`code-substrate-workflows.zapier.com/api/v0`) rejects
both plain `fetch` and `sdk.fetch` with `401 Expected valid JWT`. The versioned
SDK is the only route that works from a worker.

**`context.notion` cannot query data sources.** The platform pins it to an older
API version that 404s on data-source endpoints, so the People lookup goes
through `sdk().fetch` with the Notion connection. `workers/harvest-sync/src/notion-lookup.ts`
shows the `NOTION_API_TOKEN` variant if this ever needs to switch — it is one
function, `createUserResolver` in `src/people.ts`.

**`NOTION_API_TOKEN` is still required** even though no application code reads
it: the platform uses it to write sync rows. Do not "simplify" it away.

**`Builder.people()` takes emails, not user ids.** The People row's `Person`
property exposes `person.email` on the query response.

**Never sync `trigger_url`** — it embeds a secret token.

**The run syncs are incremental, not replace — do not "fix" this.** Zapier ages
runs out of its own history, so a replace-mode pass would mark-and-sweep exactly
the records the database exists to preserve. Neither run sync ever emits a
delete, which is a deliberate departure from the repo's usual backfill+delta
shape.

**`listWorkflowRuns` ignores every filter except `pageSize`.** `limit`,
`status`, `since` and `updatedAfter` are all accepted and silently ignored —
each returns the full unfiltered set. Do not add one expecting it to work. The
delta relies on rows being newest-first and stops client-side.

**Runs are listed through `zapierApi().get`, not `sdk.listWorkflowRuns`.** Since
late September 2026 the endpoint also returns draft test runs (`kind: "draft"`)
that omit `trigger_id` and `workflow_version_id`. The SDK's response schema
requires both (checked up to 0.113), so a single editor test run failed every
`runsDelta` cycle (and the since-removed `errorsDelta`) from 2026-09-28. `listRunsPage` makes the
same request without the strict parse and drops draft runs. Don't switch it back.

**Runs mutate after creation.** `updated_at != created_at` on every row
observed (~20s, as the run reaches `finished`), so the delta re-scans a one-hour
overlap and re-upserts. Narrowing that window will freeze runs at whatever
status they held mid-flight.

**Run intensity comes from `getDurableRun`, not `getWorkflowRun`.** Keyed on
`durable_run_id`. It returns the operations journal — one entry per executed
step or wait, with per-operation `retry_count` and an execution summary — *and*
`output`, so Output/Operations/Retries/Attempts all cost one call between them.
`getWorkflowRun` returns only `output`; do not switch back to it. This journal
is the only per-run intensity data Zapier exposes anywhere.

**`Steps` / `Action Call Sites` count call sites, not executions.** Do not
relabel them as usage or task counts. For what actually ran, use the runs
database's `Operations` column — the static and runtime numbers genuinely
differ (6 static steps vs 4-5 executed, because of branching). The two static
columns also nest and must not be summed.

**Quote stripping in `stripNonCode` is per line on purpose.** Applied
whole-file, one unbalanced quote inside a multi-line template literal spanned
thousands of characters and silently deleted real code — it took
`notion-newsletter-to-buttondown` from 7 steps to 0. There is a regression test.

**`pageContentMarkdown` replaces the whole page body, including hand-added
content.** Verified: an appended block is wiped and a child page is moved to
trash. That is why the content hash covers the body alone — hashing properties
too meant `Updated` moving re-sent the body and destroyed anything a person had
added. Do not widen that hash back out. There is no partial-body update in the
sync API; genuine preservation would mean abandoning `pageContentMarkdown` for
block surgery via the Notion REST API, which does not accept markdown, so it
would also mean writing our own markdown-to-blocks conversion and losing mermaid
and table support.

**Multi-select options are a closed set, not seeds.** The platform silently
drops a value that is not a declared option in `src/options.ts` — it does not
error and does not create the option, it just writes the cell empty. A new app
or connection alias therefore needs a code change plus a deploy. `assertDeclared`
exists to make that visible in the run logs; do not "simplify" it away, and do
not assume Notion's normal auto-create behaviour applies here. It does not.

**There is no single field for which apps a durable touches.**
`current_version.app_versions` is null on every workflow observed. `Apps` is
assembled from the trigger's `selected_api` plus the `app_key` of each bound
connection (via `listConnections`), then resolved to titles with `getApp` —
private apps have keys like `App243984CLIAPI` that mean nothing to a reader.
Strip only the trailing version from a title: `(Unofficial)` distinguishes
genuinely different apps and must stay.

**`input` is intentionally not synced** — the whole trigger payload, up to
~10.6 KB, containing full Notion page objects for the webhook durables.

## Execution cost

Credit consumption here is dominated by **sync executions**, and the notes below
are why. Reworked 2026-08-12 — do not undo a piece of it without reading the
reasoning.

Two separate problems, and the schedule was the smaller half of both:

1. **A timeout loop in `zapsSync`** — 325 consecutive ~300s failures burning ~11
   hours of compute a day, committing nothing. This was the dominant cost by a
   wide margin, and it was invisible in `ntn workers sync status` beyond a single
   `error` flag. Check `--json` for `consecutiveFailureCount` and
   `recentRunDurationsMs` when this worker looks expensive.
2. **Fan-out shape** — the run syncs spent ~400 executions/day advancing one
   durable at a time, almost all finding nothing.

`runsDelta` and `zapsSync` also moved 6h → 1d, but cadence mattered less than
either of the above. No state reset is needed — every new state field is additive
and absent-means-fetch, so the first cycle after deploying re-derives everything
and later cycles are cheap.

**A `hasMore` chain that handles one item per execution is the expensive shape.**
Both run syncs walk the durable list by carrying an `index` in state, and used to
advance it by exactly one per execution. At 57 durables that is 58 executions per
cycle, almost all of which list one durable, find nothing new, and return. The
one-per-execution rule was real — a single execution doing all of them timed out
at ~300s — but it was sized for the worst durable and charged for every durable.
The fix is `src/budget.ts`: keep taking durables until an actual spend budget (40
upstream calls or 120s) is gone. Quiet cycles collapse to a handful of executions
and busy ones degrade to the old behaviour.

**The budget is checked only *between* durables, so the per-durable caps are
still load-bearing.** `MAX_PAGES_PER_EXECUTION` and
`MAX_DETAIL_FETCHES_PER_DURABLE` bound how expensive *one* durable can get, which is the case that caused the original timeout. The
budget bounds how many durables are attempted. Neither replaces the other — do not
relax a per-durable cap on the strength of the budget existing.
`MAX_CHANGES_PER_EXECUTION` exists for the same reason in the other direction: a
run past the detail cap is still emitted but costs no upstream call, so the budget
cannot see it.

**Metering is on the pacer, not the call sites.** `createBudget` wraps a pacer and
counts every `wait()` through it. Every upstream call in this worker is preceded by
`await pacer.wait()`, so a call added later is counted for free. Pass
`budget.pacer` downstream, never the bare `zapierApi`, or the call goes uncounted.

**The workflow list is cached in state for the cycle, which also fixes a real
bug.** Every execution used to call `listWorkflows` just to index into it — 50
calls per cycle where one does. Worse, the list could change mid-cycle, so a
durable deployed or deleted partway through shifted every later index and the walk
could skip a durable or visit one twice. `listWorkflowRefs` takes the cached value
and only re-lists when `index === 0`. It deliberately stores `{id, name}` and not
the full summary, which would put descriptions and trigger payloads in sync state.

**`runsDelta` takes one page from a durable with no watermark.** The backfill owns
history, so the first page is the whole job — and because that page can still
return a cursor, completion is tracked with an explicit `firstPageOnly` flag
rather than by testing the cursor. Testing the cursor there would silently turn
the delta into a second backfill, walking every durable's full history one
execution at a time.

**A pacer ceiling is also a floor on elapsed time, and that killed `zapsSync` for
57 hours.** All three pacers were 30/min. At 48 repo directories a cold `zapsSync`
cycle needs ~97 GitHub and ~66 Zapier calls, which is ~194s + ~132s of pure
*waiting* — past the ~300s execution timeout. It failed **325 consecutive times**
between 2026-08-10 and 2026-08-12, each attempt running to the ceiling: ~27 hours
of compute burnt in 57 wall hours, and by far the largest credit consumer in this
worker. Nothing had changed in the code; the last commit was two days earlier. It
was growth (12 durables when written, 49 now) crossing a threshold.

`githubApi` is now 80/min — GitHub's documented authenticated limit is 5000/hour,
i.e. ~83/min, confirmed with `gh api rate_limit`. `zapierApi` is 60/min, which is
a doubling rather than a tuned number because Zapier publishes no limit; it is the
first suspect if 429s ever appear. **Do not lower these back to be "safe"** — a
conservative pacer is not a free choice when the work scales with durable count.

**A timed-out handler commits nothing, so progress has to be committable in
slices.** This is why memoising alone would not have rescued `zapsSync`: a timeout
never returns `nextState`, so the caches would have stayed empty and every retry
would have been another cold start, forever. `zapsSync` is therefore paginated —
`hasMore` across several executions — and that is load-bearing, not tidiness.

**`zapsSync` walks repo directories first, then leftover workflows. That order is
forced.** A directory's README only exists in memory in the execution that read
it, so the rows it belongs to must be emitted right there; caching 48 READMEs in
state to decouple the two would be far heavier than the `cycle` bookkeeping.
Workflows that no directory claims need no GitHub read, so they go last, walked
over an `order` pinned at cycle start — in replace mode a mid-cycle list change
that shifted an index would skip a row and **sweep** it.

**Mid-cycle state must accumulate over the previous cycle's, not start empty.**
`hashes` and `versions` are seeded from the existing values and overwritten per
row. A fresh map would be committed part-way through a cycle holding only the rows
reached so far, so every workflow not yet visited would lose its body hash and
have its page body re-sent next cycle — destroying hand-added blocks. Stale
entries are pruned instead on the final execution, where every row has been seen.

**`zapsSync` cannot have an early-bail gate, because it is replace mode.** A
completed cycle sweeps every row it did not emit, so returning `changes: []` on a
"nothing changed" verdict would delete all 57 rows. The saving there is memoising
the *derivation* while still emitting every row: `versions` keyed on
`current_version_id` skips `getWorkflow` until a republish, and `dirs` keyed on
each repo directory's tree sha skips the `zap.json` / `README.md` reads until an
edit. Both keys come off calls that are made anyway, so validating them is free.

**Only a *successful* `getWorkflowVersion` may be cached.** It degrades to
`undefined` on failure rather than throwing, so caching that result would freeze
the row's version columns empty until the next republish happened to move
`current_version_id` — a silent, long-lived wrong answer.

**A skipped directory must carry its old content hash forward, not re-hash.** When
`dirs` skips a directory the README was never fetched, so `readme` is *absent*, not
empty. Hashing the absent body would record a hash of `undefined` and make the
next genuinely-changed cycle look like a body change; emitting the empty body would
wipe the page. `RepoZap.unchanged` is the flag for this. If the hash it pairs with
is missing, the cache entry is dropped so the next cycle re-reads — otherwise the
directory would be skipped forever.

**A GitHub listing entry with no `sha` is always re-read.** `isDirCached` guards
this explicitly: comparing `undefined === undefined` would match a cache entry that
also lacked a sha and pin that directory permanently. There is a test.

## Error triage (moved out)

Removed from this worker on 2026-10-03. Zapier now emails the Zap owner on every
failed Code Zap run (subjects `Your Zap "<name>" had an error` and `… couldn't
run`), about three minutes after the failure. The
[`zapier-error-email-to-triage`](https://github.com/work-flowers/zapier-sdk/tree/main/zapier-error-email-to-triage)
durable turns those emails into tickets. The hourly `errorsDelta` walk existed
only because durables used to send no notification at all, and it was the most
frequent sync here.

**The triage database was detached, not deleted.** `ntn workers databases detach
errors` (ntn 0.23.17) released `Zapier Error Triage`
(`db78a092-515d-40e6-9416-aab114460f86`) from the worker. Verified straight after:
all 57 tickets kept their rows, bodies and `Zap` / `Zap Runs` relations, and
every formerly managed column dropped `readOnly`. It is now an ordinary data
source that the durable writes through the Zapier Notion connection. **Do not
re-declare an `errors` database here**: a fresh managed database would be
created, and the hand-made triage columns (`Status`, `Priority`, `Assignee`,
`Resolution Notes`, `Resolved on`, `Ticket ID`, `Root Cause`, `Due`, `GitHub
Pull Requests`) exist only on the detached one.

What the walk could see and the email cannot: the run id and the failing step.
New tickets therefore leave `Zap Runs` and `Failing Step` empty. The
`zapier-error-email-to-triage` README covers that trade.

**Zapier Manager's `zap_error_alert` trigger does not fire for Code Workflows.**
Probed 2026-08-07: its object model is classic Zaps only (its Zap dropdown lists
none of the durables, and `node_id` is an `int` while durable ids are UUIDs).
This is why the replacement keys on the alert *email*, not on a Zapier Manager
trigger.

## Runs: workflow runs vs durable runs

**A durable *is* a workflow, but a durable *run* is not a workflow run.** This is
the easiest thing here to get wrong. There is no separate list of durables —
`listWorkflows` returns them — so at the definition level the two words are
interchangeable. Runs are two different objects:

| | `listWorkflowRuns` / `getWorkflowRun` | `listDurableRuns` / `getDurableRun` |
|---|---|---|
| What | a triggered execution of a deployed workflow | the execution engine's own record |
| Id | `id` | `id`, which the workflow run calls `durable_run_id` |
| Knows its workflow | yes (`workflow_version_id`, and you queried per workflow) | **no** |
| Carries | trigger/version ids, status, input, output, error | status, input, output, error, the operations journal |

They are 1:1 — verified: workflow run `019f9e7d-f2ec…` carries `durable_run_id
019f9e7d-f468…`, and `getDurableRun` on that id returns it. But the link points
one way only, workflow run → durable run.

**There is no route back.** `getWorkflowRun` given a *durable* run id returns
`{id: null, durable_run_id: null, workflow_version_id: null}` — silent nulls, not
a 404, so a mistake here fails quietly. And `getWorkflowVersion` needs
`{workflow, version}` *both*, so a `workflow_version_id` cannot be resolved to a
workflow either. Attribution therefore requires the per-durable walk. Probed
2026-07-29; do not re-litigate it without re-probing.

The reason is structural: the engine also runs durables invoked directly
(`runDurable`, `cancelDurableRun`), which have no workflow at all, so a durable run
cannot carry a mandatory workflow reference.

**`listDurableRuns` is account-wide but carries no workflow attribution.** It
takes no `workflow` argument and returns runs across every durable, newest-first —
verified live 2026-07-29, including that it covers workflow-triggered runs. But its
fields are exactly `id`, `status`, `input`, `output`, `error`, `execution_id`,
`is_private`, `created_at`, `updated_at`. No `workflow_id`, no version id, no
trigger id, and `getDurableRun` adds none. **It therefore cannot replace the
per-durable `listWorkflowRuns` walk** — a run row must know which Zap it belongs
to.

**Neither endpoint has a date filter.** `pageSize`, `cursor`, `maxItems` only. 0.91
dropped the `since` / `updatedAfter` parameters that earlier versions accepted and
silently ignored, so there is nothing left to be misled by.

**A failed step's journal entry carries a stack trace.** Corrected 2026-10-03: this
note used to say Zapier exposes no stack trace anywhere. It is not on the run or
the execution, but `getDurableRun`'s `operations[].error` has `name` and `stack`
for an exhausted step (seen on `slack-thread-to-notion-discussion`'s
`check-page-access` failure, 2026-09-28). `failureDetail` in `src/runs.ts` reads
the name and message from the same object.

## Markdown

The conversion lives in `packages/shared/src/markdown.ts` (it moved out of this
worker on 2026-08-01 when `worker-readme-sync` needed the same fixes — both
import `toNotionMarkdown` from `@work-flowers/notion-worker-shared`, and its
tests moved with it). It is deliberately minimal and its header comment records what
was tested and what was rejected. Before adding a transform there, check that
comment — mermaid `<br/>` normalisation and wholesale pipe-table conversion were
both considered and are both *unnecessary*, and two plausible fixes for the
escaped-pipe bug (HTML entity, lookalike glyph) are wrong for reasons that are
not obvious.

Notion makes **one block per source line**, which is the single root cause of
all three markdown fixes. For ordinary prose that means hard-wrapped paragraphs
must be reflowed onto one line — `joinSoftWraps` does this, and it tracks fences
itself because `fixBlockquotes` lifts fences out of quotes *after*
`splitOnFences` has already run. A test covers that ordering.

The same rule makes **every `>` line its own quote block**, which is why a whole quote
is collapsed onto one `>` line with `<br>` carrying the internal breaks. Do not
"tidy" that back into separate lines — it re-creates the stack of one-line bars.
`<br>` is genuinely parsed; two trailing spaces and `\` line breaks were both
tested and do not work. Lifting fenced code *out* of quotes is also deliberate:
Notion cannot nest a code block inside a quote and destroys it otherwise.

Re-test against the live converter rather than reasoning about it: create a page
with the Notion MCP `create-pages` tool, then fetch it back. The round-trip
distinguishes real annotations from literal text by escaping — a literal
backtick comes back as `` \` ``, a real code span as a bare backtick.

## Testing

```shell
npm run check --workspace=notion-worker-zapier-durables-docs
npm test --workspace=notion-worker-zapier-durables-docs      # markdown + runs unit tests
ntn workers sync trigger zapsSync --preview              # end to end, no writes
ntn workers sync trigger runsDelta --preview             # run history, no writes
```
