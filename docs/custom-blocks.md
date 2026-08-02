# Custom blocks (Notion alpha)

What was learned building `workers/newsletter-dashboard`, the repo's first custom
block. Everything below was verified empirically on 2026-08-01 against
`@notionhq/custom-blocks@0.1.8` / `@notionhq/workers@0.8.1` unless marked
otherwise — the published alpha overview is out of date in at least one place
(see *Relations*), so prefer this file and the SDK's own `docs/` over the website.

**The alpha makes breaking changes.** A deployed block can stop working until it
is rebuilt against a newer SDK. Notion says so in the block's own config panel.

## What a custom block is

`worker.customBlock()` declares a front-end web app that Notion serves in a
sandboxed iframe. It is **build-time only**: no `execute` handler, so
`ntn workers exec` doesn't apply, and **no environment variables** — the block
reads Notion data through the host bridge under the *viewer's* permissions, not a
token's. Deploying the worker ships the block; there is no separate frontend
deploy.

Two SDK surfaces, and they are disjoint:

- `@notionhq/workers` — declares how the block is built and what data-source
  schema it expects.
- `@notionhq/custom-blocks` — the iframe's runtime client (`useDataSource`,
  `useTheme`, `pages`, …). Read `node_modules/@notionhq/custom-blocks/docs/*.md`;
  it is the authoritative reference and ships with the version you have.

## Project shape

```
workers/<name>/
  src/index.ts                 # worker.customBlock() declaration
  blocks/<name>/               # the Vite app
    index.html
    vite.config.ts
    src/…
```

The block directory has **no `package.json` of its own** — by design. Its
dependencies (`react`, `vite`, `@notionhq/custom-blocks`) belong to the worker's
`package.json`, and `npm install` runs from the repo root like every other
workspace here.

Keep the arithmetic in a pure module with no React or SDK imports. That's what
makes it unit-testable (`tsx --test`), and for a dashboard the arithmetic *is* the
product.

## Building locally: pin the Vite root

**`vite.config.ts` must set `root: import.meta.dirname`.** Inside an npm
workspace `npx vite` runs from the *package* root (`workers/<name>`), not the
config's directory, so a cwd-relative root looks for `index.html` one level too
high and dies with:

```
[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.
```

The error names no path, so it reads like a missing file rather than a wrong cwd.
This is workspace-specific — the same block builds fine standalone, and Notion's
deploy sandbox builds from the block directory where both agree — which is why it
is easy to lose an hour to. Add worker scripts that pass the config explicitly
rather than relying on cwd:

```json
"build:block": "vite build --config blocks/<name>/vite.config.ts",
"dev:block": "vite --config blocks/<name>/vite.config.ts"
```

Ship a `?mock` mode that renders from fixtures so layout and chart work needs no
binding, no deploy, and no Notion. It is also how you exercise empty, loading and
error states, which are otherwise awkward to reach.

## Placement: block or view — same capability

There is no `worker.customView()`. A custom block and a custom view are the *same
deployed capability*, differing only in where it's inserted, which the block can
read at runtime via `useParent()`:

| Inserted as | `useParent()` returns |
|---|---|
| Custom block in a page body | `{ type: "page_id" }`, or `block_id` inside a column/toggle/callout |
| Custom view on a database | `{ type: "data_source_id", data_source_id }` |

- **`/custom` on a page creates a new database.** The `· Database` suffix in that
  slash menu marks entries that do, same as `Table · Database`. To attach a custom
  view to an *existing* database, add it from that database's own view tab bar.
- **There is no API route** for custom views: `create_view` accepts table, board,
  list, calendar, timeline, gallery, form, chart, map and dashboard — not custom.
- **A custom view auto-binds** the enclosing data source and name-matches declared
  properties; the config panel exists only for what it couldn't match. A block on
  a page has no enclosing data source, so mapping is manual.
- A custom view belongs to **one** data source. On a multi-source database, create
  it on the data source you actually want.

## The manifest and binding

`dataSources` in `worker.customBlock()` declares the *shape* the block needs —
author-chosen keys, not a binding. Whoever inserts the block maps those keys to
real properties.

- **Declared-but-unmapped is a supported state.** `propertyIdsByKey` maps unbound
  keys to `undefined`, so a property left `Empty` in the config panel is noise,
  not a broken binding. That's what lets a property be genuinely optional.
- **The config panel reflects the *deployed* manifest**, not your working tree. A
  property you removed keeps appearing until the worker is redeployed — and one you
  add may prompt a re-map of existing instances.
- Read values through `propertiesByKey`, not `propertiesById`: you control the
  keys, not Notion's property ids.

## Reading data

`useDataSource(key, { limit })` is React-only; there is no framework-neutral
equivalent for querying rows yet.

- **`limit` defaults to 20 and caps at 999**, and there are **no server-side
  filters or sorts**. Load the rows and filter client-side. Fine for hundreds of
  rows; plan differently for tens of thousands.
- **Relations are readable**, contrary to the alpha overview page. The value union
  carries `{ id, table }` record pointers and the official habit-tracker cookbook
  declares `type: "relation"` and reads it. You get the related page's **id only**
  — no title (that needs a separate `pages.get(id)`) and no page *content*, which
  isn't readable at all in the alpha.
- Date values expose `start_date` as a plain `YYYY-MM-DD`. Use it directly;
  slicing a UTC timestamp shifts late-evening rows into the next day.
- Rows carry their own `update()`; the `pages` API covers create/get/update/delete
  when you don't have a row in hand.

## What a block cannot do

**It cannot open a Notion page.** This is settled — don't spend time on it. The
sandbox→host protocol (`dist/protocol/messages/sandboxToHost.d.ts`) permits
exactly eight messages: `connect`, `createPage`, `getPage`, `getUser`,
`listUsers`, `queryDataSource`, `resize`, `updatePage`. No navigate or open
message exists, public or internal, and the package README lists top-level
navigation, `window.open` and auth redirects as forbidden. A `target="_blank"`
anchor was tried in Notion and does nothing.

Practical consequence: don't render links to Notion pages. Let Notion's own
relation cell do the navigating. (Copy-to-clipboard-on-click was built as a
workaround and rejected as more surprising than useful.)

**No direct network access either.** Cross-origin work goes through the host. So
CDN assets fail silently — a Google-Fonts `@import` in a stylesheet just doesn't
load. Bundle fonts instead (`@fontsource/*`) so they're same-origin assets. The
Vite plugin also forces `base: "./"`, since blocks are served from a
content-addressed path.

## Theming

Import `@notionhq/custom-blocks/nds.css` and use NDS tokens (`--bg-elevated`,
`--border-primary`, `--content-primary`, `--spacing-*`) for chrome, so the block
tracks the page's theme and accent for free.

`useTheme()` returns `"light" | "dark"`, and NDS maps it to **`data-display-mode`**
— *not* `data-theme`, which selects content colour palettes. `<NotionTokenScope>`
applies theme and contrast mode automatically for React apps.

## Chart colour

Chart series can't be NDS tokens — they need fixed, validated hues. Notion's card
surfaces are **`#ffffff`** (light) and **`#202020`** (dark); validate any palette
against those two, per the `dataviz` skill, rather than eyeballing it.

The workFlowers chart tokens **fail** as-is: Russian Violet `#4E1B61` is below the
usable lightness band in light mode and only 1.28:1 against the dark card, and
ochre `#E17A14` is out of band in dark. Re-step the same hues per mode. The set
validated for `newsletter-dashboard`:

| Slot | Light | Dark |
|---|---|---|
| 1 azure | `#1479E1` | `#3A92F0` |
| 2 violet | `#7A2E96` | `#C264C0` |
| 3 ochre | `#E17A14` | `#C96A0F` |

Azure and Russian Violet are near-neighbour hues, so the dark violet leans
magenta to stay separable; its worst tritan pair still sits in the band that
requires secondary encoding (direct labels, legend, table view). Keep those.

## Unverified

Don't cite these as fact:

- **Whether formula and rollup *values* are readable.** Both are declarable
  property types in the manifest, but no rows here exercise them, and the doc
  summary that claimed relations were unreadable also claimed this — so treat it
  as unknown until tested.
- **Whether the clipboard APIs work inside the sandbox.** Untested in the host;
  they work in a plain browser with user activation.

## Reference implementation

`workers/newsletter-dashboard` — a bound dashboard with charts, a table view,
`?mock` fixtures, and unit-tested aggregation. Its `CLAUDE.md` covers the
decisions specific to that block; this file covers what generalises.
