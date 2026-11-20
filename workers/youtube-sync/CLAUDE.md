# youtube-sync — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## What it does

Mirrors every video on the workFlowers YouTube channel (@work.flowers,
`UCbrz9V64Z2x5OBveDo5ee4w`) into a worker-managed database, **YouTube Videos**,
one row per video, and links each row to its source in **Supercut Recordings**.
Daily, replace mode, one batch, so a video deleted on YouTube is swept on the
next run. Built for TKT-1069 (pieces 1 and 3); the publish half is the
`supercut-to-youtube` Next Gen Zap in the `zapier-sdk` repo.

| Property | Source |
| --- | --- |
| Title (title) | `snippet.title` |
| Video ID (primary key) | video id |
| URL | `https://www.youtube.com/watch?v={id}` |
| Published At | `snippet.publishedAt` |
| Privacy Status | `status.privacyStatus`: public, unlisted, private |
| Duration (s) | `contentDetails.duration`, ISO 8601 converted to seconds |
| Views, Likes, Comments | `statistics`. Likes is left out of the upsert when the count is hidden |
| Watch Time (min), Avg View Duration (s), Avg % Viewed | YouTube Analytics API, lifetime, about two days behind |
| page cover | largest thumbnail (`maxres` for HD uploads) |
| Supercut Recording | **hand-added** relation, written by the link pass (below) |

## Call budget: every YouTube request is a Zapier task

YouTube is reached through the Zapier SDK's `sdk.fetch` with the YouTube
connection, and from 2026-12-01 **each `sdk.fetch` is one Zapier task**. A run
makes:

1. `playlistItems.list` on the uploads playlist — 1 call per 50 videos
2. `videos.list?id=…` — 1 call per 50 videos
3. Analytics `reports.query` with `dimensions=video` — 1 call per 200 videos

That is **3 tasks a day** for the 14 videos the channel had in November 2026.
The uploads playlist id is derived (`UC…` → `UU…`) instead of read from
`channels.list`, saving a fourth. Don't add per-video requests, and never use
`search.list`: it costs 100 quota units a call and does not return unlisted
videos. The uploads playlist, read with the owner's token, does include
unlisted and private videos.

Notion reads and writes in the link pass go straight to the Notion API, not
through Zapier, so they cost no tasks.

## The Analytics API is reachable

Checked 2026-11-20: `sdk.fetch` to
`https://youtubeanalytics.googleapis.com/v2/reports` with the same connection
returns `200` and real rows, so the Zapier proxy allows that host and the
connection has the analytics scope. No need for the YouTube app's Get Report
action. A video with no views in the range is absent from the report; when the
report succeeds such a video gets `0` in the three analytics columns. When the
report **fails**, the run logs a warning and leaves the three columns out of
the upsert, so the last known values stay.

## Linking to Supercut Recordings

`Schema.relation()` can only point at a database declared in the same worker,
and Supercut Recordings belongs to `supercut-sync`, so the relation cannot be
declared. Instead:

- **Supercut Recording** is a one-way relation added to YouTube Videos **by
  hand**, pointing at Supercut Recordings (data source
  `0f3fea21-11be-4158-ba98-9bb26936db89`). One-way keeps the relation on one
  side, as TKT-1069 asks, and adds no column to supercut-sync's database.
  Being undeclared, it stays editable.
- `src/link.ts` runs at the start of each sync: it reads every Supercut row
  with a `YouTube Video ID` (hand-added there, written by the Zap), then sets
  the relation on each YouTube Videos row whose `Video ID` matches. The match
  is on the id, never the URL, since URL formats vary.
- It only **sets** links, never clears them, so a video uploaded straight to
  YouTube can be linked by hand and stays linked. Two Supercut rows with the
  same id are logged and left unlinked.
- Rows are created after `execute` returns, so **a new video is linked on the
  run after it first appears** — one day of lag on the schedule. After the
  first deploy, trigger the sync twice.
- The pass is skipped with a warning while `VIDEOS_DATA_SOURCE_ID` is unset or
  the relation column is missing; videos still sync.

## Where the database lives

_Filled in after the first deploy._

## Environment variables

| Variable | Notes |
| --- | --- |
| `ZAPIER_CLIENT_ID`, `ZAPIER_CLIENT_SECRET` | Zapier SDK client credentials. Listed in the root `CLAUDE.md` rotation table. |
| `ZAPIER_YOUTUBE_CONNECTION_ID` | `028b7213-819e-87ed-91df-0d04103840dc`, authorised to the workFlowers channel (made the default YouTube connection 2026-11-20; an older one had expired). |
| `NOTION_API_TOKEN` | Link pass only. The shared `notion-worker-automations` integration (1Password item of that name). It must see both Supercut Recordings and YouTube Videos. |
| `VIDEOS_DATA_SOURCE_ID` | Data source id of YouTube Videos, only knowable after the first deploy (`ntn workers databases list`). Not `NOTION_`-prefixed because `ntn workers env set` reserves that prefix. |

## Operating

```shell
npm run check --workspace=notion-worker-youtube-sync   # from repo root
./scripts/deploy.sh youtube-sync                        # from repo root
ntn workers sync trigger videosSync --preview           # from this directory
ntn workers sync trigger videosSync
ntn workers logs
```

The run log prints `supercut links: N set, N unchanged, N with no Supercut row`
and `videos: N upserts (N public, N unlisted); analytics for N`. A healthy
steady state has `0 set` except on the day after a new upload.
