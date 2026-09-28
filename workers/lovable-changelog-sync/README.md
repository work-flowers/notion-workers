# Lovable Changelog → Notion database (Worker sync)

A [Notion Worker](https://developers.notion.com/workers) that fetches the
**[Lovable changelog](https://docs.lovable.dev/changelog)**, parses out each
entry, and syncs them as rows into a managed Notion database — **one row per
sub-entry** (each `###` section within a date becomes its own page), refreshed
once a day.

It is a sibling of [`api-changelog-sync`](../api-changelog-sync) (the Notion
developer changelog) and follows the same design. Lovable has no changelog API
or RSS feed, so the Worker fetches the machine-readable markdown twin
(`https://docs.lovable.dev/changelog.md`, listed in
[`llms.txt`](https://docs.lovable.dev/llms.txt)). Both docs sites are
Mintlify, so entries are the same raw MDX `<Update label="…">…</Update>`
blocks — far more stable than scraping the JS-rendered HTML page.

## How it works

```
src/
├── changelog.ts          # fetch + parse (the fragile part — isolated here)
├── changelog.test.ts     # offline parser tests against captured fixtures
├── preview.ts            # `npm run preview` — print parsed rows, no deploy/writes
├── index.ts              # worker.database() + worker.sync() wiring
└── __fixtures__/
    ├── changelog.md      # snapshot of the .md twin
    └── anchors.txt       # every date/<h3> id on the rendered page, in order
```

### Managed database

`worker.database("changelog", …)` → **"Lovable Changelog"**, primary key `Key`:

| Property | Type | Source |
| :-- | :-- | :-- |
| Name | title | The `###` heading (markdown-stripped); for a block with no heading, its milestone `description` (e.g. "Lovable 1.0") or else the date label |
| Entry Date | date | The block's label (`Sep 25, 2026`) parsed to `YYYY-MM-DD` |
| URL | url | Deep link to the section's anchor on the live page, or the date's anchor |
| Raw Label | rich text | Verbatim `<Update>` label (groups same-date sections) |
| Key | rich text | `<ISO date>#<ascii-section-slug>` — unique, **the primary key** |

Each entry's **full body** is written to the row's **page body** via
`pageContentMarkdown`. Markdown formatting and links are preserved,
root-relative links are absolutized, and Mintlify components are converted:
`<Frame><img/></Frame>` → a markdown image, `<Note>`/`<Warning>` → a one-line
blockquote (`> **Note:** …`), `<br />` → `<br>`.

### Differences from `api-changelog-sync`

- **Batched.** ~528 rows vs ~49, and returning too many changes from one
  `execute()` fails, so each call emits at most 100 new/changed entries and
  returns `hasMore: true` until nothing is pending. The first run drains in ~6
  calls; later runs are usually one call with a handful of changes.
- **Anchors reproduce Mintlify exactly.** The URL slug keeps smart quotes and
  `+ & / @ ×`, turns `.` into `-`, and de-duplicates repeated headings
  page-wide (`#improvements`, `#improvements-2`, …). Verified against all 638
  ids on the rendered page. Because the newest entry is first, a new
  "Improvements" shifts every older one's suffix — the URL is in the content
  hash, so those rows are simply re-upserted with their corrected link.
- **The key uses a separate ASCII slug**, so it never depends on the anchor
  quirks or the page-wide counter above.
- **Three-letter months** (`Sep 25, 2026`); full names and `Sept` also parse.

### Sync behavior

- **Sync key:** `changelogSync`. **Mode:** `incremental`. **Schedule:** `1d`.
- **Change detection:** a content hash per entry is kept in sync state; only
  new or changed entries are upserted, and only the hashes of entries actually
  emitted are recorded, so a failed or partial cycle resumes cleanly.
- **No deletes:** historical changelog entries don't disappear. If Lovable
  renames a heading, its key changes, so the renamed entry arrives as a new row
  and the old row is left behind.
- **No secrets.** The page is public and the sync only writes to its own
  managed database, so the worker needs no environment variables.

## Develop & verify (no deploy)

```shell
npm install                                                   # from the repo root
npm run check --workspace=notion-worker-lovable-changelog-sync
npm test --workspace=notion-worker-lovable-changelog-sync     # offline parser tests
npm run preview --workspace=notion-worker-lovable-changelog-sync  # parse the LIVE page
```

`npm run preview` and the `fetchChangelogEntries()` guard (it throws if zero
entries parse) are the early-warning system for a parser break.

### Re-capturing the test fixtures

Capture both at the same time, then update the counts in the tests:

```shell
curl -fsSL https://docs.lovable.dev/changelog.md -o src/__fixtures__/changelog.md
curl -fsSL https://docs.lovable.dev/changelog \
  | grep -oE '<(h3 [^>]*|div class="update [^"]*")[^>]*id="[^"]*"' \
  | sed -E 's/.*id="//;s/"$//;s/&amp;/\&/g;s/&quot;/"/g' > src/__fixtures__/anchors.txt
npm test
```

## Deploy

From the repo root (the script refuses to deploy outside the work.flowers
workspace):

```shell
./scripts/deploy.sh lovable-changelog-sync

cd workers/lovable-changelog-sync
ntn workers sync trigger changelogSync --preview   # runs the sync, writes NOTHING
ntn workers sync trigger changelogSync             # first real populate
ntn workers sync status
```

If you change the database schema later, reset state so the next run
re-evaluates every entry: `ntn workers sync state reset changelogSync`.
