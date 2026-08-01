# newsletter-dashboard

A **custom block** capability (Notion alpha), not a sync. See `README.md` for
what it renders and how to bind it. Repo-wide conventions live in the root
`CLAUDE.md`; this file records what's specific to a custom-block worker.

## Shape

- `src/index.ts` — the only worker code. `worker.customBlock()` declares the
  build (`path`, `command`, `output`) and the *data-source schema* the block
  expects. It has no `execute` handler, so `ntn workers exec` doesn't apply and
  there is no `NOTION_API_TOKEN` to set: the block reads data through the host
  iframe under the viewer's own permissions.
- `blocks/newsletter-dashboard/` — the frontend (Vite + React). It has **no
  `package.json` of its own** by design; it shares the worker's dependencies and
  hoisted `node_modules`.
- `blocks/newsletter-dashboard/src/aggregate.ts` — all the arithmetic, kept pure
  and free of React/SDK imports so `test/aggregate.test.ts` can exercise it.

## Gotchas found building this

- **`vite.config.ts` must pin `root: import.meta.dirname`.** Inside an npm
  workspace, `npx vite` runs from the *package* root
  (`workers/newsletter-dashboard`), not the config's directory, so a
  cwd-relative root looks for `index.html` one level too high and fails with a
  bare `UNRESOLVED_ENTRY: Cannot resolve entry module index.html`. The error
  names no path, so it reads like a missing file rather than a wrong cwd. Notion's
  deploy sandbox builds from the block directory, where both agree — this only
  bites locally.
- For the same reason, local builds go through the worker's own
  `build:block` / `dev:block` scripts (which pass `--config`), not a bare
  `npx vite` in the block directory.
- **Rates must come from summed counts, never averaged row ratios** — that's the
  entire reason this block exists instead of a native chart. If you add a metric,
  add it to `summarize()` so it aggregates the same way.
- A missing denominator yields `null`, rendered `—`. Don't "fix" that to 0: a
  period with no deliveries is unknown, not zero engagement.
- Buttondown's `Recipients` is 0 on every row; `Deliveries` is the denominator.
- **The per-issue chart ranks by an unweighted rate**, which is the one place
  this block shows a figure that *isn't* size-aware. That's deliberate — you want
  to know which issue landed — but it's why the aggregate reference line and the
  per-bar delivery counts are load-bearing, not decoration. Don't remove them.
- The per-issue rows key off the Notion page id. Keep mock ids unique too: two
  fixtures sharing an id makes React reuse DOM and the bars render on top of
  each other, which looks like a layout bug rather than a data one.
- One send (2026-04-07) has deliveries and zero opens. It's counted, with a
  visible footnote — don't silently filter rows to make the chart look better.

## Colour

Series colours are literal hexes with a `data-display-mode="dark"` override, not
NDS tokens: they're picked for colourblind separation and validated against
Notion's light (`#ffffff`) and dark (`#202020`) card surfaces, which a themeable
token can't guarantee. Everything else (surfaces, borders, ink, spacing) uses NDS
tokens so the block tracks the page's theme. Light-mode series 3 sits below 3:1
contrast, which is why the end labels and table view are mandatory rather than
decorative.
