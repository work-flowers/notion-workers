# supercut-sync — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## What it does

Syncs the **curated** recordings of the `workflowers` Supercut workspace into a
worker-managed database, **Supercut Recordings**, one page per recording, so
Bullet.so can publish them. Daily, replace mode, one batch. (Hourly until 2026-10-04; cut to daily for credit cost, since the page sees little use.)

- **Row set = recordings in the Website playlist** (`WEBSITE_PLAYLIST_ID`,
  `KNa7tQVRfXvdwBqqj6M1Jj`, created 2026-10-05). Adding a recording to it
  publishes it; removing it sweeps the row on the next run. Until 2026-10-05
  the row set was "in any public playlist", which published every video in a
  topic playlist, client-specific or throwaway ones included.
- **Playlists column = the other public playlists** (the topic ones). They no
  longer decide what syncs. A Website recording in no topic playlist syncs
  with an empty category, and the run log warns about it.
- The gate is matched by **id, not name**, so renaming it is safe. The worker
  warns if it is not public: the Supercut API can create a playlist but not
  make it public, so that is a manual toggle in the Supercut UI.
- **Cover** = the recording's preview thumbnail, set via `Builder.imageCover()`
  on the upsert.
- **Page body** = exactly one `html` code block holding Supercut's embed snippet,
  with the caption `bullet:HTML` (Bullet.so's signal to render raw HTML).

## Two data sources, one recording

The Supercut REST API (`https://api.supercut.ai/v1`, spec at
`/api/platform/v1/docs/openapi.json`) provides the row set and metadata:
`/stacks` (playlists — the REST paths still say "stacks"),
`/stacks/{id}/recordings`, `/recordings/{id}` (status, owner, summary,
chapters). It exposes **no thumbnail and no embed snippet**; `/frame` only
returns signed, expiring URLs, useless as a cover.

Both come from the **unauthenticated oEmbed endpoint**
`https://supercut.ai/oembed?url=https://supercut.ai/share/{ws}/{id}&format=json`:
`html` is the embed code written into the page, `thumbnail_url`
(`https://meta.supercut.ai/split_screen/{id}?version=…`) is a public PNG cached
for a year. Share URLs may 302 to a newer *version* id, but oEmbed, embed and
thumbnail all resolve the API `public_id` — always use that id.

## Why the body is written over REST, not `pageContentMarkdown`

Notion-flavored Markdown has no caption syntax for code blocks, and
`pageContentMarkdown` replaces the entire page body every time it is emitted
(verified in `workers/zapier-durables-docs`). So the sync **never** sets
`pageContentMarkdown`, and `src/body.ts` owns the body instead: each run it
queries the data source, reads each page's children, and appends the block when
missing or patches it when the content or caption differs. Idempotent and
self-healing, no sync state. Because the platform creates rows only after
`execute` returns, a recording first seen in run *N* gets its code block in run
*N+1* — one schedule interval of lag is expected, not a bug.

The body pass needs `RECORDINGS_DATA_SOURCE_ID`, which only exists after the
first deploy has created the database. Until it is set the pass logs a warning
and is skipped; rows and covers still sync. (Do not make it throw: the first
scheduled run would then fail before the id can exist.)

## Where the database lives

Worker `01a064da-cba6-75c0-af08-d5869f6f59b8`, first deployed 2026-09-03. The
platform created **🎬 Supercut Recordings**
(`https://app.notion.com/p/3d091b0711ac813e8e95ff85c4412407`, data source
`0f3fea21-11be-4158-ba98-9bb26936db89`) under the **Our Website** page
(Marketing → Databases → … → Our Website). `worker.database()` has no
location option; move it by hand if it should live elsewhere — the binding
follows the database, not its parent.

## Token type is load-bearing

The OpenAPI spec marks `/stacks`, `/stacks/{id}/recordings` and
`/recordings/{id}` as working with both token types, but a **workspace token
(`sk_…`) sees none of Dennis's content**: `/stacks` returns `200` with zero
items and the recording endpoints return `403 forbidden`. Playlists and
recordings are user-owned, and only a **personal token (`sk_u_…`)** is scoped
to see them (observed 2026-09-03 with a freshly minted workspace token).

That silent-empty behaviour is why `execute` **throws when the Website playlist
is empty** instead of returning an empty batch: in replace mode an empty batch
would archive every row. The same guard covers someone emptying the playlist by
accident. If the gallery is ever legitimately empty, pause the sync
(`ntn workers sync pause recordingsSync`) rather than relaxing that guard. It
also throws if the token cannot see the Website playlist at all.

## Playlists is a multi-select with a fixed option list

A multi-select value whose option is not declared in `worker.database()` is
**silently dropped** on write — the row saves, the property is just empty
(observed 2026-09-03: five public playlists, one seeded option, and only that
one survived on any row). Every public playlist therefore has to be listed in
`PLAYLIST_OPTIONS` in `src/index.ts` (except the Website gate, which is never a
category). When a new topic playlist is made public, add
it there and redeploy; the run log warns
`playlist "…" is not a declared Playlists option` until you do.

## Environment variables

| Variable | Notes |
| --- | --- |
| `SUPERCUT_API_TOKEN` | **Must be a personal token (`sk_u_…`)**, from Supercut Settings → Personal API Tokens. 1Password `supercut-api` (Private vault). See "Token type is load-bearing" below. |
| `NOTION_API_TOKEN` | For the body pass only. 1Password `supercut-worker-notion-api` (Private vault). The integration must be shared with the Supercut Recordings database. Listed in the root `CLAUDE.md` rotation table. |
| `WEBSITE_PLAYLIST_ID` | `KNa7tQVRfXvdwBqqj6M1Jj`. `public_id` of the Supercut **Website** playlist — the publish gate. Required; the run throws if unset or not visible to the token. |
| `RECORDINGS_DATA_SOURCE_ID` | `0f3fea21-11be-4158-ba98-9bb26936db89`. Data source id of the managed database, only knowable **after** the first deploy (`ntn workers databases list` prints it). Not `NOTION_`-prefixed because that prefix is reserved by `ntn workers env set`. |

## Human-owned columns

Every declared property is read-only in Notion. A publish flag, notes, or
anything else a person edits has to be added to the data source by hand and
stay undeclared in `src/index.ts`. Record any such column here:

| Property | Type | Purpose |
| --- | --- | --- |
| _(none yet)_ | | |

## Operating

```shell
npm run check --workspace=notion-worker-supercut-sync   # from repo root
./scripts/deploy.sh supercut-sync                        # from repo root
ntn workers sync trigger recordingsSync --preview        # from this directory
ntn workers sync trigger recordingsSync
ntn workers logs
```

The run log prints one line per pass:
`embed blocks: N appended, N updated, N unchanged, N awaiting page creation (N pages in database)`.
A healthy steady state is all `unchanged`; `awaiting page creation` should only
be non-zero on the run after a new recording appears.
