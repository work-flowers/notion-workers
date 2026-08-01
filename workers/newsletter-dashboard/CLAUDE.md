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

## Relations are readable, despite the alpha overview

The alpha overview page says property support excludes relations. That is out of
date: `NotionDataSourceValue` includes an array of `{ id, table }` record
pointers, and the official habit-tracker cookbook both declares
`type: "relation"` and reads it. A relation therefore gives you the related
page's id — but only its id. There is no way to read the related page's title
from the relation value; that needs a separate `pages.get(id)`, and page *content*
(blocks) is not readable at all in the alpha.

What you cannot do is navigate to it. `README.md` in `@notionhq/custom-blocks`
lists "no top-level navigation, `window.open`, or auth redirects" under Forbidden
APIs, so the subject cell is a plain `target="_blank"` anchor and whether it opens
is up to the host's iframe sandbox, not to this code.

Declared-but-unmapped properties are a supported state (`propertyIdsByKey` maps
them to `undefined`), which is what lets `issue` be optional. Adding a property
to the manifest does change the deployed manifest, so an existing block instance
may need re-mapping after such a deploy.

## Hand-added properties

`Email Analytics` carries a **Newsletter Issue** relation that is *not* in
`buttondown-sync`'s managed schema and therefore not reproducible from code —
recording it here per the repo convention for human-owned columns. It points at
`Newsletter Issues` and is populated by
`scripts/backfill-issue-relation.ts`, which joins Email Analytics `Email ID` to
Newsletter Issues `Buttondown ID` (both hold Buttondown's `em_…` identifier).

It has to stay hand-added: declaring it in the sync schema would mark it
read-only, and `Schema.relation()` only relates two syncs — Newsletter Issues is
a human-managed data source, not a sync.

Nothing links new sends automatically yet. Re-run the backfill after publishing,
or build it out following the `link-contact-to-company` webhook pattern.

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

Deliberately hybrid: **NDS tokens for chrome** (surfaces, borders, ink, spacing)
so the block tracks the page's theme and works in dark mode, and **workFlowers
brand hues for the series** — azure, Russian Violet, ochre, in the brand's own
chart order — as literal hexes with a `data-display-mode="dark"` override.

The brand's raw chart tokens can't be used as-is. They're built for white web
pages and fail on Notion's surfaces: Russian Violet `#4E1B61` is below the usable
lightness band in light mode (L 0.335) and only 1.28:1 against the dark card;
ochre `#E17A14` is out of band in dark. So each mode carries its own step of the
same hue, validated as a set against the surface it renders on. If you touch
these, re-validate both modes against `#ffffff` and `#202020` — don't eyeball it.

Two consequences to preserve:

- The dark violet leans magenta because azure and Russian Violet are
  near-neighbour hues. Its worst tritan pair is ΔE 7.4, inside the band that is
  only legal with secondary encoding — the direct end labels, legend and table
  view are that encoding.
- Status colours are **not** the brand's ochre CTA, because ochre is series 3
  here and a status colour must never read as a series.

The brand also has no dark mode at all (`tokens/colors.css` is light-only) and
loads Inter from the Google Fonts CDN, which the sandboxed iframe's CSP blocks —
both reasons the chrome stays NDS. If Inter is ever wanted, bundle it via
`@fontsource/inter` so it's a same-origin asset.
