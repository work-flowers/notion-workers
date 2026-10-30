# xero-invoice-sync — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## No `upstreamUpdatedAt` on upserts (removed 2026-10-30)

`invoicesBackfill` and `invoicesDelta` used to pass `upstreamUpdatedAt` = the invoice's Xero `UpdatedDateUTC`. Notion skips any upsert whose timestamp isn't newer than the last one applied to that row, even when the properties differ, and still counts it as an upsert with `sync status` healthy. Here that blocked:

- **Matched Domain**, derived from the Xero *contact* (AccountNumber → `COM-<n>`, else email/website domain). Editing a contact doesn't bump its invoices' `UpdatedDateUTC`.
- **Any mapping change** in `invoiceProperties` / `mapXeroStatus`. The manual backfill is the only way to repair those rows, and the guard made it a no-op for every unchanged invoice.

Two syncs do share these rows, which is the one legitimate reason to keep the field, but both read live from Xero at run time, so a stale overwrite needs a backfill page fetched before, and returned after, a delta that saw a newer edit of the same invoice; the next 6h delta corrects it. That is a far smaller risk than a backfill that can't repair anything. Company and FX Rate relations are written by `reconcile.ts` over REST, not the upsert, so they were never affected. Don't reintroduce the field.

Overall workers documentation lives at https://developers.notion.com/workers/get-started/overview.md.
