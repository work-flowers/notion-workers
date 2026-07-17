# notion-worker-email-db-updates

A [Notion Worker](https://developers.notion.com/workers) that enriches newly created pages in the **Emails** data source with metadata parsed from their mail block, resolved **Contacts**, and internal recipients. Replaces a production Zap + sub-Zap (kept in `exported-zap-*.json` for reference).

## What it does

When a page is added to the Emails data source (`1e491b07-11ac-80ce-8b86-000b29ba4f68`), a Notion DB automation calls this Worker's webhook. The Worker then:

1. Polls the page (up to ~90s) for its `mail` block. Mail blocks are **not exposed by the public Notion API** (they come back as `unsupported`), so the page is fetched through Notion MCP via the *MCP Client by Zapier* app (Zapier SDK) — the same route the original Zap used. This is a deliberate stopgap: when the API adds mail-block support, `mailBlock.ts` should switch to `blocks.children` and the MCP dependency goes away.
2. Parses the latest message in the thread: `From`, `To`, `Cc`, `Subject`, `MessageId`; `Gmail Thread ID` and `Date Received` come from the page's own properties, with mail-header fallback for the date.
3. Resolves email addresses via [`@work-flowers/notion-worker-shared`](https://github.com/work-flowers/notion-worker-shared):
   - External addresses → **Contacts** page IDs, matching on **Primary Email or Secondary Email**. Unknown addresses are classified with AI by Zapier (individual vs. service account, with a Zapier-table blocklist) and new Contact pages are created for individuals (capped at 10 per run, `Primary Email` only).
   - Internal addresses (`@work.flowers`) → Notion workspace user IDs via `notion.users.list`.
4. Patches the page: `From` (email), `To` / `Cc` (multi-select), `Gmail Message ID`, `Gmail Thread ID` (falls back to the message ID), `Date Received` (only if Notion didn't already set it), `Contacts` (**merged** with any relations Notion set natively — never overwritten), `Internal Recipients` and `Comment Access` (people).

Differences from the original Zap, on purpose:

- Existing-contact lookup queries the Notion Contacts data source directly (Primary **and** Secondary Email) instead of a Zapier cache table.
- The `Contacts` relation is merged, not replaced.
- The Zapier "Update Properties for New Email Block Table" audit table is dropped; Worker run logs (`ntn workers runs list/logs`) replace it.
- Internal user IDs come from `notion.users.list` instead of the "Internal User IDs" Zapier table.

Note: `Comment Access` is overwritten with the internal recipients (same as the Zap), which replaces any permission-group default Notion put there.

## Layout

```
src/
├── index.ts     # Worker + onEmailCreated webhook registration
├── handler.ts   # handlePageCreated orchestration
└── mailBlock.ts # MCP-Client fetch + polling + <mail> metadata parser
scripts/         # local dev utilities (tsx)
```

## Setup

Prerequisites: Node 22+, the [`ntn` CLI](https://ntn.dev), and Notion Business/Enterprise with Workers enabled.

```bash
npm install
npm run check
```

Secrets (`ntn workers env set` / `.env` for local runs):

- `NOTION_API_TOKEN` — internal integration token with access to the Emails and Contacts data sources and workspace users.
- `ZAPIER_CLIENT_ID` / `ZAPIER_CLIENT_SECRET` — Zapier SDK client credentials (`npx zapier-sdk create-client-credentials`).
- `MCP_CLIENT_CONNECTION_ID` — (recommended) the *MCP Client by Zapier* connection authenticated against the workFlowers Notion MCP. Without it, the Worker picks the newest MCP Client connection automatically.

## Deploy

```bash
ntn workers deploy
ntn workers webhooks list   # copy the URL for onEmailCreated
```

Wire it up in Notion: Emails data source → automations → trigger **When page added** → action **Send to webhook** → paste the URL.

## Local testing

```bash
set -a && source .env && set +a
npx tsx scripts/run-handler-local.ts <email-page-id>
```

## References

- [`exported-zap-2026-07-17T00_26_11.958Z.json`](exported-zap-2026-07-17T00_26_11.958Z.json) — original parent Zap.
- [`exported-zap-2026-07-17T00_31_25.520Z.json`](exported-zap-2026-07-17T00_31_25.520Z.json) — original contact-resolution sub-Zap.
- [notion-worker-shared](https://github.com/work-flowers/notion-worker-shared) — shared contact-resolution package.
- [notion-meeting-note-db-updates](https://github.com/work-flowers/notion-meeting-note-db-updates) — sibling worker using the same shared package.
