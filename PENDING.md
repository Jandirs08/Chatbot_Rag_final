# PENDING — Aleph Deep Signal v2

Estado work-in-progress + bloqueadores.

---

## 🚀 CÓMO CONTINUAR MAÑANA

### Paso 0 — Build frontend EN CASA (red sin MITM)

**Recomendado.** En red corp el build falla por TLS MITM (Fortinet FortiGate intercepta `registry.npmjs.org`). Diagnóstico 2026-05-15:

- Error: `yarn install` → `unable to verify the first certificate`
- Issuer cert: `O=Fortinet, CN=FG200FT923921608`
- CA Fortinet **no presente** en trust stores Windows del equipo (ni `LocalMachine\Root` ni `CurrentUser\Root`) → no se puede inyectar al contenedor sin pedirla a IT.

**Flujo casa:**
```powershell
git pull
docker compose stop frontend
docker compose build --no-cache frontend
docker compose up -d frontend
```

Una vez instalado, `node_modules` queda dentro del volumen del contenedor. Al volver a corp no se reinstala salvo que cambie `package.json`.

Librería pendiente actualmente: `framer-motion@^12.38.0` (animaciones en `_components/motion/` usadas por 5 vistas admin).

### Paso 1 — Arregla red corp (si vuelves a corp net)

Sigue **B-4** abajo. Mínimo necesario para que `docker-compose build` funcione.

Alternativa rápida: comparte datos móvil → build → vuelves a corp.

### Paso 2 — Rebuild docker frontend

```powershell
docker-compose stop frontend
docker-compose build --no-cache frontend
docker-compose up -d frontend
docker-compose logs -f frontend
```

### Paso 3 — Valida 5 vistas transformadas

Abre en orden:
- `http://localhost:3000/dashboard`
- `http://localhost:3000/admin/observability`
- `http://localhost:3000/admin/conversations`
- `http://localhost:3000/admin/inbox`
- `http://localhost:3000/admin/settings`

Toma notas: qué se siente bien, qué falla, qué amplificar.

### Paso 4 — Continúa con Claude

Abre nueva sesión Claude Code en este directorio.

**Skill disponible:** `design-polish` (project-local, ya creado en `.claude/skills/design-polish/`).

**Cómo invocar:**

```
/design-polish inventory
```
→ muestra roadmap status + vistas pendientes.

```
/design-polish transform dashboard-home
```
→ transforma `/` (homepage admin, PR-8 siguiente).

```
/design-polish audit dashboard
```
→ auditea vista existente vs design.md v2, reporta gaps.

```
/design-polish polish settings
```
→ pulido final pre-merge.

```
/design-polish bolder conversations
```
→ amplifica si quedó tímida.

**Subcomandos disponibles:**

| Cmd | Qué hace |
|-----|----------|
| `transform <view>` | Reskin completo per receta paleta |
| `audit <view>` | Gap analysis vs design.md v2 |
| `polish <view>` | Final pass pre-merge |
| `bolder <view>` | Amplifica timidez |
| `inventory` | Estado roadmap |

**Sin subcomando:** muestra menú.

### Paso 5 — Orden recomendado tomorrow

1. Si después de validar quieres seguir transformaciones:
   ```
   /design-polish transform dashboard-home
   ```
   (después PR-9 playground, PR-10 auth, PR-11 chat widget LAST)

2. Si validación reveló problemas en vistas ya hechas:
   ```
   /design-polish bolder dashboard
   ```
   (o cualquier vista que se sienta tibia)

3. Si quieres deep polish sub-componentes (FU-A/B/C/D abajo):
   Pídele al Claude:
   > "Lanza PR-FU-A: deep polish sub-componentes inbox/conversations shared (KanbanCard, ChatDetail, etc.)"

### Frases útiles para abrir sesión Claude tomorrow

> "Estamos en branch master con PRs 0-7 hechos. Lee PENDING.md primero. Quiero validar X / continuar PR-Y."

> "Lee PENDING.md y design.md v2. Continúa donde quedamos."

> "/design-polish inventory"

### Notas

- **Skill ya registrada** y visible en Claude (probado, aparece en skills list).
- **Reviewer agent automático** se lanza dentro del subcomando `transform` post-transformación. No necesitas pedirlo aparte.
- **Caveman mode** sigue activo si no lo desactivas (`stop caveman` para apagar).
- **PENDING.md** = source of truth estado. Si Claude tomorrow pierde contexto, este archivo lo resuelve.

---

## 🔴 BLOQUEADO — Red corporativa (SSL inspection)

Causa: proxy MITM (Zscaler/Netskope/similar) bloquea TLS dentro contenedor Alpine. Cert corp en Windows host pero no en Docker.

### B-1. Instalar libs UX extras (PR-2a diferido)

```powershell
cd frontend
npm install @tabler/icons-react cmdk vaul
```

Sin estos: lucide cubre iconografía funcional. Vistas se transforman OK pero menos variedad decorativa + sin command palette + sin drawer mobile.

### B-2. Rebuild docker frontend container

Container necesita reconstruir para chapar:
- framer-motion (instalado host post PR-1, falta en container)
- libs B-1 cuando se resuelva
- Decor SVG `/public/assets/decor/*` (vol bind monta, build limpio asegura)
- Tokens nuevos globals.css + tailwind.config.ts
- 6 vistas transformadas (page.tsx files)

```powershell
docker-compose stop frontend
docker-compose build --no-cache frontend
docker-compose up -d frontend
docker-compose logs -f frontend
```

### B-3. Validación visual real

Cuando docker frontend levante en `:3000`:

- `http://localhost:3000/dashboard` — PR-3 validation (analytics, hero teal+cyan+amber)
- `http://localhost:3000/admin/observability` — PR-4 validation (telemetry teal+cyan+violet)
- `http://localhost:3000/admin/conversations` — PR-5 validation (split teal+amber+violet)
- `http://localhost:3000/admin/inbox` — PR-6 validation (kanban teal+amber+magenta+cyan)
- `http://localhost:3000/admin/settings` — PR-7 validation (sidebar teal+violet+amber)

### B-4. Fix proper cert corp (cuando vuelvas a red corp)

**Contexto confirmado (2026-05-15):** firewall corp = Fortinet FortiGate (`FG200FT923921608`). CA raíz **no está en trust stores Windows** del equipo de trabajo — pedirla a IT o exportarla desde Chrome cuando navegues a un sitio HTTPS interceptado (Chrome → candado → "Conexión segura" → Certificado → Detalles → exportar root como `.crt`/`.cer`).

**A. Copiar cert corp dentro container (recomendada):**

1. Identifica cert corp:
   ```powershell
   Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "Fortinet|Zscaler|Netskope|Forcepoint" } | Format-List Subject, Issuer
   ```

2. Exporta:
   ```powershell
   $cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "*<patron>*" }
   $cert | Export-Certificate -FilePath frontend\corp-ca.crt -Type CERT
   ```

3. Modificar `frontend/Dockerfile.dev`:
   ```dockerfile
   COPY corp-ca.crt /usr/local/share/ca-certificates/
   RUN cat /usr/local/share/ca-certificates/corp-ca.crt >> /etc/ssl/certs/ca-certificates.crt \
       && update-ca-certificates
   ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
   ```

4. Rebuild docker.

**B. Build fuera red corp (atajo, no permanente):** móvil tethering momentáneo, build container, vuelve red corp.

**C. Registry interno empresa:** consultar IT por Nexus/Artifactory mirror npm con cert propio.

---

## 🟡 ROADMAP — Estado vistas

| # | Vista | Route | Receta | Estado |
|---|-------|-------|--------|--------|
| 1 | Dashboard analytics | `/dashboard` | teal + cyan + amber | ✅ PR-3 done + polished |
| 2 | Observability | `/admin/observability` | teal + cyan + violet | ✅ PR-4 done + polished |
| 3 | Conversations | `/admin/conversations` | teal + amber + violet sutil | ✅ PR-5 done + polished |
| 4 | Inbox kanban | `/admin/inbox` | teal + amber + magenta + cyan | ✅ PR-6 done + polished |
| 5 | Settings/Brain | `/admin/settings` | teal + violet + amber sutil | ✅ PR-7 done + polished |
| 6 | Dashboard home | `/` | teal + cyan + amber | ⏳ PR-8 next |
| 7 | Playground | `/dashboard/playground` | teal + cyan + violet | ⏳ PR-9 |
| 8 | Auth | `/auth/login` | teal + violet + magenta sutil | ⏳ PR-10 |
| 9 | Chat widget | `/chat` | teal + amber | ⏳ PR-11 (LAST) |

---

## 🟠 FOLLOW-UP — Deep polish sub-componentes

Reviews flag varios sub-componentes shared que viven fuera del scope per-vista. Pendientes para PRs posteriores:

### PR-FU-A: Conversations + Inbox shared `_components`
- `app/admin/inbox/_components/KanbanCard.tsx` — HoverLift + glow per dominio + accent dominio per column
- `app/admin/inbox/_components/KanbanColumn.tsx` — section header con icono + numbered
- `app/admin/inbox/_components/InboxConversationCard.tsx` — accent VIP magenta, amber timer
- `app/admin/inbox/_components/ConversationList.tsx` — row HoverLift + accent dominio
- `app/admin/inbox/_components/ChatDetail.tsx` — chat bubbles teal/amber, metadata violet sutil
- `app/admin/inbox/_components/EmptyState.tsx` — decor SVG ilustrado
- `app/admin/inbox/_components/InboxToolbar.tsx` — tabs accent dominio, icon en cada filtro

### PR-FU-B: Observability telemetry sections
- `app/admin/observability/_components/KPISection.tsx` — usar TickNumber + Sparkline + dominio cyan
- `app/admin/observability/_components/ServicesSection.tsx` — dominio violet en metadata + cyan latencias
- `app/admin/observability/_components/PipelineSection.tsx` — accent dominio per stage type (IO=cyan, model=violet)
- `app/admin/observability/_components/ThroughputSection.tsx` — sparkline cyan
- `app/admin/observability/_components/TokensSection.tsx` — accent violet (consumo IA)
- `app/admin/observability/_components/GatingSection.tsx` — accent dominio per gate
- `app/admin/observability/_components/AlertBanner.tsx` — banner reskin
- `app/admin/observability/_components/KnowledgeGapsTab.tsx` — empty state ilustrado

### PR-FU-C: Settings tab content
- `components/admin/settings/SettingsAppearanceTab.tsx` — hero per-tab, sections numeradas
- `components/admin/settings/SettingsBrainTab.tsx` — accent violet IA, sections numeradas, slider HoverLift
- `components/admin/settings/SettingsSystemTab.tsx` — section numeradas, empty/error ilustrados

### PR-FU-D: Dashboard analytics deep polish
- Activity chart: card chrome con eyebrow numerado interno
- HandoffSection: amplify amber human zone
- LeadsTable: row HoverLift + accent badges

---

## 🟢 INFO — PRs completados

- ✅ **PR-0** — `design.md` v2 reescrito (sections 0-16, motion first-class, paleta extendida, decor permitido, glass overlays permitido, gradients catálogo)
- ✅ **PR-1** — Setup base: framer-motion + decor SVG set (15 archivos) + motion primitives (`_components/motion/`) + Sparkline (`_components/charts/`) + atmospheric layers (glow radial body dual + noise grain global + bg-grid utility) + accent tokens (violet/cyan/magenta light+dark) + glow shadows (4 colors) + gradient catalog. RootLayoutClient inyecta noise grain global. Tailwind config extendido (colors, easings, durations, shadows).
- ✅ **PR-2b** — Skill `design-polish` project-local con SKILL.md + 5 references (checklist-v2, primitives, views-roadmap, transform-recipe, anti-patterns-aleph, reviewer-prompt) + script `load-aleph-context.mjs`. Routes a impeccable internals.
- ⏸ **PR-2a** — Libs tabler/cmdk/vaul → bloqueado (ver B-1)
- ✅ **PR-3** — `/dashboard` analytics transform. Hero zone con orbs teal+cyan + bento KPIs 6/3/3/12 + sparklines + TickNumber + PulseDot + section dividers numerados 01-04 + empty states ilustrados (EmptyLeads, EmptyMini, EmptyIllustrated reusable). Reviewer POLISH → 6 fixes aplicados (em dash, emoji ⚠, handoff bars `width%` → `scaleX()`, 3 accents → 2 accents, EmptyMini ilustrado, HandoffSection empty ilustrado).
- ✅ **PR-4** — `/admin/observability` transform. Hero zone con orbs cyan+violet + embedding-cloud (metáfora RAG) + pulse-wave + 5 sections numeradas 02-06 con iconos dominio (Zap cyan, Database violet, Workflow teal, BarChart3 cyan, Coins violet) + tabs reskin (primary glow vs violet glow) + skeleton fiel layout. Reviewer POLISH → fixes (skeleton fiel, decor metáfora RAG, em dash → "s/d"). PageHeader.tsx orphan eliminado.
- ✅ **PR-5** — `/admin/conversations` transform. Compact hero strip con orbs teal+violet + grid bg + MessagesSquare icon + display gradient + PulseDot live + TickNumber count + Inbox amber icon + auto-refresh microcopy. Reviewer POLISH → fix receta (magenta→violet sutil), title bump text-3xl→4xl, dead shadow class removed. Sub-componentes shared con inbox intactos (follow-up).
- ✅ **PR-6** — `/admin/inbox` kanban transform. Top bar hero strip con orbs magenta+cyan + grid bg + InboxIcon amber + display gradient + cyan PulseDot "en vivo · 5s" (tickeando dominio) + TickNumber count + skeleton fiel kanban layout. Reviewer POLISH → fixes (live chip success→cyan, numbered eyebrow `04/09`). DnD/Board/cards intactos (follow-up).
- ✅ **PR-7** — `/admin/settings` transform. Sidebar hero con eyebrow numerado `07/09` + orb violet + bg-grid + display gradient + SettingsIcon violet + active nav buttons accent-violet glow + amber dirty dot + runtime dialog glass border violet + empty state runtime ilustrado (empty-brain.svg + grid fade + reintentar CTA). Reviewer POLISH → empty state ilustrado runtime dialog. Tab content sub-componentes intactos (follow-up).
