# notion-worker-shared

Shared TypeScript helpers for work.flowers [Notion Workers](https://developers.notion.com/workers). Extracted from [notion-meeting-note-db-updates](https://github.com/work-flowers/notion-meeting-note-db-updates) so multiple workers can reuse the same contact-resolution logic.

## Modules

- **`contacts`** — `resolveContactPageIds(notion, zapier, emails, options?)`: resolves raw email addresses to Notion Contact page IDs, in order:
  1. Drop internal-domain and blocklisted addresses (Zapier table blocklist, exact + substring).
  2. Match remaining addresses against existing Contacts on **Primary Email** (email property) *or* **Secondary Email** (multi-select).
  3. Any address that matched **no** existing Contact is run through the AI-by-Zapier classifier (individual vs. service account). This gates *every* contact creation.
  4. Create Contact pages only for addresses classified as individuals (capped per run, default 10).
- **`internalUsers`** — `buildInternalUserMap(notion)` (workspace email → user-id map via `users.list`) and `resolveInternalUserIds(emails, map)`.
- **`notionRaw`** — raw `fetch` helpers for endpoints the SDK doesn't cover at `Notion-Version: 2026-03-11`: `queryDataSource(dataSourceId, body)` and `createPage(body)`. Requires `NOTION_API_TOKEN` in the environment.

## Install (in a worker project)

```bash
npm install github:work-flowers/notion-worker-shared
```

The `prepare` script compiles `dist/` on install. Peer dependencies: `@notionhq/client`, `@zapier/zapier-sdk`.

## Usage

```ts
import {
  resolveContactPageIds,
  buildInternalUserMap,
  resolveInternalUserIds,
} from "@work-flowers/notion-worker-shared";

const [internalMap, contactPageIds] = await Promise.all([
  buildInternalUserMap(notion),
  resolveContactPageIds(notion, zapier, emails),
]);
const internalUserIds = resolveInternalUserIds(emails, internalMap);
```

## `toNotionMarkdown`

Prepares a GitHub README for a sync's `pageContentMarkdown`. Notion emits **one
block per source line**, so a hard-wrapped paragraph otherwise arrives as a stack
of one-line paragraphs. Also collapses blockquotes and rewrites pipe tables that
contain an escaped pipe. The header comment in `src/markdown.ts` records what was
tested against the live converter and which plausible fixes are wrong — read it
before adding a transform.

Used by `zapier-durables-docs` and `worker-readme-sync`.

## Consumers

- `workers/meeting-note-db-updates` — contact and internal-user resolution
- `workers/zapier-durables-docs`, `workers/worker-readme-sync` — `toNotionMarkdown`

Historical standalone repos, superseded by this monorepo:
[notion-meeting-note-db-updates](https://github.com/work-flowers/notion-meeting-note-db-updates),
[notion-worker-email-db-updates](https://github.com/work-flowers/notion-worker-email-db-updates)
