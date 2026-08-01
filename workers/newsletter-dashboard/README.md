# newsletter-dashboard

A Notion **custom block** (alpha) that renders an engagement dashboard for the
newsletter, bound to the `Email Analytics` data source that
[`buttondown-sync`](../buttondown-sync) populates.

## Why it exists

Notion's native charts can't aggregate a ratio. `Email Analytics` has a
row-level `Click Rate`, but a chart can only sum, average or take the median of
those per-row percentages — so a 54-delivery send counts the same as a
180-delivery one. On the current 12 sends that gap is real:

| | |
|---|---|
| Σ clicks ÷ Σ deliveries (correct) | **9.3%** |
| mean of row-level click rates (what a native chart plots) | **7.7%** |

This block keeps the raw counts and recomputes every rate at the aggregate
level, per period.

## What it shows

- **Stat tiles** — delivered, open rate, click rate, click-to-open, unsubscribe
  rate for the selected range, each with change vs the equally long preceding
  window (omitted for *All time*, which has no prior window).
- **Engagement rate** — open / click / click-to-open by week, month or quarter,
  on one axis (all three share a unit).
- **Delivery volume** — deliveries per period, as its own chart rather than a
  second y-axis on the rate plot.
- **Table view** — the same numbers per period and per send, so nothing is
  reachable only by hovering.

Rates are `null` (`—`) rather than `0` when the denominator is missing, and
periods with no send are gaps in the line, not 0% points.

`Deliveries` is the denominator throughout. Buttondown leaves `Recipients` at 0
on these rows, so it can't be used.

## Data binding

The worker declares the *shape* it needs; the mapping to real properties happens
in Notion when the block is inserted. Bind the `sends` data source to
**Email Analytics** with:

| Declared key | Email Analytics property |
|---|---|
| `subject` | Subject (title) |
| `sentAt` | Publish Date (date) |
| `deliveries` | Deliveries (number) |
| `opens` | Opens (number) |
| `clicks` | Clicks (number) |
| `unsubscribes` | Unsubscriptions (number) |

Do **not** map `Click Rate` / `Open Rate` / `Click Rate (Agg)` — the block
derives rates itself, and the alpha can't read formula properties anyway.

## Develop

From the repo root:

```shell
npm run dev:block --workspace=notion-worker-newsletter-dashboard
```

Then open `http://localhost:5178/?mock` — `?mock` renders from the fixtures in
`blocks/newsletter-dashboard/src/mock.ts`, so no Notion binding is needed.
`&theme=dark` and `&today=2026-08-01` are also honoured.

Checks:

```shell
npm run check --workspace=notion-worker-newsletter-dashboard
npm run test --workspace=notion-worker-newsletter-dashboard
```

The aggregation logic is pure and unit-tested in `test/aggregate.test.ts`,
including the mean-of-ratios comparison above.

## Deploy

```shell
./scripts/deploy.sh newsletter-dashboard
```

Deploying the worker ships the block — there's no separate frontend deploy. Then
in Notion, use `/custom` → **Custom block**, pick this block, and map the data
source as above.

## Alpha caveats

- Custom Blocks are a private alpha and the SDK makes breaking changes;
  a deployed block can stop working until it's rebuilt against a newer SDK.
- Queries are capped at 999 rows, with no server-side filters or sorts — the
  block loads every send and filters client-side. Fine at this volume.
- Only basic property types are readable: no formulas, rollups or relations.
- Requires a Business or Enterprise workspace.
