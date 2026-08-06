# crm-deal-desk

A **custom block** capability (Notion alpha), not a sync. See `README.md` for
what it does and how to bind it.

**How custom blocks work in general — project shape, the Vite `root` pin,
block-vs-view placement, manifest binding, what the sandbox forbids — lives in
[`docs/custom-blocks.md`](../../docs/custom-blocks.md).** Read that first; this
file records only what is specific to *this* block.

## Shape

- `src/index.ts` — the `worker.customBlock()` declaration (three data sources).
- `blocks/deal-desk/src/rules.ts` — **every rule, as pure functions.** No React,
  no SDK imports. This is the product; the UI is a rendering of it, and
  `test/rules.test.ts` exercises it directly.
- `blocks/deal-desk/src/rows.ts` — the only module that knows Notion's value
  shapes, in both directions.
- `blocks/deal-desk/src/mock.ts` — a fixture mirroring the CRM template.

## This block writes

Unlike `newsletter-dashboard`, this is not read-only. It creates deals via
`pages.create({ parent: { type: "data_source_key", key: "deals" } })` and edits
them via the row's own `update()`. **Relations are writable** —
`{ type: "relation", relation: [{ id }] }` — which is the thing that makes a
constrained CRM front end possible at all.

`row.update()` resolves manifest keys to raw property ids; the top-level
`pages.update()` would need the raw ids spelled out. Prefer the row helper when
you have a row.

`toProperties()` writes **every** field on every save, nulls included. Clearing
matters: moving a deal out of Closed Lost has to actually remove the lost
reason, and an omitted key silently leaves the old value in place.

## The rules are the point

- **Requirements are per stage, spelled out, not chained.** The closed stages
  genuinely diverge — a lost deal needs no value, a won one does — and
  `...previousStage` would hide that. Read the table in `README.md` before
  changing any of them.
- **`contactChoicesFor` returns a union, not an array.** "Pick a company first"
  and "this company has nobody on record" are different problems with different
  fixes; a bare `[]` collapses them into a dropdown that looks broken. The
  fourth case, `unfiltered`, is the honest degraded mode when the Contacts
  binding has no company relation — it says so rather than implying it filtered.
- **`orphanedContact` exists because a mismatched contact is invisible.** The
  picker only lists eligible people, so a wrong contact renders as *no
  selection* while the requirement complains about it — which reads as a bug.
  Naming the person and their real employer is what makes it actionable. Don't
  "simplify" this away.
- **Unknown ids are not violations.** `contactMismatch` returns false for a
  contact outside the loaded 999-row window. Accusing it would make the audit
  lie as the CRM grows.
- **Stages come from the bound schema**, filtered to the seven the rules know.
  The template has no **Declined**; offering it would produce a save that fails
  at the API rather than a button that was never enabled.

## Design: workFlowers, deliberately not Notion

`newsletter-dashboard` uses NDS tokens so it dissolves into the page. This block
does the opposite, on request: it is a *product surface* a client's team works
in instead of the database grid, so it looks like a workFlowers app. Chosen
knowingly against the alpha's house guidance.

Two consequences, both intended:

- **It does not track the page theme.** The brand has no dark mode
  (`tokens/colors.css` is light-only) and half-inventing one would produce a
  third palette belonging to neither system. The block paints its own light
  surface. `useTheme()` and `<NotionTokenScope>` are therefore unused — don't
  reintroduce them without also solving the dark palette.
- **Fonts are bundled, not linked.** The brand's `typography.css` pulls Inter
  and JetBrains Mono from the Google Fonts CDN; the sandbox blocks cross-origin
  requests and the `@import` fails *silently*, leaving system sans.
  `@fontsource-variable/inter` and `@fontsource/jetbrains-mono` are imported
  from `index.tsx` instead.

Tokens are **copied** into `deal-desk.css`, not imported — the design system
lives outside this repo. Keep them in sync by hand; they're the brand's values,
not this block's, so don't tune them here.

Dropping NDS also took the CSS bundle from 200 kB to 39 kB.

## The fixture is fake on purpose

`mock.ts` mirrors the **workFlowers CRM Template**, not the live CRM, because
this gets screen-recorded and shown externally. A test asserts that no real
client name appears in it — keep that test passing.

Two properties about its shape are load-bearing, not decoration:

- **Contact counts vary a lot** (Marina Freight 18, Saffron & Salt 1, Bluefin
  and Pelican Bay zero). The first fixture only contained contacts already named
  on a deal, which narrowed 48 people to 2 and made the filter demo *understate*
  itself. A picker that offers two names doesn't look like it's saving you from
  anything.
- **Two companies have nobody**, which is the only way to reach the
  "no contacts at this company" branch.

Ids are synthetic slugs (`co-marina`), not the template's page ids. Nothing
round-trips to a real page, so a readable id is worth more than a faithful one.

## The template CRM was modified

Setting this up added to `workFlowers CRM Template` (2026-08-06):

- `Type` and `Lost Reason` **select properties on ⚡️ Deals Template** — it had
  neither, and the gating rules need both.
- 20 companies, 120 contacts, 33 deals of generated fake data.

`Deal Stage` still has no **Declined** option; the block adapts rather than the
template being changed further. If you re-populate, re-measure the audit figures
in `test/rules.test.ts` rather than loosening the assertions — the number being
real is the whole argument.
