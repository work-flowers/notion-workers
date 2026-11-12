# partnerstack-sync

Syncs our PartnerStack **partner** account into Notion, so the rewards and
payouts of every partner program we belong to can be read in Notion instead of
PartnerStack's dashboard. It also ships a custom block that summarises one
program on that program's page.

It covers every program the account is in (currently Notion Setup Sessions,
Notion, Notion Consultants and Xero). There is nothing to configure per
program: a new program appears on the next daily run.

## What it syncs

Three Worker-managed data sources, all read-only in Notion:

| Data source | PartnerStack endpoint | Schedule | One row per |
|---|---|---|---|
| PartnerStack Programs | `GET /api/v2/partnerships` | daily | program we're in |
| PartnerStack Rewards | `GET /api/v2/rewards` | every 6h | reward (a commission, or a $0 tracked event) |
| PartnerStack Payouts | `GET /api/v2/payouts` | every 6h | withdrawal to our bank account |

They are linked by two-way relations:

- **Rewards ↔ Programs**, from the program each reward belongs to.
- **Payouts ↔ Rewards** and **Payouts ↔ Programs**, inferred (see below).

Every sync re-reads everything on each run. PartnerStack has no "changed
since" filter, and a reward's status moves from pending to approved to paid
weeks after it is created, so an incremental sync would miss most changes.

Bank details from the payouts endpoint are deliberately not synced; only the
provider's name is kept.

### How payouts are matched to rewards

PartnerStack never says which rewards a withdrawal paid. Each reward carries a
numeric payout batch id, but that id isn't the payout's key and can't be looked
up. What does hold is that every withdrawal so far equals one batch's total
minus a small withdrawal fee. So the payouts sync links a payout to the batch
whose total exceeds it by at most $5, and only when that pairing is unique in
both directions. Each linked payout also records its batch id and the fee.

Anything ambiguous or unmatched is left unlinked and noted in the run's log,
rather than guessed.

### The Description column

**Programs → Description** is written by hand, not by the sync. PartnerStack
has no description for private programs, so it was added as an ordinary
editable column and is left alone by every run. Don't add it to the worker's
schema: declaring it would make it read-only.

## Program summary block

`programSummary` is a custom block for **program pages**. On a program's page
it works out which program it's on and shows:

- **Totals**: paid (with the last payment date), awaiting payment (approved vs
  pending, with the next payment date), declined, and the number of rewards.
- **By payment month**: paid and scheduled amounts, with values in a tooltip on
  hover.
- **Payouts including this program**, with this program's share of each. A
  payout can combine several programs.
- **Rewards**, newest first, with the $0 tracked events behind a checkbox.

Placed anywhere other than a program page, it shows an overview of all
programs instead.

### Adding it to the program pages

Add it once, to the **PartnerStack Programs page layout**, and every program
page gets it. Custom blocks are native page-layout modules, placed either:

- as a **tab** of its own, next to the page's Content tab, or
- as a view **inside the main Content tab**.

Then map the block's three data sources in its settings:

| Block data source | Notion data source | Properties |
|---|---|---|
| Programs | PartnerStack Programs | Name |
| Rewards | PartnerStack Rewards | Name, **Partner Program** (the relation, not the `Program` select), Payout, Amount, Status, Payment Date, Created |
| Payouts | PartnerStack Payouts | Name, Amount, Status, Fee, Withdrawn, Sent, Created |

Most properties match by name automatically.

The block can also be typed into any page body with `/`, as an ordinary block.
On a program page it behaves the same; anywhere else it shows the overview.

## Setup

One environment variable: `PARTNERSTACK_API_KEY`, the partner API key from
PartnerStack's user settings (stored in 1Password). The worker doesn't call
the Notion API, so it needs no `NOTION_API_TOKEN`.

```shell
cd workers/partnerstack-sync
ntn workers env set PARTNERSTACK_API_KEY=...
```

## Develop

From the repo root:

```shell
npm run check --workspace=notion-worker-partnerstack-sync
npm run test --workspace=notion-worker-partnerstack-sync
npm run dev:block --workspace=notion-worker-partnerstack-sync -- --port 5179
```

Then open `http://localhost:5179/?mock` for the overview, or
`?mock&program=prog_setup` for one program. `&theme=dark` is also honoured.

`?mock` and the tests use `blocks/program-summary/src/mock.ts`, a **fictional**
fixture shaped like the real data. This repo is public: never replace it with a
real PartnerStack snapshot, and keep real amounts out of tests, docs and commit
messages.

## Deploy

```shell
./scripts/deploy.sh partnerstack-sync --yes
```

`--yes` is needed because the worker owns databases. Deploying the worker also
ships the block. Then trigger the syncs, Programs first so the relations have
something to point at:

```shell
cd workers/partnerstack-sync
ntn workers sync trigger programsSync
ntn workers sync trigger rewardsSync
ntn workers sync trigger payoutsSync
```

## Caveats

- PartnerStack's partner API returns a different shape from its published
  reference; `src/partnerstack.ts` types what actually comes back.
- Select options (programs, statuses) are declared in advance. A value the
  schema doesn't know may fail a run; add it to the schema if so.
- Custom blocks are a Notion alpha. A deployed block can stop working until it
  is rebuilt against a newer SDK; redeploying usually fixes it.

More detail for maintainers, including data quirks and the matching rules, is
in [`CLAUDE.md`](CLAUDE.md).
