# notion-workers

Monorepo for all work.flowers [Notion Workers](https://developers.notion.com) — TypeScript programs hosted by Notion that extend Custom Agents with tools, sync external data into Notion databases, and receive webhooks.

## Layout

```
packages/
  shared/            @work-flowers/notion-worker-shared — shared helpers
                     (contact resolution, internal user lookup, raw data-source calls)
workers/
  <worker-name>/     one deployable Notion Worker per directory
```

Each worker directory is a self-contained npm workspace with its own `package.json`, `src/`, and `workers.json` (the `ntn` CLI config binding the directory to a deployed worker). Workers that need shared helpers depend on `@work-flowers/notion-worker-shared` as a workspace package — no publishing or version bumping required.

## Working with a worker

Deploy via the wrapper script from the repo root:

```sh
./scripts/deploy.sh <worker-name>
```

For workers without the shared dependency this is a plain `ntn workers deploy`. For workers that depend on `@work-flowers/notion-worker-shared`, the script packs the shared package into a `vendor/` tarball inside the worker, temporarily points the dependency at it, deploys with `--no-git`, and restores everything — because the ntn cloud build uploads only the worker directory and runs its own `npm install`, which can't see unpublished workspace packages.

All other `ntn` commands run from inside the worker's directory (the CLI finds `workers.json` by CWD lookup):

```sh
cd workers/<worker-name>
npm run check          # typecheck
ntn workers runs list  # inspect recent runs
```

Install dependencies once from the repo root: `npm install`.

## Adding a new worker

1. `cd workers && ntn workers new <worker-name>` (or copy an existing worker as a starting point)
2. Set the package name in its `package.json` to `notion-worker-<worker-name>` (workspace names must be unique)
3. Add `"@work-flowers/notion-worker-shared": "*"` to dependencies if needed
4. `npm install` from the repo root, then build and deploy from the worker directory

## Migrating an existing standalone repo

From the repo root, preserving history:

```sh
git subtree add --prefix=workers/<worker-name> /path/to/old-repo main
```

Then: fix the package name, swap the `github:` shared dependency for the workspace version, remove the worker's own `package-lock.json`, `npm install` from root, typecheck, deploy, and archive the old GitHub repo.
