# Transform recipe — view by view

Sequential workflow. Don't skip steps. Each step gates the next.

## Step 0 — Pre-flight

Confirm:
- View is in `views-roadmap.md` with a receta
- No uncommitted changes in target files (or user confirmed they're OK to overwrite)
- Dev server can start (for screenshot validation later)

## Step 1 — Scan current view

Read in this order:
1. `app/<route>/page.tsx`
2. `app/_components/<view-or-domain>/*.tsx` (if any sub-components)
3. Any client component files local to the view (`<View>Client.tsx`)

Identify:
- Hero candidate: top title + sub
- Metrics: numeric values, deltas, trends
- Live data: streams, refresh intervals, websocket states
- Lists/tables/grids
- Empty / error / loading states
- Section boundaries

Don't read shared components (sidebar, layout, ui/ primitives) unless absolutely needed to confirm a contract.

## Step 2 — Pick receta + plan

Open `views-roadmap.md`, find the view's row. Note receta paleta.

Write a brief ASCII plan (≤25 lines) like:

```
HERO  ┌───────────────────────────────────────────────┐
      │ 01/05 — TÍTULO DEL DOMINIO         <pulse-dot>│
      │ <Display gradient title>                       │
      │ <sub line>             [decor: orb teal+cyan] │
      └───────────────────────────────────────────────┘

BENTO ┌──────────────────┬─────────────┬─────────────┐
      │ Hero KPI (col-6) │ KPI (col-3) │ KPI (col-3) │
      │ sparkline 240×36 │ cyan glow   │ violet glow │
      ├──────────────────┴─────────────┴─────────────┤
      │ Activity chart card (col-12)                 │
      │ + bento split below                          │
      └──────────────────────────────────────────────┘

LIST  Leads table reskin + empty state ilustrado
```

Present to user (or skip if `--autopilot`).

## Step 3 — Apply, chunked

Order strictly:

### 3a. Hero zone
- Wrap top content in `relative overflow-hidden` container, rounded-2xl, border, bg-card or surface-elevated
- Add 1-2 decor orbs absolutely positioned, opacity 30-50%, blur-2xl, `animate-orb-float` (stagger animation-delay)
- Add `bg-grid opacity-40` layer absolute
- Title in Space Grotesk display, wrap span with `gradient-hero-display`
- Sub line `text-muted-foreground`
- Numbered eyebrow `01 / XX — UPPERCASE SECTION` mono primary/70
- If live: PulseDot + TickNumber inline status

### 3b. Bento KPIs
- Replace any uniform grid with `grid grid-cols-12 gap-4`
- Hero KPI: col-span-6 or 8
- Secondary KPIs: col-span-3 or 4
- Each wrapped in HoverLift with glow color per dominio (primary / cyan / violet / magenta)
- Card pattern: rounded-2xl border border-border bg-card p-6 relative overflow-hidden
- Optional decor blob `absolute -top-12 -right-12 w-40 h-40 opacity-30 blur-2xl`
- Label: text-xs uppercase tracking-wider text-muted-foreground font-heading + icon
- Value: text-3xl to text-5xl font-heading font-bold tabular-nums + TickNumber
- Trend chip: bg-success/10 text-success border border-success/25 rounded-full text-xs font-mono
- Sparkline below value, color matching dominio

### 3c. Stagger entrance
- Wrap KPI grid in `<Stagger>`, each card in `<StaggerItem>`
- Wrap list/table rows in Stagger when ≤ 20 visible items

### 3d. Section dividers
- Replace plain `<hr>` or `border-b` with numbered header `01 / 05 — TITLE` + hairline gradient fade OR `<img src="/assets/decor/divider-numbered.svg" />` in primary/40 color

### 3e. Tables / lists
- Header: `font-heading uppercase tracking-wider text-xs text-muted-foreground`
- Rows: hover bg-card/80 + transition-colors, optional HoverLift if rows interactive
- Numeric cells: `font-mono tabular-nums`
- ID cells: `font-mono text-xs px-2 py-0.5 rounded bg-muted`
- Status cells: accent badges
- Empty state: replace plain text with SVG illustration + grid fade container + CTA

### 3f. Empty states
- Container: `rounded-xl border border-dashed border-border bg-card/50 p-8 flex flex-col items-center text-center relative overflow-hidden`
- Inside: `absolute inset-0 bg-grid opacity-30 pointer-events-none`
- Illustration: 120-180px from `/assets/decor/empty-*.svg` wrapped in `text-{accent}` for currentColor
- Title: font-heading font-semibold
- Sub: text-sm text-muted-foreground max-w-xs
- CTA: text-xs button with accent color + lucide icon leading

### 3g. Iconography pass
- Every section header gets icon (16-20px), 8px gap, color-tagged to dominio
- Every CTA gets leading icon
- Empty state CTAs get leading icon
- Status badges get inline icon (12px)
- Avatars: if missing initials fallback, add Lucide icon fallback

### 3h. Copy / mono pass
- Numbers measuring system → `font-mono tabular-nums`
- Replace em dashes with commas/colons
- Trim restated headings
- Replace "AI", "intelligent", "smart" buzzwords with direct verbs

## Step 4 — Typecheck

```bash
npx tsc --noEmit
```

Fix errors. Don't proceed until clean.

## Step 5 — Checklist v2

Read `checklist-v2.md` and verify each of the 15 items against the diff. Mark each ✅ / ❌ / N/A explicitly in the transform report. If any ❌, fix and re-verify before moving on.

## Step 6 — Reviewer agent

Use `reference/reviewer-prompt.md`. Substitute `{view}`, `{files-changed}`, `{receta}`, `{checklist-summary}`. Launch agent. Wait for verdict.

If reviewer reports critical ❌ (not 🟡), re-iterate.

## Step 7 — Report

Output to user, ≤300 words:
- View transformed
- Receta applied
- Files touched (list)
- Primitives used (list)
- Decor SVG used (list)
- Checklist v2 summary (15 items)
- Reviewer verdict (✅/🟡/❌ + key findings)
- Screenshot path or instructions to view
- Next steps (next view in roadmap, or polish if reviewer suggested)
