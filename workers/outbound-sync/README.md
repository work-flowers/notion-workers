# outbound-sync

Syncs Apollo list contacts into **🎯 Outbound Leads** (and, from Stage 2, Smartlead campaign state). See `CLAUDE.md` for the design, the full list of synced versus human-edited columns, and the environment variables.

## ⚠️ Detach before decommissioning

This worker *attaches* to the existing Outbound Leads database. While attached, synced columns are read-only and rows can't be added or deleted by hand. If Apollo or Smartlead is ever dropped, run this first:

```shell
cd workers/outbound-sync && ntn workers databases detach outboundLeads
```

Detaching removes the read-only locks and keeps every row. Deleting the worker or removing its database declaration does **not** release the database: it stays locked with nothing able to release it.

## Setup

1. `ntn workers env set ZAPIER_CLIENT_ID=… ZAPIER_CLIENT_SECRET=… APOLLO_CONNECTION_ID=02b3ee04-e9e5-88ba-929d-5fc5f76b65b1 APOLLO_LIST_IDS=<id>[,<id>…]`
2. Deploy from the repo root: `./scripts/deploy.sh outbound-sync`
3. Attach: `cd workers/outbound-sync && ntn workers databases attach outboundLeads 61a01f87-741b-4dbd-a98e-ada01e07eb3b` (the data source ID)
4. Preview without writing: `ntn workers sync trigger apolloLeads --preview`
5. First real run: `ntn workers sync trigger apolloLeads`
