# Aleph anti-patterns — auto-refuse

Match-and-refuse list specific to Aleph v2. If about to write any of these, rewrite differently.

## Color crimes
- **Monocromatic view** (everything teal, or everything violet). Always combine per receta.
- **3+ accents in one card.** Card scope cap = 2 accents beyond primary.
- **Raw Tailwind palette** (slate-/gray-/zinc-/emerald-/red-/blue-/purple-/violet-/indigo-/amber-/orange-). Use semantic tokens or accent-* utilities.
- **Amber as warning.** Amber = human personality. Warning = system degraded. Distinct.
- **Brand color hardcoded.** Bot brand is admin-configurable via `--brand-color`. Never inline `#1a9980`.
- **Same hue everywhere.** Each view should have at least one zone with a non-primary accent.

## Layout crimes
- **Uniform `grid-cols-3` of identical cards.** Bento or hierarchy. Not lazy grid.
- **Nested cards.** Card inside card = always wrong. Use background tints + spacing instead.
- **Every section wrapped in a card.** Most don't need it. Reserve cards for interactive content.
- **No hero zone in primary views.** Dashboard/Observability/Conversations/Inbox/Settings/Auth all require hero.
- **Plain `border-b` between sections.** Use numbered dividers / decor / hairline fade.

## Motion crimes
- **Animating width/height/top/left/margin/padding.** Transform + opacity + filter only.
- **Bounce / elastic / spring overshoot on UI elements.** Ease-out-expo / spring soft. No toy bounces.
- **Infinite spinning decoration.** Spinners only on loading states inside buttons / small zones.
- **Skipping reduce-motion.** Every motion primitive must respect it. Always.

## Iconography crimes
- **Section header without icon.** Every section gets an icon (lucide functional or tabler decorative).
- **Empty state with text only.** Must have SVG decor + icon + CTA.
- **Icon-less buttons with text labels.** Add a leading icon. Exception: tiny inline links.
- **Stroke 2 on lucide icons.** Use stroke 1.75 (consistent with Aleph spec).

## Copy crimes
- **Em dashes (`—`) in microcopy.** Use commas/colons/periods/parentheses.
- **"No data" / "Sin datos" / "—" as empty state.** Always illustrate.
- **Restated headings as sub.** Sub should add info, not echo.
- **Marketing AI buzzwords** ("AI-powered", "intelligent", "smart") in admin UI. Be direct.

## Component crimes
- **Glass on tables / list rows / forms.** Glass = overlays only (popovers, modales, drawers, toasts).
- **Side-stripe accent borders.** Full borders + bg tint. Never colored side stripes.
- **Gradient text body.** Only `.gradient-hero-display`, max 1 per view.
- **Decorative animated rainbow borders.** Banned.
- **Modal as first thought.** Exhaust inline + progressive alternatives first.

## Architecture crimes
- **Inventing primitives inline.** If missing, surface as sub-PR.
- **Touching data hooks during transform.** Visual-only. Data layer untouched.
- **Refactoring shared components during view transform.** Out of scope.
- **Auto-expanding scope to "fix while I'm here".** Surgical only.

## Category-reflex check

If someone could guess the look from the category alone, reflex training data is winning:
- "RAG admin → dark blue + purple gradient AI vibe" → category reflex. Aleph escapes with teal-primary + petroleum void + dominio rotation.
- "Dashboard → KPI grid 4-up with sparklines" → reflex. Aleph uses bento, hero, decor metáforas RAG.
- "Empty state → centered text + lucide icon" → reflex. Aleph uses SVG illustration + grid fade + CTA accent.

Run the scene sentence (who uses this, where, in what mood) and confirm the receta + decor + hero choice doesn't collapse to a generic category template.
