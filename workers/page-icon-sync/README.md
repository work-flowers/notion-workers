# notion-worker-page-icon-sync

A [Notion Worker](https://developers.notion.com/workers) that copies a Company's icon onto Meeting Note and Email pages when they're linked to that Company.

## What it does

When a page in the **Meeting Notes** or **Emails** data source has its `Companies` relation set, a Notion database automation POSTs the triggering page to this Worker. The Worker fetches the page, reads the first related company, and updates the source page's icon to match.

Both Meeting Notes and Emails have a relation property literally named `Companies`, so a single webhook handler (`syncIconFromCompany`) serves both.

| Data source | ID |
|---|---|
| Meeting Notes | `19891b07-11ac-8137-9d62-000b75fab86e` |
| Emails | `1e491b07-11ac-80ce-8b86-000b29ba4f68` |
| Companies | `21991b07-11ac-80b0-b787-000b3d3995f6` |

Behaviour:
- Always overwrites the source page's existing icon.
- If multiple companies are linked, uses the first.
- If the company has no icon, no-ops.
- `file`-type icons (uploaded to Notion, expiring URLs) are copied as `external` icons using the same URL.

## Setup

```bash
npm install
ntn workers env set NOTION_API_TOKEN=ntn_...   # personal access token, or an internal integration with access to all three data sources
ntn workers deploy
ntn workers webhooks list                       # copy the URL for syncIconFromCompany
```

Then, in Notion, on **each** of Meeting Notes and Emails:

1. Add a database automation.
2. Trigger: `Companies` property edited.
3. Action: Send webhook → paste the URL from `webhooks list`.

## Development

```bash
npm run check     # type-check
ntn workers deploy
ntn workers runs list
ntn workers runs logs <runId>
```

Webhook handlers can't be exercised via `ntn workers exec`; smoke-test by deploying and editing the `Companies` relation on a test Meeting Note or Email.
