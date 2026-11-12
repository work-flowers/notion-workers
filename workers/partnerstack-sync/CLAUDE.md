# partnerstack-sync

One-way, read-only sync of workFlowers' PartnerStack **partner** account into three Worker-managed data sources. It covers every program the account belongs to (Notion Setup Sessions, Notion, Notion Consultants, Xero).

| Key | Data source | ID | Primary key | Source | Schedule |
|---|---|---|---|---|---|
| `partnerstackPrograms` | PartnerStack Programs | `15e7c385-0767-4d6e-b088-d432b5c2649d` | Program Key (`co_…`) | `GET /api/v2/partnerships` | 1d |
| `partnerstackRewards` | PartnerStack Rewards | `18b59246-92fc-4a7a-b29d-de8dcb6f5a66` | Reward Key | `GET /api/v2/rewards` | 6h |
| `partnerstackPayouts` | PartnerStack Payouts | `2e504b8f-1d7d-4d87-a45a-f52a22f7bd82` | Payout Key | `GET /api/v2/payouts` (+ rewards) | 6h |

They were created at the workspace root on first deploy (2026-11-12) and have since been moved into one "Partnerstack" database. Moving them doesn't affect the sync.

Relations, all two-way:

- Rewards `Partner Program` ↔ Programs `Rewards`, from the reward's `company.key`. The `Program` select on Rewards duplicates it for grouping and colour.
- Payouts `Programs` ↔ Programs `Payouts`, and Payouts `Rewards` ↔ Rewards `Payout`. **Both are inferred**; see "Matching payouts to rewards" below.

**`Description` on Programs is human-owned**: it was added by hand and is deliberately not declared in `worker.database()`, which would make it read-only. A programs re-sync leaves it alone (verified 2026-11-12). PartnerStack has no description for private programs: `offers` is all-null on partnerships, and only Xero has a public marketplace listing.

All syncs are **replace** mode and re-read everything. The API has no updated-since filter, and rewards change status (`pending → approved → paid`) weeks after they are created, so a created-at delta would miss most changes. Volumes are small enough to fit one page each (the limit is 250). If it ever grows large, the rewards endpoint takes `min_created`, which would allow a created-at backfill paired with a replace sync over recent months.

## Matching payouts to rewards

The API never links a payout (a bank withdrawal, `pay_…`) to the rewards it paid. A reward's integer `payout_id` is not a payout key, and `/v2/payouts/{payout_id}` returns 404. But every withdrawal so far equals one reward batch (rewards sharing a `payout_id`) minus a small withdrawal fee. `matchPayoutsToBatches()` links a payout to the batch whose total exceeds it by at most $5, and only when that pairing is unique in both directions. Every payout matched when this was built (2026-11-12). The batch id and the fee are written to the payout (`Payout Batch`, `Fee`). A payout's `Programs` counts only programs with non-zero rewards in its batch. Ambiguous or unmatched payouts are left unlinked and logged.

## Program summary block (`programSummary`)

A custom block in `blocks/program-summary/` (general guide: [`docs/custom-blocks.md`](../../docs/custom-blocks.md)). It is meant for **PartnerStack Programs row pages**. There it uses `usePage().id` to find its program and shows that program's totals by status, paid vs scheduled amounts by payment month, the payouts that included it (with the program's share of each), and its rewards. Placed anywhere else, it shows an overview of all programs.

- Binds three data sources: Programs (`name`), Rewards (`name`, `program` = **Partner Program relation**, `payout`, `amount`, `status`, `paymentDate`, `created`) and Payouts (`name`, `amount`, `status`, `fee`, `withdrawn`, `sent`, `created`).
- **Everything is joined from the Rewards side.** Each reward holds one program id and one payout id. The many side (Programs.Rewards, Payouts.Rewards) would hit Notion's 25-id relation cap, and the Notion program already has more than 25 rewards.
- **Place it in the Programs page layout**, not in each page body. Custom blocks are native page-layout modules, either as a tab of their own or as a view inside the main Content tab, so one placement covers every program page (per the user, 2026-11-12). The Notion MCP's `update-data-source` `page_layout` schema has no custom-block module yet, so this is done in the UI. Pasting it into page bodies with `/` also works, but each instance is then bound separately.
- **Untested: whether `usePage()` inside a layout module returns the row's page id**, which per-program filtering depends on. If the block shows the all-programs overview on a program page, that's the first thing to check.
- `aggregate.ts` is pure; `test/aggregate.test.ts` covers totals by status, months, a payout shared by two programs, an empty program and the overview. `?mock` renders the overview, and `?mock&program=prog_setup` (any fixture program id) renders one program's view. Both use `mock.ts`, a **fictional** fixture shaped like the real data. **This repo is public: never commit a real PartnerStack snapshot or real amounts**, here or in tests, docs or commit messages. Dev server: `partnerstack-program-summary` in `.claude/launch.json`.
- The worker moved to TypeScript 6 along with the block. TS 6 stops auto-including `@types/*` and the old ES2020 target lacks `Array.at`, so `tsconfig.json` sets `types: ["node"]` and ES2022. Without that, the cloud build fails while a local check that resolves TS 5 still passes.

## PartnerStack API

- Partner API key from the PartnerStack dashboard's user settings, sent as `Authorization: Bearer <key>`. Base: `https://api.partnerstack.com/api/v2`.
- Pagination: `limit` (max 250) plus `starting_after=<last item key>`, with `data.has_more`.
- No rate limit is published and no rate-limit headers are returned. The pacer allows 60/min.
- **The live partner-side response differs from the published reference** (https://docs.partnerstack.com/reference/get_v2-rewards-2). Rewards have `company` (= the program), `payment_date`, `payment_status` (`available` | `withdrawn`) and `payout_id` at the top level, and no `partnership` object. `src/partnerstack.ts` types what actually came back.
- Amounts are in cents.

## Data quirks

- **Notion Setup Sessions pays one lump-sum reward per month** ("PartnerStack Payout: work.flowers (Sep 1 - 30 2026)"), with no per-session detail. The other Notion program has one reward per referral event, and many of those are $0 "application submitted" rows.
- Notion referral customers are anonymised (`<sha256>@notion.internal`). The worker strips the trailing " - $0.00 USD purchase by …" from titles and keeps only `Customer Key`, which pairs a referral's "submitted" and "approved" rewards.
- **Attributing referrals to a teammate.** `Referred By` is the referral customer's `sub_ids`, joined with ", ". It is the only per-person signal the partner API exposes. The dashboard's link report (team member, link) is vendor-only: `GET /v2/links/partnership/{id}` exists but returns 401 to a partner key. Customers carry no link key, and `has_paid` doesn't help either, since it is true for most of them. Teammates must therefore append a sub ID to their link. Referrals from before that stay blank and can't be attributed from the API (2026-11-12).
- **The Notion program pays for Startup trial events, not revenue**: $0 when an application is submitted and a flat amount when it is approved, whether or not the customer ever pays. So the dashboard's per-link "Total commissions" is always $0, and its "Revenue" and "Paid signups" earn nothing directly. Its overview also mixes scopes: clicks, paid signups and revenue count link-attributed activity only, while signups and commissions count the whole partnership.
- `Country` is `transaction.category_key`, which the Notion program uses for the referral's country.
- A reward's `payout_id` (an integer) is stored as `Payout Batch`.
- The Notion API returns at most 25 items per relation property, so `ntn datasources query` caps the Notion program at "25 related" even though all of its rewards are linked.
- `/v2/payouts` rows are bank withdrawals. `provider.meta` holds the beneficiary bank details. It is deliberately not synced, and only `provider.name` is kept.
- Unknown select values (a new program or status) are a risk because options are predeclared. Add them to the schema if a run fails on one.

## Env vars

`PARTNERSTACK_API_KEY`, from 1Password `op://Private/partnerstack-api/credential`. No `NOTION_API_TOKEN`: nothing here calls the Notion API.

Local dry run: `ntn workers exec --local` can't find `tsx` in the workspace layout. Call `worker.run("<syncKey>", {})` from a tsx script run inside this directory instead.
