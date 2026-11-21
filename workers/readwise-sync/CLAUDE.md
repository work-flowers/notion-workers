# readwise-sync

Syncs Dennis's Readwise **book** library (Readwise v2 `GET /api/v2/books/?category=books`) into a managed Notion database. Articles, tweets, podcasts and Reader documents are excluded by the `category=books` filter. Highlights themselves are not synced, only per-book metadata and the highlight count.

## Notion

- Database **Readwise Library**: `41f91b07-11ac-8173-866c-d7cbe0937aba`
- Data source: `41f91b07-11ac-81d1-9128-000b796f69f2` (query with `POST /v1/data_sources/{id}/query`)
- Primary key: `Readwise ID` (Readwise book id as a string, byte-identical to the change `key`)
- Each page gets the book cover as both page cover and icon (📕 when Readwise has no cover).

## Sync

One capability, `readwiseBooksSync`: `replace` mode, every `6h`. One request at `page_size=1000` covers the whole library (379 books on 2026-11-21); it follows `next` if the library ever outgrows that. Replace mode removes books deleted in Readwise.

- `Source` is a select with the sources seen on 2026-11-21 (`kindle`, `kobo`, `bookwise`, `reader`, `manual`, `native`). Anything new is written as `other`; add it to `SOURCES` to get its own option.
- `Tags` is comma-joined rich text, not a multi-select, because Readwise tags are free-form and a multi-select needs every option declared in the schema.
- Every declared property is read-only in Notion. Add human-owned columns (rating, status, notes) to the data source by hand and list them here.

## Relation to Readwise Highlights

**Readwise Highlights** (`2d791b07-11ac-814b-af18-000b6272383c`, under *Dennis' Reading*) is written by Readwise's own Notion export: one page per document, highlights in the page body. This worker only writes its relation column.

- **`Highlights Page`** on Readwise Library is a two-way relation (the reverse column on Highlights is `Readwise Library`). It was **added by hand via the API on 2026-11-21 and is not in the worker schema**: declaring it would make it read-only, and a managed schema's relations can only target worker databases. Rebuilding the database from code won't recreate it. Re-add it with `PATCH /v1/data_sources/41f91b07-11ac-81d1-9128-000b796f69f2` (`relation` → `data_source_id` above, `dual_property.synced_property_name: "Readwise Library"`).
- **Join** (`src/relink.ts`): the ASIN in the Highlights page's Amazon `URL` (`/gp/product/<ASIN>`) against the book's `ASIN`. When that fails, it falls back to normalised `Title` + `Author`, which covers Kobo and manual books that have no ASIN. On 2026-11-21 this linked 374 of 379 books (353 by ASIN, 21 by title + author), with every title verified. The 5 unlinked books have no page in Highlights because Readwise doesn't export them (0 highlights, or Readwise's own tutorial book).
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
