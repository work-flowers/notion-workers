# stage-gate

A Notion **custom block** (alpha) that turns a project page into a stage-gated
checklist: each phase is a section, items are marked Pending / Complete / N/A
inline, and **Advance phase** only enables once every mandatory item in the
current phase is done. Neutral styling (Notion's own design tokens), no branding.

## What it does

- Opens on a board of all projects, one column per phase; click a card to open its gate.
- Creates a new project from the board (name, plus optional make, model and variant; it starts in Phase 1).
- Creates the checklist rows for a project that has none, linked to the project.
- Shows completed phases collapsed and ticked, the current phase open, future
  phases greyed out; plus the current gate (e.g. 2/3) and the handover pack
  (e.g. 13/16).
- Requires a file link before an item can be marked Complete.
- Allocates each item to an owner from a picker of workspace members.
- Advances the project's Phase, ending at "Handed over".
- Switches the interface between English and Vietnamese (EN / VI, top right). Data in Notion stays English.

## Use it

1. Deploy: `./scripts/deploy.sh stage-gate` from the repo root.
2. On any page, type `/` and insert the **stageGate** custom block.
3. Map **Projects** and **Deliverables** to the two data sources and their
   properties in the block's config panel. Any gap shows as a banner.

## Develop

```bash
npm run dev:block --workspace=notion-worker-stage-gate
```

Then open `http://localhost:5173/?mock` (`&theme=dark`, `&project=a|b|c` to tag a
project as "This page"). Platform C starts empty and exercises seeding.

```bash
npm test --workspace=notion-worker-stage-gate
```

The checklist itself is `blocks/stage-gate/src/checklist.ts`.
