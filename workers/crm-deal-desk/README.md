# crm-deal-desk

A **custom block** (Notion alpha) that puts a three-tab CRM front end —
**Contacts, Companies, Deals** — over the live workFlowers CRM. It began as the
Deal Desk proof of concept (a gated pipeline over a fictional template) and
keeps that question at its centre: *can a custom block be the way a team
works, instead of the database grid?*

It reads and **writes**: it creates and edits deals, contacts and companies,
and refuses to save ones that break the rules. Every record renders its
linked **Meeting Notes** and **Emails**, the way the native Notion page does.

## What it demonstrates

| | Notion | CRM Desk |
|---|---|---|
| **Pre-filtered relation picker** | The Contact cell offers every row in Contacts | Picking a Company narrows Contact to that company's people |
| **Conditional gating** | Any field can be left blank in any stage | A deal cannot enter a stage until that stage's requirements are met, and the UI lists which ones are missing |
| **Cross-field integrity** | A contact from the wrong company saves silently | Blocked before the write, and named: *"Mei Lin works at Juniper Health, not this company"* |
| **Duplicate awareness** | A second "Marina Freight Pte Ltd" saves silently | Suffix- and domain-insensitive hint next to the save button; the person decides |
| **List filters** | Filtering a view edits it for everyone who opens the page | Contacts and Companies filter per person, per session — company, lead source, country and deal activity — with no view to put back |

### The empirical case

The **Needs attention** view runs the stage rules backwards over existing
rows. Against the demo fixture: **20 violations across 16 of 38 deals** —
every one created through Notion's own UI, which enforces none of the rules.

```
dealType 6 · value 4 · lostReason 3 · expectedClose 2
contactId 2 · contactMatch 2 · companyId 1
```

`test/rules.test.ts` asserts those figures, so the claim can't rot silently.
(It was 24 across 17 when the closed stages still demanded a close date.)

## Data: the live CRM

Bound to the data sources under the **📇 CRM** page
(`21991b07-11ac-811d-ad9c-f4a7103368f8`), which is also where the block is
inserted. The manifest declares author-chosen *keys*; the config panel maps
them onto real properties. **The declared type must equal the property's type
exactly** (`status`, `people`, `phone_number`, `url`…) or the key silently
resolves to unbound — the Diagnostics footer lists every unbound key.

| Key | Live data source | id |
|---|---|---|
| `deals` | Deals (Core CRM Objects) | `21a91b07-11ac-808d-9657-000b1390d20b` |
| `companies` | Companies (Core CRM Objects) | `21991b07-11ac-80b0-b787-000b3d3995f6` |
| `contacts` | Contacts (Core CRM Objects) | `21991b07-11ac-81a6-a894-000be4a09a67` |
| `fxRates` | FX Rates (managed by `fx-rates`) | `8c31c25c-da91-4480-88e6-369491ba04d6` |
| `meetingNotes` *(optional)* | Meeting Notes | `19891b07-11ac-8137-9d62-000b75fab86e` |
| `emails` *(optional)* | Emails | `1e491b07-11ac-80ce-8b86-000b29ba4f68` |

### Binding checklist

Every key's description in the config panel names the live property; this is
the same list.

**deals** — `name`→Deal Name · `stage`→Status · `dealType`→Type · `value`→Value
· `currency`→Deal Currency · `probability`→Probability · `expectedClose`→Expected
Close · `actualClose`→Actual Close · `company`→Company · `contact`→Contact ·
`referredBy`→Referred by · `lostReason`→Lost Reason · `description`→Description
· `owner`→Owner · `meetingNotes`→Meeting Notes · `emails`→Emails

**companies** — `name`→Company Name · `website`→Website ·
`description`→Description · `industry`→Industry · `size`→Size ·
`country`→Country · `contacts`→Contacts · `deals`→Deals · `meetingNotes`→Meeting
Notes · `emails`→Emails

**contacts** — `name`→Name · `firstName`→First Name · `lastName`→Last Name ·
`jobTitle`→Job Title · `email`→Primary Email · `phone`→Primary Phone ·
`linkedin`→Linkedin · `note`→Note · `leadSource`→Lead Source ·
`country`→Country · `owner`→Owner · `company`→Related Company · `deals`→Deals ·
`meetingNotes`→Meeting Notes · `emails`→**📥 Emails** (emoji prefix)

**fxRates** — `currency`→Currency · `rateToSgd`→Rate to SGD · `rateDate`→Rate
Date

**meetingNotes** — `title`→Title · `date`→Date · `type`→Type · `summary`→Summary

**emails** — `title`→Subject · `date`→Date Received · `from`→From ·
`summary`→Thread Summary

### Why Meeting Notes and Emails are (only optionally) bound

A `useDataSource` subscription caps at **999 rows** and, as of
`@notionhq/custom-blocks` 0.1.44, can filter and sort server-side on most
scalar properties — but **not on relations**. Both databases are far past 999
rows, so "the notes linked to this deal" cannot be expressed as a query. The
block reads them per record instead: `pages.get` on each relation id, newest
end first, 30 per batch, 4 in flight, 8 s timeout, memoised for the life of
the sandbox. The optional bindings sort each database newest-first and hold
the 999 most recent rows as a warm cache, so recent activity paints instantly
and only older ids cost a fetch. Leave them unbound and everything goes
through `pages.get`.

### How the other windows use filter and sort

| Window | Query |
|---|---|
| Open pipeline | `Status in [Lead, Proposal, Negotiation, In signing]`, newest created first |
| Closed deals | `Status in [Closed Won, Closed Lost, Declined]`, newest Actual Close first, 200 at a time |
| Companies | sorted by name |
| Contacts | newest created first, so the cap drops the oldest people |
| Contact search (only while the contact window is capped) | `Name contains …`, 50 rows — reaches past the window; email/title search stays client-side (`or` is unsupported) |

### The Contacts and Companies list filters

Both list panes carry four filters under the search box: **company, lead
source, country, deal activity** on Contacts, and **industry, size, country,
deal activity** on Companies. They are client-side and per session — nobody
else's view changes, and there is nothing to undo afterwards.

- They run over the **loaded window**, not the whole database. When Contacts is
  capped, the count line says *"filtered within the loaded contacts"* rather
  than implying the filter saw everything.
- Filters apply **before** the search, because `searchContacts` caps its result
  at 200 and filtering afterwards would drop matches the filter had kept.
- **"Has an open deal"** is read from the loaded deals — sound, because the
  store holds every open deal. **"No deals"** is read from the record's own
  relation ids instead, which cover the closed deals that were never loaded.
  A record whose only deal is an unloaded closed one is therefore neither, and
  that is correct.

Client-side filters are kept as a guard: an old Notion client ignores filter
and sort silently, and the block detects that (a closed deal in the open
window) and says so.

## Running it

```bash
npm run dev:block --workspace=notion-worker-crm-deal-desk
```

Then open **<http://localhost:5175/?mock>**. Mock mode runs the whole app —
all three tabs, create and edit, linked activity — against a fictional fixture,
with writes held in memory. No Notion, no binding, nothing written anywhere.
This is the mode to record demos in.

- `?mock&slow` — page fetches take 1.5 s, to see the loading states.
- `?mock&truncated` — pretends the contact window hit the 999 cap (the banner).
- `?mock&relation=unbound` — the degraded picker when Contacts has no company
  relation mapped.
- **Diagnostics** (collapsed footer of the live block; `?debug` opens it) — binding health per data source, the raw people value,
  and a `pages.get` probe on one meeting note and one email.

```bash
npm run check --workspace=notion-worker-crm-deal-desk   # typecheck worker + block
npm test  --workspace=notion-worker-crm-deal-desk       # rules, records, linked
./scripts/deploy.sh crm-deal-desk                       # from the repo root
```

## Inserting it in Notion

Add it as a **custom block on the CRM page**, not a custom view on a database.
A custom view auto-binds only its enclosing data source, and this block needs
four (six with the caches). After a deploy that changes the manifest, existing
instances are prompted to remap — do that on the CRM page instance only. The
template-demo instance lacks Declined, FX Rates and most of the new
properties; it will show unbound keys and degrade, which is expected.

## The rules

Spelled out per stage in `blocks/crm-desk/src/rules.ts`:

| Stage | Requires |
|---|---|
| Lead | a name |
| Proposal | + company, contact, type, value > 0 |
| Negotiation / In signing | + expected close date |
| Closed Won | name, company, contact, type, value > 0 |
| Closed Lost / Declined | name, company, **lost reason** |

Plus one rule that applies everywhere: the contact must work at the linked
company.

- **No stage asks for the actual close date.** A database automation stamps
  `Actual Close` when a deal enters a closed stage; the block shows it
  read-only and writes it back unchanged.
- **The lost reason covers Closed Lost *and* Declined** (the property's own
  description says so) and is **cleared on save** when a deal leaves those
  stages, so a revived deal doesn't carry a reason it was lost.
- A **lost** deal needs no value — deals die before they're priced. A **won**
  deal does, because that is the figure the business reports on.

Contacts and companies have lighter rules (`records.ts`): a name (first + last
will do), and a well-formed email or URL *if* one is given. Duplicate hints
never block.

### Currency

`Value` has no currency format in the CRM; the currency is the `Deal Currency`
relation to an FX Rates row. The header total converts every open deal to SGD
through `Rate to SGD`. A deal with no currency is taken as SGD (the
pre-relation convention); a currency whose rate hasn't synced counts as
"no value or rate" rather than being guessed.

## Known limits

- **999 rows per subscription.** Each window is its own subscription, so open
  and closed deals don't compete, and Contacts drops its *oldest* rows first.
  When a window is capped a banner says so and the search box asks Notion
  directly. If Contacts ever outgrows one window, the escape hatch is a real
  **checkbox** property maintained by an automation (formulas and rollups are
  not filterable) that the block can filter on.
- **A block cannot open a Notion page.** Linked notes and emails are rendered
  in place (title, date, type or sender, summary); there is nothing to click
  through to.
- **Linked activity is newest-first only within what has loaded.** Relation
  order is used as a proxy for recency when choosing what to fetch first; the
  "Load more" label says how many older items remain.
- **People are read-only.** Owners are shown, never written.
- **The alpha makes breaking changes** — a deployed block can stop working until
  it's rebuilt against a newer SDK.

See [`docs/custom-blocks.md`](../../docs/custom-blocks.md) for what generalises
across blocks, and [`CLAUDE.md`](./CLAUDE.md) for decisions specific to this one.
