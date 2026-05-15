# PR-1 Primitives Inventory

All available primitives the skill MUST reuse. Never invent inline alternatives.

## Motion components — `@/app/_components/motion`

| Component | Import | When to use |
|-----------|--------|-------------|
| `FadeIn` | `import { FadeIn } from "@/app/_components/motion"` | Mount entrance any single card/section. Props: `delay`, `y`, `duration`. |
| `Stagger` + `StaggerItem` | same | Grids/lists entrance. Stagger 40ms default. Wrap parent in Stagger, each child in StaggerItem. |
| `Presence` | same | Toasts, popovers, modales, conditional UI. Modes: `fade` / `scale` / `slide-up`. |
| `HoverLift` | same | Interactive cards. Glow color elegible: `primary` / `violet` / `cyan` / `magenta` / `none`. |
| `TickNumber` | same | Live numeric metrics. Props: `value`, `decimals`, `suffix`, `prefix`. Spring animation. |
| `PageTransition` | same | Wrap page-level content for route transitions. |
| `PulseDot` | same | "Live" state indicator. Colors: primary/success/warning/error/amber/violet/cyan/magenta. |
| `motionTokens` | same | Tokens for custom motion if needed: ease, spring, duration, stagger. |

## Charts — `@/app/_components/charts`

| Component | Import | When to use |
|-----------|--------|-------------|
| `Sparkline` | `import { Sparkline } from "@/app/_components/charts/Sparkline"` | Inline mini-chart in KPI cards. Pure SVG. Props: `data`, `width`, `height`, `color`, `fill`, `strokeWidth`. |

Existing recharts components (ResponsiveContainer/AreaChart/BarChart) remain for full-size charts.

## Decor SVG — `/assets/decor/`

| Path | Use case |
|------|----------|
| `glow-orb-teal.svg` | Hero decor, primary surfaces |
| `glow-orb-violet.svg` | Brain/Settings hero, AI/system zones |
| `glow-orb-cyan.svg` | Observability hero, data-live zones |
| `glow-orb-magenta.svg` | Inbox VIP, escalation moments |
| `noise-grain.svg` | Global atmospheric layer (already applied in RootLayoutClient) |
| `corpus-strands.svg` | RAG metáfora — knowledge graph |
| `embedding-cloud.svg` | RAG metáfora — vector space |
| `signal-bars.svg` | Activity metáfora |
| `pulse-wave.svg` | Streaming/live metáfora |
| `divider-numbered.svg` | Section divider with center dot |
| `empty-conversations.svg` | Empty conversations list |
| `empty-metrics.svg` | Empty analytics/observability |
| `empty-brain.svg` | Empty corpus/settings |
| `empty-inbox.svg` | Empty inbox |
| `empty-search.svg` | No search results |

Usage: render as `<img src="/assets/decor/<file>.svg" alt="" />`. For decor SVGs that use `currentColor`, wrap parent with `text-primary` / `text-accent-violet` etc.

## CSS utilities (globals.css)

| Class | Purpose |
|-------|---------|
| `.bg-grid` | Grid SVG background with radial fade |
| `.bg-grid-dense` | Tighter 12px grid |
| `.bg-noise` | Noise grain (already applied globally; use only for opt-in zones) |
| `.gradient-primary` | Linear teal→darker teal — CTAs |
| `.gradient-primary-cyan` | Teal→cyan |
| `.gradient-violet-cyan` | Violet→cyan |
| `.gradient-aurora` | Multi-radial teal+violet+cyan |
| `.gradient-soft` | Subtle teal+violet wash for hero backgrounds |
| `.gradient-hero-display` | Text gradient foreground→primary (use 1 per viewport max) |
| `.glass` | Backdrop blur + saturate (OVERLAYS ONLY) |
| `.card-lift` | Hover lift + glow primary + border tint (CSS-only) |
| `.shadow-glow-primary/violet/cyan/magenta` | Glow halo box-shadows |
| `.animate-orb-float` | 18s float animation for decor orbs |
| `.animate-pulse-glow` | 2.4s pulse halo for live indicators |
| `.skeleton-shimmer` | Pro shimmer for loading skeletons |
| `.text-label` | Caps + tracking for KPI labels (Space Grotesk 500 12px) |
| `.font-data` / `.tabular-data` | DM Mono tabular-nums for system metrics |
| `.bg-amber` / `.text-amber` / `.border-amber` | Amber personality |
| `.bg-accent-violet` / `.text-accent-violet` / `.border-accent-violet` | Violet dominio |
| `.bg-accent-cyan` / `.text-accent-cyan` / `.border-accent-cyan` | Cyan dominio |
| `.bg-accent-magenta` / `.text-accent-magenta` / `.border-accent-magenta` | Magenta dominio |

## Icon libraries

| Lib | Import | When |
|-----|--------|------|
| `lucide-react` | `import { Activity } from "lucide-react"` | Functional UI — actions, navigation, status. 16/20/24px. Stroke 1.75. |
| `@tabler/icons-react` (PR-2a) | `import { IconBrain } from "@tabler/icons-react"` | Decorative/personality icons (hero, empty states, section accents). 4900+ variety. |

## UX libs (PR-2a)

| Lib | When |
|-----|------|
| `cmdk` | Command palette Cmd+K. Use for global search/navigation. |
| `vaul` | Mobile bottom-sheet drawer (better than Radix Dialog on touch). |

## Tailwind extensions (tailwind.config.ts)

- Colors: `accent-violet`, `accent-cyan`, `accent-magenta` (with `-foreground`)
- Easing: `ease-out-expo`, `ease-out-back`, `ease-in-out-circ`
- Duration: `320`, `560` ms
- Box-shadow: `glow-primary`, `glow-violet`, `glow-cyan`, `glow-magenta`

## Fonts

Already wired via next/font:
- `--font-sans` Inter — body
- `--font-heading` Space Grotesk — headings, labels, KPI display
- `--font-mono-ui` DM Mono — system metrics
- `--font-telemetry-mono` JetBrains Mono — telemetry-specific
