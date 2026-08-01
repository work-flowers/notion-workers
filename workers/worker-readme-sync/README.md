# worker-readme-sync

A Notion Worker that syncs README files from the `work-flowers/notion-workers` GitHub repository into a Notion database every 12 hours.

## What it does

- Fetches all worker directories from `workers/` in the repo
- Reads each worker's `README.md` and stores it as the page body
- Joins with deployment metadata from `ntn workers list` (stored as the `WORKERS_METADATA` env var)
- Populates: Worker Name, Worker ID, GitHub URL, Created, Last Updated, Updated By, Capabilities, Deployed

## Configuration

### Environment variables

- `GITHUB_TOKEN` (secret) - GitHub token with read access to the repo
- `WORKERS_METADATA` (JSON) - Deployment metadata from `ntn workers list` combined with `ntn workers capabilities list`

### Schedule

Runs every 12 hours (`schedule: "12h"`). Mode: `replace` (removes rows for workers no longer in the repo).

### Sync key

`readmeSync` - trigger manually with `ntn workers sync trigger readmeSync`
