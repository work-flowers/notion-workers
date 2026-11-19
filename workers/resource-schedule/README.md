# resource-schedule

A Forecast-style resourcing schedule as a Notion custom block: who is booked on
what, day by day, with free hours per person, a placeholder row for unassigned
work, and jobs created from templates with recommended hours per round.

## Run it locally

```shell
npm run dev:block --workspace=notion-worker-resource-schedule
```

Open `http://localhost:5173/?mock` (add `&theme=dark` for dark mode). Mock mode
runs every flow in memory over fictional data; nothing is written anywhere.

## Databases and binding

Create these five databases (property names must match for auto-mapping):

| Data source | Properties |
|---|---|
| **Bookings** | Booking (title), Job (relation → Jobs), Team member (relation → Team), Placeholder (select: `Overflow`), Dates (date range), Hours per day (number), Round (number), Notes (text) |
| **Team** | Name (title), Role (multi-select), Team (select), Weekly capacity (number, empty means 35), Dedicated to (relation → Clients) |
| **Jobs** | Job (title), Job number (text), Client (relation → Clients), Template (relation → Job templates), Label (select of colour names) |
| **Clients** | Client (title) |
| **Job templates** | Template (title), Round 1 hrs, Round 2 hrs, Round 3 hrs, Days between rounds (numbers), Role (select) |

People are rows of **Team**, not workspace members, so guests see everyone's
names (Notion's own People database can't be shared with guests).

Insert the block with `/custom` → **Resourcing schedule**, then map each data
source in its settings.

## What to show

1. **Team** tab: each person's open hours per day ("Full" when booked, red when
   over). Type a department ("retouching") or pick a role to narrow it.
2. **New job** from a template: its rounds land on the **Overflow** row with the
   recommended hours.
3. Click an Overflow booking: people with the right role are ranked by open
   hours on those days. Pick one, adjust dates or hours, and watch the colouring
   move before you save.
4. **Projects** tab: each job, grouped by client, with who's on it.
5. The five databases underneath: ordinary Notion data, open to automations,
   the API and MCP.

## Deploy

```shell
./scripts/deploy.sh resource-schedule
```
