---
name: Aleph
description: Plataforma RAG para empresas — el panel de control de tu asistente inteligente
version: 2.0
colors:
  primary: "#1a9980"
  primary-light: "#168b72"
  primary-dark: "#2dd4a8"
  accent-violet: "#7c5cff"
  accent-cyan: "#22d3ee"
  accent-magenta: "#f43f9c"
  bg-light: "#f4f6f8"
  bg-dark: "#0a0e14"
  surface-dark: "#0f141c"
  surface-dark-elevated: "#151c26"
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
    fontSize: "clamp(2.5rem, 4vw + 0.5rem, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "'Space Grotesk', system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 1.5vw + 0.5rem, 1.875rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "'DM Mono', 'JetBrains Mono', monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    letterSpacing: "-0.01em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  "2xl": "24px"
  "3xl": "32px"
  full: "9999px"
motion:
  ease-out-expo: "cubic-bezier(0.16, 1, 0.3, 1)"
  ease-out-back: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  spring-soft: { stiffness: 260, damping: 28 }
  spring-snappy: { stiffness: 380, damping: 30 }
  duration-instant: "120ms"
  duration-fast: "200ms"
  duration-base: "320ms"
  duration-slow: "560ms"
  stagger-tight: "40ms"
  stagger-loose: "80ms"
---

# Design System: Aleph — Deep Signal v2

## 0. What changed in v2

v1 era disciplina monástica: paleta restringida, cero decoración, motion ausente. Resultado correcto pero **inerte** — sensación de "Word con color teal". v2 mantiene identidad **Deep Signal** pero acepta que profundidad sin atmósfera = vacío. Cambios:

- **Paleta expandida:** tres acentos secundarios (violet, cyan, magenta) para diferenciar dominios funcionales (telemetry, conversation, configuración)
- **Superficie atmosférica:** noise, grid SVG, mesh gradients, orbs decorativos permitidos en superficies marcadas
- **Glassmorphism permitido** en overlays (popovers, modales, sidebars flotantes)
- **Gradients permitidos** fuera del body (decor, hero KPIs, accents)
- **Motion como ciudadano de primera clase** — sección 9
- **Bento + asimetría** como principio de layout — sección 10
- **Sistema de iconografía dual** — lucide + decor SVG propio (sección 11)
- **Empty states con personalidad** ilustrada (sección 12)

v1 prohibió decoración por miedo a corporate AI gradient slop. v2 permite decoración con **intención semántica**: cada elemento decorativo refleja una propiedad del sistema (profundidad = corpus, glow = inferencia activa, grid = estructura RAG).


## 1. Identity Concept

**Name:** Aleph (ℵ) — Borges: el punto que contiene todos los demás. RAG = corpus que contiene conocimiento, respuestas emergen de él.

**Creative North Star: "Deep Signal"**

UI vive en espacio oscuro substantivo. Contra esa profundidad, señales precisas emergen — teal como inferencia, amber como humano, violet como sistema, cyan como dato vivo. La interfaz **respira**: glow ambiente sutil, partículas de ruido, layers asimétricos. No es minimalismo monástico, es **profundidad habitada**.

**Breaks category reflex:**
- Admin SaaS típico = navy/slate corporativo plano → Aleph usa petroleum void + multi-signal
- AI gradient cliché (purple→pink) → Aleph usa teal-primary con violet solo como acento dominio
- Notion/Linear blanco minimalista → Aleph asume oscuridad como hogar, luz como excepción

**Key characteristics:**
- Teal signal como primary — inferencia precisa
- Violet deep como acento sistema/AI metadata
- Cyan electric como dato live (métricas tickeando)
- Magenta como alerta humana premium (handoff, escalación)
- Amber como personalidad cálida — distinto a warning
- Petroleum void más oscuro que v1 (`#0a0e14`) — mayor contraste con signals
- Atmósfera viva: glow radial body, noise grain sutil, decor SVG en zonas marcadas
- Tipografía display más grande (hasta 4.5rem) — números KPI hero

## 2. Color System

### 2.1 Surfaces — Dark Mode (Petroleum Void deep, hue 218)

| Token | HSL | Hex |
|-------|-----|-----|
| `--background` | `220 35% 5%` | `#0a0e14` |
| `--surface` | `218 32% 7%` | `#0d1219` |
| `--surface-elevated` | `216 28% 10%` | `#121a23` |
| `--card` | `215 26% 13%` | `#17202b` |
| `--card-elevated` | `213 24% 16%` | `#1c2734` |
| `--popover` | `213 24% 18%` | `#202c3a` |
| `--foreground` | `210 22% 92%` | `#dce8f0` |
| `--foreground-strong` | `0 0% 100%` | `#ffffff` |
| `--muted` | `213 24% 17%` | `#1d2735` |
| `--muted-foreground` | `215 16% 62%` | `#8b9cae` |
| `--border` | `215 22% 20%` | `#233040` |
| `--border-subtle` | `215 22% 14%` | `#1a232f` |
| `--border-strong` | `215 22% 28%` | `#324158` |

### 2.2 Surfaces — Light Mode (Cool Mist, hue 210)

| Token | HSL | Hex |
|-------|-----|-----|
| `--background` | `210 20% 97%` | `#f4f6f8` |
| `--surface` | `210 24% 98%` | `#f7f9fb` |
| `--surface-elevated` | `0 0% 100%` | `#ffffff` |
| `--card` | `210 28% 99%` | `#fafbfc` |
| `--popover` | `0 0% 100%` | `#ffffff` |
| `--foreground` | `218 32% 10%` | `#0f1823` |
| `--muted` | `210 18% 93%` | `#e8edf2` |
| `--muted-foreground` | `215 15% 46%` | `#6b7888` |
| `--border` | `210 22% 88%` | `#d8e1ea` |

### 2.3 Primary Signal — Teal (hue 168)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--primary` | `168 65% 30%` | `168 75% 54%` | CTAs, focus, active states |
| `--primary-glow` | `168 75% 50%` | `168 85% 60%` | Hover glows, signal accents |
| `--primary-faint` | `168 50% 94%` | `168 40% 12%` | Tint backgrounds |
| `--primary-foreground` | `0 0% 100%` | `220 35% 5%` | Text on primary |

### 2.4 Secondary Signals (nuevo en v2)

Tres acentos para diferenciar **dominio**, no jerarquía. Uso restringido a sección/feature, no mezclar arbitrariamente.

| Token | Light | Dark | Dominio |
|-------|-------|------|---------|
| `--accent-violet` | `255 75% 60%` | `255 85% 70%` | AI/sistema, model metadata, embeddings, latente |
| `--accent-cyan` | `188 90% 42%` | `188 95% 55%` | Datos live, telemetry tickeando, streaming |
| `--accent-magenta` | `330 80% 55%` | `330 88% 65%` | Handoff humano, escalación premium, urgencia VIP |

**Pattern badge accent:**
```
bg-accent-violet/12 text-accent-violet border border-accent-violet/30
```

**Regla dominio:**
- Observability = primario teal + cyan electric (datos vivos)
- Conversations = primario teal + amber (humano)
- Settings/Brain = primario teal + violet (sistema/IA)
- Inbox urgente = magenta como personalidad VIP

### 2.5 Semantic Status

| Token | Light | Dark | Significado |
|-------|-------|------|-------------|
| `--success` | `154 76% 38%` | `154 65% 50%` | Healthy, completed |
| `--warning` | `38 90% 46%` | `38 90% 58%` | Degraded, pending |
| `--error` | `0 72% 51%` | `0 75% 60%` | Failed, blocked |
| `--info` | `220 75% 54%` | `220 78% 66%` | Neutral info |

### 2.6 Amber — Personality (hue 40)

`--amber: 40 85% 55%` (dark). Calidez humana, NO warning. Usar para:
- Unread badges, notification dots
- "Esperando 4 min"
- Kanban comercial/soporte
- Handoff awareness


## 3. Elevation — 5 layers + atmospheric

Dark mode usa 5 capas con incremento ≥3% lightness, **más** dos capas atmosféricas que viven detrás de todo:

| Capa | Token | Rol |
|------|-------|-----|
| -1 — Glow ambiente | radial gradient teal upper | Atmósfera body |
| -2 — Noise grain | SVG noise 4% opacity | Textura grano fino |
| 0 — Page | `--background` | Canvas base |
| 1 — Surface | `--surface` | Secciones principales |
| 2 — Elevated panel | `--surface-elevated` | Containers feature |
| 3 — Card | `--card` | Cards interactivas |
| 4 — Card elevated | `--card-elevated` | Cards hover/featured |
| 5 — Popover | `--popover` | Overlays flotantes |

Cards permiten **inner-glow** sutil en hover: `inset 0 1px 0 hsl(var(--primary) / 0.08)`.


## 4. Shadows + Glow

Shadows teal-tinted (no negro puro). Glow primary en hover/focus = signal visible.

```css
/* Dark mode */
--shadow-sm:    0 1px 2px 0 rgb(4 14 18 / 0.4);
--shadow-card:  0 1px 4px 0 rgb(4 14 18 / 0.5), 0 1px 2px -1px rgb(4 14 18 / 0.35);
--shadow-md:    0 4px 12px -2px rgb(4 14 18 / 0.55);
--shadow-lg:    0 12px 32px -8px rgb(4 14 18 / 0.6);
--shadow-glow-primary: 0 0 0 1px hsl(var(--primary) / 0.4), 0 8px 32px -4px hsl(var(--primary) / 0.35);
--shadow-glow-violet:  0 0 0 1px hsl(var(--accent-violet) / 0.4), 0 8px 32px -4px hsl(var(--accent-violet) / 0.35);
--shadow-glow-cyan:    0 0 0 1px hsl(var(--accent-cyan) / 0.4), 0 8px 32px -4px hsl(var(--accent-cyan) / 0.35);
```

**Hover lift estándar:**
```css
transform: translateY(-2px);
box-shadow: var(--shadow-glow-primary);
border-color: hsl(var(--primary) / 0.4);
transition: all 280ms var(--ease-out-expo);
```


## 5. Atmospheric layers

### 5.1 Body radial glow (siempre activo dark)

```css
.dark body {
  background-image:
    radial-gradient(ellipse 80% 50% at 70% -10%, hsl(168 60% 14% / 0.65), transparent 60%),
    radial-gradient(ellipse 60% 40% at 15% 110%, hsl(255 60% 14% / 0.4), transparent 60%);
}
```

Glow teal arriba-derecha + glow violet abajo-izquierda. Atmósfera, no decoración.

### 5.2 Noise grain (capa global)

SVG noise 200×200 turbulence, opacity 0.04, mode overlay. `position: fixed; inset: 0; pointer-events: none; z-index: 0`. Grano cinematográfico.

### 5.3 Grid background (zonas marcadas)

`bg-grid` utility: SVG grid 24×24 con líneas `hsl(var(--border) / 0.4)`. Fade radial al centro. Uso: hero sections, empty states, hero dashboard.

### 5.4 Decor orbs (hero KPIs)

Blobs SVG con `filter: blur(60px)`, opacity 0.25, animación `float 18s ease-in-out infinite`. Solo en hero zones, max 2 por viewport. Color por dominio (teal, violet, cyan).

### 5.5 Mesh gradient (empty/auth/landing)

Mesh CSS multi-radial gradients posición animada lenta. Reservado para landing/auth/onboarding/empty states grandes — NO en superficies operativas.


## 6. Glassmorphism (permitido v2)

Permitido en overlays flotantes y sidebars contextuales. Backdrop blur + bg semi-transparente sobre fondo con decoración.

```css
.glass {
  background: hsl(var(--card) / 0.7);
  backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid hsl(var(--border) / 0.6);
}
```

**Permitido en:** popovers, command palette, mobile nav drawer, toasts, image overlays, lightboxes.
**Prohibido en:** cards de listas, table rows, formularios, contenido principal de página. Glass = excepción overlay.


## 7. Gradients (permitidos v2 con reglas)

### 7.1 Permitidos
- Buttons primary hero — `.gradient-primary`
- KPI hero numbers background — `.gradient-soft`
- Sidebar active item — `.gradient-sidebar-active`
- Decor orbs — gradients radiales blur
- Skeleton shimmer
- Empty state illustrations

### 7.2 Prohibidos
- Body text — `background-clip: text` solo en display heroes específicos con aprobación
- Borders decorativos animados (rainbow border) — prohibido
- Card background completo gradient — solo si es hero feature

### 7.3 Catálogo

```css
.gradient-primary {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent-cyan)) 100%);
}
.gradient-violet-cyan {
  background: linear-gradient(135deg, hsl(var(--accent-violet)) 0%, hsl(var(--accent-cyan)) 100%);
}
.gradient-soft {
  background: linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--accent-violet) / 0.06));
}
.gradient-hero-display {
  background: linear-gradient(180deg, hsl(var(--foreground-strong)) 0%, hsl(var(--primary-glow)) 100%);
  background-clip: text;
  color: transparent;
}
```


## 8. Typography

| Token | Familia | Rol |
|-------|---------|-----|
| `--font-heading` | Space Grotesk | h1-h4, labels caps, KPI display |
| `--font-sans` | Inter | Body, UI text |
| `--font-mono-ui` | DM Mono / JetBrains Mono | Métricas sistema, tokens, costos, latencia |

**Display heroes:** `clamp(2.5rem, 4vw + 0.5rem, 4.5rem)` weight 700 tracking `-0.04em`. Permitido `gradient-hero-display` en una vez por viewport.

**Mono rule:** todo número que mide sistema (latencia, uptime, tokens, costos, msgs/min) en DM Mono con `tabular-nums`. KPI marketing puede usar display.

**Capitalization:** labels SHORT en UPPERCASE tracking `0.08em`. Headings sin uppercase, dejar peso/tamaño hacer trabajo.


## 9. Motion (nuevo v2 — first-class)

Motion declara **vida del sistema**: inferencia ocurriendo, datos llegando, presencia humana. No es decoración.

### 9.1 Tokens

```ts
const motion = {
  ease: {
    outExpo: [0.16, 1, 0.3, 1],
    outBack: [0.34, 1.56, 0.64, 1],
    inOutCirc: [0.85, 0, 0.15, 1],
  },
  spring: {
    soft: { stiffness: 260, damping: 28 },
    snappy: { stiffness: 380, damping: 30 },
    bouncy: { stiffness: 320, damping: 18 },
  },
  duration: { instant: 0.12, fast: 0.2, base: 0.32, slow: 0.56 },
  stagger: { tight: 0.04, loose: 0.08 },
}
```

### 9.2 Patrones canónicos

| Patrón | Cuándo | Implementación |
|--------|--------|---------------|
| **FadeIn** | Mount inicial cualquier card | opacity 0→1, y 12→0, duration base, ease outExpo |
| **Stagger** | Listas, grids KPI | children stagger 0.04, mismo FadeIn |
| **Presence** | Toasts, popovers, modales | scale 0.95→1 + opacity, spring snappy |
| **Layout** | Kanban drag, list reorder | framer `layout` prop + spring soft |
| **HoverLift** | Cards interactivas | translateY -2, glow primary, 280ms outExpo |
| **TickNumber** | Métricas live | spring soft sobre value, mono digits |
| **Shimmer** | Skeleton loading | gradient sweep 1.6s infinite linear |
| **PulseGlow** | Estado activo (en vivo, streaming) | box-shadow scale 1→1.4 opacity 0.5→0, 2.4s infinite |
| **PageTransition** | Cambio ruta admin | crossfade + y 8→0, duration fast |

### 9.3 Reduce-motion

Toda animación NO-esencial respeta `prefers-reduced-motion: reduce`. Esenciales (skeleton, pulse vivo, focus) mantienen forma pero duration acortada.

### 9.4 Prohibido

- Animar `width/height/top/left` — solo `transform` + `opacity` + `filter`
- Bounce excesivo en CTAs (toy-like)
- Infinite spin decorativo fuera de loading
- Parallax en admin (reservado landing si aplica)


## 10. Layout — Asimetría + Bento

v1 implícitamente promovía grids uniformes. v2 declara explícitamente:

### 10.1 Bento dashboards

Cards de tamaños asimétricos en grid `12-col`. Hero KPI ocupa 6-8 cols, secundarios 3-4, terciarios 2-3. Altura variable. Crea jerarquía visible.

### 10.2 Hero zone

Toda vista principal admin tiene hero zone superior:
- Altura ~200-280px
- Background: surface-elevated + grid SVG + 1-2 decor orbs
- Contenido: title display + sub + 1-2 CTAs + métricas tickeando inline
- Border-bottom hairline con fade

### 10.3 Split asimétrico

Vistas tipo conversations: 1/3 vs 2/3, NO 50/50. List angosta, detalle amplio.

### 10.4 Densidad jerárquica

Hero KPI: number `text-5xl`. Secondary KPI: `text-2xl`. Inline metric: `text-sm`. Diferenciación obligatoria, no todo mismo tamaño.

### 10.5 Section dividers

Reemplazar `border-b` plano por:
- Hairline con fade radial al centro (SVG)
- O numeración ornamental Space Grotesk `01 / 04 — Section name`
- O divider con icono decor SVG centrado


## 11. Iconography — Dual system

### 11.1 Functional icons — Lucide

UI actions, navigation, status. Lucide-react. Tamaño base 16px, accent 20px, hero 24px. Stroke 1.75.

### 11.2 Decor icons — Custom SVG

Set propio en `public/assets/decor/`:
- `glow-orb-{teal|violet|cyan|magenta}.svg`
- `grid-bg.svg`
- `mesh-{aurora|deep|warm}.svg`
- `noise-grain.svg`
- `divider-{simple|ornate|numbered}.svg`
- `empty-{conversations|metrics|search|brain|inbox}.svg` — ilustraciones empty states
- `corpus-strands.svg`, `embedding-cloud.svg`, `pipeline-flow.svg` — metaforas RAG
- `signal-bars.svg`, `pulse-wave.svg` — actividad

Estilo decor: linework fino (1.25px) + fill teal/violet con opacidad. NO photorealistic, NO 3D, NO emoji-ish. Geometría técnica.


## 12. Empty states + Loading

### 12.1 Empty states

NUNCA "No data" plano. Cada empty state tiene:
- Ilustración SVG custom 120-180px del set decor
- Title `text-lg` Space Grotesk
- Sub `text-sm text-muted-foreground` explicando qué falta y por qué
- CTA primary si hay acción posible
- Container con `bg-grid` fade + border dashed

### 12.2 Loading

- Skeleton shimmer con gradient sweep (no pulse opacity feo)
- Spinners solo en botones/inline, nunca página completa
- Página completa loading = skeleton de la layout final, no spinner

### 12.3 Live streaming indicators

- Pulse dot teal para "en vivo"
- TickNumber para métricas updating
- Streaming text con cursor blink mono


## 13. Component patterns

### 13.1 Card interactive

```
rounded-xl border border-border bg-card
hover: -translate-y-0.5 shadow-glow-primary border-primary/40
transition-all duration-[280ms] ease-[var(--ease-out-expo)]
```

### 13.2 KPI hero

```
Container: rounded-2xl bg-card border border-border/60 overflow-hidden relative
  ::before: orb decorativa absoluta blur-3xl opacity-30
  Label: text-xs uppercase tracking-wider text-muted-foreground font-heading
  Value: text-5xl font-heading font-bold tabular-nums (Space Grotesk)
  Sub: text-xs text-muted-foreground + sparkline 60×20px
  Trend chip: bg-success/10 text-success rounded-full px-2 py-0.5 text-xs
```

### 13.3 Button primary

```
.gradient-primary text-primary-foreground
rounded-lg px-4 py-2 font-medium
hover: brightness-110 shadow-glow-primary -translate-y-0.5
active: translate-y-0 brightness-95
focus-visible: ring-2 ring-primary/50 ring-offset-2 ring-offset-background
```

### 13.4 Badge dominio

```
bg-{accent}/12 text-{accent} border border-{accent}/30
rounded-full px-2.5 py-0.5 text-xs font-medium
```

### 13.5 Section header con numero

```
01 / 04 ────────────  CORPUS HEALTH
^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^
mono primary/60       heading uppercase tracking-wider
```


## 14. Token Usage Rules (v2)

1. **Nunca** raw Tailwind palette en components: `slate-*`, `gray-*`, `zinc-*`, `emerald-*`, `red-*`, `amber-*`, `orange-*`, `purple-*`, `violet-*`, `indigo-*`. Usar `--accent-violet` no `violet-500`.
2. **Solo dos accents en una vista.** No mezclar 3+ accents simultáneos — caos cromático.
3. **Amber ≠ Warning.** Mantener distinción.
4. **Glass solo overlays.** No glass en cards de lista.
5. **Gradient text solo display hero.** Max 1 por viewport.
6. **Glow primary reservado.** Solo hover/focus/streaming/featured. No glow constante en todo.
7. **Mono para sistema, display para hero.** Body siempre Inter.
8. **Motion respeta reduce-motion.** No-essential cae a opacity-only.
9. **Decor SVG con propósito.** Cada orb/grid/blob refleja propiedad sistema (corpus, inferencia, dato).
10. **Bento sobre uniform grids** en dashboards. Asimetría = jerarquía visual.


## 15. Do / Don't (v2)

### Do
- `bg-card` no `bg-white`
- `border-border` no raw colors
- Hover lift + glow primary en cards interactivas
- Decor orbs en hero zones (max 2)
- Glass en popovers/modals
- Gradient en CTAs principales
- Stagger entrance en grids
- Sparklines inline en KPIs
- Empty state ilustrado custom
- Bento layouts en dashboards
- Accent violet/cyan/magenta por dominio
- Mono para todo número de sistema

### Don't
- `border-left: 3px` decorativo plano
- Glass en filas de tabla
- Gradient text en body
- Animar layout properties
- Mezclar 3+ accents en una vista
- "No data" plano
- Spinner página completa
- Cards todas mismo tamaño
- Decor orbs en zonas operativas densas
- Imitar Intercom/Linear/Notion/ChatGPT
- `dark:` overrides redundantes
- Amber para warning de sistema


## 16. Implementation roadmap

PR-0 (este): design.md v2
PR-1: Setup base — framer-motion install, decor SVG set, motion primitives (`_components/motion/`), atmospheric layers (radial glow, noise, grid utilities), sparkline component, skeleton shimmer pro, gradient catalog en globals.css, accent tokens (violet/cyan/magenta), elevation extra layers
PR-2: Skill `design-polish` con checklist v2
PR-3+: Iterar vistas — Settings → Observability → Conversations → Inbox → Dashboard → /chat widget (último)
