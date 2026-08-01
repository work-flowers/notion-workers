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
- **By issue** — one bar per send, ranked by click rate, open rate,
  click-to-open or deliveries, with a reference line at the aggregate rate for
  the same window. Ranking by a rate ignores size, so a 54-delivery issue can
  top a 180-delivery one; the reference line and each bar's delivery count (in
  its tooltip) are what keep that honest. Capped at the top 20, and the subtitle
  says so when there are more.
- **Table view** — the same numbers per period and per send, so nothing is
  reachable only by hovering. Every column sorts on click (unknown values always
  sort last, whichever direction). When the optional `issue` relation is mapped,
  each subject links to the Newsletter Issues page holding that send's content.

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
| `issue` *(optional)* | a relation to Newsletter Issues — see below |

Do **not** map `Click Rate` / `Open Rate` / `Click Rate (Agg)` — the block
derives rates itself, and the alpha can't read formula properties anyway.

### The optional `issue` relation

`issue` is the only property that may be left unmapped: without it the table
view renders subjects as plain text, with it each subject links to the
Newsletter Issues page holding that send's content.

It needs a relation property on Email Analytics pointing at Newsletter Issues,
populated by matching Email Analytics `Email ID` to Newsletter Issues
`Buttondown ID` — those hold the same Buttondown identifier (`em_…`). Note that
`Email Analytics` is a synced data source, so the relation has to be a
hand-added (undeclared) property; a managed schema would make it read-only, and
`Schema.relation()` only relates two syncs, which Newsletter Issues isn't.

**Setting it up.** Add the property by hand in Notion — on `Email Analytics`, a
relation named **Newsletter Issue** pointing at `Newsletter Issues`, limited to
one page. Then backfill it:

```shell
NOTION_API_TOKEN=ntn_... npx tsx scripts/backfill-issue-relation.ts
```

That's a dry run: it verifies the property is a relation aimed at the right data
source, reports how many rows match, and writes nothing. Add `--apply` to write.
Re-running is safe — rows already pointing at the right page are skipped — so
the same command catches up after new sends.

Two caveats, both real:

- Not every send has an issue page. A Buttondown resend gets its own `Email ID`
  with no Notion counterpart, so it stays unlinked — the table says how many.
- The SDK forbids top-level navigation and `window.open`, so the subject is a
  plain `target="_blank"` anchor. Whether the host's iframe sandbox lets that
  open is a property of Notion's sandbox, not of this code.

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
