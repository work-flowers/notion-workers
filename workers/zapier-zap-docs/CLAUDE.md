# zapier-zap-docs — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## What it touches

- **Zapier Code Workflows** (`listWorkflows`, `getWorkflow`) — the deployed
  durables. Read-only.
- **GitHub** `work-flowers/zapier-sdk` — `zap.json` and `README.md` per
  directory. Read-only, via the Zapier GitHub connection.
- **Notion People** data source `a0791b07-11ac-8364-9113-07ea21165718` —
  read-only, to resolve a creator.
- **Managed database "Zapier Zaps"** — written only through `zapsSync`.

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

## Markdown

`src/markdown.ts` is deliberately minimal and its header comment records what
was tested and what was rejected. Before adding a transform there, check that
comment — mermaid `<br/>` normalisation and wholesale pipe-table conversion were
both considered and are both *unnecessary*, and two plausible fixes for the
escaped-pipe bug (HTML entity, lookalike glyph) are wrong for reasons that are
not obvious.

Re-test against the live converter rather than reasoning about it: create a page
with the Notion MCP `create-pages` tool, then fetch it back. The round-trip
distinguishes real annotations from literal text by escaping — a literal
backtick comes back as `` \` ``, a real code span as a bare backtick.

## Testing

```shell
npm run check --workspace=notion-worker-zapier-zap-docs
npm test --workspace=notion-worker-zapier-zap-docs      # markdown unit tests
ntn workers sync trigger zapsSync --preview             # end to end, no writes
```
