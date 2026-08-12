# gdrive-tools

Two tools for Notion Custom Agents, both backed by Zapier's Google Drive integration:

| Tool | Zapier action | Notes |
|---|---|---|
| `findDriveFiles` | `google-drive` / `search` / `find_multiple_files` | Name search, returns ids for the agent to choose from. |
| `renameDriveFile` | `google-drive` / `write` / `update_file_metadata` | Renames a file **or** folder in place by id. |

No syncs, no databases, no webhooks — this worker is tools-only.

## Why `update_file_metadata` and not `update_file_name`

Google Drive exposes two rename-capable write actions. `update_file_name` is
built around Zapier's folder→file picker (`folder` + `file` + `new_name`) and
carries a separate `rename_folder` boolean. `update_file_metadata` takes a bare
`file_id` plus `name` and treats files and folders identically, which is the
right shape for a tool that receives an id from an agent rather than a dropdown.

## The two actions echo back different Drive API versions

Verified against the live connection on 2026-08-12:

| | search (`find_multiple_files`) | write (`update_file_metadata`) |
|---|---|---|
| Drive API shape | **v2** | **v3** |
| Name field | `title` | `name` |
| Link field | `alternateLink` | *none returned* |
| Other fields | `mimeType`, `modifiedDate`, `explicitlyTrashed`, … | `kind`, `id`, `mimeType` only |

So a rename response carries no URL at all — `summarise()` in `src/index.ts`
reads both name fields and synthesises `https://drive.google.com/open?id=<id>`
when no link comes back, so the agent can still hand the user something clickable.

`find_multiple_files` also wraps its hits: the result is `[{ count, files: [...] }]`,
not a flat array of files.

## Nullable inputs are still required

`j.string().nullable()` makes a property nullable, **not** optional — the
platform's validator rejects a call that omits it (`InvalidToolInputError: must
have required property 'exactMatch'`). Agents pass explicit `null`, so this only
bites hand-written `ntn workers exec -d '{…}'` payloads: spell out every field.

Google Drive does not allow changing a file's **extension** after creation, so a
rename that drops or changes `.pdf` will silently leave the stored extension
alone. The tool description tells agents to keep the extension in `newName`.

## Zapier client credentials

A Worker runs headless in Notion's sandbox, so there is no browser for Zapier's
OAuth login — it authenticates with client credentials instead. Each worker in
this repo gets its own pair, named `notion-worker-<dirname>`:

```shell
npx zapier-sdk create-client-credentials notion-worker-gdrive-tools
```

The secret is shown **once**. Store it in 1Password (Employee vault, item
`zapier-gdrive-tools`, fields `client id` / `client secret` — matching
`.env.tpl`), then push both to the worker:

```shell
ntn workers env set ZAPIER_CLIENT_ID <id>
ntn workers env set ZAPIER_CLIENT_SECRET <secret>
```

The Google Drive **connection** is separate: it is the stored OAuth grant on the
Zapier account (`Google Drive dennis@work.flowers`). `resolveDriveConnectionId()`
takes the first Google Drive connection unless `ZAPIER_GOOGLE_DRIVE_CONNECTION_ID`
is set. Pin it once a second Drive account is connected.

## Local testing

```shell
op run --env-file=.env.tpl -- ntn workers exec findDriveFiles --local -d '{"name":"forecast"}'
op run --env-file=.env.tpl -- ntn workers exec renameDriveFile --local -d '{"fileId":"<id>","newName":"New name"}'
```

`renameDriveFile` mutates the real Drive — test it against a throwaway file.
