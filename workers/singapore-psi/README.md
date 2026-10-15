# singapore-psi

A [Notion Worker](https://developers.notion.com/workers) that syncs NEA's hourly Pollutant Standards Index (PSI) for Singapore into a managed **Singapore PSI** database, one row per reading per region.

## What it does

Data comes from data.gov.sg's [PSI real-time API](https://data.gov.sg/datasets?formats=API). Each row holds one hourly reading for one region (North, South, East, West, Central):

- 24-hour PSI and a **Band** (Good, Moderate, Unhealthy, Very unhealthy, Hazardous)
- PM2.5, PM10, O₃, CO, SO₂ and NO₂ concentrations, with their sub-indices
- **Timestamp** of the reading and **Updated At**, the time NEA last revised it

Two syncs write to it:

- `psiDelta` runs every 30 minutes and upserts readings that are new or revised since its last run.
- `psiBackfill` runs only when triggered. It loads the last 90 days, one day at a time, and removes rows older than that.

## Development

```bash
npm run check --workspace=notion-worker-singapore-psi   # from the repo root
./scripts/deploy.sh singapore-psi                       # from the repo root
```

Useful commands, run from this directory:

```bash
ntn workers sync trigger psiDelta --preview      # dry-run
ntn workers sync trigger psiBackfill             # load the last 90 days
ntn workers sync status                          # health
```

## Configuration

`DATA_GOV_SG_API_KEY` is optional. It raises the rate limit from 6 to 12 calls per 10 seconds. Request a key from the data.gov.sg dashboard (see the [guide](https://guide.data.gov.sg/developer-guide/api-overview/how-to-request-an-api-key)), then set it with `ntn workers env set DATA_GOV_SG_API_KEY=…`.
