# notion-worker-shared

Shared TypeScript helpers for work.flowers [Notion Workers](https://developers.notion.com/workers). Extracted from [notion-meeting-note-db-updates](https://github.com/work-flowers/notion-meeting-note-db-updates) so multiple workers can reuse the same contact-resolution logic.

## Modules

- **`contacts`** — `resolveContactPageIds(notion, zapier, emails, options?)`: resolves raw email addresses to Notion Contact page IDs. Drops internal-domain and blocklisted addresses (Zapier table blocklist, exact + substring), matches existing Contacts on **Primary Email** (email property) *or* **Secondary Email** (multi-select), classifies unknown addresses as individual vs. service account via AI by Zapier, and creates Contact pages for individuals (capped per run, default 10).
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

## Consumers

- [notion-meeting-note-db-updates](https://github.com/work-flowers/notion-meeting-note-db-updates)
- [notion-worker-email-db-updates](https://github.com/work-flowers/notion-worker-email-db-updates)
