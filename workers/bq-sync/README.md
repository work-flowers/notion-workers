# notion-worker-bq-sync

A [Notion Worker](https://developers.notion.com/workers) that runs a BigQuery
report through the [Zapier SDK](https://docs.zapier.com/sdk) and syncs the
results into a Notion database.

## What it does

The `effectiveRatesSync` capability (see [src/index.ts](src/index.ts)) runs the
query in [src/query.ts](src/query.ts) against the `workflowers-analytics`
BigQuery project via Zapier's Google BigQuery connector, then replaces the
contents of the managed Notion database **Effective Hourly Rate by Client
(YTD)**.

The report computes the effective hourly rate per client, year to date:

- **Revenue** — Xero ACCREC invoices (status `AUTHORISED` or `PAID`) limited to
  revenue accounts `200` (Retainer Fees) and `201` (Project Fees), normalised
  to SGD via each invoice's `currency_rate`.
- **Hours** — Harvest time entries (total and billable).
- **Mapping** — Xero contacts are joined to Harvest clients through
  `google_sheets.company_ids` (deduped on `harvest_client_id`, since the
  source sheet repeats each company).
- **Filter** — clients with fewer than 10 hours tracked YTD are excluded
  (`MIN_HOURS` in [src/query.ts](src/query.ts)).
- **Effective rate** — revenue ÷ total hours.

The YTD window is computed in the query (`DATE_TRUNC(CURRENT_DATE('Asia/Singapore'), YEAR)`),
so it rolls over automatically each year.

## Configuration

Secrets are stored with `ntn workers env set`:

| Variable | Purpose |
|----------|---------|
| `ZAPIER_CLIENT_ID` / `ZAPIER_CLIENT_SECRET` | Zapier SDK client credentials (headless auth, created with `npx zapier-sdk create-client-credentials`) |
| `ZAPIER_BIGQUERY_CONNECTION_ID` | The Zapier connection for the `zapier@workflowers-analytics.iam.gserviceaccount.com` service account |

## Operating it

```shell
ntn workers deploy                                # deploy changes
ntn workers sync trigger effectiveRatesSync       # run now
ntn workers sync trigger effectiveRatesSync --preview  # dry run, no writes
ntn workers sync status                           # health check
ntn workers runs list                             # recent executions
```

This is a proof of concept, so the sync schedule is `manual` — it only runs
when triggered via the CLI. Change `schedule` in [src/index.ts](src/index.ts)
(e.g. to `"1d"`) and redeploy to run it automatically. The managed database
schema is defined in code; changing property definitions requires a redeploy
and may reset data.
