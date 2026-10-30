# outbound-sync

Syncs Apollo list contacts into **🎯 Outbound Leads** (and, from Stage 2, Smartlead campaign state). See `CLAUDE.md` for the design, the full list of synced versus human-edited columns, and the environment variables.

## ⚠️ Detach before decommissioning

This worker *attaches* to the existing Outbound Leads database. While attached, synced columns are read-only and rows can't be added or deleted by hand (archiving still works; see `CLAUDE.md`). If Apollo or Smartlead is ever dropped, run this first:

```shell
cd workers/outbound-sync && ntn workers databases detach outboundLeads
```

Detaching removes the read-only locks and keeps every row. Deleting the worker or removing its database declaration does **not** release the database: it stays locked with nothing able to release it.

## Setup

1. Deploy from the repo root: `./scripts/deploy.sh outbound-sync`
2. From `workers/outbound-sync`, set these with `ntn workers env set` (see `CLAUDE.md` for setting them straight from 1Password): `APOLLO_API_KEY` (1Password `apollo-api`), `SMARTLEAD_API_KEY` (`smartlead-api`) and `NOTION_API_TOKEN` (`notion-worker-automations`). Every Apollo contact list is synced, so there's no list setting.
3. Attach: `cd workers/outbound-sync && ntn workers databases attach outboundLeads 61a01f87-741b-4dbd-a98e-ada01e07eb3b` (the data source ID). **This starts a real sync straight away**, so step 2 must be complete and correct first.
4. Check the result: `ntn workers sync status --no-watch`. `ntn workers sync trigger <sync> --preview` shows what the next cycle would write without writing it.
5. Share the worker-created **Smartlead Campaigns** database with the `notion-worker-automations` integration (moving it under CRM > Databases does this). Then give Outbound Leads a one-way, single-page relation to it named exactly **Push to campaign**: it's the push webhook's input, and the webhook reads it by that name.
6. Create two database automations on Outbound Leads, each a **Send webhook** action with the default body: Status → Sequenced → the `pushToSmartlead` URL, and Status → Interested → the `promoteToContact` URL. Get the URLs from `ntn workers webhooks list` and keep them private; the URL is the only authentication.
