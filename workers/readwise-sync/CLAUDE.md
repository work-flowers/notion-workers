# readwise-sync

Syncs Dennis's Readwise book library into a managed Notion database. It combines two Readwise APIs that hold different book lists (`src/readwise.ts`):

- **Readwise Books**, the reading tracker (`GET https://readwise.io/books/api/v1/books/`, `limit=1000`, follows `next`). It is the backbone: every book on a shelf, with reading dates, rating, progress and catalogue data. On 2026-11-21 it held 1,155 books, of which 1,090 were live; the other 65 sit on the `deleted` shelf and are skipped. 628 came from a Goodreads import, and most of those have no highlights. This endpoint isn't in Readwise's public API docs; it was found by probing, and it backs the Readwise MCP's `books_*` tools.
- **Readwise highlights** (`GET /api/v2/books/?category=books`): only books that have highlights (379 on 2026-11-21). It supplies highlight count, last highlight, source, tags, document note and the highlights page link.

Highlights themselves are not synced, only per-book metadata and the highlight count.

## Notion

- Database **Readwise Library**: `41f91b07-11ac-8173-866c-d7cbe0937aba`
- Data source: `41f91b07-11ac-81d1-9128-000b796f69f2` (query with `POST /v1/data_sources/{id}/query`)
- Primary key: `Book ID`. For tracker books it is the tracker book id. A highlighted book with no tracker entry is keyed `h<highlights id>`. The key is byte-identical to the change `key`.
- `Readwise ID` is the highlights (v2) book id. It was the primary key until 2026-11-21, when the database switched to the tracker; the switch replaced every row once. Rows without it have no highlights.
- Each page gets the cover as both page cover and icon: the tracker's catalogue cover, else the highlights cover, else 📕.

## Sync

One capability, `readwiseBooksSync`: `replace` mode, every `6h`. Each call refetches both lists (3 requests) and returns the next 250 changes in a stable order, so no state carries the library. Replace mode removes books deleted in Readwise or moved to the `deleted` shelf.

- **Matching a highlighted book to a tracker book** (`matchBooks`): by ASIN, then by normalised title plus the first author's surname, then by title alone when only one tracker book has that title. Normalisation drops subtitles, punctuation and leading articles, and decodes HTML entities. On ties a finished book wins, and each tracker book takes at most one highlights book. On 2026-11-21, 373 of 379 highlighted books matched. The remaining 6 got `h…` rows with no shelf: 4 aren't in the tracker; Ullrich's *Hitler* has highlights for both volumes but only one tracker entry; and Readwise's own tutorial book.
- **Dates:** `Started` and `Finished` are dates without a time. Readwise stores them as local midnight in UTC, 16:00Z for Singapore (Goodreads imports use 00:00Z), so they are converted to the date in `READER_TIME_ZONE` (`Asia/Singapore`). Change that constant if the reader moves.
- **Every date column is a calendar date with no time.** `Last Highlight` and `Updated in Readwise` are converted to the date in `READER_TIME_ZONE` too. All dates display as `YYYY/MM/DD`. That's the closest built-in format to ISO 8601: Notion date columns, and the SDK's `DateFormat`, have no `YYYY-MM-DD` option.
- **`Shelf`:** Unsorted (gray), Want to Read (blue), Currently Reading (yellow), Finished (green), Did Not Finish (red). `Rating` is a number (Readwise allows halves).
- **`Progress`:** a percent, only set for books read in a tracked app, and rounded in code to whole percentage points. The SDK's number schema only takes a `format`, so it cannot set display rounding or *Show as: Bar*. Those are UI-only settings on the column.
- **Select fallbacks:** `Origin` and `Source` only accept the values seen on 2026-11-21. Anything new is written as `other`; add it to `ORIGINS` or `SOURCES` to give it its own option.
- **`Tags`** is comma-joined rich text, not a multi-select, because Readwise tags are free-form and a multi-select needs every option declared in the schema.
- **Read-only columns:** every declared property is read-only in Notion. Add human-owned columns to the data source by hand and list them here.

## Relation to Readwise Highlights

**Readwise Highlights** (`2d791b07-11ac-814b-af18-000b6272383c`, under *Dennis' Reading*) is written by Readwise's own Notion export: one page per document, highlights in the page body. This worker only writes its relation column.

- **`Highlights Page`** on Readwise Library is a two-way relation (the reverse column on Highlights is `Readwise Library`). It was **added by hand via the API on 2026-11-21 and is not in the worker schema**: declaring it would make it read-only, and a managed schema's relations can only target worker databases. Rebuilding the database from code won't recreate it. Re-add it with `PATCH /v1/data_sources/41f91b07-11ac-81d1-9128-000b796f69f2` (`relation` → `data_source_id` above, `dual_property.synced_property_name: "Readwise Library"`).
- **Join** (`src/relink.ts`): only rows with a `Readwise ID` are considered. Each one's highlights record is refetched, and the join uses that record's ASIN against the one in the Highlights page's Amazon `URL` (`/gp/product/<ASIN>`). When that fails, it falls back to normalised title + author. This uses the highlights API's title and author, which are the same values Readwise's export writes, rather than the tracker's, which differ ("House of Morgan" vs "The House of Morgan"). On 2026-11-21 this linked 374 of 379 highlighted books (353 by ASIN, 21 by title + author), with every title verified. The 5 unlinked books have no page in Highlights because Readwise doesn't export them (0 highlights, or Readwise's own tutorial book).
- **Why it can't be done at deploy time:** we did not use a `type: "attached"` database, because deploys would migrate the schema of a database that Readwise's integration owns.
- **When it runs:** each sync cycle ends with `relink` calls. They run *after* the call that returned the upserts, because upserts only land once `execute` returns. Each call writes at most 120 rows, at 3 requests/second, and repeats until no row differs. It writes only rows whose relation differs from the match, so a steady-state run writes 0. It never clears a relation when no match exists, so a link added by hand to an unmatched book stays; a hand-made link on a *matched* book gets overwritten. Sync upserts leave the relation alone (checked by re-running after the first relink: 0 writes).

## Credentials

- `READWISE_API_TOKEN`: env var on the worker. Source: 1Password **chiuts** (personal) account, item `readwise-api`, field `credential`.
- `NOTION_API_TOKEN`: env var on the worker, used only by the relink step. Its value is the PAT below rather than the shared `notion-worker-automations` integration, because this one already has access to both databases (the parent page *Dennis' Reading* is shared with it).
- 1Password **work-flowers** account, item `notion-pat-dennis-readwise-library` (bot `dennis-readwise-library`): a work.flowers PAT with both Workers and public-API access. Besides the env var, it is used to deploy and to read rows back without touching the global `ntn` login:

  ```shell
  export NOTION_API_TOKEN=$(op read "op://Employee/notion-pat-dennis-readwise-library/credential" --account work-flowers.1password.com)
  export NOTION_WORKSPACE_ID=9607e18f-5d82-4842-8b96-ca0d32e66011
  ./scripts/deploy.sh readwise-sync
  ```
