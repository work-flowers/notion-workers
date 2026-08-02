# newsletter-dashboard

A **custom block** capability (Notion alpha), not a sync. See `README.md` for
what it renders and how to bind it.

**How custom blocks work in general — project shape, the Vite `root` pin,
block-vs-view placement, manifest binding, what the sandbox forbids, chart colour
against Notion's surfaces — lives in [`docs/custom-blocks.md`](../../docs/custom-blocks.md).**
Read that first; this file only records what's specific to *this* block.

## Shape

- `src/index.ts` — the `worker.customBlock()` declaration.
- `blocks/newsletter-dashboard/` — the Vite + React frontend.
- `blocks/newsletter-dashboard/src/aggregate.ts` — all the arithmetic, kept pure
  and free of React/SDK imports so `test/aggregate.test.ts` can exercise it. This
  is the part that matters; the charts are a rendering of it.

## The analytics, which are the whole point

- **Rates must come from summed counts, never averaged row ratios.** That is the
  entire reason this block exists instead of a native Notion chart, and the gap is
  real: 9.3% vs 7.7% on the current 12 sends. If you add a metric, add it to
  `summarize()` so it aggregates the same way. `test/aggregate.test.ts` asserts
  both figures, so the premise can't rot silently.
- A missing denominator yields `null`, rendered `—`. Don't "fix" that to 0: a
  period with no deliveries is unknown, not zero engagement.
- Periods with no send produce **no bucket** — a gap in the line, not a 0% point.
- Buttondown leaves `Recipients` at 0 on every row; **`Deliveries` is the
  denominator** throughout.
- One send (2026-04-07) has deliveries and zero opens — almost certainly missing
  tracking. It is counted, with a visible footnote. Don't silently filter rows to
  make the chart look better.
- **The per-issue chart ranks by an unweighted rate**, the one place this block
  shows a figure that *isn't* size-aware. That's deliberate — you want to know
  which issue landed — but it's why the aggregate reference line and the per-bar
  delivery counts are load-bearing, not decoration. Don't remove them.
- The per-issue rows key off the Notion page id. Keep mock ids unique too: two
  fixtures sharing an id makes React reuse DOM and the bars render on top of each
  other, which looks like a layout bug rather than a data one.

## The Newsletter Issue relation, and why this block ignores it

`Email Analytics` carries a **Newsletter Issue** relation that is *not* in
`buttondown-sync`'s managed schema and therefore not reproducible from code —
recorded here per the repo convention for human-owned columns. It points at
`Newsletter Issues`, joined on Buttondown's `em_…` identifier (`Email ID` here,
`Buttondown ID` there).

It has to stay hand-added: declaring it in the sync schema would mark it
read-only, and `Schema.relation()` only relates two syncs — Newsletter Issues is
human-managed. `buttondown-sync`'s `emailAnalyticsSync` maintains it
automatically at the start of each 6h cycle; `scripts/backfill-issue-relation.ts`
here does the same join on demand, for catch-ups or for checking the join without
waiting for a cycle.

**This block deliberately does not read it, and shouldn't be "improved" to.** A
block cannot open a Notion page (see the guide), so any link it rendered would go
nowhere. Subjects are plain text; Notion's own relation cell does the navigating.
Copy-to-clipboard-on-click was built and rejected as more surprising than useful.

## Colour

Hybrid by design: **NDS tokens for chrome** so the block tracks the page theme,
**workFlowers brand hues for the series** — re-stepped per mode, because the raw
brand tokens fail on Notion's surfaces. The validated hexes and the reasoning are
in the guide; if you touch them, re-validate both modes rather than eyeballing it.

Two consequences to preserve here:

- The dark violet leans magenta, and its worst tritan pair sits in the band that
  is only legal with secondary encoding — the direct end labels, legend and table
  view *are* that encoding.
- Status colours are **not** the brand's ochre CTA, because ochre is series 3
  here and a status colour must never read as a series.

The brand has no dark mode at all (`tokens/colors.css` is light-only) and loads
Inter from the Google Fonts CDN, which the sandbox blocks — both reasons the
chrome stays NDS.
