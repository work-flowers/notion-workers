# Associate Contact with Company — Notion Worker

Replaces the Zapier zap **"Associate Contact with Company"** (`exported-zap-2026-06-28T04_02_38.776Z.json`)
with a single Notion-Worker webhook. **No Zapier Tables involved** — the worker
reads and writes the live Notion CRM directly.

## What it does

When a contact's email changes, the worker links that contact to the company
that owns the email's domain:

1. Reads the contact's email(s) from the webhook payload.
2. Picks the first **business** domain (personal providers are skipped:
   `gmail.com`, `outlook.com`, `yahoo.com`, `hotmail*`, `icloud.com`,
   `privaterelay.appleid.com`).
3. Resolves the contact in the **Contacts** data source
   (`21991b07-11ac-81a6-a894-000be4a09a67`) by that email.
4. Finds a **Company** (`21991b07-11ac-80b0-b787-000b3d3995f6`) whose `Website`
   contains the domain — or creates one (`Website` = the domain) if none exists.
5. Appends the company to the contact's `Related Company` relation (idempotent —
   it never clobbers an existing link; if already linked it no-ops).

### How it differs from the old zap

| Old zap | This worker |
|---|---|
| Triggered by a new row in a Zapier Table | Triggered by a Notion database automation webhook |
| Looked up the "Company IDs" Zapier Table | Queries the **Companies** data source directly |
| 1-minute domain delay-queue (de-dupe) | _dropped_ — see "Known limitation" below |
| Stale-record cleanup path (delete + recreate) | _dropped_ — a live query can't return a deleted page |
| New company left with a blank title | Same — only `Website` is set (per your choice) |

## Capability

- **Webhook** `onContactEmailUpdated`
- Worker id: `019f0c8b-8cc9-7647-96b1-a60181adb192` (workspace `work.flowers`)
- **Get the webhook URL** with `ntn workers webhooks list`. Treat it as a
  secret — anyone who has it can post events — so it is intentionally not
  recorded in this repo.

## Remaining setup (required)

### 1. Set the Notion token

The webhook calls the Notion API with a token you provide. Simplest is a
**personal access token** (acts as you, can already see the whole CRM):

```bash
ntn workers env set NOTION_API_TOKEN=ntn_...
ntn workers deploy        # redeploy so the secret is picked up
```

(An internal integration token also works, but it must be connected to the
Core CRM database under its **Connections** menu.)

### 2. (Optional) Lock the webhook with a shared secret

```bash
ntn workers env set WEBHOOK_SECRET=$(openssl rand -hex 16)
ntn workers deploy
```

If set, the automation must send the same value in an `X-Webhook-Token` header
(or `Authorization: Bearer <value>`). If unset, the worker relies on URL secrecy.

### 3. Create the Notion database automation

In the **Contacts** data source → **Automations** (or a database button):

- **Trigger:** when `Primary Email` is edited. Add a second trigger/automation
  for `Secondary Email` if you want both (the worker is idempotent, so extra
  fires are harmless).
- **Action:** _Send webhook_ → paste the URL from `ntn workers webhooks list`.
- **Body (JSON):** insert the email property values, e.g.

  ```json
  {
    "primaryEmail": "<insert the Primary Email property>",
    "secondaryEmail": "<insert the Secondary Email property>"
  }
  ```

  Field names are forgiving — the worker scans the entire payload for any email
  address, so any shape that includes the contact's email(s) works.
- **Headers (only if you set `WEBHOOK_SECRET`):** `X-Webhook-Token: <value>`.

## Develop / operate

```bash
npm run check                       # type-check
ntn workers deploy --name link-contact-to-company
ntn workers runs list               # recent executions
ntn workers runs logs <runId>       # logs for one run
ntn workers capabilities disable onContactEmailUpdated   # pause
ntn workers capabilities enable  onContactEmailUpdated   # resume
```

## Known limitation — duplicate companies under a race

The old zap delayed by domain for 1 minute to avoid two simultaneous contacts
with the same new domain each creating a company. This worker queries live and
creates immediately, so two webhooks for the same brand-new domain arriving at
the same instant could create two companies. In practice email edits are rare
enough that this is unlikely; if it ever matters, add a short pre-create
re-query or a domain-keyed lock.
