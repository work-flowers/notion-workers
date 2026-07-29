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
- **Managed database "Zapier Error Triage"** — written only through
  `errorsDelta`, and only its machine columns.

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

## Error triage

**Declaring a property in a managed schema makes it `readOnly` in Notion — a
person cannot edit it.** Not emitting a value does not help; managed-ness follows
the *declaration*, not the writes. Verified the hard way on 2026-07-29: `Status`,
`Priority`, `Assignee`, `Resolution Notes` and `Resolved` were declared in the
schema and deliberately never written, and the result was five read-only columns
and a triage table nobody could triage in.

So those five are **hand-made properties on the data source, not in the schema**.
Anything a human must edit has to stay out of `worker.database()`. Their intended
shape, for rebuilding by hand if this database is ever recreated:

| Property | Type | Options |
|---|---|---|
| `Status` | status | To-do: `Untriaged` (gray) · In progress: `Ready for Claude` (purple), `Ready for human review` (orange), `In progress` (blue) · Complete: `Resolved` (green), `Won't fix` (brown) |
| `Priority` | select | `High` (red), `Medium` (yellow), `Low` (gray) |
| `Assignee` | person | — |
| `Resolution Notes` | text | — |
| `Resolved` | date | — |

**Undeclaring a property releases it rather than dropping it.** Removing those
five from the schema and redeploying left every one in place, options and status
groups intact, and simply cleared `readOnly`. Nothing was lost and nothing had to
be recreated — worth knowing before panicking about a schema change.

**Properties carry only metadata lifted off the run. Diagnosis lives in the page
body, and an agent owns that body — so `errorsDelta` must never write it.**
`pageContentMarkdown` replaces a page body *in its entirety* (see the note on
`zapsSync` above: it wipes appended blocks and trashes child pages). A ticket is
re-upserted every time its signature recurs, so emitting a body here would
destroy the agent's analysis on the next recurrence, silently and repeatedly.
There is no `pageContentMarkdown` in the triage `changes`, and none may be added.

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

**A durable with no runs at all never gets a watermark**, so it is re-walked every
cycle. That is one list call and no failures — correct, just not free. Writing a
watermark for it would need a sentinel, which is not worth the confusion.

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

`src/markdown.ts` is deliberately minimal and its header comment records what
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
