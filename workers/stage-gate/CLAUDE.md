# stage-gate

A **custom block** (Notion alpha), not a sync: a phase-by-phase checklist for one
project with an **Advance phase** button that only enables once every mandatory
item in the current phase is Complete or N/A. Built for the MRT vehicle-platform
demo (task TKT-936); written to be reusable across clients.

General custom-block mechanics live in [`docs/custom-blocks.md`](../../docs/custom-blocks.md).
This file records only what's specific to this block.

## Shape

- `src/index.ts`: the `worker.customBlock()` declaration (keys `projects`, `deliverables`).
- `blocks/stage-gate/src/checklist.ts`: **the hard-coded checklist**: phases,
  the 16 items, status names. The one file to replace per client. Planned next
  step: read it from a Checklist Definition database with per-language labels.
- `gate.ts`: all gate arithmetic, pure; covered by `test/gate.test.ts`.
- `rows.ts`: Notion values ↔ domain types, write shapes, binding checks.
- `store.ts` / `mock.ts`: the persistence interface and its in-memory `?mock`
  implementation (`?mock`, `&theme=dark`, `&project=a|b|c` to tag one as "This page").

## Decisions

- **Neutral styling.** NDS tokens only, no client or workFlowers branding, so it
  reads as part of whichever workspace shows it and follows light/dark.
- **Overview first, as a board.** The block opens on a kanban board, one
  column per phase plus Handed over (and "No phase" when needed). Cards show the
  current gate with a meter, the handover pack and a "Ready to advance" tag;
  clicking a card opens that project's gate, with a back link. Cards are **not
  draggable** on purpose: dragging between columns would bypass the gate. When the block sits
  on a project page, that card is tagged "This page" but is not auto-opened.
  Seeding only runs once a project is opened, never from the overview.
- **Creating a project.** "+ New vehicle platform" on the board takes a name,
  creates the row in the first phase with optional Make / Model / Variant
  (optional bindings: blank or unmapped fields aren't written), then opens it as soon
  as the subscription delivers the row, which seeds its checklist. The noun is
  `PROJECT_NOUN` in `checklist.ts`, the per-client file.
- **No checklist ≠ gate met.** A project with no deliverables can't advance;
  otherwise the empty phase would pass vacuously.
- **Complete needs evidence.** An item can only be marked Complete with a File
  link (`applyChange` in `gate.ts`); clicking Complete without one opens a link
  field with *Save & complete*. N/A and Pending need none, and a Complete item
  can't have its link removed. The rule applies to edits only: rows completed
  before it existed keep counting toward the gate and carry a *No file link*
  tag. Links are shown as text, not anchors, because the sandbox can't open them.
- **The gate is computed in the block**, not read from the `Gate ready` formula,
  because statuses update optimistically and the formula lags a round trip.
- **Seeding is automatic and conservative.** Rows are created only when the
  project has no deliverables by both counts (no loaded row points at it and its
  own `Deliverables` relation is empty), the window is fully loaded and not past
  999, and the binding is healthy. Creation is sequential and matched on
  `Item key`, so a part-failed seed is completed (not duplicated) by the
  **Create checklist** retry button. Two people opening an empty project at the
  same moment could still both seed; acceptable for the demo.
- **Writes.** Status, Completed date and File link together (date set on Complete, kept if
  already set, cleared on Pending/N/A); project Phase on advance. Never writes
  the helper formulas (`Project phase`, `In current phase`, `Open in current
  phase`, `Done`).
- **The gate is soft.** Phase can still be changed from a board view; say so in
  the demo.

## Binding (MRT demo workspace)

- Projects → 🛻 Vehicle Platform Projects `5ca111dd-7ee8-455b-a86c-edbf838d47e4`
- Deliverables → ✅ Deliverables `1c8f6744-631e-42da-aea9-0b1a3361220a`

Key names match the property names apart from case (`itemKey` → Item key,
`completedDate` → Completed date). A binding gap or a missing Phase/Status
option shows as a banner in the block.
