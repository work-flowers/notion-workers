# notion-worker-youtube-sync

A [Notion Worker](https://developers.notion.com/workers/get-started/overview.md) that mirrors every video on a YouTube channel, unlisted ones included, into a Notion database every 12 hours, with views, likes, comments and YouTube Analytics watch time. Each page plays the video inline and is linked to the Supercut recording it was published from, matched on the YouTube video id.

YouTube is called through the [Zapier SDK](https://docs.zapier.com/sdk), so the worker holds no Google credentials: it uses a Zapier YouTube connection.

## Setup

```bash
npm install                                               # from the repo root
ntn workers env set ZAPIER_CLIENT_ID=… ZAPIER_CLIENT_SECRET=…
ntn workers env set ZAPIER_YOUTUBE_CONNECTION_ID=<connection id>
ntn workers env set NOTION_API_TOKEN=ntn_…                # integration must see both databases
ntn workers env set VIDEOS_DATA_SOURCE_ID=<id>            # after the first deploy creates the database
```

Then add a **Supercut Recording** relation column to the YouTube Videos database by hand. See [CLAUDE.md](CLAUDE.md) for the design notes.
