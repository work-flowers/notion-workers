# Notion API Changelog → Notion database (Worker sync)

A [Notion Worker](https://developers.notion.com/workers) that fetches the
**Notion developer changelog**, parses out each entry, and syncs them as rows
into a managed Notion database — **one row per sub-entry** (each `###` section
within a date becomes its own page), refreshed every 12 hours.

There is no official changelog API or RSS feed, so the Worker fetches the page
and parses it. It targets the machine-readable markdown twin
(`https://developers.notion.com/page/changelog.md`, listed in
[`llms.txt`](https://developers.notion.com/llms.txt)), whose entries are raw
MDX `<Update label="…">…</Update>` blocks — far more stable than scraping the
JS-rendered HTML page.

## How it works

```
src/
├── changelog.ts          # fetch + parse (the fragile part — isolated here)
├── changelog.test.ts     # offline parser tests against a captured fixture
├── preview.ts            # `npm run preview` — print parsed rows, no deploy/writes
├── index.ts              # worker.database() + worker.sync() wiring
└── __fixtures__/
    └── changelog.md       # snapshot of the live page for deterministic tests
```

The parse logic is deliberately isolated in [`src/changelog.ts`](src/changelog.ts)
behind a small interface — `fetchChangelogEntries(): Promise<ChangelogEntry[]>`
and a pure `parseChangelog(md)` — so a structural change in the page only ever
requires touching that one file.

### Managed database

`worker.database("changelog", …)` → **"Notion API Changelog"**, primary key
`Key`:

| Property | Type | Source |
| :-- | :-- | :-- |
| Name | title | The `###` section heading (markdown-stripped); the date label when a date has no/only-generic heading |
| Entry Date | date | The block's label parsed to `YYYY-MM-DD` |
| URL | url | `…/page/changelog#<section-slug>`, or the date anchor `#<date-slug>` |
| Raw Label | rich text | Verbatim `<Update>` label, e.g. `June 25, 2026` (groups same-date sections) |
| Key | rich text | `<ISO date>#<section-slug>` — unique, **the primary key** |

Each entry's **full body** is written to the row's **page body** via
`pageContentMarkdown` (not a property), as markdown — inline code, lists, bold,
and links are preserved, root-relative links are absolutized, and nothing is
truncated.

### Sync behavior

- **Sync key:** `changelogSync`. **Mode:** `incremental`. **Schedule:** `12h`.
- **One row per `###` section:** a date with multiple sub-entries (e.g. June 25,
  2026) becomes multiple pages. A date with no heading, or only a generic
  "What's new" heading, becomes a single page named by the date; any preamble
  before the first heading becomes its own date-named page.
- **Primary key:** the composite `Key` (`<ISO date>#<section-slug>`), so re-runs
  dedupe instead of duplicating rows.
- **Change detection:** a content hash per entry is kept in sync state. Each run
  upserts only entries that are new or whose content changed — unchanged
  entries are skipped (no reprocessing), but a later edit is still picked up
  (and `pageContentMarkdown` replaces the body on update, so no duplication).
- **No deletes:** historical changelog entries don't disappear.
- **Non-date labels are skipped:** four legacy entries use ranges/prose (e.g.
  `Changes for April 2024`, `September 8 - September 21, 2023`) and are not
  synced. Only clean `Month D, YYYY` labels become rows.
- **Single batch:** the whole changelog (~49 sections today) is parsed in one
  execution (`hasMore: false`), well within the per-execution timeout.

## Develop & verify (no deploy)

```shell
npm install
npm run check     # type-check
npm test          # offline parser tests (fixture-based)
npm run preview   # fetch + parse the LIVE page, print rows it would write
```

`npm run preview` and the `fetchChangelogEntries()` guard (it throws if zero
entries parse) are the early-warning system for a parser break.

### Re-capturing the test fixture

The fixture is a snapshot of the live page. After an intentional adaptation to
a page change, refresh it and re-run the tests:

```shell
curl -fsSL https://developers.notion.com/page/changelog.md -o src/__fixtures__/changelog.md
npm test
```

## Deploy

The changelog page is public (no upstream auth). The only secret is
`NOTION_API_TOKEN` — a personal access token (`ntn_…`) the platform uses to
write rows for this sync. It is **not** read by application code.

```shell
# 1. Store the token (never hardcode it). Via 1Password, optionally:
#    ntn workers env set NOTION_API_TOKEN=$(op read "op://Work/Notion PAT/credential")
ntn workers env set NOTION_API_TOKEN=ntn_xxx

# 2. Deploy — creates the managed database and registers the sync
ntn workers deploy

# 3. Preview end to end — runs the sync, writes NOTHING to the database
ntn workers sync trigger changelogSync --preview

# 4. First real populate (or just wait for the 12-hour schedule)
ntn workers sync trigger changelogSync

# Observe
ntn workers sync status
ntn workers runs list
```

If you change the database schema later, reset state so the next run re-evaluates
every entry: `ntn workers sync state reset changelogSync`.
