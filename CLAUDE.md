# notion-workers monorepo

One Notion Worker per directory under `workers/`; shared helpers in `packages/shared` (`@work-flowers/notion-worker-shared`). npm workspaces — always `npm install` from the repo root, never inside a worker.

## Conventions

- **Notion API**: always target `data_source_id` (not `database_id`). When the `@notionhq/client` SDK v2.x doesn't expose data-source endpoints, use `client.request()` with `Notion-Version: 2026-03-11` (`POST /v1/data_sources/{id}/query`, `GET /v1/data_sources/{id}`).
- **Page writes are silent.** Every `POST /v1/pages`, `PATCH /v1/pages/{id}` and append-children call sends `notifications: { mode: "silent" }` (added 2026-10-08), so worker edits — especially to Person properties like Internal Attendees — don't notify anyone; automations and webhooks still fire. The SDK v2.x strips unknown body params, so `context.notion.pages.update` *cannot* send it: write through `updatePage`/`createPage` from the shared package (which add it) or a raw fetch.
- **Shared code**: helpers used by two or more workers belong in `packages/shared`. Workers depend on it via `"@work-flowers/notion-worker-shared": "*"` — never via a `github:` URL.
- **Package names**: each worker's `package.json` name is `notion-worker-<dirname>` (workspace names must be unique; freshly scaffolded workers all ship as `@notionhq/workers-template` and must be renamed).
- **Deployed worker name must equal the directory name** — plain `<dirname>`, with no `notion-` or `notion-worker-` prefix and no prose (`bq-sync`, not `BigQuery Effective Rate Sync`). The name is set once by `ntn workers deploy --name` at creation and `--name` is *forbidden* on update, so a first deploy that passes the wrong name leaves the drift in place silently — `ntn workers list` is the only place it shows. Fix it with `ntn workers rename <dirname>` from the worker's directory (in-place metadata change; `workerId`, env vars and sync state are untouched, no redeploy needed) — never by renaming the directory to match, which would break the `notion-worker-<dirname>` package convention above. Audit by joining `ntn workers list --plain` to each `workers.json` on `workerId`; nine of seventeen had drifted by 2026-08-01 and were renamed.
- **Lockfile**: single root `package-lock.json`. Workers must not have their own.
- **`@notionhq/workers` is pinned, repo-wide, to one exact version** (currently `0.8.3`) — never the scaffold's `">=0.0.0"`. The cloud build runs its own `npm install`, so a range means production silently runs whatever was latest that day while the repo typechecks against the root lockfile. That is not theoretical: until 2026-09-07 all 22 workers carried the open range against a lockfile resolving `0.8.1`, so any deploy would have built against `0.9.0` — which **stops applying declared schema changes to an existing managed database**: the sync writes the property, Notion discards every value, and the run reports success. Bump all workers together, as a deliberate change, and verify a declared schema change still lands before trusting it.
- **workers.json**: per-worker `ntn` config (workspaceId + workerId). Committed. Never copy one worker's `workers.json` to another — deploys would overwrite the wrong worker.
- **Managed schemas make properties read-only. Anything a human must edit has to stay out of `worker.database()`.** Declaring a property is what marks it `readOnly: true` in Notion — *not* whether the sync ever writes a value to it. Declared and never written still means nobody can set it in the UI. Human-owned columns (a triage status, an assignee, notes) therefore have to be added to the data source by hand and documented in the worker's own `CLAUDE.md`, since they are then not reproducible from code. Undeclaring a property does *not* drop it: it stays, keeps its values, options and status groups, and simply loses `readOnly`. (Learned on `zapier-durables-docs`, 2026-07-29.)
- **A sync change's `key` must be byte-identical to the value written into `primaryKeyProperty`.** The platform resolves `key` through that property's *value*, so a key that differs from it matches nothing and **inserts a new row on every run** — the sync quietly becomes append-only while `sync status` stays `healthy` and every run reports a plausible batch of upserts. It is also the only thing coupling a backfill/delta pair: the two syncs share no state, so agreeing on the primary key value is what lets a replace-mode backfill land on the delta's rows instead of doubling them. Replace mode cannot repair the damage — mark-and-sweep only removes keys *absent* from the batch, and duplicates share a key. Two tells that this has happened: duplicate rows whose values are byte-identical, and no row in the database having `last_edited_time != created_time`. Hand-cleanup is awkward, because an upsert will **un-archive a trashed row** to write to it and an out-of-band REST rename does not repoint it — see `workers/ga4-sync/CLAUDE.md` for the procedure that works. (Learned on `ga4-sync`, 2026-08-03; the other 17 syncs in the repo were audited and all hold the invariant.)

## Workspace safety (check before every deploy)

**Everything in this repo targets the work.flowers workspace `9607e18f-5d82-4842-8b96-ca0d32e66011`.**

The `ntn` CLI keeps a **single global login** with no per-repo binding, so a deploy silently targets whichever workspace was last authenticated. Client repos are worked on in the same sessions, and a worker has already been deployed into the wrong workspace this way.

- `./scripts/deploy.sh` blocks a deploy when the resolved workspace isn't work.flowers, and when a worker's `workers.json` records a different workspace. Don't bypass it.
- Check manually with `ntn doctor` and read the **Resolved workspace** line. It writes to **stderr**, so capture `2>&1`.
- **Don't use `ntn whoami`** for this — it calls `/v1/users/me`, which `403`s for sessions whose token lacks user-read capability, so it reports nothing even when auth is fine.
- Switching is `ntn logout && ntn login`, which is global — it also changes where client repos would deploy. Switch back afterwards.
- A `workers.json` created against the wrong workspace must be deleted, not edited; redeploy with `--name` to regenerate it.

Client repos carry the mirror-image guard pinned to their own workspace. Never copy IDs, page references or secrets between this repo and a client's.

## ntn CLI

Run all `ntn workers` commands from inside the worker's directory — it resolves `workers.json` by CWD lookup.

- **Deploy: always `./scripts/deploy.sh <worker-name>` from the repo root**, never bare `ntn workers deploy` for workers that use the shared package. The ntn cloud build uploads only the worker directory and runs `npm install` in a sandbox, so it cannot resolve unpublished workspace packages; the script vendors a tarball of `packages/shared` for the duration of the deploy. `--local-build` also does not work in a workspace (workers have no local `node_modules`).
- **Deploying no longer touches your uncommitted `package.json` edits.** To vendor the tarball the script rewrites the dependency with `npm pkg set`, then puts the file back from a byte-for-byte copy taken beforehand. It used to restore with `git checkout -- workers/<name>/package.json`, which restores from the *index* and so discarded every uncommitted change to the file, not just the line it had added. That silently ate new dependencies and scripts twice (2026-08-01, 2026-08-03) — and the deploy still succeeded each time, because the upload happens before the cleanup trap fires, so only the working tree was wrong and nothing failed to signal it. Don't reintroduce a git-based restore in any script that mutates a tracked file.
- Typecheck before deploying: `npm run check --workspace=<package-name>` from the root
- Secrets: `ntn workers env` — never commit secrets

### Rotating a shared credential

**Environment variables live on the deployed worker, not in this repo, and are scoped to one `workerId`.** Nothing is shared or inherited between workers — several just happen to hold copies of the same credential. So rotating one means running `ntn workers env set` in *every* worker that holds it, and a worker you miss keeps using the old value until its next scheduled run, where it fails upstream rather than at deploy time. `src/zapier.ts` throws a clear error on a *missing* variable; a *stale* one just gets rejected by the API.

Two credentials are duplicated widely enough to need a checklist (as of 2026-09-28):

| Credential | Workers holding it |
|---|---|
| `ZAPIER_CLIENT_ID` + `ZAPIER_CLIENT_SECRET` | `bq-sync`, `buttondown-tools`, `email-db-updates`, `ga4-sync`, `gdrive-tools`, `luma-guest-sync`, `meeting-note-db-updates`, `xero-invoice-sync`, `zapier-durables-docs` |
| `NOTION_API_TOKEN` | `buttondown-sync`, `create-newsletter-page`, `email-db-updates`, `ga4-sync`, `harvest-sync`, `link-contact-to-company`, `luma-guest-sync`, `meeting-note-db-updates`, `page-icon-sync`, `set-company-logo`, `supercut-sync` |

`NOTION_API_TOKEN` is only needed when worker code reads it (REST calls or `context.notion`) — the platform writes managed-database sync rows without it (`fx-rates` has no env vars and reports healthy; `lovable-changelog-sync` ran its first sync, 528 upserts, with none set). Don't set it on a worker that doesn't read it.

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

## Custom blocks

Building a custom block (or a custom database view — same capability) is different enough from a sync to have its own guide: **[`docs/custom-blocks.md`](docs/custom-blocks.md)**. Read it first. It covers the project shape, the Vite `root` pin that npm workspaces make mandatory, block-vs-view placement, what the sandbox forbids (it cannot open a Notion page), and the chart colours validated against Notion's surfaces. `workers/newsletter-dashboard` is the reference implementation.

## SDK guidance

Every worker — and the repo root — carries Notion's own guidance in `.agents/` (`INSTRUCTIONS.md`, plus `skills/sync-guide`, `auth-guide`, `sync-debug`, `sync-validate`), with `AGENTS.md` and `.claude/skills` symlinked to it. **That is the source of truth for SDK and CLI mechanics** — schema builders, sync modes, pagination patterns, OAuth. Keep it; don't replace it with a hand-written summary.

It is **not version-matched to anything**, despite what the scaffold implies. `ntn workers new` downloads it at scaffold time from `makenotion/notion-cookbook` (`workers/templates/workers-default/.agents/`), which tracks that repo's `main` — not the `ntn` release. Nothing refreshes it once a worker exists, so it goes stale silently: before 2026-09-07 this repo held **eighteen different vintages across eighteen workers**, no two alike, and four workers had none at all.

- **Refresh with `./scripts/sync-agent-skills.sh [ref]`** (defaults to `main`) from the repo root. It re-vendors into all workers plus the root, fixes the symlinks, and stamps the exact upstream SHA in `.agents/UPSTREAM_REF`. Idempotent.
- Only `.agents/` is vendored. The upstream template's own `package.json`, `src/` and `.examples/` are left alone — its package.json would clobber each worker's name and dependencies.
- The root copy exists so a session started at the repo root discovers the skills at all; discovery is per-directory. The root gets no `AGENTS.md`, which would otherwise shadow this file.
- `.github/workflows/agent-skills-drift.yml` runs the script weekly and opens a refresh PR when upstream moves. Read the `.md` diffs; the `.ts` examples churn on style.

## Worker-specific docs

Each worker keeps its own `CLAUDE.md` for worker-specific context (what it syncs, which databases/data sources it touches, quirks of the upstream API). Scaffold-generated boilerplate that duplicates this file can be deleted from worker CLAUDE.mds when touched.
