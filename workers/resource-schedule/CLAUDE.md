# resource-schedule

A **custom block** (Notion alpha), not a sync: a Forecast-style resourcing
schedule over four ordinary Notion databases. Built as a sales mock-up, so it
is deliberately small. `README.md` has the binding table and the demo script.
General custom-block mechanics live in
[`docs/custom-blocks.md`](../../docs/custom-blocks.md) — read that first.

**This repo is public.** Keep client names, people and deal details out of code,
fixtures, docs and commit messages. The Notion copy of the demo data uses real
workspace members as people; `fixture.ts` uses fictional names in their place.

- Worker id `01a1ed31-96b7-7f52-9b5e-fcccddeec6d3`, capability `custom_block resourceSchedule`.

## Shape

- `src/index.ts` — the manifest. Four data sources (Bookings, Jobs, Clients,
  Job templates); property names match the demo databases so the config panel
  auto-maps them.
- `blocks/schedule/src/model.ts` — all the arithmetic as pure functions: dates
  (UTC, weekends skipped), daily load, availability states, the roster,
  Forecast-style search, template → rounds, and the assignee ranking.
  `test/model.test.ts` runs it against the fixture.
- `columns.ts` — the date axis (Day = 4 weeks, Week = 12 weeks) and bar pixel spans.
- `rows.ts` — the only module that knows Notion's value shapes.
- `store.ts` — the `Store` interface; `index.tsx` (Notion) and `mock.ts`
  (memory, over `fixture.ts`) implement it.
- `Grid.tsx` (rows, heat map, bars, drag-to-move), `Editor.tsx` (booking side
  panel with ranked suggestions), `NewJob.tsx`, `App.tsx` (builds the Team and
  Projects rows).

## Decisions

- **One booking = one person (or placeholder) × one date range × flat hours per
  day**, like a Forecast assignment. Front-loaded work is several bookings,
  which is what template rounds produce.
- **Overflow is a placeholder row, not a person**: a booking with an empty
  Person and `Placeholder = Overflow`. Assigning a person clears the
  placeholder and vice versa.
- **Role, Team and Weekly capacity live on the Bookings rows, and the block
  writes them.** A person's roster entry is the union of their bookings' values
  (empty capacity means 35); assigning a booking to someone writes their roster
  values onto it, and moving it back to a placeholder clears them. There is no
  automation: a Notion automation formula can't reach a person's People-record
  properties (`Trigger page.Person.first().` offers nothing, tried 2026-11-18),
  and neither search nor the Notion MCP can see the native People database. A
  guest can't see it either, so the block never reads it. Consequences: the
  seed bookings had to carry the values, and someone with no bookings at all
  doesn't appear. A real build needs a proper People sync, starting with
  whether the API can read the People database at all.
- **People's names come from `users.get`**, memoised with an 8s timeout. Whether
  a *guest* viewer can resolve other members' and guests' names is unverified;
  a failure shows "Unknown person" rather than breaking the grid.
- **Suggestions rank, never assign.** Role match first, then whoever fits on
  every day, then dedicated-to-this-client, then most headroom. A person always
  clicks the name.
- **The editor previews live**: the grid recomputes the heat map with the
  unsaved draft applied, so reassigning visibly moves hours off Overflow before
  Save.
- **Template rounds**: a round over 7h is spread evenly over as many days as it
  needs; each round starts `Days between rounds` working days after the
  previous one ends.
- **No `created_time` (or formula/rollup/unique ID) property on Bookings or
  Jobs** — it makes every block write hang (see `docs/custom-blocks.md`).
- **NDS styling**, so it follows the page's light and dark themes.
- Out of scope for the mock-up: Linear, time off, milestones, export, 999-row
  windowing.
