# supercut-sync — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## What it does

Syncs **every recording owned** by the token's user in the `workflowers`
Supercut workspace into a worker-managed database, **Supercut Recordings**, one
page per recording. The database is **private**: since 2026-11-20 it is no
longer published to the website by Bullet.so, because it now holds client and
throwaway recordings too. Daily, replace mode, one batch. (Hourly until 2026-10-04; cut to daily for
credit cost, since the page sees little use.)

- **Row set = all owned recordings** (`GET /recordings`, about 40 in
  November 2026). A recording deleted in Supercut is swept on the next run.
  Before 2026-11-20 the row set was a Supercut "Website" playlist (and before
  2026-10-05, "in any public playlist").
- **No Website gate (since 2026-11-20).** The worker used to read
  `WEBSITE_PLAYLIST_ID` and set an **On Website** checkbox from it. Once the
  database went private, Dennis deleted the Website playlist, every run threw
  because the id was gone, and the gate was removed: the env var is no longer
  read and On Website is no longer declared. The undeclared column stays in
  Notion with its last values (no longer read-only) until it is deleted by
  hand. **If the database is ever published again, it needs a new publish
  filter first**, or client-specific and throwaway videos reach the site.
- **Playlists column = the public topic playlists.** They don't decide what
  syncs; a recording in none of them syncs with an empty category.
- **Cover** = the recording's preview thumbnail from oEmbed, set via
  `Builder.imageCover()` on the upsert. oEmbed is unauthenticated, so it may
  fail for private recordings; the run log summarises failures in one line and
  those rows get no cover.
- **Icon** = the Supercut logo on every row, via `Builder.imageIcon()` with a
  logo.dev URL (since 2026-11-20). The workspace's Supercut custom emoji would
  be nicer, but the Workers SDK cannot set a custom emoji icon.
- **Page body** = one Notion **embed block** pointing at
  `https://supercut.ai/embed/{ws}/{id}`, so the video plays inline. Until
  2026-11-20 it was an `html` code block captioned `bullet:HTML` (Bullet.so's
  raw-HTML signal, from when the site published these pages); the body pass
  deletes any such block it finds.

## Viewership analytics

`/recordings/{id}` returns an `analytics` block (added by Supercut, picked up
2026-11-19): all-time `visits` and `plays`, each `{ total, unique }`,
aggregated across versions. These land in **Visits**, **Unique Visits**,
**Plays** and **Unique Plays**. The block is only present when the token has
analytics access; when it is missing the four columns are left out of the
upsert, so the last known counts stay rather than dropping to zero. Counts are
refreshed once a day with the sync.

Engagement rate (average % watched) is **not** in that block — it needs a
separate `/recordings/{id}/analytics` call per recording, deliberately not
made.

## Two data sources, one recording

The Supercut REST API (`https://api.supercut.ai/v1`, spec at
`/api/platform/v1/docs/openapi.json`) provides the row set and metadata:
`/stacks` (playlists — the REST paths still say "stacks"),
`/stacks/{id}/recordings`, `/recordings` (owned list, with analytics),
`/recordings/{id}` (status, owner, summary, chapters, analytics). It exposes **no thumbnail and no embed snippet**; `/frame` only
returns signed, expiring URLs, useless as a cover.

The thumbnail comes from the **unauthenticated oEmbed endpoint**
`https://supercut.ai/oembed?url=https://supercut.ai/share/{ws}/{id}&format=json`:
`thumbnail_url`
(`https://meta.supercut.ai/split_screen/{id}?version=…`) is a public PNG cached
for a year. Share URLs may 302 to a newer *version* id, but oEmbed, embed and
thumbnail all resolve the API `public_id` — always use that id.

## Why the body is written over REST, not `pageContentMarkdown`

`pageContentMarkdown` replaces the entire page body every time it is emitted
(verified in `workers/zapier-durables-docs`), so anything added below the video
would be wiped daily; it also could not express the old code block's caption.
So the sync **never** sets `pageContentMarkdown`, and `src/body.ts` owns the
embed block instead: each run it queries the data source, reads each page's
children, deletes any legacy `bullet:HTML` code block, and appends the embed
block when missing or patches its URL when it differs. Other blocks are left
alone. Idempotent and
self-healing, no sync state. Because the platform creates rows only after
`execute` returns, a recording first seen in run *N* gets its embed block in run
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

That silent-empty behaviour is why `execute` **throws when Supercut returns no
recordings at all** instead of returning an empty batch: in replace mode an
empty batch would archive every row.

## Playlists is a multi-select with a fixed option list

A multi-select value whose option is not declared in `worker.database()` is
**silently dropped** on write — the row saves, the property is just empty
(observed 2026-09-03: five public playlists, one seeded option, and only that
one survived on any row). Every public playlist therefore has to be listed in
`PLAYLIST_OPTIONS` in `src/index.ts`. When a new topic playlist is made public, add
it there and redeploy; the run log warns
`playlist "…" is not a declared Playlists option` until you do.

## Environment variables

| Variable | Notes |
| --- | --- |
| `SUPERCUT_API_TOKEN` | **Must be a personal token (`sk_u_…`)**, from Supercut Settings → Personal API Tokens. 1Password `supercut-api` (Private vault). See "Token type is load-bearing" below. |
| `NOTION_API_TOKEN` | For the body pass only. 1Password `supercut-worker-notion-api` (Private vault). The integration must be shared with the Supercut Recordings database. Listed in the root `CLAUDE.md` rotation table. |
| `RECORDINGS_DATA_SOURCE_ID` | `0f3fea21-11be-4158-ba98-9bb26936db89`. Data source id of the managed database, only knowable **after** the first deploy (`ntn workers databases list` prints it). Not `NOTION_`-prefixed because that prefix is reserved by `ntn workers env set`. |

## Human-owned columns

Every declared property is read-only in Notion. A publish flag, notes, or
anything else a person edits has to be added to the data source by hand and
stay undeclared in `src/index.ts`. Record any such column here:

| Property | Type | Purpose |
| --- | --- | --- |
| YouTube Status | select: Ready for YouTube, Uploading, Uploaded (unlisted), Public, Needs review, Failed | Set to Ready for YouTube to publish the recording unlisted, to Public to make it public. The Zap moves it through the other states. |
| YouTube Video ID | text | The uploaded video's id. Match key for the `youtube-sync` worker's Supercut Recording relation. |
| YouTube URL | url | Watch URL of the uploaded video. |
| YouTube Error | text | Why the last publish attempt failed or needs review. |
| YouTube Clients OK | checkbox | Tick after reviewing a Needs review flag to let the Zap publish despite client names in the transcript. |

All five were added by hand on 2026-11-20 and are written by the
`supercut-to-youtube` Next Gen Zap in the `zapier-sdk` repo
(work-flowers/zapier-sdk#314). **Never declare them in `worker.database()`**:
that would make them read-only, and the Zap's write-back would fail. The six
videos uploaded by hand on 2026-11-20 were backfilled into YouTube Video ID.

## Operating

```shell
npm run check --workspace=notion-worker-supercut-sync   # from repo root
./scripts/deploy.sh supercut-sync                        # from repo root (add --yes for schema changes)
ntn workers sync trigger recordingsSync --preview        # from this directory
ntn workers sync trigger recordingsSync
ntn workers logs
```

The run log prints one line per pass:
`embed blocks: N appended, N updated, N old code blocks removed, N unchanged, N awaiting page creation (N pages in database)`.
A healthy steady state is all `unchanged`; `awaiting page creation` should only
be non-zero on the run after a new recording appears.
