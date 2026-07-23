# notion-workers monorepo

One Notion Worker per directory under `workers/`; shared helpers in `packages/shared` (`@work-flowers/notion-worker-shared`). npm workspaces — always `npm install` from the repo root, never inside a worker.

## Conventions

- **Notion API**: always target `data_source_id` (not `database_id`). When the `@notionhq/client` SDK v2.x doesn't expose data-source endpoints, use `client.request()` with `Notion-Version: 2026-03-11` (`POST /v1/data_sources/{id}/query`, `GET /v1/data_sources/{id}`).
- **Shared code**: helpers used by two or more workers belong in `packages/shared`. Workers depend on it via `"@work-flowers/notion-worker-shared": "*"` — never via a `github:` URL.
- **Package names**: each worker's `package.json` name is `notion-worker-<dirname>` (workspace names must be unique; freshly scaffolded workers all ship as `@notionhq/workers-template` and must be renamed).
- **Lockfile**: single root `package-lock.json`. Workers must not have their own.
- **workers.json**: per-worker `ntn` config (workspaceId + workerId). Committed. Never copy one worker's `workers.json` to another — deploys would overwrite the wrong worker.

## ntn CLI

Run all `ntn workers` commands from inside the worker's directory — it resolves `workers.json` by CWD lookup.

- Deploy: `ntn workers deploy` (cloud build by default; `--local-build` bundles locally, `--no-git` switches file discovery from git to filesystem walking)
- Typecheck before deploying: `npm run check`
- Secrets: `ntn workers env` — never commit secrets

## Worker-specific docs

Each worker keeps its own `CLAUDE.md` for worker-specific context (what it syncs, which databases/data sources it touches, quirks of the upstream API). Scaffold-generated boilerplate that duplicates this file can be deleted from worker CLAUDE.mds when touched.
