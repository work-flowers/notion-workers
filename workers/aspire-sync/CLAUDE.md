# aspire-sync

One-way, read-only sync of an Aspire business account into two Worker-managed databases. Built for TKT-1058 (Notion SG SME event demo, 12 Nov 2026) against **Aspire's sandbox**. It never sees workFlowers' real Aspire account.

| Key | Database | Data source | Primary key |
|---|---|---|---|
| `aspireAccounts` | Aspire Accounts (sandbox) | `bb6981ab-a698-4849-ad0e-6247dcaad732` | Account ID |
| `aspireTransactions` | Aspire Transactions (sandbox) | `e401054c-483b-427a-a0fd-a8067c702be5` | Transaction ID |

Transactions → Account is a two-way relation (reverse column: `Transactions` on Accounts). Both syncs run in **replace** mode, hourly, and re-read everything: there are 6 accounts and 67 transactions, which fit on one page each. A real account would need an incremental transactions sync keyed on `start_date`.

## Aspire API

- Docs: https://docs.api.aspireapp.com. The OpenAPI spec is at `https://docs.api.aspireapp.com/api/v1.yaml` and is malformed YAML (duplicate keys, unquoted colons), so read it as text, not with a parser.
- Sandbox base: `https://demo-api.demo.aspireapp.com/public/v1` (default). Production is `https://api.aspireapp.com/public/v1`; override with the `ASPIRE_BASE_URL` env var.
- Auth: `POST /login` with `{grant_type: "client_credentials", client_id, client_secret}` returns a bearer token (sandbox: 1800s, no refresh token). The worker logs in once per execution.
- The docs say Aspire whitelists caller IPs. The sandbox accepted both a laptop and the Workers runtime without any setup (verified 2026-11-11). Production may not.
- Rate limits: under 100 req/min per GET endpoint and for login. The pacer allows 60/min.
- **Amounts and balances are in the currency's smallest unit as Aspire defines it**: cents for SGD, HKD, EUR and USD, but whole rupiah for IDR, even though ISO 4217 gives IDR two decimals. `toMajorUnits()` hardcodes the zero-decimal set; extend it if a new currency shows up.

## Env vars

`ASPIRE_CLIENT_ID`, `ASPIRE_CLIENT_SECRET`, from 1Password `op://Shared/aspire-sandbox` (`username` and `credential`). Optional `ASPIRE_BASE_URL`. No `NOTION_API_TOKEN`: nothing here calls the Notion API.

## Quirks

- The sandbox data is obviously test data (counterparties like "test proxy" or "SANDBOX TEST ONLY"), and it is synced as-is by decision. Other Aspire testers write to the same sandbox, so rows can appear between runs.
- Select options are predeclared from what the sandbox returned. Missing values are written as empty, not `0` or `""`. The `EMPTY` helper in `index.ts` is an empty token array, which is what `Builder.number(NaN)` produces.
- Every row's page icon is the Aspire logo from logo.dev (`ASPIRE_ICON`, a publishable `pk_` token, fine in code). It is set on every upsert because the sync owns the page and an omitted icon would be cleared.
- Redeploys need `./scripts/deploy.sh aspire-sync --yes`: the worker owns databases, and `ntn` asks for confirmation it can't get non-interactively.
- Intended home was the workFlowers Demo workspace, but that workspace isn't on a Business/Enterprise plan, so Workers can't deploy there (checked 2026-11-11). It lives in work.flowers.
