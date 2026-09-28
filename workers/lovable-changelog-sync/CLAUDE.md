# lovable-changelog-sync — worker context

Repo-wide conventions live in the root `CLAUDE.md`; general Workers SDK guidance
is in `AGENTS.md`. This file covers only what is specific to this worker. The
README has the full design.

## What it does

Syncs https://docs.lovable.dev/changelog into a worker-managed database,
**Lovable Changelog**, one page per `###` section, every 12 hours. Modelled on
`api-changelog-sync` (Notion's changelog, also a Mintlify site); keep the two
parsers' shape in step when changing either.

- **Source:** `https://docs.lovable.dev/changelog.md`, public, no auth.
- **No env vars.** A sync writing only to its own managed database needs no
  `NOTION_API_TOKEN` — `fx-rates` runs healthy with none (checked 2026-09-28).
  `api-changelog-sync` holding one is a leftover, not a requirement.

## Quirks

- **Batched at 100 changes per `execute()`** (~528 rows total). State is
  `{ hashes }` only; a hash is recorded only once its entry is emitted.
- **URL anchors are not stable for repeated headings.** Mintlify suffixes
  duplicates page-wide in document order, newest first, so every new
  "Improvements"/"Bug fixes"/"Removed" section bumps the older ones' `-N`.
  Expected: those rows re-upsert with the new URL. The `Key` uses a separate
  ASCII slug and is unaffected.
- **`anchorSlug` was derived empirically** and pinned by
  `src/__fixtures__/anchors.txt` (ids scraped from the rendered HTML). If a test
  on anchors fails after re-capturing fixtures, Mintlify changed its slugger.
- **Unknown MDX components** on a line of their own are stripped, keeping their
  content; the "no stray tags" test catches anything inline that slips through.
