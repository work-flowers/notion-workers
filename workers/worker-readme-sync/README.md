# worker-readme-sync

A Notion Worker that syncs README files from the `work-flowers/notion-workers` GitHub repository into a Notion database every 12 hours.

## What it does

For each worker directory in `workers/`, the sync:

- Fetches the `README.md` and stores it as the page body
- Reads `workers.json` to determine deployment status and worker ID
- Parses `src/index.ts` to detect capabilities (sync, tool, webhook)
- Fetches git commit history for created date, last updated date, and author email
- Constructs the GitHub URL for each worker

All metadata is derived from the GitHub repo itself; no manual env var updates needed when new workers are deployed.

## Configuration

### Environment variables

- `GITHUB_TOKEN` (secret) - GitHub token with read access to the repo

### Schedule

Runs every 12 hours (`schedule: "12h"`). Mode: `replace` (removes rows for workers no longer in the repo).

### Sync key

`readmeSync` - trigger manually with `ntn workers sync trigger readmeSync`
