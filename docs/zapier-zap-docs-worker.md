# Zapier Zap docs worker — feasibility notes

Planning notes for a worker that maintains a Notion database documenting every
deployed Zapier Durable in the work.flowers Zapier workspace: metadata as
properties, each Zap's GitHub README as the page body. Intended to be portable
enough to redeploy for clients.

**Status: exploration only. Nothing built.**

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

[`work-flowers/zapier-sdk`](https://github.com/work-flowers/zapier-sdk) is
public and is the source of truth: one directory per Zap, each with
`README.md`, `zap.json`, `workflow.ts`. Roughly 48 KB of READMEs total.

Use a read-only PAT — anonymous GitHub is 60 requests/hour per IP, and workers
run on shared egress.

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

- **Mermaid is explicitly supported** via a ` ```mermaid ` fence.
- **The spec wants `<br>`; all seven mermaid READMEs use `<br/>`** (44
  occurrences). Normalise in the worker — don't change the repo, GitHub renders
  both.
- **Pipe tables are not in the spec.** Notion uses `<table><tr><td>` XML. Five
  READMEs use GitHub pipe tables — convert them, or accept degraded rendering.
- Escape ``\ * ~ ` $ [ ] < > { } | ^`` outside code blocks. Headings 5 and 6
  collapse to heading 4.
- The three Luma READMEs carry no mermaid diagram at all — repo rule drift, not
  a worker problem.

Not verified empirically: the `<br/>` and pipe-table behaviour. A test page
create was attempted twice and blocked on tool approval. Coding defensively for
both cases is cheaper than the test.

## User mapping

No Zapier action resolves a user ID to an email address. `getProfile` returns an
email but takes no arguments — it describes the authenticated identity only.

`created_by_user_id` is the Zapier **customuser id**. Confirmed: `find_table`
returns `owner_zapier_customuser_id: 20495893`, matching `list_workflows`
exactly. A second form of the same identity exists —
`owner_zapier_customuser_public_id: 01521d30-59cf-838a-8442-82d26716a2e5`,
which is also the `profile_id` on connections.

Current choice: Zapier Table `01JM3J9SG5X6S8GBSSC8AS28AT` ("Internal User IDs"),
fields `Zapier ID` and `Notion User ID`. Read it with the pattern already proven
in `contact-emails-to-zapier-table/workflow.ts`:

```ts
sdk.listTableRecords({
  table: "01JM3J9SG5X6S8GBSSC8AS28AT",
  keyMode: "names",
  filters: [{ fieldKey: "Zapier ID", operator: "exact", value: createdByUserId }],
  pageSize: 1,
});
```

### The native People database is viable — earlier conclusion was wrong

An earlier round of investigation concluded the native People database was
unreachable. **That conclusion was based on invalid evidence and should not be
repeated.**

The Zapier MCP connector used for that investigation was bound to the
`Knoxx | Dennis #2` connection — the client workspace that
`zapier-sdk/CLAUDE.md` explicitly says never to bind. Every Notion read through
it hit Knoxx, not work.flowers, so the 404s and the absent "People" entry in the
data-source picker proved nothing. A live Zapier test successfully updated a
People record.

What actually holds:

- **Notion MCP blocks it**: `403 restricted_resource` — "This object is managed
  by Notion and isn't accessible via MCP". Real, but specific to the MCP surface.
- **The Notion public REST API does not block it.**
- A worker's `context.notion` is the public API, so People is very likely
  readable and writable from a worker.
- Separately, `users.list` (workspace members, used by `buildInternalUserMap`)
  genuinely is read-only with no custom fields. That is a *different object*
  from the People database; the two were conflated.

People is therefore the better long-term home for the mapping — it removes the
Zapier Table dependency, which is the client-portability problem. Keep the Table
as the fallback. Either way the lookup sits behind one function, so this does
not block building.

## Open questions

1. The People data source ID, and the property names added to it.
2. Whether `Zapier ID` in the Table stores the numeric `20495893` or the
   `01521d30-…` UUID. A UUID would make the join silently return nothing.
3. Whether an **internal** integration token (from
   `app.notion.com/developers/connections`) can be granted access to People.
   The Zapier test proves only that Zapier's OAuth integration can.
4. Optionally, the empirical markdown test.

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

## Environment notes

- work.flowers Notion connection: `02b73654-15c8-85c3-b16a-07304d2beb17`
- Knoxx Notion connection: `02b95b31-c152-8800-9036-1107e08f70da` — never bind
  this one; it cannot see work.flowers databases.
