# notion-worker-set-company-logo

A Notion Worker with a single **webhook** capability, `setCompanyLogo`.

When a Notion database automation fires its **Send webhook** action, this Worker:

1. Reads the triggering page id from the automation payload (`body.data.id`).
2. Retrieves the page's **Website** property and cleans it to a bare domain
   (strips `https://`/`http://`, `www.`, and any path/query/port).
3. Sets the page icon to `https://img.logo.dev/{domain}?token={LOGO_DEV_TOKEN}`.

## Setup

```bash
npm install
npm run check          # type-check

# Secrets
ntn workers env set NOTION_API_TOKEN=ntn_...        # PAT, or internal integration token
ntn workers env set LOGO_DEV_TOKEN=pk_xxxxxxxx      # logo.dev publishable token
# Optional — defaults to "Website":
ntn workers env set WEBSITE_PROPERTY="Website"

ntn workers deploy
ntn workers webhooks list                           # copy the setCompanyLogo URL
```

If `NOTION_API_TOKEN` is an **internal integration** (not a personal access
token), connect it to the target database: open the database → ••• →
Connections → add the integration. A PAT acts as you and needs no connection.

## Wire up the Notion automation

In the source database: **New automation** → trigger (e.g. *Page added* or
*Website is edited*) → action **Send webhook** → paste the `setCompanyLogo`
URL from `ntn workers webhooks list`.

The automation's webhook payload delivers the triggering page object under
`data`, which is where the Worker reads the page id from.

## Notes

- The **Website** property may be a URL, email, phone, rich-text, title, or
  formula(string) property — the handler extracts a string from any of these.
- The webhook URL itself is the shared secret; treat it as sensitive. Notion
  returns `202` immediately and runs the handler async, retrying non-fatal
  errors up to 3 times.

## Local test

```bash
ntn workers exec setCompanyLogo --local -d '{"data":{"id":"<page-id>"}}'
```

Requires `NOTION_API_TOKEN` and `LOGO_DEV_TOKEN` in a local `.env`
(`ntn workers env pull`).
