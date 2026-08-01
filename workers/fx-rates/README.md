# fx-rates

A [Notion Worker](https://developers.notion.com/workers) that syncs daily FX rates for USD, SGD, JPY, and AUD into a managed Notion database, with conversions to both USD and SGD.

## What it does

One sync capability — `fxRatesSync` — runs daily and maintains a 4-row "FX Rates" database:

| Currency | Rate to USD | Rate to SGD | Rate Date | Last Synced |
|----------|-------------|-------------|-----------|-------------|
| USD | 1 | 1.27… | 2026-05-14 | 2026-05-15 06:39 |
| SGD | 0.78… | 1 | … | … |
| JPY | 0.0063… | 0.0080… | … | … |
| AUD | 0.72… | 0.92… | … | … |

Rates come from the free, unauthenticated [Frankfurter API](https://frankfurter.dev/) (ECB-sourced, daily updates). A single API call uses USD as base; cross-rates to SGD are derived arithmetically.

The sync runs in `replace` mode but upserts by `Currency` as the primary key, so the same 4 Notion pages are updated in place each run — no churn.

## Development

```bash
npm install
npm run check        # typecheck
ntn workers deploy   # build + deploy
```

Useful commands:

```bash
ntn workers sync trigger fxRatesSync --preview   # dry-run
ntn workers sync trigger fxRatesSync             # run now
ntn workers sync status                          # health
ntn workers runs list                            # recent executions
```

No secrets are required — Frankfurter is unauthenticated, and writes to the managed database are authenticated automatically by the Notion runtime.

## Files

- [`src/index.ts`](src/index.ts) — Worker entry, declares the `fxRates` database and the `fxRatesSync` capability.
- `workers.json` — local Worker ID (gitignored; created by `ntn workers deploy --name <name>`).
