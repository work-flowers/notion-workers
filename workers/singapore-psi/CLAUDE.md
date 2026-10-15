# singapore-psi — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker.

## What it syncs

NEA's hourly Pollutant Standards Index, from data.gov.sg's v2 real-time API
(`https://api-open.data.gov.sg/v2/real-time/api/psi?date=YYYY-MM-DD`), into a
managed **Singapore PSI** database: one row per hourly reading × region.

- **Primary key** `Reading ID` = `<API timestamp>|<region>`, e.g.
  `2026-10-15T10:00:00+08:00|west`. The sync `key` is built from the same string.
- **Regions**: north, south, east, west, central. Data up to at least 2020 also
  carries `national`; it is mapped too. Unknown regions are logged and skipped
  rather than written, since a select value outside the declared options fails.
- **Band** is derived from 24h PSI with NEA's descriptors (Good ≤50, Moderate
  ≤100, Unhealthy ≤200, Very unhealthy ≤300, Hazardous above).
- History goes back to roughly 2016 (2016-01-01 returns no data, 2016-06-01 does).

## Syncs

- `psiDelta` — incremental, every 30 min. Fetches today (SGT) plus the date of
  now − 3h, and upserts only items whose `updatedTimestamp` is newer than the
  stored `since`. NEA revises readings after first publishing them, and
  `updatedTimestamp` is what moves when it does.
- `psiBackfill` — replace mode, manual. One SGT day per execute, from
  `BACKFILL_DAYS` (90) ago up to today. **Replace mode means a backfill run also
  deletes every row older than the window** — that is the retention policy.
  Widen `BACKFILL_DAYS` before running it if you want to keep more.

## API quirks

- Errors come back in the body as `code`: `0` is success, `17`
  (`REAL_TIME_API_DATA_NOT_FOUND`) is a day with no data and is treated as empty,
  `24` (`TOO_MANY_REQUESTS`) is the rate limit (also HTTP 429).
- Rate limits reset every 10 s: 6 calls without a key, 12 with a dev key, 30
  with a prod key. The `dataGovSg` pacer is set to 5 / 10 s so it works keyless.
  Raise it if a key is set and the backfill needs to go faster.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATA_GOV_SG_API_KEY` | No | Sent as `x-api-key` for a higher rate limit. Stored in 1Password: `op://Employee/nea/credential`. |

Keys are created at https://data.gov.sg (log in → API dashboard → Create API
Key). **They expire.** data.gov.sg emails the owner 3 months, 1 month, 3 weeks
and 1 week before. An invalid key is not rejected: a made-up `x-api-key` still
returned `code: 0` (checked 2026-10-15). So an expired key most likely
degrades silently to keyless limits, which the pacer already respects, rather
than failing the sync. Rotate it with
`ntn workers env set DATA_GOV_SG_API_KEY=…`, or unset it to run keyless.

No `NOTION_API_TOKEN`: the worker only writes through the managed sync.
