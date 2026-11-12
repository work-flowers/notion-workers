# aspire-sync

Syncs an [Aspire](https://aspireapp.com) business account's bank accounts and
transactions into Notion. It was built for a Notion SME event demo and runs
against **Aspire's sandbox**, so everything it shows is Aspire's test data,
never a real account.

## What it syncs

Two Worker-managed data sources, both read-only in Notion and refreshed hourly:

| Data source | Aspire endpoint | One row per |
|---|---|---|
| Aspire Accounts (sandbox) | accounts | bank account: currency, available balance, type, status, bank |
| Aspire Transactions (sandbox) | transactions | transaction: date, signed amount, currency, direction, status, channel, spend category, counterparty, fee, FX details, card |

Each transaction links to its account through a two-way relation (the reverse
column on Accounts is `Transactions`). Every row's page icon is the Aspire
logo.

Both syncs re-read everything on each run. That's cheap at sandbox scale; a
real account would need an incremental transactions sync instead.

### Amounts

Aspire sends amounts in each currency's smallest unit **as Aspire defines it**:
cents for SGD, USD, EUR and HKD, but whole rupiah for IDR. The sync converts
to major units, so `Amount`, `Balance After` and `Fee` read as ordinary money.
Debits are negative.

## Setup

| Variable | Value |
|---|---|
| `ASPIRE_CLIENT_ID` | sandbox client id (1Password) |
| `ASPIRE_CLIENT_SECRET` | sandbox client secret (1Password) |
| `ASPIRE_BASE_URL` | optional; defaults to the sandbox API |

```shell
cd workers/aspire-sync
ntn workers env set ASPIRE_CLIENT_ID=... ASPIRE_CLIENT_SECRET=...
```

The worker logs in with client credentials once per run. It doesn't call the
Notion API, so it needs no `NOTION_API_TOKEN`.

## Develop and deploy

```shell
npm run check --workspace=notion-worker-aspire-sync
./scripts/deploy.sh aspire-sync --yes
```

`--yes` is needed because the worker owns databases. After a deploy, run the
syncs by hand rather than waiting for the hour:

```shell
cd workers/aspire-sync
ntn workers sync trigger aspireAccountsSync
ntn workers sync trigger aspireTransactionsSync
```

## Caveats

- The sandbox is shared with other Aspire testers, so rows can appear between
  runs, and some carry obvious test names. They're synced as-is.
- Select options (currencies, statuses, spend categories) are declared in
  advance from what the sandbox returned. A new value may need adding to the
  schema.
- Pointing it at production Aspire would need more than a new base URL: Aspire
  may require the caller's IP to be allow-listed, and the transactions sync
  should become incremental.

More detail for maintainers is in [`CLAUDE.md`](CLAUDE.md).
