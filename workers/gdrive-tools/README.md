# gdrive-tools

Gives Notion Custom Agents three Google Drive tools, so an agent can find,
rename and move files for you. The tools run through Zapier's Google Drive
integration. There are no syncs, databases or webhooks: the worker is
tools-only.

## Tools

| Tool | What it does |
|---|---|
| `findDriveFiles` | Searches Drive by name (substring or exact) and returns matching files and folders with their ids and links. |
| `renameDriveFile` | Renames a file or folder in place, by id. |
| `moveDriveFile` | Moves a file into another folder, by file id and folder id. |

The tools are designed to be chained: an agent finds the file (and, for a
move, the destination folder) with `findDriveFiles`, then passes the ids on.
When a search returns several matches, the tool description tells the agent
to ask which one you mean rather than guess.

Each tool returns `success` and a readable `message`; failures come back as a
message rather than an error, so the agent can tell you what went wrong.

### Good to know

- Drive won't change a file's extension after it's created, so a rename keeps
  the original extension even if the new name drops it.
- Searches cover the connected account's My Drive unless a Shared Drive id is
  given.
- Rename and move act on the real Drive. Test them on a throwaway file.

## Setup

The worker authenticates to Zapier with client credentials, since it runs
headless:

```shell
npx zapier-sdk create-client-credentials notion-worker-gdrive-tools
cd workers/gdrive-tools
ntn workers env set ZAPIER_CLIENT_ID <id>
ntn workers env set ZAPIER_CLIENT_SECRET <secret>
```

The secret is shown once; keep it in 1Password. The Google Drive account
itself is the Drive connection stored on the Zapier account. The worker uses
the first one it finds, unless `ZAPIER_GOOGLE_DRIVE_CONNECTION_ID` pins a
specific connection (needed once a second Drive account is connected).

## Develop and deploy

`.env.tpl` maps the variables to 1Password, so tools can be run locally:

```shell
cd workers/gdrive-tools
op run --env-file=.env.tpl -- ntn workers exec findDriveFiles --local -d '{"name":"forecast","exactMatch":null,"driveId":null,"limit":null}'
```

Nullable inputs still have to be present, so spell out every field as above.

```shell
npm run check --workspace=notion-worker-gdrive-tools
./scripts/deploy.sh gdrive-tools
```

More detail for maintainers, including the Drive API quirks behind the tool
outputs, is in [`CLAUDE.md`](CLAUDE.md).
