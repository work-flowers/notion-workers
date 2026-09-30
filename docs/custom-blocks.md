# Custom blocks (Notion alpha)

What was learned building `workers/newsletter-dashboard`, the repo's first custom
block. Everything below was verified empirically on 2026-08-01 against
`@notionhq/custom-blocks@0.1.8` / `@notionhq/workers@0.8.1` unless marked
otherwise — the published alpha overview is out of date in at least one place
(see *Relations*), so prefer this file and the SDK's own `docs/` over the website.

**The alpha makes breaking changes.** A deployed block can stop working until it
is rebuilt against a newer SDK. Notion says so in the block's own config panel.

**Pin `@notionhq/custom-blocks` to an exact version** (currently `0.1.44`, since
2026-09-15) in every block worker, for the same reason `@notionhq/workers` is
pinned: the cloud build runs its own `npm install` in the worker directory, so a
caret range means production builds against whatever is latest while the repo
typechecks against the root lockfile. Until 2026-09-15 all three blocks carried
`^0.1.x` against a lockfile resolving `0.1.8` — production had been building
against 0.1.4x for weeks. Renames between 0.1.8 and 0.1.44: `pages.delete` →
`pages.archive` / `unarchive`, `archived` → `is_archived`, `*Input` arg types →
`*Args`; rows gain `archive()` / `unarchive()` / `is_archived` / `in_trash`.

**Pin `vite` and `@vitejs/plugin-react` exactly too** (currently `8.3.1` /
`6.1.1`, since 2026-09-30). They're devDependencies, but the deploy sandbox runs
the Vite build itself, so a caret range there drifts the same way: on
2026-09-30 the cloud built `ga4-sync` with Vite 8.3.1 while the lockfile held
8.2.0. The pinned versions are the ones that cloud build used, and that bundle
is confirmed rendering.

**A block that stops rendering usually just needs a redeploy.** `ga4-sync`'s
dashboard stopped rendering after sitting on its 2026-08-03 build while the host
moved on; the code typechecked and built cleanly against 0.1.44, and `./scripts/deploy.sh
ga4-sync` alone fixed it. Check `ntn workers list` for the last deploy date
before debugging the block's code.

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

**Prefer a real snapshot to invented fixtures**, and `import()` it dynamically so
the bundle Notion serves doesn't carry it. Plausible-looking synthetic numbers
hide the conditions the layout actually has to survive — a 78-session spike among
3-session days, nine days at zero, a 1,118-view page next to a 1-view one. The
snapshot goes stale, and that is fine: nothing feeds it back into the bound
block, and a stale fixture with correct arithmetic beats a fresh one with made-up
numbers. It also lets the unit tests assert figures that were *measured*.

## `vite.config.mts` when the worker is CommonJS

**If the host worker's `package.json` has no `"type": "module"`, the Vite config
must be `vite.config.mts`, not `.ts`.** Vite loads its config through Node's
resolver, which picks CJS-vs-ESM from the nearest `package.json`. A block added
to an existing *sync* worker therefore gets its config `require`d and dies with:

```
Failed to resolve "@notionhq/custom-blocks/vite". This package is ESM only but it
was tried to load by `require`.
```

The error names the SDK, so it reads like a broken dependency rather than a
module-system mismatch two directories up. `newsletter-dashboard` never hits it
because it is a block-only worker and its package is already `"type": "module"`.

Use the `.mts` extension rather than adding `"type": "module"` to the worker: the
extension scopes the change to one file, whereas the package flag changes what
`tsc` emits for the sync Notion actually runs. Vite discovers `vite.config.mts`
natively, so the deploy sandbox's bare `npx vite build` finds it unaided — but
your own `--config` script paths need updating, and so does the block
`tsconfig.json`'s `include`.

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

- **`limit` defaults to 20 and caps at 999 — per subscription.** Several
  `useDataSource` calls on the same key each get their own window, so the cap is
  per *view* (open deals vs closed deals), not per database. There is no cursor.
- **Server-side `filter` and `sorts` exist since 0.1.35** (verified against
  0.1.44, 2026-09-15). Filter: `title`, `rich_text`, `url`, `email`,
  `phone_number`, `number`, `checkbox`, `date`, and `select` / `status` /
  `multi_select` (by option name, one or an array). Sort: the text-ish types,
  `number`, `checkbox`, `date`, plus `propertyId: "created_time" |
  "last_edited_time"` — **not** select/status. One condition or a flat `and` of
  ≤ 25; **no `or`, no nesting, no relative dates, and no relation, people,
  formula or rollup filters** (those come back as text fallbacks). Address a
  property by manifest `key` or raw `propertyId`. Keep the option object
  referentially stable (module constant or `useMemo`) — a new object each render
  replaces the subscription and blanks the rows while it reloads. **Old Notion
  clients ignore filter and sort silently**, so keep a client-side guard and
  detect it (a row the filter should have excluded). Sorting a near-cap window
  by `created_time` descending is the cheap fix for "the newest rows fall off";
  a filtered secondary subscription (e.g. `title contains q`) reaches past it.
  `workers/crm-deal-desk/blocks/crm-desk/src/index.tsx` has one of each.
- **A data source past the cap can still be read in date windows.** Filter on
  its date property per window (one calendar month, or one drill-down period)
  and merge; each window has its own 999. A variable number of windows needs a
  component per window, since hooks can't be called a variable number of
  times. Re-check each row's date after merging — that's what catches a client
  that ignored the filter — and keep a row only in the window that contains it
  so an ignored filter can't multiply rows. `ga4-sync`'s `useAcquisition` and
  `useNotionPeriodPages` (`blocks/website-dashboard/src/index.tsx`) do both.
  **Date-range filters work in the live host** (verified 2026-09-30):
  `{ and: [{ key, date: { on_or_after } }, { key, date: { on_or_before } }] }`
  returned exactly the requested period for `pageDays`, and 🚥 Traffic loaded
  month by month gave the same Acquisition totals as loading it whole. Whether
  a `number` sort is honoured is still unconfirmed — both blocks re-sort
  client-side, so it can't be seen from the UI.
- **Relations are readable**, contrary to the alpha overview page. The value union
  carries `{ id, table }` record pointers and the official habit-tracker cookbook
  declares `type: "relation"` and reads it. You get the related page's **id only**
  — no title (that needs a separate `pages.get(id)`) and no page *content*, which
  isn't readable at all in the alpha.
- Date values expose `start_date` as a plain `YYYY-MM-DD`. Use it directly;
  slicing a UTC timestamp shifts late-evening rows into the next day.
- Rows carry their own `update()`; the `pages` API covers create/get/update/delete
  when you don't have a row in hand.

## Writing: a block is not limited to dashboards

Verified on `crm-deal-desk` 2026-08-06. **Full CRUD works, including relations**,
which is what makes a block usable as an app rather than a report.

- `pages.create({ parent: { type: "data_source_key", key }, properties })`
  inserts a row into a mapped data source. `properties` accepts your manifest
  keys, so no raw ids.
- `row.update({ properties })` edits a row you already have, also by key. The
  top-level `pages.update()` is keyed by **raw property id only** and each value
  must repeat its own `id` — prefer the row helper whenever you have a row.
- **Relation values are writable**: `{ type: "relation", relation: [{ id }] }`.
  The read shape (`Array<{ id, table }>`) and the write shape are different;
  don't round-trip one into the other.
- Other write shapes worth having to hand: `{ type: "status", status: { name } }`,
  `{ type: "select", select: { name } | null }`, `{ type: "date", date: { start } | null }`,
  `{ type: "number", number }`, `{ type: "title", title: [{ type: "text", text: { content } }] }`.
- **Write every field you own on every save, nulls included.** An omitted key
  leaves the old value in place, so a field that should have been *cleared*
  silently keeps its previous value.
- `pages.create` cannot set an icon or cover yet — create, then `pages.update`.

### Read the property's options rather than hardcoding them

`propertySchemasByKey[key].options` gives a select/status property's option
names, so a block can offer exactly what the bound property accepts. This
matters more than it sounds: hardcode a status name the bound property lacks and
you get a save that fails at the API instead of a control that was never
offered. A `status` property also exposes `groups`, but those only partition the
options by id — every name is already in `options`, so read that alone.

## The manifest property type is `rich_text`, not `text`

`CustomBlockManifestPropertyType` follows the API's names. Declaring `type:
"text"` fails the typecheck with a 25-member union in the error message, which
buries the one-word fix.

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

### Three NDS token names that look obvious and don't exist

A missing custom property makes the **whole declaration invalid**, so the
failure mode is a transparent background rather than an error — dark text on the
browser's dark default, which reads as a theme bug rather than a typo:

| Wrong | Right |
|---|---|
| `--bg-primary` | `--bg-base` |
| `--content-orange`, `--content-red` | the `--orange-*` / `--red-*` scales, e.g. `--orange-60` |
| `--spacing-3` (by step) | `--spacing-12` (by pixel value) |

Also available and easy to miss: `--border-strong`, `--bg-interactive-strong`
with `--content-on-interactive-strong` for primary buttons, `--radius-*`,
`--font-sans`, `--font-weight-*`, `--shadow-md`.

### When *not* to use NDS

NDS is right for a block that should dissolve into the page — a dashboard, a
chart, a view. It is the wrong default for a block that is a **product surface**:
the app a team works in instead of the database grid. `crm-deal-desk` uses the
workFlowers design system for exactly that reason, and looking unlike Notion is
the point rather than a cost.

Two things that bite if you go that way:

- **Bundle the fonts.** A brand stylesheet that `@import`s Google Fonts fails
  *silently* in the sandbox and you get system sans. Use `@fontsource-*`.
- **Decide what happens in dark mode before you start.** A brand with no dark
  palette can't track `useTheme()`, so either commit to painting your own
  surface (legible on a dark page the way an embedded app is) or derive a dark
  variant properly. Half-doing it yields a third palette belonging to neither
  system.

Dropping NDS is also worth ~160 kB of CSS.

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

- **Whether formula and rollup *values* are readable as anything useful.** The
  0.1.44 property-support table says both come back as a *text fallback* that
  does not preserve the structured value, and neither can be filtered or sorted.
  Treat them as display-only strings at best; `crm-deal-desk` reads FX rates
  from a real number property instead of the `Value (SGD)` formula.
- **Whether `pages.get` settles for every page.** The bridge has no timeout and
  drops a host result the SDK's strict parse rejects — and the `NotionPage`
  property schema omits formula, rollup, created_time and unique_id. Whether the
  host strips those before sending is untested; wrap every `pages.get` /
  `users.get` in your own timeout (`linked-loader.ts` in `crm-deal-desk`).
- **Whether the clipboard APIs work inside the sandbox.** Untested in the host;
  they work in a plain browser with user activation.

## Where the block should live

A block can be its own worker or ride along in the worker that syncs its data.
There is **no runtime coupling either way** — the block reads Notion through the
host bridge under the viewer's permissions, never through the worker's token — so
this is purely about deploys and maintenance:

| | Its own worker | Inside the sync worker |
|---|---|---|
| Schema drift | Nothing links the manifest to the schema it mirrors but a comment | Rename a property and both halves change in one PR |
| Deploy | Independent; a sync hotfix never rebuilds an alpha-SDK block | Shared — a frontend build error fails a sync deploy, and every deploy re-applies the managed database schemas |
| Overhead | Another `workers.json`, README, CLAUDE.md, deploy target | None |

`newsletter-dashboard` is standalone (it had no sync to co-locate with);
`ga4-sync` carries its block. Neither is the default — pick on whether the
dashboard is the primary way the synced data gets consumed, in which case shared
fate is a feature.

## Three reference implementations

- **`workers/newsletter-dashboard`** — the simpler one: a single data source,
  charts, a table view, `?mock` fixtures, unit-tested aggregation.
- **`workers/ga4-sync/blocks/website-dashboard`** — a block co-located with the
  sync that feeds it, mapping **three** data sources with tabs, optional keys,
  and generic `TrendLines` / `Columns` / `RankedBars` primitives reused across
  all of them. Also the one that hit the `.mts` problem above.
- **`workers/crm-deal-desk`** — the read/**write** one, and the only app rather
  than a report: a three-tab CRM (Contacts, Companies, Deals) over the live CRM
  that creates and edits records, pre-filters a relation picker on another
  field's value, gates stage transitions on per-stage requirements, and renders
  each record's linked Meeting Notes and Emails via memoised, time-limited
  `pages.get` calls because relations can't be filtered server-side. Also the
  one that leaves NDS behind for the brand system, and the reference for
  per-view filtered subscriptions. Its `?mock` mode runs every flow with writes
  held in memory, which is how to demo a writing block without touching real
  data; `?debug` is its binding-health panel.

### Making a writing block demo-able

Two habits worth copying from `crm-deal-desk`:

- **Put persistence behind a small interface** (there, a `Store` with
  `createDeal` / `updateDeal`) and give `?mock` an in-memory implementation. The
  same UI then exercises the real flows — including the guardrails — with no
  binding, no deploy and nothing written anywhere. That is the mode to record
  demos in.
- **Don't demo against live client data.** Point the fixture and the binding at
  a fictional template CRM instead, and add a test asserting no real client name
  appears in the fixture. Sizing matters too: a picker that narrows five
  contacts to two doesn't look like it's saving anyone from anything, so give
  the fixture a realistic spread (one company with 18 people, one with 1, two
  with none) or the demo understates itself.

Each worker's `CLAUDE.md` covers the decisions specific to its block; this file
covers what generalises.
