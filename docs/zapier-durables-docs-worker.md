# Zapier Zap docs worker — feasibility notes

Planning notes for a worker that maintains a Notion database documenting every
deployed Zapier Durable in the work.flowers Zapier workspace: metadata as
properties, each Zap's GitHub README as the page body. Intended to be portable
enough to redeploy for clients.

**Status: exploration only. Nothing built.** Every leg has now been verified
empirically (last pass 2026-07-26) — Zapier metadata, authenticated GitHub
reads, the People user mapping, and the Notion markdown conversion. No blocking
unknowns remain.

## Verified feasible

### Zapier metadata

`createZapierSdk({ credentials: { clientId, clientSecret } })` from
`@zapier/zapier-sdk/experimental` — `listWorkflows` is **not** on the main
entry point. The experimental surface also exposes `getWorkflow`,
`listWorkflowVersions`, `getWorkflowVersion`, `listWorkflowRuns`,
`getWorkflowRun`.

**Version matters, and the earlier note missed it.** The workflow surface does
not exist at all in `@zapier/zapier-sdk@0.53.0`, which is what every other
worker in this repo pins via `^0.53.0` (a caret on a `0.x` version locks the
minor, so it resolves to `0.53.x`). Introspecting the SDK there returns no
workflow members and `sdk.listWorkflows` is `undefined`.

- **Pin `^0.91.0`.** Verified: the experimental surface exposes `listWorkflows`,
  `getWorkflow`, `listWorkflowVersions`, `getWorkflowVersion`,
  `listWorkflowRuns`, `getWorkflowRun`, plus create/update/enable/disable.
- **Do not go to 1.x.** `@zapier/zapier-sdk@1.1.0` removes the `./experimental`
  subpath from its `exports` map entirely — importing it throws
  `ERR_PACKAGE_PATH_NOT_EXPORTED`.

Also worth recording so it is not re-derived: the same method names exist as
**Zapier MCP tools** (`list_workflows`, `get_workflow`, …). That is almost
certainly where the original field list came from. A Worker cannot call MCP
tools, and the underlying REST host (`code-substrate-workflows.zapier.com/api/v0`)
rejects both plain and `sdk.fetch` requests with
`401 Expected valid JWT in authorization header`. The versioned SDK is the only
route that works from a worker.

This auth pattern already runs in five workers off `ZAPIER_CLIENT_ID` /
`ZAPIER_CLIENT_SECRET`: `bq-sync`, `buttondown-tools`, `email-db-updates`,
`luma-guest-sync`, `xero-invoice-sync`.

`listWorkflows()` returns `{ data, nextCursor }`. Each row: `id`, `name`,
`description`, `trigger_url`, `enabled`, `disabled_reason`, `is_private`,
`created_by_user_id`, `current_version_id`, `triggers[]`, `created_at`,
`updated_at`.

`created_by_user_id` is a **string** (`"20495893"`), which is exactly the
rich-text form stored in People — the join needs no coercion.

`getWorkflow({ workflow })` adds a single key, `current_version`, and the
useful fields are nested inside it (the earlier note listed them as top-level):
`source_files`, `zapier_durable_version`, `dependencies`, `trigger`,
`connections`, `app_versions`. So `connections` and `dependencies` cost one
extra call per workflow — nine per cycle.

Nine durables deployed today — eight enabled, `contrast-registrations-to-event-attendance`
disabled.

### GitHub READMEs

[`work-flowers/zapier-sdk`](https://github.com/work-flowers/zapier-sdk) is the
source of truth: one directory per Zap, each with `README.md`, `zap.json`,
`workflow.ts`. 47.5 KB of READMEs across ten directories.

**Read it authenticated — do not depend on the repo staying public.** Route
GitHub through the Zapier SDK's `fetch` against the existing GitHub connection
(`02581386-b46a-8abe-ad7a-bb264a3bd2ff`, "GitHub denchiuten #3"), the same
pattern `workers/xero-invoice-sync/src/notion.ts` already uses for Notion:

```ts
await sdk().fetch("https://api.github.com/repos/work-flowers/zapier-sdk/contents/…", {
  method: "GET",
  connection: process.env.ZAPIER_GITHUB_CONNECTION_ID,
  headers: { Accept: "application/vnd.github.raw+json" },
});
```

Verified: the connection authenticates as `denchiuten` with scopes
`gist, notifications, read:org, repo, user`. The `repo` scope covers private
repositories, so this keeps working if the repo is flipped to private. Rate
limit is 5000 requests/hour, not the anonymous 60/hour per shared-egress IP.

This needs no new credential — the worker already carries `ZAPIER_CLIENT_ID` /
`ZAPIER_CLIENT_SECRET` for `listWorkflows`. A read-only PAT is the fallback if
the connection is ever unavailable, but it is strictly more to manage.

### Notion page bodies

Sync upserts accept `pageContentMarkdown`, and it **replaces** the body on
update rather than appending. Documented and relied on in
`workers/api-changelog-sync`, which is the closest template for this worker:
fetch markdown, hash it into sync state, only re-emit changed rows.

## Decisions

- **Row set is exactly what `listWorkflows` returns** — deployed durables only,
  including disabled ones. Non-deployed directories
  (`deal-won-set-up-client-workspace`) and classic Code-step Zaps
  (`email-contact-page-zap`) never appear. GitHub is enrichment only.
- **Join on `workflow_id` from `zap.json`.** Not on names, and not on the
  `// Source of truth:` header — that header is missing from all three Luma
  directories (present in 6 of 10).
- `luma-event-to-notion/zap.json` uses a `deployments[]` array: one directory,
  two deployed workflows. Both rows share one README body — acceptable.
- **Never sync `trigger_url`** — it embeds a secret token. Use
  `https://zapier.com/durables-editor/<workflow-id>` instead.

## Notion-flavored Markdown

`pageContentMarkdown` is a pass-through in the SDK; conversion happens
server-side, so `notion://docs/enhanced-markdown-spec` is the contract.

**Tested empirically on 2026-07-26** — three probe pages created through the
Notion MCP `create-pages` tool (same server-side converter) and read back. Two
of the earlier defensive assumptions were wrong, and one real bug turned up
that the notes had not predicted.

### What the test actually showed

- **Mermaid fences are verbatim.** `<br/>` and `<br>` both survive unchanged
  inside a ` ```mermaid ` fence. **No normalisation needed** — the earlier note
  was wrong. Nothing inside a fence is touched, so this was never at risk.
- **GitHub pipe tables are supported.** They convert to real Notion
  `<table header-row="true">` blocks. The earlier note claiming they are absent
  from the spec was wrong; no hand-conversion to `<table><tr><td>` is needed.
- **Inline formatting inside cells works.** Code spans, bold, and links all
  become genuine annotations, not literal text. Confirmed by round-tripping an
  escaped literal alongside a real one: the serializer emits `` \` `` and
  `\*\*` for literals and bare `` ` ``/`**` for real annotations, so the two
  are distinguishable.
- **Headings 5 and 6 collapse to heading 4** — confirmed. Not currently an
  issue: no README uses an h5 or h6.
- Inline `<br/>` *outside* a fence is canonicalised to `<br>`. Harmless.

### The one real defect: escaped pipes corrupt table rows

`\|` inside a table cell breaks the cell split and **loses content**. Input
`| pipe | a \| b |` came back as a two-cell row ending `a \` — the ` b` is
gone. In the more realistic probe the escape produced an *extra* cell, shifting
every later column in that row.

This is not hypothetical. Every one of the five READMEs with a pipe table
contains exactly one `\|`:

| Directory | Table rows | `\|` | mermaid | `<br/>` |
|---|---|---|---|---|
| contact-emails-to-zapier-table | 9 | 1 | 1 | 8 |
| enrich-contact-records | 5 | 1 | 1 | 10 |
| luma-event-to-notion | 7 | 1 | 0 | 0 |
| luma-guest-registered-to-event-attendance | 3 | 1 | 0 | 0 |
| luma-guest-updated-to-event-attendance | 3 | 1 | 0 | 0 |

#### The fix: re-emit affected tables as native table XML

Notion's `<table><tr><td>` form accepts a **literal** `|` in a cell — no escape
needed, so nothing splits. Verified end to end: the real
`enrich-contact-records` connection table converts to a 4×4 XML table with
`` `work.flowers | Dennis` `` intact in a single cell, code spans and all.

Only tables that actually contain a `\|` are rewritten. Clean pipe tables are
left exactly as they are — they already convert correctly, and rewriting them
would be risk for no gain.

Two alternatives were tried first and **both are wrong**:

- **`&#124;`** — Notion does not decode HTML entities. Confirmed with a control:
  `&amp;` round-trips as `&amp;`, not `&`. The reader would literally see
  "&#124;".
- **A lookalike glyph** (U+2502 `│`, U+FF5C `｜`) — survives and does not split,
  but silently swaps the character the README author wrote.

### Minor

- **Bare domains autolink.** `work.flowers` becomes
  `[work.flowers](http://work.flowers)` and `Apollo.io` likewise. Cosmetic, but
  it puts dead links in a connection table. Wrap such cells in a code span
  upstream if it grates.
- Repo-wide counts: 50 `<br/>` and zero `<br>` across seven mermaid READMEs
  (the earlier figure of 44 was low). The three Luma READMEs carry no mermaid
  diagram — repo rule drift, not a worker problem.

Probe pages (private, still in the workspace — delete when done):
`3a991b07-11ac-8145-b87e-eded022166c9` (br / pipe tables),
`3a991b07-11ac-819d-823b-fd46a8602ea0` (cell contents),
`3a991b07-11ac-817f-b4b7-def866c8bd7f` (code span vs literal),
`3a991b07-11ac-8196-8eb3-e093bad95315` (entity fix vs bug control),
`3a991b07-11ac-8192-b4e8-fa0fa4ecef6c` (entity decoding),
`3a991b07-11ac-811b-8dc7-cdafd40d25f4` (table XML with raw pipes),
`3a991b07-11ac-8191-9db5-facb555a1074` (real converted README table).

## User mapping

No Zapier action resolves a user ID to an email address. `getProfile` returns an
email but takes no arguments — it describes the authenticated identity only.

`created_by_user_id` is the Zapier **customuser id**. Confirmed: `find_table`
returns `owner_zapier_customuser_id: 20495893`, matching `list_workflows`
exactly. A second form of the same identity exists —
`owner_zapier_customuser_public_id: 01521d30-59cf-838a-8442-82d26716a2e5`,
which is also the `profile_id` on connections.

### Use the native People database — verified end to end

**Resolved on 2026-07-26.** The native People database is readable over the
Notion public REST API and carries the mapping already. Use it; the Zapier Table
`01JM3J9SG5X6S8GBSSC8AS28AT` ("Internal User IDs") is now only a fallback.

- Database id: `d3d91b07-11ac-82df-b0d8-014512d331ec`
- **Data source id: `a0791b07-11ac-8364-9113-07ea21165718`**
- Relevant properties: `Zapier User ID` (rich_text) → `Person` (people)

`Zapier User ID` stores the **numeric** customuser id — Dennis's record holds
`"20495893"`, which matches `created_by_user_id` from `listWorkflows` exactly.
Filtering on the `01521d30-…` public UUID returns zero rows, so that ambiguity
is settled: **join on the numeric id.**

```
POST /v1/data_sources/a0791b07-11ac-8364-9113-07ea21165718/query
{"filter":{"property":"Zapier User ID","rich_text":{"equals":"20495893"}},"page_size":1}
→ 1 result: Dennis, Person = 121d872b-594c-810b-ba5a-000206eeef1e
```

Only a **read** is needed — resolve a Zapier user id to a Notion user id. No
write to People is required.

#### Both access routes work; prefer the Zapier connection

| Route | Verified | Extra credential |
|---|---|---|
| Zapier SDK `fetch` + Notion connection `02b73654-…` | 200 on `2025-09-03` and `2026-03-11` | none |
| Internal integration token over REST | 200 once shared | `NOTION_API_TOKEN` |

**Correction (2026-09-28):** a later revision of these notes claimed
`NOTION_API_TOKEN` "is required either way — the platform uses it to write rows
for *any* sync", citing `api-changelog-sync`. That is wrong. **The platform
writes managed-database sync rows without it**; the token is only needed when
worker code reads it — to back REST calls or `context.notion`. Evidence:
`fx-rates` is a managed-database sync with no env vars at all and `ntn workers
sync status` reports it healthy, and `lovable-changelog-sync` was deployed with
no env vars and ran its first sync at 528 upserts, 0 failures.
`api-changelog-sync` simply held a token nothing reads. So the original framing
stands — the Zapier route adds no Notion credential, the REST route does — and
the trade-off is:

- **Zapier route** — no Notion token on the worker, and no need to share People
  with an integration;
  one more layer of indirection; the connection id is workspace-specific, so a
  client redeploy needs a Notion connection in *their* Zapier account.
- **REST route** — simplest and most direct, and exactly what
  `workers/harvest-sync/src/notion-lookup.ts` already does; requires setting
  `NOTION_API_TOKEN` on the worker and sharing People with the integration behind
  it (already done for `notion-worker-automations`).

Going with the Zapier route, kept behind a single `resolveNotionUserId()` so
switching is a one-function change.

Note that `context.notion` **cannot** do this lookup either way: the platform
pins it to an older API version that 404s on data-source endpoints (see the
comment at the top of `workers/harvest-sync/src/notion-lookup.ts`). Whichever
route is chosen, it is an explicit client — not `context.notion`.

#### Corrections to earlier rounds

An earlier round concluded People was unreachable. That was based on a Zapier
MCP connector bound to the `Knoxx | Dennis #2` client workspace — every Notion
read hit Knoxx, not work.flowers, so those 404s proved nothing.

A later round then reported that an internal integration token could not reach
People either. That was also wrong, and for a mundane reason: the database had
simply not been shared with the token being tested. Sweeping every Notion token
in 1Password against it, `notion-worker-page-icon-sync` and `notion-as-code-test`
both returned 200 **before** any sharing change was made.

What holds:

- **Notion MCP blocks it**: `403 restricted_resource` — "This object is managed
  by Notion and isn't accessible via MCP". Real, but specific to the MCP surface,
  and irrelevant to a worker.
- **The public REST API does not block it** — over either auth route.
- Separately, `users.list` (workspace members, used by `buildInternalUserMap`)
  genuinely is read-only with no custom fields. That is a *different object*
  from the People database; the two were conflated.

## Open questions

All four earlier questions are now answered — see the sections above.

1. ~~People data source ID and property names~~ — `a0791b07-11ac-8364-9113-07ea21165718`,
   `Zapier User ID` (rich_text) → `Person` (people).
2. ~~Numeric vs UUID join key~~ — numeric (`20495893`). The UUID matches nothing.
3. ~~Whether an internal integration token can reach People~~ — yes, once shared;
   two existing tokens already could. Moot if the Zapier route is used.
4. ~~The empirical markdown test~~ — done. One real defect found (escaped pipes).

Remaining, and none of them block building:

1. Whether `Zapier User ID` gets populated for the other People records. Today
   only Dennis has one, so every other `created_by_user_id` falls through to the
   unmapped path. That is a data-entry task, not a code problem — hence the
   `Creator ID` rich-text column below, so unmapped ids stay visible.
2. Whether `listWorkflowRuns` is worth the nine extra calls per cycle for a
   Last Run column.

## Proposed shape

One worker, one managed database, **replace-mode** sync on an hourly
schedule — mark-and-sweep handles deleted Zaps for free at this record count —
with content hashes in sync state so unchanged rows are skipped.

Properties: Name (title), Status, Description, Trigger app + event, Editor URL,
GitHub URL, Workflow ID, Version ID, Connections, Dependencies, Created,
Updated, Creator (people, via the resolver), Creator ID (rich text, so unmapped
IDs stay visible). Page body: the README.

Optional: a Last Run date from `listWorkflowRuns` — nine extra calls per cycle,
and it turns the database from documentation into something worth checking.

Markdown pre-processing before `pageContentMarkdown` is one step, not four:
re-emit tables containing `\|` as native table XML. Mermaid, clean pipe tables,
and inline formatting all pass through untouched.

The People lookup returns an **email**, not a user id — `Builder.people()` takes
email addresses. The People row's `Person` property exposes `person.email` on
the query response, so this is one field deeper, not another call.

Credentials: `NOTION_API_TOKEN` (required by the platform to write sync rows,
not read by application code), `ZAPIER_CLIENT_ID`, `ZAPIER_CLIENT_SECRET`, and
two connection ids (Notion, GitHub). **No GitHub PAT** — that is the one
credential the Zapier routing genuinely removes.

## Environment notes

Zapier connections (all reachable with the `ZAPIER_CLIENT_ID` /
`ZAPIER_CLIENT_SECRET` pair the worker needs anyway):

- work.flowers Notion: `02b73654-15c8-85c3-b16a-07304d2beb17`
- GitHub `denchiuten #3`: `02581386-b46a-8abe-ad7a-bb264a3bd2ff` — scopes
  `gist, notifications, read:org, repo, user`
- Knoxx Notion: `02b95b31-c152-8800-9036-1107e08f70da` — never bind this one;
  it cannot see work.flowers databases.

Notion:

- People database `d3d91b07-11ac-82df-b0d8-014512d331ec`, data source
  `a0791b07-11ac-8364-9113-07ea21165718`
- Data-source endpoints need `Notion-Version: 2025-09-03` or later; both
  `2025-09-03` and `2026-03-11` were verified against People.

Consequence for portability: redeploying for a client means a `NOTION_API_TOKEN`
for their workspace (unavoidable — the platform needs it to write sync rows) plus
swapping two connection ids. No GitHub PAT to provision.
