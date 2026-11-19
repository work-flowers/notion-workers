# resource-schedule

A **custom block** (Notion alpha), not a sync: a Forecast-style resourcing
schedule over five ordinary Notion databases. Built as a sales mock-up, so it
is deliberately small. `README.md` has the binding table and the demo script.
General custom-block mechanics live in
[`docs/custom-blocks.md`](../../docs/custom-blocks.md) — read that first.

**This repo is public.** Keep client names, people and deal details out of code,
fixtures, docs and commit messages. The Notion copy of the demo data uses real
workspace members as people; `fixture.ts` uses fictional names in their place.

- Worker id `01a1ed31-96b7-7f52-9b5e-fcccddeec6d3`, capability `custom_block resourceSchedule`.

## Shape

- `src/index.ts` — the manifest. Five data sources (Bookings, Team, Jobs, Clients,
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
  Team member and `Placeholder = Overflow`. Assigning a person clears the
  placeholder and vice versa.
- **People are rows of a Team database, not workspace users.** Bookings point
  at them through the `Team member` relation; Name, Role, Team, Weekly capacity
  and Dedicated to (relation → Clients) live on the Team row. Replaced on
  2026-11-19 a design that used a Person property plus `users.get` for names
  and copied Role/Team/capacity onto every booking. That failed for guests: a
  guest viewer saw no names, and Notion's native People database can't be
  shared with guests at all, nor read through the API, search or the Notion MCP
  (its properties aren't reachable from an automation formula either). A Team
  database has none of those limits and lets someone with no bookings appear.
  Team's optional `Notion account` person column is for humans; the block
  never reads it.
- **Clicking a person's name opens `PersonPanel.tsx`** (Name, Role, Team, Hours
  / week), which writes that person's Team row. It previews live like the
  booking editor. Role and Team choices are the Team database's options.
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
- **Client theming stays out of git.** `schedule.css` routes the primary
  button, selected tabs and today marker through `--rs-brand*` variables (NDS
  defaults) and carries a hidden `.rs-brandbar`. An optional
  `blocks/schedule/src/brand.local.css` overrides them and shows the bar; it is
  loaded with `import.meta.glob`, so the build works without it. Selectors in it
  must out-rank `schedule.css` (`.nds.rs-root …`), because the glob import is
  hoisted above it. The file is listed in `.git/info/exclude`, not `.gitignore`.
  **Deploy with `./scripts/deploy.sh resource-schedule --no-git`**, or the
  theme silently doesn't ship: `ntn` discovers files through git and honours
  every ignore source, `info/exclude` included; `--no-git` walks the
  filesystem and still respects `.gitignore` files (verified 2026-11-18 by
  CSS bundle size: 204.51 kB with the theme, 203.68 kB without). The theme file
  exists only in the checkout it was made in; keep a copy somewhere durable.
  Availability colours are never themed: they carry meaning.
- Out of scope for the mock-up: Linear, time off, milestones, export, 999-row
  windowing.
