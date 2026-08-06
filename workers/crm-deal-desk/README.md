# crm-deal-desk

A **custom block** (Notion alpha) that puts a small, opinionated CRM front end
over Notion CRM data sources — a proof of concept for the question *"can a
custom block be the way a team works, instead of the database grid?"*

It is not a dashboard. It reads and **writes**: it creates deals, edits them,
and refuses to save ones that break the rules.

## What it demonstrates

Three things clients ask for that Notion's own database UI cannot do:

| | Notion | Deal Desk |
|---|---|---|
| **Pre-filtered relation picker** | The Contact cell offers every row in Contacts | Picking a Company narrows Contact to that company's people |
| **Conditional gating** | Any field can be left blank in any stage | A deal cannot enter a stage until that stage's requirements are met, and the UI lists which ones are missing |
| **Cross-field integrity** | A contact from the wrong company saves silently | Blocked before the write, and named: *"Mei Lin works at Juniper Health, not this company"* |

The nearest Notion can get is an automation that comments on the page *after*
the bad value is saved — which, as the Slack thread that started this put it,
"no one sees".

### The empirical case

The **Needs attention** tab runs the same rules backwards over existing rows.
Against the demo CRM: **24 violations across 17 of 38 deals** — every one of
them created through Notion's own UI, which enforces none of the rules.

```
dealType 6 · value 4 · actualClose 4 · lostReason 3
expectedClose 2 · contactId 2 · contactMatch 2 · companyId 1
```

`test/rules.test.ts` asserts those figures, so the claim can't rot silently.

## Data: the template, not the live CRM

Bound to the **workFlowers CRM Template**, which is entirely fictional — this
gets screen-recorded and shown to people outside the company, so no real client
appears in it. Populated 2026-08-06 with 25 companies, 125 contacts, 38 deals.

| Key | Template data source |
|---|---|
| `deals` | ⚡️ Deals Template — `32091b07-11ac-8191-8e52-000bce02ed8c` |
| `companies` | Companies — `32091b07-11ac-8111-a8ea-000b970565cf` |
| `contacts` | Contacts — `32091b07-11ac-81cb-8870-000b814a326d` |

The manifest declares author-chosen *keys*, not a binding, so it maps onto a
client CRM with different property names without a code change.

## Running it

```bash
npm run dev:block --workspace=notion-worker-crm-deal-desk
```

Then open **<http://localhost:5175/?mock>**. Mock mode runs the whole app —
including create and edit — against a fixture mirroring the template, with
writes held in memory. No Notion, no binding, nothing written anywhere. This is
the mode to record demos in.

`?mock&relation=unbound` shows the degraded state when the Contacts data source
has no company relation mapped: the picker offers everyone and says so rather
than pretending it filtered.

```bash
npm run check --workspace=notion-worker-crm-deal-desk   # typecheck
npm test  --workspace=notion-worker-crm-deal-desk       # the rules
./scripts/deploy.sh crm-deal-desk                       # from the repo root
```

## Inserting it in Notion

Add it as a **custom block on a page** rather than a custom view on the Deals
database. A custom view auto-binds only its enclosing data source, and this
block needs three — the two extra ones would still need mapping by hand, and a
full-width page block is the better frame for "this is the app the team uses".

The config panel then maps the manifest keys onto real properties. `Stage` must
use the canonical stage names (Lead, Proposal, Negotiation, In signing, Closed
Won, Closed Lost, Declined) — the gating rules are defined per stage and can't
be inferred. Any of the seven the bound property doesn't offer is simply not
shown; the template has no **Declined**, and the block adapts.

## The rules

Cumulative by intent, spelled out per stage in `blocks/deal-desk/src/rules.ts`:

| Stage | Requires |
|---|---|
| Lead | a name |
| Proposal | + company, contact, type, value > 0 |
| Negotiation / In signing | + expected close date |
| Closed Won | name, company, contact, type, value > 0, actual close |
| Closed Lost / Declined | name, company, actual close, **lost reason** |

Plus one rule that applies everywhere: the contact must work at the linked
company.

Two deliberate asymmetries. A **lost** deal needs no value — deals die before
they're priced, and demanding a number just gets a fake one typed in. A **won**
deal does, because that is the figure the business reports on.

## Known limits

- **999 rows per data source, no server-side filter.** Everything is loaded and
  filtered in the browser. Fine here; the live workFlowers CRM is at 945
  contacts, and past 999 the Contact picker would silently stop seeing the
  newest people.
- **A block cannot open a Notion page.** No deep links to deals; Notion's own
  relation cells do the navigating.
- **The alpha makes breaking changes** — a deployed block can stop working until
  it's rebuilt against a newer SDK.

See [`docs/custom-blocks.md`](../../docs/custom-blocks.md) for what generalises
across blocks, and [`CLAUDE.md`](./CLAUDE.md) for decisions specific to this one.
