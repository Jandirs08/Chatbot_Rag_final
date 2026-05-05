---
name: Aleph
description: Plataforma RAG para empresas — el panel de control de tu asistente inteligente
colors:
  primary: "#1a9980"
  primary-light: "#168b72"
  primary-dark: "#2dd4a8"
  bg-light: "#f4f6f8"
  bg-dark: "#0d1117"
  surface-dark: "#111820"
  surface-dark-elevated: "#16202a"
  fg-light: "#0f1823"
  fg-dark: "#dce8f0"
  muted-light: "#6b7888"
  muted-dark: "#8898aa"
  border-light: "#dce4ec"
  border-dark: "#1e2a36"
  amber: "#e89430"
  success: "#17a96a"
  warning: "#d48c0a"
  error: "#dc2626"
  info: "#3b7be8"
typography:
  display:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "clamp(2rem, 3vw + 0.5rem, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.5vw + 0.5rem, 1.75rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.06em"
  mono:
    fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  "2xl": "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
  "3xl": "64px"
---

# Design System: Aleph — Deep Signal

## 1. Identity Concept

**Name:** Aleph (ℵ) — from Borges: the point in space that contains all other points simultaneously. The product is a RAG system: it ingests documents and answers questions. The visual language reflects that: depth that contains knowledge, with precise moments of signal emerging from it.

**Creative North Star: "Deep Signal"**

The UI lives in a dark, substantial space. Not "dark mode because tools look cool dark" — but because the primary user is monitoring active conversations and decision-making systems, often in mixed or low-light environments. Against that depth, a single vivid teal primary color acts like a signal: precise, purposeful, honest. Warm amber moments mark human interactions and attention states. Nothing is decorative.

**Breaks the category reflex:** B2B SaaS admin panel category reflex = navy + corporate blue, or clean white + slate. Aleph uses petroleum-dark backgrounds with teal-signal primary and amber personality. No purple, no indigo, no "AI gradient."

**Key Characteristics:**
- Deep teal as primary — signal, precision, intelligence. Not Slack cyan, not healthcare teal.
- Petroleum void backgrounds in dark mode — substantial depth, not generic charcoal
- Cool morning mist in light mode — not white, not warm gray
- Amber as personality token — warmth, human, notifications. Distinct from warning.
- Teal-tinted shadows and glow on hover — the surface has presence
- Space Grotesk + Inter + DM Mono — unchanged, proven hierarchy


## 2. Color System

### CSS Custom Properties (globals.css)

All colors flow through `--token` CSS custom properties. Never use raw Tailwind color classes
(`slate-*`, `gray-*`, `emerald-*`, `red-*`, `amber-*`, `blue-*`, `orange-*`) in components.
Always use semantic tokens.

### Light Mode — Cool Morning Mist (hue 210)

| Token | HSL | Hex approx |
|-------|-----|-----------|
| `--background` / `--surface` | `210 20% 97%` | `#f4f6f8` |
| `--surface-elevated` | `210 28% 99%` | `#fafbfc` |
| `--card` | `210 28% 99%` | `#fafbfc` |
| `--popover` | `210 28% 99%` | `#fafbfc` |
| `--foreground` | `218 32% 10%` | `#0f1823` |
| `--muted` | `210 18% 93%` | `#e8edf2` |
| `--muted-foreground` | `215 15% 46%` | `#6b7888` |
| `--border` | `210 22% 88%` | `#d8e1ea` |
| `--input` | `210 18% 93%` | `#e8edf2` |

### Dark Mode — Petroleum Void (hue 218)

| Token | HSL | Hex approx |
|-------|-----|-----------|
| `--background` / `--surface` | `218 32% 8%` | `#0d1117` |
| `--surface-elevated` | `216 28% 12%` | `#141c24` |
| `--card` | `215 26% 14%` | `#18212c` |
| `--popover` | `213 24% 17%` | `#1d2735` |
| `--foreground` | `210 22% 92%` | `#dce8f0` |
| `--muted` | `213 24% 17%` | `#1d2735` |
| `--muted-foreground` | `215 16% 60%` | `#8898aa` |
| `--border` | `215 22% 20%` | `#233040` |
| `--input` | `215 26% 14%` | `#18212c` |

### Primary — Teal Signal (hue 168)

| Token | Light HSL | Dark HSL |
|-------|-----------|----------|
| `--primary` | `168 65% 30%` | `168 70% 52%` |
| `--primary-foreground` | `0 0% 100%` | `218 32% 8%` |
| `--primary-faint` | `168 50% 94%` | `215 26% 14%` |
| `--primary-muted` | `168 28% 52%` | `168 20% 60%` |

Primary in light mode is dark teal (readable on white). Primary in dark mode is vivid teal (bright signal on dark). The same hue, different luminosity.

### Semantic Tokens

| Name | Light HSL | Dark HSL | Use |
|------|-----------|----------|-----|
| `--success` | `154 76% 38%` | `154 65% 45%` | Completed, active, healthy state |
| `--warning` | `38 90% 46%` | `38 85% 52%` | Caution, pending, degraded state |
| `--error` | `0 72% 51%` | `0 72% 55%` | Failure, blocked, critical state |
| `--info` | `220 75% 54%` | `220 72% 62%` | Neutral informational |
| `--destructive` | `0 72% 51%` | `0 55% 42%` | Destructive actions only |

**Semantic badge pattern:**
```
bg-success/10 text-success border border-success/25
bg-warning/10 text-warning border border-warning/25
bg-error/10 text-error border border-error/25
bg-info/10 text-info border border-info/25
bg-amber/10 text-amber border border-amber/25
```

### Amber — Personality Token (hue 40)

| Token | Light HSL | Dark HSL |
|-------|-----------|----------|
| `--amber` | `40 85% 52%` | `40 80% 55%` |
| `--amber-foreground` | `28 30% 12%` | `28 30% 12%` |

**Amber is NOT warning.** Amber = warmth, human presence, attention (not alarm). Use for:
- Unread message counts, notification dots
- Waiting time indicators ("esperando 4 min")
- Kanban columns: comercial, soporte
- Human handoff moments

Warning = system state problem. Amber = human moment that needs attention.

### Sidebar Token Namespace

| Token | Light | Dark |
|-------|-------|------|
| `--sidebar-background` | `210 28% 99%` | `218 32% 8%` |
| `--sidebar-foreground` | `215 15% 46%` | `215 16% 60%` |
| `--sidebar-primary` | `168 65% 30%` | `168 70% 52%` |
| `--sidebar-accent` | `168 50% 94%` | `215 26% 14%` |
| `--sidebar-border` | `210 22% 88%` | `215 22% 20%` |

Bot brand color (`--brand-color`): `#1a9980` default, admin-configurable per bot instance.


## 3. Elevation

Five visible layers. In dark mode each step is ≥3% lighter than the previous.

| Layer | Token | Dark approx |
|-------|-------|------------|
| 0 — Page | `--background` | `hsl(218 32% 8%)` — `#0d1117` |
| 1 — Elevated panel | `--surface-elevated` | `hsl(216 28% 12%)` — `#141c24` |
| 2 — Card | `--card` | `hsl(215 26% 14%)` — `#18212c` |
| 3 — Popover | `--popover` | `hsl(213 24% 17%)` — `#1d2735` |

Cards in dark mode have NO inner glow, NO gradient — just the solid layer step. The elevation is legible from the lightness contrast alone.


## 4. Shadows

Shadows use teal-tinted depth (not pure black). Hover emits a teal signal glow.

```css
/* Light mode */
--shadow-sm:    0 1px 2px 0 rgb(20 60 70 / 0.05);
--shadow-card:  0 1px 3px 0 rgb(20 60 70 / 0.07), 0 1px 2px -1px rgb(20 60 70 / 0.05);
--shadow-md:    0 4px 6px -1px rgb(20 60 70 / 0.09), 0 2px 4px -2px rgb(20 60 70 / 0.06);
--shadow-lg:    0 10px 15px -3px rgb(20 60 70 / 0.11), 0 4px 6px -4px rgb(20 60 70 / 0.07);
--shadow-hover: 0 4px 20px rgb(20 60 70 / 0.16);

/* Dark mode */
--shadow-sm:    0 1px 2px 0 rgb(4 14 18 / 0.4);
--shadow-card:  0 1px 4px 0 rgb(4 14 18 / 0.5), 0 1px 2px -1px rgb(4 14 18 / 0.35);
--shadow-md:    0 4px 8px -1px rgb(4 14 18 / 0.55), 0 2px 4px -2px rgb(4 14 18 / 0.4);
--shadow-hover: 0 4px 24px rgb(20 180 140 / 0.22);  /* teal signal glow */
```


## 5. Dark Mode Background

Dark mode body has a subtle radial teal glow at the upper area — atmospheric presence, not decoration:

```css
.dark body {
  background-image: radial-gradient(
    ellipse 140% 55% at 65% -5%,
    hsl(168 35% 10%) 0%,
    transparent 60%
  );
}
```


## 6. Typography

| Font | Role | Token |
|------|------|-------|
| Space Grotesk | Headings, labels, UI caps | `--font-heading` |
| Inter / system-ui | Body text | `--font-sans` |
| DM Mono | Code, data, mono UI | `--font-mono-ui` |

Heading scale:
- `h1`: `clamp(1.75rem, 2vw + 0.5rem, 2.25rem)` — weight 700, tracking -0.03em
- `h2`: `clamp(1.25rem, 1vw + 0.5rem, 1.5rem)` — weight 600, tracking -0.02em
- `h3`: `clamp(1rem, 0.5vw + 0.5rem, 1.125rem)` — weight 600, tracking -0.01em
- Body: 15px, line-height 1.6

**Mono rule:** Any number that measures a system — latency, uptime, tokens, costs, chat/min — renders in DM Mono. Marketing numbers (big dashboard KPIs) use Space Grotesk.


## 7. Utility Classes

| Class | Definition |
|-------|-----------|
| `.gradient-primary` | `linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(148 72% 38%) 100%)` |
| `.gradient-brand` | `linear-gradient(135deg, hsl(168 65% 28%) 0%, hsl(193 65% 34%) 100%)` |
| `.gradient-soft` | `linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, hsl(var(--primary) / 0.04) 100%)` |
| `.surface-inset` | `bg-muted border border-border rounded-md` — wells, code blocks |
| `.skeleton-shimmer` | Animated loading shimmer using `--muted` + `--primary-faint` |
| `.text-label` | Space Grotesk 500 12px uppercase tracking-wide — KPI labels |
| `.font-data` | DM Mono tabular-nums — system metrics |
| `.bg-amber` / `.text-amber` | Amber personality token |


## 8. Token Usage Rules

1. **Never** use raw Tailwind palette classes in components: `slate-*`, `gray-*`, `zinc-*`, `blue-*`, `emerald-*`, `red-*`, `amber-*`, `orange-*`, `purple-*`, `violet-*`, `indigo-*`.
2. **Dark: overrides almost always wrong.** Tokens handle dark mode natively. Only add `dark:` when overriding for a surface that uses a different token in dark mode.
3. **Status badge pattern:** `bg-success/10 text-success border border-success/25` — not raw emerald.
4. **Destructive hover:** `hover:bg-error/10 hover:text-error` — not `hover:bg-red-50`.
5. **Side-stripe borders banned.** Never `border-left/right > 1px` as accent. Use full border + bg tint.
6. **Amber ≠ Warning.** Wrong: `text-amber` for a system degraded state. Right: `text-warning`.
7. **No gradient text.** `background-clip: text` with gradient = banned. Use solid `text-primary`.


## 9. Do / Don't

### Do:
- Use `bg-card` not `bg-white`. Card handles dark mode automatically.
- Use `border-border` not any raw color for dividers.
- Use `text-muted-foreground` for secondary labels, metadata, captions.
- Use `text-foreground` for any primary content text.
- Use `bg-primary/10 text-primary` for tint states (selected, highlighted).
- Use `.gradient-primary` for CTA buttons when `.gradient-brand` is too strong.
- Keep semantic colors consistent: `success` always = positive health, `error` always = failure.

### Don't:
- Don't use `border-left: 3px solid [color]` as a decorative accent stripe.
- Don't use gradient text (`background-clip: text`).
- Don't use glassmorphism (blur + transparency) decoratively.
- Don't animate CSS layout properties (width, height, top, left) — only `transform` + `opacity`.
- Don't use `prefers-reduced-motion` without wrapping pulse/flow animations.
- Don't imitate Intercom, Linear, Notion, or ChatGPT visually.
- Don't add `dark:` overrides for things that tokens already handle.
