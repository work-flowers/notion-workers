# notion-worker-supercut-sync

A [Notion Worker](https://developers.notion.com/workers/get-started/overview.md) that syncs a curated set of recordings from a [Supercut](https://supercut.ai) workspace into a Notion database — one page per recording, with the recording's thumbnail as the page cover and its embed code in the page body as a code block captioned `bullet:HTML`, ready for [Bullet.so](https://bullet.so) to render.

"Curated" means the recording is in the Supercut playlist named by `WEBSITE_PLAYLIST_ID`. The `recordingsSync` capability runs daily in replace mode, so a recording removed from that playlist is removed from Notion too.

| Notion property | Source |
|---|---|
| Name (title) | recording title |
| Recording ID (primary key) | `public_id` |
| Share URL, Embed URL | `https://supercut.ai/{share,embed}/{workspace}/{public_id}` |
| Thumbnail URL, page cover | oEmbed `thumbnail_url` |
| Recorded At, Duration (s), Status, Owner | recording metadata |
| Playlists (multi-select) | public topic playlists containing the recording (the Website gate is excluded) |
| Summary, Chapters | Supercut AI summary and chapter list (`mm:ss Title` per line) |

## Setup

```bash
npm install                     # from the repo root
ntn workers env set SUPERCUT_API_TOKEN=sk_u_...            # personal token; a workspace token sees nothing
ntn workers env set NOTION_API_TOKEN=ntn_...          # share the integration with the database
ntn workers env set RECORDINGS_DATA_SOURCE_ID=<id>    # after the first deploy creates the database
```

See [CLAUDE.md](CLAUDE.md) for the design notes and [.env.example](.env.example) for the variables.
