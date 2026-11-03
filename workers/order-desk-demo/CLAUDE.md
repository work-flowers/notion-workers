# order-desk-demo

A **custom block** (Notion alpha), not a sync. `README.md` has what it shows,
the demo page and the binding table. General custom-block mechanics live in
[`docs/custom-blocks.md`](../../docs/custom-blocks.md) — read that first.

- Worker id `01a1a0a8-106b-7e2f-96c3-4a6dead6b5b7`, capability `custom_block orderDesk`.
- Generic, fictional rebuild of the Knoxx order desk. **Never copy Knoxx data,
  names or IDs in here**, and never point this block at a client workspace.

## Shape

- `src/index.ts` — the manifest. Six data sources; property names equal the
  demo databases' so the config panel auto-maps them.
- `blocks/order-desk/src/rules.ts` — every rule as pure functions: the two
  pickers, `orderProblems`, `moves` (the stage gates), re-pricing. No React, no
  SDK. `test/rules.test.ts` runs it against the mock fixture.
- `rows.ts` — the only module that knows Notion's value shapes.
- `store.ts` — the `Store` interface; `index.tsx` (Notion) and `mock.ts` (memory)
  implement it.
- `OrderList.tsx`, `OrderSheet.tsx`, `components.tsx` (incl. `Picker`, which can
  show *why* an option is disabled — the reason a native `<select>` won't do).

## Decisions

- **Stage moves are forward-only** and each lists every blocker. Confirm routes
  by `Payment terms`: "On account" → Brewing, anything else → Awaiting payment.
- **Lines lock after Draft.** Notes stay editable while the order is open.
- **Hand-typed prices are a warning, not a blocker**; the price-list entry
  relation records provenance and is cleared when a price is typed.
- **Writes are batched** behind one Save bar; stage moves are separate and
  disabled while there are unsaved edits.
- **NDS styling**, so it follows the page's light/dark theme and looks native.
- **No 999-cap handling**: the demo databases are tiny. A real desk would
  window Orders (see the Knoxx original).
- **The demo databases must not carry a `created_time` (or formula/rollup/unique
  ID) property** — it makes every block write hang. Both originally had a
  `Created` column; it was dropped on 2026-11-03. See `docs/custom-blocks.md`.

## Keeping mock and Notion in step

`mock.ts` mirrors the seeded Notion data with readable ids. If you change the
seed (add a customer, re-price something), change both, or the README's "What
to show" table will describe one and not the other. CC-1015 in Notion is a
test order created through the block during verification; it isn't in the mock.
