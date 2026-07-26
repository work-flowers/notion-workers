# Zapier Durables → Notion database (Worker sync)

Documents every **deployed Zapier Durable** in the work.flowers Zapier account
as a row in a managed Notion database: metadata as properties, the Zap's README
from [`work-flowers/zapier-sdk`](https://github.com/work-flowers/zapier-sdk) as
the page body.

Feasibility notes and the empirical testing behind these design decisions live
in [`docs/zapier-durables-docs-worker.md`](../../docs/zapier-durables-docs-worker.md).

## What it does

`zapsSync` — replace mode, hourly:

1. `listWorkflows()` (experimental Zapier SDK) — the row set is exactly what is
   deployed, so non-deployed repo directories and classic Code-step Zaps never
   appear.
2. `getWorkflow()` per durable for `current_version` — the only place
   `connections`, `dependencies` and `zapier_durable_version` are exposed.
3. GitHub, for each directory's `zap.json` and `README.md`.
4. The People database, to resolve the creator's Zapier id to a Notion person.

Nine durables today, so a cycle is roughly 32 upstream calls — comfortably
inside GitHub's authenticated 5000/hour even running every hour.

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

Always from the repo root, never bare `ntn workers deploy`:

```shell
./scripts/deploy.sh zapier-durables-docs
```

Then preview before letting it write:

```shell
ntn workers sync trigger zapsSync --preview
```
