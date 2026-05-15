# Checklist v2 — Mandatory per transformed view

All 15 items must be ✅ before declaring done. If any item is N/A for the specific view, mark it `N/A` and justify in one sentence in the transform report.

## Visual structure
- [ ] **01. Hero zone present:** top section with title display (Space Grotesk weight 700, ≥3xl), sub-line, 1-2 decor orbs (animate-orb-float, opacity 30-50%, blur-2xl when needed), grid SVG bg fade. Numbered eyebrow (`01 / XX`) optional but encouraged.
- [ ] **02. Bento layout:** asymmetric grid (12-col preferred). Hero KPI occupies 6-8 cols, secondaries 3-4. Not uniform `grid-cols-3` repetition.
- [ ] **03. Section dividers:** numbered (`01/05 — TITLE`) OR hairline with gradient fade OR decor SVG (`divider-numbered.svg`). No raw `border-b` plain dividers between sections.

## Motion
- [ ] **04. Entrance animation:** view content wrapped in FadeIn or Stagger. Stagger 40ms for grids.
- [ ] **05. HoverLift on cards:** every interactive card uses HoverLift component with glow color matching receta dominio.
- [ ] **06. TickNumber on KPIs:** all numeric metrics ≥3 digits use TickNumber (not raw `{value}`).
- [ ] **07. Reduce-motion respected:** all motion primitives used (they handle it internally). Spot-check `useReducedMotion` is not bypassed.

## Iconography
- [ ] **08. Section headers have icons:** every section has lucide or tabler icon adjacent to title.
- [ ] **09. CTAs have icons:** every button with label has leading icon (lucide preferred for actions).
- [ ] **10. Empty states ilustrated:** any empty state uses decor SVG (empty-*.svg) + grid fade + lucide/tabler icon in CTA, never plain "No data" text.

## Color discipline
- [ ] **11. Receta paleta applied:** matches `views-roadmap.md` entry for this view. Max 3 accents visible. No monocromatic.
- [ ] **12. Sparklines color-tagged:** every Sparkline uses `hsl(var(--primary))` or `hsl(var(--accent-{cyan|violet|magenta}))` matching the metric's dominio.
- [ ] **13. No raw Tailwind palette:** zero occurrences of `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `red-*`, `purple-*`, `violet-*`, `indigo-*`, `amber-*`, `orange-*`, `blue-*` in view code. Grep verifies.

## Typography
- [ ] **14. DM Mono for system numbers:** latency, tokens, costs, IDs, timestamps render with `font-mono tabular-nums` or `.font-data`. Marketing KPIs may use Space Grotesk display.

## Verification
- [ ] **15. Typecheck clean:** `npx tsc --noEmit` returns 0 errors.

## Banned patterns (auto-fail if found)

If any present, the transform fails and must be redone before reviewer agent:

- Side-stripe borders (`border-left: 3px solid <color>` decorative)
- Glassmorphism in table rows / list items / forms
- Gradient text in body content (only `.gradient-hero-display` allowed, max 1 per view)
- Animating CSS layout properties (width/height/top/left/margin/padding)
- Uniform identical card grids without hierarchy
- "No data" / "Sin datos" / empty `<div></div>` for empty states
- Spinner full-page loading (use skeleton-shimmer or skeleton matching final layout)
- 3+ accents in same card scope
- `dark:` overrides where tokens already handle dark mode
- Imitating Intercom / Linear / Notion / ChatGPT chrome
- Em dashes (`—`) in copy — use `,` / `:` / `;` / `.` / parentheses instead
