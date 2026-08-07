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
  `errorsDelta`. Every column in it is machine-written now; see *Error triage*.
- **Linear**, through the **Zapier** Linear connection
  (`ZAPIER_LINEAR_CONNECTION_ID`), team `LINEAR_TEAM_ID`, labelled
  `LINEAR_LABEL_ID` (`d4cfb106-…`, the **Zap Error** label). Write-only in
  practice: `errorsDelta` opens one issue per error signature and comments on
  recurrences.

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

**Triage lives in Linear; this database is the machine index.** Notion holds the
signature, `Occurrences`, first/last seen and the relations to Zaps and Zap Runs.
Linear holds status, priority, assignee and the diagnosis. Changed 2026-08-07.

**This is what dissolved the read-only-column problem, so do not reintroduce
those columns.** Declaring a property in a managed schema makes it `readOnly` in
Notion — a person cannot edit it — and not emitting a value does not help,
because managed-ness follows the *declaration*, not the writes. Verified the hard
way on 2026-07-29: `Status`, `Priority`, `Assignee`, `Resolution Notes` and
`Resolved on` were declared and deliberately never written, and the result was
five read-only columns and a triage table nobody could triage in. They then lived
as hand-made properties outside the schema, which worked but was not reproducible
from code. Linear has all five natively, so new tickets are triaged there.

**The hand-made properties are not to be deleted on migration — they hold live
triage history.** Read back off the live data source
(`db78a092-515d-40e6-9416-aab114460f86`) on 2026-08-07, there are **seven**
editable properties, not the five recorded here previously:

| Property | Type | Notes |
|---|---|---|
| `Status` | status | To-do: `Untriaged` (gray) · In progress: `Ready for Claude` (purple), `Ready for GLM` (yellow), `Ready for human review` (orange), `In progress` (blue) · Complete: `Resolved` (green), `Won't fix` (brown) |
| `Priority` | select | `High` (red), `Medium` (yellow), `Low` (gray) |
| `Assignee` | person | — |
| `Resolution Notes` | text | Carries real prose on resolved tickets. Deleting the column destroys it. |
| `Resolved on` | date | Set by a Notion automation when `Status` moves to a Complete option. |
| `Ticket ID` | auto_increment_id | `ZAP-25`. **Keep this.** The agent write-ups in page bodies refer to tickets by this number, and the Linear attachment title carries it across. |
| `GitHub Pull Requests` | relation | To `collection://3ad91b07-11ac-805d-8a56-000b61b9143a`. Someone added it by hand; nothing in this repo writes it. |

`Ticket` (title) also reports as editable, because Notion cannot mark a title
`readOnly`. The sync still owns it.

**Undeclaring a property releases it rather than dropping it.** Removing five of
these from the schema and redeploying left every one in place, options and status
groups intact, and simply cleared `readOnly`. Nothing was lost and nothing had to
be recreated — worth knowing before panicking about a schema change. It is also
why deleting them would be a *manual* action in Notion: a code change cannot do
it, which is the safety net here rather than an inconvenience.

**The Notion Linear connection cannot be used from a worker — this was checked,
do not retry it.** Notion's Linear connector is a workspace integration for
search and link previews (it is what lets Notion AI read Linear). The Workers
runtime exposes exactly two routes to a third-party credential: `worker.oauth()`
with an OAuth app you own, and a Notion-managed `provider:` shorthand that is
private alpha. Neither reaches a connector configured in Notion's settings, and
`@notionhq/workers@0.8.1` has no connection concept at all. Hence Zapier.

**Linear is reached with `sdk().runAction`, not GraphQL.** `runAction` executes a
Zapier app action against a stored connection, so `src/linear.ts` names actions
(`create_issue`, `create_comment`, `issues_by_name`) and fields instead of
writing queries, and no Linear token is held here. Each call costs a Zapier task,
which is the right trade at triage volume (~8 signatures in two months) and would
be the wrong one on a per-run path.

**`LINEAR_LABEL_ID` is an id, not a name, and is optional.** `labels` on
`create_issue` is a dynamic enum over the workspace's *existing* labels — Zapier
resolves it by id, and a name that is not already there is not created, so a
hard-coded name would fail on every ticket. Unset means no label, deliberately:
a label misconfiguration must never be what stops a failure being reported.

**The Linear issue carries a link back to its Notion row, attached on a *later*
execution.** A sync's `changes` are applied after `execute` returns, so on the
execution that first sees a signature the row does not exist and the lookup
correctly finds nothing; the ticket stays `notionAttached: false` until it does.
At one durable per execution that is usually seconds. Do not "fix" this by
attaching at creation time — there is nothing to attach to yet.

**The back-link needs `NOTION_TRIAGE_DATA_SOURCE_ID`
(`db78a092-515d-40e6-9416-aab114460f86`) because a worker cannot discover its own
database.** `worker.database()` returns an opaque `DatabaseHandle` — `{ key,
config }` and nothing else — so there is no runtime route from the handle to the
data source the platform created for it. Unset means no attachment, which is a
working configuration: it is necessarily a post-deploy value.

**`list_issue_labels` without a `name` filter does not return every label.** It
listed 20 and reported `hasNextPage: false` while omitting `Zap Error`, which a
name-filtered call then found. Do not conclude a label is missing from an
unfiltered listing — query it by name before creating a duplicate.

**The issue title carries a `[zap-err:xxxxxxxx]` marker, and it is load-bearing.**
`ticketTitle` tracks the *newest* occurrence, so the visible part of the title
moves when a later failure names a different step. The marker is hashed from the
signature alone, so it does not. It is the anchor `issues_by_name` searches on
when a retried execution needs to find an issue it already opened — searching the
display title would miss and open a duplicate. Do not "tidy" it out of the title.

**Properties carry only metadata lifted off the run. Diagnosis lives in the
Linear issue, and an agent owns it.** Two consequences, both deliberate:

- `errorsDelta` must never write a Notion page body. `pageContentMarkdown`
  replaces a body *in its entirety* (see the note on `zapsSync` above: it wipes
  appended blocks and trashes child pages), and a ticket is re-upserted every
  time its signature recurs. There is no `pageContentMarkdown` in the triage
  `changes`, and none may be added.
- The Linear **description is written once at creation and never rewritten**, for
  exactly the same reason. Recurrences post a *comment*. This is why
  `issueDescription` carries no counts: they would be stale within the hour and
  could never be corrected without destroying the analysis below them.

**A recurrence comment is one per cycle, not one per run.** `noticedCount` holds
the count at the last note, so a fault that failed nine more times in an hour
gets one comment saying so. Without it the overlap window would post a comment an
hour on every unfixed fault — noise on precisely the tickets that matter most.

**The sync never touches status, priority or assignee — including on
recurrence.** A resolved issue that recurs gets a comment, not a reopening. That
mirrors what `Status` always was here: the human's. It does mean a fault marked
"Won't fix" recurs quietly into a closed issue's comments, which is the intended
reading of "won't fix".

**A Linear failure must never fail the sync.** Each ticket's Linear work is
wrapped individually and a failure is logged, not thrown: the Notion row is the
durable record of the failure, and losing the sync to a Linear blip would lose
the walk's progress with it. The next cycle retries — `needsNotice` stays true
while a ticket has no issue id or an unreported count.

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
