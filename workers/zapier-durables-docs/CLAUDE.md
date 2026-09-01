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
- **Managed database "Zapier Error Triage"**
  (`db78a092-515d-40e6-9416-aab114460f86`) — written only through `errorsDelta`,
  and only its machine columns. See *Error triage*.

There is also a **hand-made `🚨 Error Triage` data source**
(`41662a45-d908-4176-8a08-9f90cc83e730`) that predates the managed one and is not
touched by any sync. It was the schema sketch this was modelled on. If it is
still there, it is Dennis's to delete, along with the hand-added `Error Triage`
relation on the Zaps database.

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
still load-bearing.** `MAX_PAGES_PER_EXECUTION`, `MAX_DETAIL_FETCHES_PER_DURABLE`,
`MAX_TRIAGE_DETAIL_FETCHES` and `INITIAL_PAGES_PER_EXECUTION` bound how expensive
*one* durable can get, which is the case that caused the original timeout. The
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

**`runsDelta` takes one page from a durable with no watermark; `errorsDelta` walks
that durable's whole history. The asymmetry is deliberate.** In `runsDelta` the
backfill owns history, so the first page is the whole job — and because that page
can still return a cursor, completion is tracked with an explicit `firstPageOnly`
flag rather than by testing the cursor. Testing the cursor there would silently
turn the delta into a second backfill, walking every durable's full history one
execution at a time. `errorsDelta` has no backfill (see below) and *must* walk it
all, which is what `INITIAL_PAGES_PER_EXECUTION` and its cursor resume are for.

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

## Error triage

The **data source is `db78a092-515d-40e6-9416-aab114460f86`**. A worker cannot
discover this for itself — see the note on `DatabaseHandle` below — so anything
outside the sync that needs to reach these rows has to be told.

**Declaring a property in a managed schema makes it `readOnly` in Notion — a
person cannot edit it.** Not emitting a value does not help; managed-ness follows
the *declaration*, not the writes. Verified the hard way on 2026-07-29: `Status`,
`Priority`, `Assignee`, `Resolution Notes` and `Resolved on` were declared in the
schema and deliberately never written, and the result was five read-only columns
and a triage table nobody could triage in.

So those are **hand-made properties on the data source, not in the schema**.
Anything a human must edit has to stay out of `worker.database()`.

**There are seven of them, not five, and they hold live triage history.** Read
back off the live data source on 2026-08-07 — the five-property list recorded
here previously was incomplete, and deleting these columns would destroy real
content (`Resolution Notes` carries full write-ups on resolved tickets):

| Property | Type | Notes |
|---|---|---|
| `Status` | status | To-do: `Untriaged` (gray) · In progress: `Ready for Claude` (purple), `Ready for GLM` (yellow), `Ready for human review` (orange), `In progress` (blue) · Complete: `Resolved` (green), `Won't fix` (brown) |
| `Priority` | select | `High` (red), `Medium` (yellow), `Low` (gray) |
| `Assignee` | person | — |
| `Resolution Notes` | text | Carries real prose on resolved tickets. Deleting the column destroys it. |
| `Resolved on` | date | Set by a Notion automation when `Status` moves to a Complete option. |
| `Ticket ID` | auto_increment_id | `ZAP-25`. The agent write-ups in page bodies refer to tickets by this number. |
| `GitHub Pull Requests` | relation | To `collection://3ad91b07-11ac-805d-8a56-000b61b9143a`. Someone added it by hand; nothing in this repo writes it. |

`Ticket` (title) also reports as editable, because Notion cannot mark a title
`readOnly`. The sync still owns it.

**Undeclaring a property releases it rather than dropping it.** Removing five of
these from the schema and redeploying left every one in place, options and status
groups intact, and simply cleared `readOnly`. Nothing was lost and nothing had to
be recreated — worth knowing before panicking about a schema change.

**Properties carry only metadata lifted off the run. Diagnosis lives in the page
body, and an agent owns that body — so `errorsDelta` must never write it.**
`pageContentMarkdown` replaces a page body *in its entirety* (see the note on
`zapsSync` above: it wipes appended blocks and trashes child pages). A ticket is
re-upserted every time its signature recurs, so emitting a body here would
destroy the agent's analysis on the next recurrence, silently and repeatedly.
There is no `pageContentMarkdown` in the triage `changes`, and none may be added.

**Triage stays in this Notion database — the issue-tracker route was evaluated
and dropped, 2026-08-07.** Moving ticket creation into Linear was built and then
reverted; the current setup works, and Linear is reserved for external client
delivery rather than internal Zapier workflows. Do not add issue-tracker code to
this worker. If it is ever revisited, the shape that survived scrutiny was a
downstream durable on Notion's `new_data_source_item` rather than anything
in-worker, for two reasons that are properties of syncs and not of Linear:

- **A sync upserts, so a row is created exactly once** and updated thereafter. A
  create-triggered consumer therefore fires once per signature by construction,
  where the in-worker version needed a hashed title marker and a search before
  every create just to survive an execution dying mid-write.
- **A sync cannot know its own row's page URL.** `changes` are applied *after*
  `execute` returns, so on the execution that first sees a signature the row does
  not exist yet. Anything wanting that link needs a deferred second pass, or a
  trigger payload that already carries it.

**A worker cannot discover its own database.** `worker.database()` returns an
opaque `DatabaseHandle` — `{ key, config }` and nothing else — so there is no
route from the handle to the data source the platform created for it. Anything
needing the id must be given it.

**Zapier Manager's `zap_error_alert` trigger does not fire for Code Workflows.**
Probed 2026-08-07 and the reason is structural, so do not re-litigate it without
re-probing: Zapier Manager's object model is classic Zaps only. Its "Zap"
dropdown lists 45 classic Zaps and none of the 49 durables; `node_id` is typed
`int` while durables are UUIDs; and its find-a-Zap action returns `[]` for
`xero-invoice-alerts` and `enrich-contact-records` while resolving a classic Zap
by exact title. This is why triage is a walk on a schedule and not an
event-driven Zap — the tempting simplification is not available.

**That is why there is no `Root Cause` property.** It was there, and was removed
2026-07-29 at Dennis's request for exactly this reason. Whatever writes the body
can get it from `fetchRunDetail(durableRunId).rootCause` — `failureDetail` in
`src/runs.ts` pulls it out of the operations journal, and that is the only place
Zapier exposes it. `runs.test.ts` records the real journal shape.

**The signature is `workflowId · errorType · normalisedMessage` and must stay
derivable from `listWorkflowRuns` alone.** The failing step comes from
`getDurableRun`, which degrades to `undefined` on failure; keying on it would let
one transient journal failure split a ticket in two and fork its count. It is
display-only. There is a test asserting the signature is identical with and
without the journal.

**Every rule in `normaliseMessage` is driven by a message actually observed** —
appended JSON payload dumps, ids, ISO and US-format timestamps, semver. Quoted
substrings are kept deliberately: they are usually the discriminating part
(`"new Date()"`, `Step "update-contact-record"`). If `MAX_TICKETS` eviction ever
warns, the fix is a normalisation rule, not a bigger ceiling.

**One sync, not the repo's usual backfill + delta pair — and this one cannot be
split.** Sync state is per sync key, so a separate backfill would accumulate
ticket counts the delta could not see, and the delta's first cycle would overwrite
`Occurrences: 14` with `Occurrences: 1`. Any aggregate column forces the counting
into a single state.

**The watermark must not move until a durable's walk finishes.** Page one carries
the newest run, so a partial pass already knows the eventual high-water mark;
committing it early makes the next execution skip every older failure it has not
reached yet. That is what `pendingWatermark` is for — do not "simplify" it into
`watermarks`.

**`Occurrences` is the count; the `Zap Runs` relation is a 25-run sample.** Do not
present the number of links as the number of failures.

**A ticket minted before its Zap/run rows exist lands with both relations
empty, and completed walks re-emit recent tickets to heal that.** The `Zap` and
`Zap Runs` relations resolve against rows the *daily* `zapsSync` and `runsDelta`
own, but tickets come from the *hourly* `errorsDelta` — so a durable deployed
and failing the same day gets a ticket whose relation keys match nothing, and
the platform drops the links silently. Observed live 2026-09-01 (ZAP-34,
`slack-thread-to-notion-discussion`). Since a ticket is only re-upserted when
its signature recurs, a one-off failure would stay unlinked forever; the fix is
`relinkable` in `src/errors.ts` — every completed walk re-emits tickets seen in
the last `RELINK_WINDOW_MS` (48h), which re-resolves the relations once the
daily syncs have landed the rows. Safe because the triage sync never writes
page bodies or the hand-made columns. Do not shrink the window below ~30h: a
ticket minted just after a daily cycle waits up to ~24h for its Zap row plus up
to `FULL_WALK_INTERVAL_MS` for the next forced walk.

**A durable with no runs at all never gets a watermark**, so it is re-walked every
cycle. That is one list call and no failures — correct, just not free. Writing a
watermark for it would need a sentinel, which is not worth the confusion.

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
cannot carry a mandatory workflow reference. A side effect is that an ad-hoc
`runDurable` failure will open the gate and trigger a walk that finds nothing to
ticket — a wasted walk, never wrong data.

**`listDurableRuns` is account-wide but carries no workflow attribution.** It
takes no `workflow` argument and returns runs across every durable, newest-first —
verified live 2026-07-29, including that it covers workflow-triggered runs. But its
fields are exactly `id`, `status`, `input`, `output`, `error`, `execution_id`,
`is_private`, `created_at`, `updated_at`. No `workflow_id`, no version id, no
trigger id, and `getDurableRun` adds none. **It therefore cannot replace the
per-durable `listWorkflowRuns` walk** — a ticket must know which Zap it belongs to.
Do not "optimise" the walk away on the strength of this endpoint existing.

**Neither endpoint has a date filter.** `pageSize`, `cursor`, `maxItems` only. 0.91
dropped the `since` / `updatedAfter` parameters that earlier versions accepted and
silently ignored, so there is nothing left to be misled by.

**The gate is advisory and must stay that way.** `listDurableRuns` is used only to
decide whether an hourly cycle is worth walking (1 call instead of ~54). A false
negative would mean a real failure never gets a ticket, and coverage was only
spot-checked across three of 27 durables — so the walk happens unconditionally
every `FULL_WALK_INTERVAL_MS` regardless of the verdict. Do not remove that
override, and do not treat `conclusive` as optional: no watermark yet, and a full
page that never reached back to the watermark, both have to walk.

**`gateWatermark` is not one of the `watermarks`.** Those are per workflow and keyed
on *workflow-run* timestamps; `gateWatermark` is a single account-wide baseline on
*durable-run* timestamps. Different objects, different id spaces — do not merge
them.

**`lastFullWalkAt` is stamped when a walk starts, not when it finishes.** A cycle
interrupted mid-walk resumes from `index` on the next tick, so the walk still
completes; stamping on completion would need another state field to tell "resumed"
from "started".

**A title falls back to the message when the journal named no step.** `errorType`
is `details.name`, which for a plain `throw new Error(...)` in durable code is
literally `"Error"` — six of the first eighteen live tickets were titled
`<zap> · Error`, unusable in a list. Do not "tidy" the fallback away.

**Zapier exposes no stack trace anywhere** — not on the run, not on the execution,
not on the operation. Verified against a real failed run's full journal. The
sketched schema this was modelled on had a `Stack Trace` column; the closest thing
that actually exists is the failing operation's own error, which `failureDetail`
extracts.

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
ntn workers sync trigger errorsDelta --preview           # triage tickets, no writes
```

**A new ticket's `Status` is empty, confirmed** on the first live run
(2026-07-29): all eighteen tickets came back with `Status = null`, so the platform
does *not* apply the status property's default to a sync-created row. Views must
treat empty as untriaged, or the property's default has to be set in Notion.
