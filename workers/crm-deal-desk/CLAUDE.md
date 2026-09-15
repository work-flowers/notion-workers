# crm-deal-desk

A **custom block** capability (Notion alpha), not a sync. See `README.md` for
what it does, the live data-source ids and the binding checklist.

**How custom blocks work in general — project shape, the Vite `root` pin,
block-vs-view placement, manifest binding, filter/sort support, what the
sandbox forbids — lives in [`docs/custom-blocks.md`](../../docs/custom-blocks.md).**
Read that first; this file records only what is specific to *this* block.

## Shape

- `src/index.ts` — the `worker.customBlock()` declaration. Capability key is
  still `dealDesk` (existing instances point at it); the block directory is
  `blocks/crm-desk`.
- `blocks/crm-desk/src/rules.ts` — **every deal rule, as pure functions.** No
  React, no SDK imports. `test/rules.test.ts` exercises it directly.
- `records.ts` — Contact and Company types, their save requirements, the
  duplicate hints and search. Pure; `test/records.test.ts`.
- `linked.ts` — Meeting Note / Email pages → `LinkedRecord`, from either the
  public-API page shape (`pages.get`) or the data-source row shape (cache
  bindings). Pure; `test/linked.test.ts`.
- `linked-loader.ts` — the React hook that fetches linked pages: warm cache
  first, module memo, own timeout, bounded pool, batches from the newest end.
- `users.ts` — `users.get` memo for the Owner chip.
- `rows.ts` — the only module that knows Notion's value shapes, both directions.
- `store.ts` — the `Store` interface both roots implement.
- `App.tsx` (shell + tabs), `DealsTab.tsx`, `ContactsTab.tsx`,
  `CompaniesTab.tsx`, `components.tsx`, `nav.ts`, `debug.tsx` (the Diagnostics footer).
- `mock.ts` + `mock-linked.ts` — the fictional fixture, including generated
  notes and emails shaped exactly like `pages.get` output.

## This block writes

It creates deals, contacts and companies via
`pages.create({ parent: { type: "data_source_key", key } })` and edits them via
the row's own `update()`. **Relations are writable** —
`{ type: "relation", relation: [{ id }] }`.

Writers in `rows.ts` write **every field the block owns on every save, nulls
included** (an omitted key leaves the old value in place; clearing a Lost
Reason depends on it) and **omit every field it does not own** — `owner`, and
the `deals` / `contacts` / `meetingNotes` / `emails` relations Notion maintains
from the other side. `actualClose` is written back unchanged so the
automation-stamped date survives a save. `onlyBound()` then drops any key the
config panel left unmapped, because writing an unbound key fails the whole
save and an optional field should degrade to "not editable here".

## The rules are the point

- **Requirements are per stage, spelled out, not chained.** Read the table in
  `README.md` before changing any of them.
- **No stage requires `actualClose`.** A database automation stamps it. Asking
  a person for a date the system is about to overwrite is how you get two
  dates. `normalizeDraft` also **clears `lostReason`** off non-lost stages at
  save time.
- **`contactChoicesFor` returns a union, not an array.** "Pick a company first"
  and "this company has nobody on record" are different problems; the fourth
  case, `unfiltered`, is the honest degraded mode.
- **`orphanedContact` exists because a mismatched contact is invisible** in the
  filtered picker. Don't "simplify" it away.
- **Unknown ids are not violations.** `contactMismatch` returns false for a
  contact outside the loaded window.
- **Stages come from the bound schema**, filtered to the seven the rules know.
- **Client-side filters stay even though the queries filter server-side.** An
  old Notion client ignores `filter`/`sorts` silently; `filtersApplied` detects
  a closed deal in the open window and the shell says so.

## Data access: why it looks like this

- Each `useDataSource` call is its own 999-row subscription with its own
  filter and sort (module-constant option objects — a fresh object each render
  replaces the subscription). Open deals, closed deals, companies, contacts and
  the contact search are separate windows on purpose.
- **Relations cannot be filtered server-side**, so a record's Meeting Notes
  and Emails go through `pages.get` per id. `linked-loader.ts` has its **own 8 s
  timeout** because the bridge has none: a host result the SDK's strict
  valibot parse rejects is logged and dropped, and the promise never settles.
  The `NotionPage` property schema omits formula/rollup/created_time types — if
  the host ever sends those on a Meeting Note page, this is where it would
  hang. the Diagnostics footer has a probe for exactly this; record what it shows below.
- Currency comes from the `fxRates` binding, not the `Value (SGD)` formula:
  formulas return a text fallback and can't be filtered or trusted as numbers.

## Design: workFlowers, deliberately not Notion

The block is a *product surface*, so it looks like a workFlowers app rather
than Notion furniture. It **does not track the page theme** (the brand is
light-only; `useTheme()` and `<NotionTokenScope>` are unused — don't
reintroduce them without solving the dark palette) and **fonts are bundled**
via `@fontsource-*` because the sandbox blocks the Google Fonts CDN silently.
Tokens are copied into `crm-desk.css`, not imported; keep them in sync by hand.

## The fixture is fake on purpose

`mock.ts` / `mock-linked.ts` mirror the CRM *template*, not the live CRM,
because this gets screen-recorded. Every address is on `.example`; tests assert
no real client name or domain appears. Marina Freight has ~60 emails (to reach
"Load more") and one dangling note id (to reach "couldn't be read").

If you change the fixture, **re-measure** the audit figures in
`test/rules.test.ts` rather than loosening the assertions.

## Spike results (live CRM, Diagnostics footer, 2026-09-15)

- **All 45 keys bound** on the CRM page instance: no unbound keys on any of
  the six data sources, so the declared types match the live schema.
- **Relation arrays are not capped at 25.** The largest company email
  relation returned **920** ids.
- **The status filter is honoured**: the closed-deals window returned 61
  rows with the open window failing, so the two are genuinely separate.
- **Both optional caches fill to 999 with `hasMore: true`** — Meeting Notes
  and Emails are indeed past the cap, as assumed.
- **`sorts: [{ propertyId: "created_time" }]` is rejected by the host** with
  `Unknown sort property ID: created_time`, contrary to the SDK docs. The
  block now looks the built-in's id up from `propertySchemasById` (type
  `created_time`) via a 1-row probe subscription and falls back to the host's
  default order if that is refused too (`useNewestFirst` in `index.tsx`).
  After the fix both windows load without error (8 open deals, 946
  contacts); whether the schema id was accepted or the fallback engaged is
  not distinguishable from the panel yet.
- **People values are `[{ id, table: "notion_user" }]`** record pointers;
  `asRelationIds` in `rows.ts` handles that shape (and bare strings).
- **Linked emails render on live deals** — a deal with one linked email
  showed it with subject, date and sender, so `pages.get` on an Email page
  settles and its properties are keyed by name. Not yet confirmed for a
  Meeting Note page (the probe button covers it).
