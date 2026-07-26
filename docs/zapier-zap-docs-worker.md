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

This auth pattern already runs in five workers off `ZAPIER_CLIENT_ID` /
`ZAPIER_CLIENT_SECRET`: `bq-sync`, `buttondown-tools`, `email-db-updates`,
`luma-guest-sync`, `xero-invoice-sync`.

`listWorkflows` returns `id`, `name`, `description`, `enabled`,
`disabled_reason`, `is_private`, `created_by_user_id`, `created_at`,
`updated_at`, `current_version_id`, `triggers[]`. `getWorkflow` adds
`source_files`, `dependencies`, `zapier_durable_version`, `connections`.

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

So the worker's only required markdown fix-up is **escaped pipes**: replace
`\|` in table cells with a character Notion will not split on (`&#124;` or a
plain `/`) before handing the body to `pageContentMarkdown`. Everything else
passes through correctly.

### Minor

- **Bare domains autolink.** `work.flowers` becomes
  `[work.flowers](http://work.flowers)` and `Apollo.io` likewise. Cosmetic, but
  it puts dead links in a connection table. Wrap such cells in a code span
  upstream if it grates.
- Repo-wide counts: 50 `<br/>` and zero `<br>` across seven mermaid READMEs
  (the earlier figure of 44 was low). The three Luma READMEs carry no mermaid
  diagram — repo rule drift, not a worker problem.

Probe pages (private, still in the workspace — delete when done):
`3a991b07-11ac-8145-b87e-eded022166c9`,
`3a991b07-11ac-819d-823b-fd46a8602ea0`,
`3a991b07-11ac-817f-b4b7-def866c8bd7f`.

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
| Zapier SDK `fetch` + Notion connection `02b73654-…` | 200 on `2025-09-03` and `2026-03-11` | **none** |
| Internal integration token over REST | 200 once shared | `NOTION_API_TOKEN` |

Prefer the Zapier route. The worker must carry `ZAPIER_CLIENT_ID` /
`ZAPIER_CLIENT_SECRET` anyway for `listWorkflows`, so this adds nothing, and
`workers/xero-invoice-sync/src/notion.ts` already implements exactly this
client. It also sidesteps the per-token sharing chore that the internal
integration needs.

Note that `context.notion` **cannot** do this lookup: the platform pins it to an
older API version that 404s on data-source endpoints (see the comment at the top
of `workers/harvest-sync/src/notion-lookup.ts`). So "the worker already has a
Notion client" is not an argument for the REST route — either way it is an
explicit client.

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

One worker, one managed database, **replace-mode** sync on a 6–12 hour
schedule — mark-and-sweep handles deleted Zaps for free at this record count —
with content hashes in sync state so unchanged rows are skipped.

Properties: Name (title), Status, Description, Trigger app + event, Editor URL,
GitHub URL, Workflow ID, Version ID, Connections, Dependencies, Created,
Updated, Creator (people, via the resolver), Creator ID (rich text, so unmapped
IDs stay visible). Page body: the README.

Optional: a Last Run date from `listWorkflowRuns` — nine extra calls per cycle,
and it turns the database from documentation into something worth checking.

Markdown pre-processing before `pageContentMarkdown` is one step, not four:
replace `\|` inside table cells. Mermaid, pipe tables, and inline formatting all
pass through untouched.

Credentials: `ZAPIER_CLIENT_ID`, `ZAPIER_CLIENT_SECRET`, and three connection
ids (Notion, GitHub, and — only if the People lookup falls back — the Zapier
Table). No `NOTION_API_TOKEN`, no GitHub PAT.

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

Consequence for portability: with both Notion and GitHub routed through Zapier
connections, the worker's entire secret footprint is the Zapier client id and
secret plus three connection ids. Redeploying for a client means swapping the
connection ids, not provisioning new Notion integrations or GitHub PATs.
