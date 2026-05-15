# Views Roadmap — Receta paleta per view

Each view has a **paleta receta**: primary teal always + 1–3 accents from {violet, cyan, magenta} + amber/status colors as needed. Never monocromatic. Max 3 accents visible simultaneously beyond primary.

## Roadmap order + status

| Order | View | Route | Receta paleta | Dominio rationale | Status |
|-------|------|-------|---------------|-------------------|--------|
| 1 | Dashboard analytics | `/dashboard` | teal + cyan + amber | datos live + actividad humana | ⏳ pending (target PR-3) |
| 2 | Observability | `/admin/observability` | teal + cyan + violet | datos live + IA/sistema | ⏳ pending |
| 3 | Conversations | `/admin/conversations` | teal + amber + violet (sutil) | humano principal, IA acento | ⏳ pending |
| 4 | Inbox kanban | `/admin/inbox` | teal + amber + magenta (VIP) + cyan (live) | full personalidad | ⏳ pending |
| 5 | Settings/Brain | `/admin/settings` | teal + violet + amber (sutil) | IA/sistema, persona bot | ⏳ pending |
| 6 | Dashboard home | `/` | teal + cyan + amber | landing admin | ⏳ pending |
| 7 | Playground | `/dashboard/playground` | teal + cyan + violet | dato + IA experimental | ⏳ pending |
| 8 | Auth | `/auth/login` | teal + violet + magenta sutil | hero brand entry | ⏳ pending |
| 9 | Chat widget | `/chat` | teal + amber | conversación humana | ⏳ pending (LAST) |

## Application rules per receta

### Dashboard analytics — teal + cyan + amber
- Primary CTAs: teal
- Activity/streaming metrics: cyan glow + cyan sparklines
- Leads/human moments: amber accents
- Hero orb: teal + cyan secondary
- Decor metáfora: signal-bars or pulse-wave

### Observability — teal + cyan + violet
- Primary CTAs: teal
- Live telemetry / latency / streaming: cyan (TickNumber + sparklines cyan)
- AI metadata / model latency / embeddings: violet
- Pipeline waterfall: cyan for IO, violet for model
- Hero orbs: cyan + violet
- Decor metáfora: pulse-wave + embedding-cloud

### Conversations — teal + amber + violet sutil
- Primary action: teal
- Human messages: amber accents (avatar ring, unread)
- Bot messages: teal
- AI/system metadata (model used, tokens): violet sutil (only on metadata strip)
- Hero orb: teal + amber
- Decor metáfora: corpus-strands (subtle background)

### Inbox kanban — teal + amber + magenta + cyan
- Primary: teal
- Conversación waiting: amber timer + amber unread
- VIP / escalation cards: magenta border + magenta glow
- Live-tickeando metrics: cyan
- Column headers: dominio per column type
- Hero orb: amber + magenta
- Decor: signal-bars per column

### Settings/Brain — teal + violet + amber sutil
- Primary: teal
- Brain config / persona / prompts: violet
- Color picker / brand: keep primary teal
- Active config: amber sutil indicator
- Hero orb: teal + violet
- Decor metáfora: embedding-cloud + corpus-strands

### Dashboard home — teal + cyan + amber
- Same as Dashboard analytics receta
- Lighter content, more hero presence
- Aleph ℵ watermark preserved (signature element)

### Playground — teal + cyan + violet
- Primary: teal
- Run/execute: cyan glow
- Model output: violet metadata
- Hero gradient: primary-cyan
- Decor metáfora: pulse-wave + embedding-cloud

### Auth — teal + violet + magenta sutil
- Hero brand zone: gradient-aurora (full atmosphere)
- Primary CTA: teal
- Brand watermark: ℵ large
- Decor: glow-orb-teal + glow-orb-violet floating

### Chat widget — teal + amber
- Conservative: bot brand color (admin-configurable) overrides primary
- Human messages: amber accents
- Streaming: PulseDot teal + cursor
- NO violet/cyan/magenta (widget = customer-facing, restraint)
- No hero zone (compact)

## Combinatorial rules

- Never **3+ accents in same card**. Card scope = max 2 accents.
- Per **view-wide**, max 3 accents simultáneamente visibles.
- Amber + status colors don't count as accents — they're personality/semantic.
- Primary teal is omnipresent and doesn't count toward the limit.
- If a view has multiple zones (hero, KPIs, table), each zone can have a different sub-receta as long as the view-wide cap holds.

## Identity preservation

Across all views:
- Teal primary always present (CTAs, focus, brand)
- Space Grotesk headings + Inter body + DM Mono metrics
- Dark BG petroleum void with dual radial glow (teal upper, violet lower)
- Noise grain global (already in RootLayoutClient)
- Aleph ℵ watermark preserved in hero zones where appropriate

Identity is the constant. Receta is the variation. User should recognize "this is Aleph" in any view while each view has its own personality.
