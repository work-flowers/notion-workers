# notion-workers monorepo

One Notion Worker per directory under `workers/`; shared helpers in `packages/shared` (`@work-flowers/notion-worker-shared`). npm workspaces — always `npm install` from the repo root, never inside a worker.

## Conventions

- **Notion API**: always target `data_source_id` (not `database_id`). When the `@notionhq/client` SDK v2.x doesn't expose data-source endpoints, use `client.request()` with `Notion-Version: 2026-03-11` (`POST /v1/data_sources/{id}/query`, `GET /v1/data_sources/{id}`).
- **Shared code**: helpers used by two or more workers belong in `packages/shared`. Workers depend on it via `"@work-flowers/notion-worker-shared": "*"` — never via a `github:` URL.
- **Package names**: each worker's `package.json` name is `notion-worker-<dirname>` (workspace names must be unique; freshly scaffolded workers all ship as `@notionhq/workers-template` and must be renamed).
- **Lockfile**: single root `package-lock.json`. Workers must not have their own.
- **workers.json**: per-worker `ntn` config (workspaceId + workerId). Committed. Never copy one worker's `workers.json` to another — deploys would overwrite the wrong worker.
- **Managed schemas make properties read-only. Anything a human must edit has to stay out of `worker.database()`.** Declaring a property is what marks it `readOnly: true` in Notion — *not* whether the sync ever writes a value to it. Declared and never written still means nobody can set it in the UI. Human-owned columns (a triage status, an assignee, notes) therefore have to be added to the data source by hand and documented in the worker's own `CLAUDE.md`, since they are then not reproducible from code. Undeclaring a property does *not* drop it: it stays, keeps its values, options and status groups, and simply loses `readOnly`. (Learned on `zapier-durables-docs`, 2026-07-29.)

## ntn CLI

Run all `ntn workers` commands from inside the worker's directory — it resolves `workers.json` by CWD lookup.

- **Deploy: always `./scripts/deploy.sh <worker-name>` from the repo root**, never bare `ntn workers deploy` for workers that use the shared package. The ntn cloud build uploads only the worker directory and runs `npm install` in a sandbox, so it cannot resolve unpublished workspace packages; the script vendors a tarball of `packages/shared` for the duration of the deploy. `--local-build` also does not work in a workspace (workers have no local `node_modules`).
- Typecheck before deploying: `npm run check --workspace=<package-name>` from the root
- Secrets: `ntn workers env` — never commit secrets

### Rotating a shared credential

**Environment variables live on the deployed worker, not in this repo, and are scoped to one `workerId`.** Nothing is shared or inherited between workers — several just happen to hold copies of the same credential. So rotating one means running `ntn workers env set` in *every* worker that holds it, and a worker you miss keeps using the old value until its next scheduled run, where it fails upstream rather than at deploy time. `src/zapier.ts` throws a clear error on a *missing* variable; a *stale* one just gets rejected by the API.

Two credentials are duplicated widely enough to need a checklist (as of 2026-07-29):

| Credential | Workers holding it |
|---|---|
| `ZAPIER_CLIENT_ID` + `ZAPIER_CLIENT_SECRET` | `bq-sync`, `buttondown-tools`, `email-db-updates`, `luma-guest-sync`, `meeting-note-db-updates`, `xero-invoice-sync`, `zapier-durables-docs` |
| `NOTION_API_TOKEN` | `api-changelog-sync`, `buttondown-sync`, `create-newsletter-page`, `email-db-updates`, `harvest-sync`, `link-contact-to-company`, `luma-guest-sync`, `meeting-note-db-updates`, `page-icon-sync`, `set-company-logo`, `zapier-durables-docs` |

That table is a snapshot and will drift. Regenerate it rather than trusting it — this prints every worker's variable *names* only, never a value:

```shell
cd workers && for d in */; do w="${d%/}"; [ -f "$w/workers.json" ] || continue; \
  printf "%-28s %s\n" "$w" "$(cd "$w" && ntn workers env list 2>/dev/null | awk 'NF{print $1}' | sort | paste -sd, -)"; done
```

Connection ids (`ZAPIER_*_CONNECTION_ID`) are per worker and per connection, not shared secrets — they name a stored Zapier connection rather than carrying a credential, so they do not need rotating.

## Notion automation webhooks

Workers that receive **Notion database automation** webhooks (via `worker.webhook()`) get Notion's default envelope, **not** a flat body. The triggering page is nested under `data`:

```json
{
  "source": { "type": "automation", "automation_id": "…", "event_id": "…" },
  "data":   { "object": "page", "id": "<page-id>", "properties": { … } }
}
```

- **The page id is at `data.id`** (with `data.object === "page"`) — Notion always includes it. Parsing only top-level keys will miss it and silently fall back to whatever lookup you coded, which is a real ambiguity source when records share a value (e.g. two contacts on one email). Always resolve by `data.id` and act on the exact edited page.
- `data.properties` holds the page's property values, so the property that fired the automation is readable straight off the payload — no extra fetch needed for simple cases.
- The structured `event.pageId` / `event.pageData` shape shown in `.examples/automation-example.ts` is only for the **alpha `worker.automation()`** capability. A raw `worker.webhook()` receives the JSON above and must dig it out itself.

See `workers/link-contact-to-company/src/index.ts` (`extractContactPageId`) for a reference parser.

## Worker-specific docs

Each worker keeps its own `CLAUDE.md` for worker-specific context (what it syncs, which databases/data sources it touches, quirks of the upstream API). Scaffold-generated boilerplate that duplicates this file can be deleted from worker CLAUDE.mds when touched.
