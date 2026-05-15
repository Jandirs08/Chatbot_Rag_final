---
name: design-polish
description: Use this skill to TRANSFORM admin views of the Aleph RAG platform against design.md v2 (Deep Signal). Goes beyond recoloring — applies hero zones, bento layouts, motion primitives, decor SVG metáforas RAG, dominio cromático per view, sparklines, TickNumber, glow shadows, ilustrated empty states, iconografía obligatoria. Each view transform ends with an automated reviewer agent audit. Routes through impeccable subcommands for craft/critique/polish/bolder when applicable. Project-local skill, ships with repo.
user-invocable: true
argument-hint: "[transform|audit|polish|bolder|inventory] [view-path]"
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash
  - Agent
---

# design-polish — Aleph Deep Signal v2 Transformer

Transforms admin views surgically per `design.md` v2. Not a recolor — full visual reskin with motion, layout, decor, iconography, dominio cromático combinations.

## Hard rules

1. **Surgical scope:** ONE view per invocation. Touch only that view's files (`page.tsx` + view-local `_components/`). Never refactor shared primitives, sidebar, layout shell, data hooks, or API. If something cross-cutting blocks the transform, surface it as a separate task — never auto-expand.
2. **Context first:** always run setup before touching code (next section).
3. **Receta paleta per view:** never monocromatic. Apply the prescribed combination from `reference/views-roadmap.md`. Max 3 accents simultaneously beyond primary.
4. **Iconografía obligatoria:** every section header has an icon, every CTA has icon+label, every empty state has icon + decor SVG, every status badge has icon.
5. **Verify before done:** `npx tsc --noEmit` must pass. Checklist v2 (15 items) must be marked. Reviewer agent must report no critical ❌.
6. **No new primitives inline:** if a needed primitive is missing, halt and surface as a new sub-PR. Never invent one-off motion/icon/decor inside a view file.
7. **No raw Tailwind palette colors:** `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `red-*`, `purple-*`, `violet-*`, `indigo-*`, `amber-*`, `orange-*` BANNED in view code. Use semantic tokens or `accent-{violet,cyan,magenta}` utilities.

## Setup (run once per invocation)

Before any view work, load context:

```bash
node .claude/skills/design-polish/scripts/load-aleph-context.mjs
```

Consume the full JSON output. It bundles:
- `design.md` v2 (sections 0–16)
- `reference/primitives.md` — PR-1 inventory (motion, decor SVG, sparkline, glow, accents)
- `reference/views-roadmap.md` — view inventory + dominio cromático assigned per view + status
- `reference/checklist-v2.md` — 15 mandatory items
- `reference/anti-patterns-aleph.md` — bans
- `reference/transform-recipe.md` — step-by-step workflow

If output is already in this session's history, skip re-run.

## Subcommands

| Cmd | Routes to | Purpose |
|-----|-----------|---------|
| `transform <view>` | `impeccable craft` internally | Full reskin of the view per design.md v2 |
| `audit <view>` | `impeccable critique` internally | Gap analysis vs design.md v2 |
| `polish <view>` | `impeccable polish` internally | Final pass before merge |
| `bolder <view>` | `impeccable bolder` internally | Amplify a view that came out timid |
| `inventory` | — | Show roadmap status (done / in-progress / pending) |

If no subcommand: render the table + list pending views + ask user which to attempt.

## `transform` workflow

Strictly sequential:

1. **Load context** (see Setup).
2. **Read view files:** `app/<route>/page.tsx` + sub-components in `app/_components/<view>/` or local folders. Don't recurse beyond view scope.
3. **Identify primitives candidates** by scanning current view:
   - Hero candidate (top section with title + sub)
   - KPI candidates (numeric values, deltas, trends)
   - Live state candidates (real-time data, streams)
   - Empty/error states
   - Lists, tables, grids
   - Section headers
4. **Pick receta paleta** from `views-roadmap.md` for this view.
5. **Plan as ASCII bento** (one short block) — show user, get nod or skip if `--autopilot` requested.
6. **Apply transformations** in this order, committing after each chunk passes typecheck:
   a. Hero zone (orb decor + grid bg + display title + PulseDot + TickNumber)
   b. Bento KPIs (HoverLift + Sparkline + TickNumber + accent badge per dominio)
   c. Stagger entrance on grids/lists
   d. Section dividers (numbered `01/04` + hairline fade OR decor SVG)
   e. Tables/lists reskin (HoverLift rows, mono fonts, accent badges)
   f. Empty states (decor SVG illustration + grid fade + CTA accent)
   g. Iconografía pass (every header/button/badge/empty has icon)
   h. Copy pass (DM Mono for system numbers, no em dashes, terse)
7. **Run typecheck.** Fix any breaks.
8. **Run checklist v2** (read from `reference/checklist-v2.md`). All 15 must be ✅.
9. **Launch reviewer agent** (see next section).
10. **Report:** files touched, primitives used, accent receta applied, reviewer verdict, screenshot path (if dev server up).

## Reviewer agent (mandatory post-transform)

After step 8, launch a reviewer agent. Prompt template in `reference/reviewer-prompt.md`. Use:

```
Agent({
  description: "Audit transformed view <X>",
  subagent_type: "general-purpose",
  prompt: <content of reference/reviewer-prompt.md with {view} {files} {receta} filled in>
})
```

Wait for verdict. If reviewer reports any **critical ❌**, re-iterate before declaring done. If only 🟡 suggestions, report to user and let them decide.

## `audit` workflow

1. Load context.
2. Read view files.
3. Run checklist v2 against current state.
4. Route to `impeccable critique <view>` for heuristic scoring.
5. Report: ✅/❌/🟡 per checklist item + impeccable score + 3 high-impact next steps.
6. No code changes.

## `polish` workflow

Only on views already transformed. Final-mile pass.

1. Load context.
2. Read view files.
3. Route to `impeccable polish <view>` internally.
4. Apply only nits: spacing rhythm, type leading, hover/focus states, microcopy, mono enforcement, reduce-motion checks.
5. Verify typecheck.
6. Launch reviewer agent.

## `bolder` workflow

For views that came out timid post-transform.

1. Load context.
2. Identify timidity: missing hero, no decor, flat KPIs, uniform grid, no accent rotation.
3. Route to `impeccable bolder <view>` internally.
4. Amplify within design.md rules (no monocromatic, max 3 accents, no banned patterns).
5. Verify typecheck.
6. Launch reviewer agent.

## `inventory`

Render the table from `reference/views-roadmap.md`. Show status column. No changes.

## Routing rules

1. **No argument** — render subcommand table + invite user to pick.
2. **First word matches subcommand** — execute that workflow.
3. **First word doesn't match a subcommand** — treat full argument as view target, default to `transform`.

## Cross-skill integration

When this skill routes to `impeccable`, it does so as if the user typed `/impeccable <subcommand> <view>` with the Aleph context already loaded. The impeccable skill reads `DESIGN.md` (which is our v2 spec) and `PRODUCT.md` if present. If PRODUCT.md is missing, surface a nudge but proceed — design.md v2 has enough identity to operate.
