# DESIGN.md — Aleph Design System v3
> **La biblia.** Todo lo que conflictúe con este doc, pierde.
> Reescrito desde cero: 2026-06-27. El v2 "Deep Signal" fue descartado.

---

## 1. Filosofía

**"Una herramienta, no un espectáculo."**

Aleph es usado por dueños de PYMEs latinoamericanas en sesiones de 5-15 min desde laptop. El diseño debe:
- Comunicar estado de un vistazo — sin buscar
- Reducir fricción, no crear asombro visual
- Sentirse profesional sin sentirse frío
- Escalar sin romperse: de 1 chatbot a 10 sin rediseñar

### Anti-patrones prohibidos
- **Sábana de cajas** — contenedores del mismo tamaño, padding, peso. Se lee como "hecho con template".
- **Dark mode por defecto** — usuarios de negocio en oficina, pantallas brillantes.
- **Decoración sin función** — gradientes ambient, blobs, noise texture sin propósito funcional.
- **Form plano expuesto** — todos los campos de configuración abiertos al mismo tiempo.
- **Jerarquía flat** — cuando todo tiene el mismo énfasis, nada lo tiene.

---

## 2. Paleta de Color

### Superficies
| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--bg` | `#f8f9fb` | Fondo de página |
| `--surface` | `#ffffff` | Cards, sidebar, modals, drawers |
| `--surface-2` | `#f2f4f7` | Hover, inputs, fondos secundarios |
| `--surface-3` | `#e8ecf2` | Badges neutros, kbd hints |
| `--border` | `#e2e6ed` | Separadores suaves |
| `--border-strong` | `#c8cfd9` | Dropzone, elementos interactivos |

### Texto
| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--text` | `#0f172a` | Body principal |
| `--text-2` | `#475569` | Labels, texto secundario |
| `--text-3` | `#94a3b8` | Placeholder, hints, timestamps |
| `--text-inv` | `#ffffff` | Sobre fondos oscuros (botones) |

### Colores semánticos — cada uno tiene UN dominio funcional
| Token CSS | Hex | Dominio — no usar fuera de este rol |
|-----------|-----|-------------------------------------|
| `--brand` | `#0d9488` | CTA, acción principal, nav activo, seleccionado |
| `--brand-hover` | `#0b7c72` | Hover sobre brand |
| `--brand-light` | `#f0fdfa` | Fondos tinted brand (nav activo, badges) |
| `--brand-mid` | `#99f6e4` | Charts secundarios brand |
| `--cyan` | `#0891b2` | Datos live, RAG activo, streaming, canal Web |
| `--cyan-light` | `#e0f9ff` | Fondo cyan |
| `--amber` | `#d97706` | Handoff humano, atención manual, en proceso |
| `--amber-light` | `#fffbeb` | Fondo amber |
| `--violet` | `#7c3aed` | IA / modelo / sistema / respuesta del bot |
| `--violet-light` | `#f5f3ff` | Fondo violet |
| `--magenta` | `#db2777` | VIP, urgente, alertas críticas, badge counter |
| `--magenta-light` | `#fdf2f8` | Fondo magenta |
| `--green` | `#16a34a` | Éxito, resuelto, conectado, canal WhatsApp |
| `--green-light` | `#f0fdf4` | Fondo green |
| `--red` | `#dc2626` | Error, eliminar, crítico, bloqueado |
| `--red-light` | `#fef2f2` | Fondo red |

**Regla de oro:** Un elemento nunca cambia de color semántico. Amber siempre = humano. Violet siempre = IA. El usuario aprende el código de color sin leer documentación.

### Quick reference
| Situación | Color |
|-----------|-------|
| El usuario ejecuta una acción (CTA, submit) | brand/teal |
| El bot respondió usando RAG | cyan |
| Hay un humano involucrado (handoff, agente) | amber |
| El sistema de IA hizo algo | violet |
| Algo urgente o VIP | magenta |
| Todo salió bien | green |
| Algo falló | red |
| Sin contexto especial | neutral/gray |

---

## 3. Tipografía

```css
--font-head: 'Space Grotesk', system-ui, sans-serif;  /* Headings, brand, KPIs */
--font-body: 'Inter', system-ui, sans-serif;            /* Body, UI, labels */
--font-mono: 'DM Mono', 'JetBrains Mono', monospace;   /* Code, IDs, tokens, valores técnicos */
```

### Escala
| Rol | Tamaño | Peso | Familia |
|-----|--------|------|---------|
| Page title | 22-28px | 700 | Space Grotesk |
| Card title | 15-17px | 700 | Space Grotesk |
| KPI value | 24-32px | 700 | Space Grotesk |
| Section label | 11px UPPERCASE | 600 | Inter |
| Body | 14px | 400 | Inter |
| Body medium | 14px | 500-600 | Inter |
| Small/hints | 12px | 400 | Inter |
| Mono | 13px | 400-500 | DM Mono |

**Regla de jerarquía:** La diferencia entre el elemento más grande y el más pequeño visible en pantalla debe ser al menos 3x. Sin esto, la página se ve plana.

---

## 4. Espaciado y Radios

**Grid base: 4px**
```
Valores: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

```css
--radius:     8px;   /* Inputs, buttons, badges */
--radius-lg:  12px;  /* Cards */
--radius-xl:  16px;  /* Modals, panel headers */
--radius-2xl: 24px;  /* Command palette */
```

**Padding de cards:**
- Card estándar: `20px`
- Card compacta (stat, KPI secundario): `14px`
- Card hero (settings section header): `32px`

---

## 5. Sombras

```css
--shadow-sm: 0 1px 3px rgba(15,23,42,.07);    /* Cards en reposo */
--shadow:    0 4px 16px rgba(15,23,42,.09);   /* Hover, dropdowns, popovers */
--shadow-lg: 0 12px 40px rgba(15,23,42,.14);  /* Modals, drawers, overlays */
```

---

## 6. Componentes — shadcn/ui como base

**Regla:** shadcn/ui para todos los componentes. No reinventar lo que shadcn tiene.

| Componente shadcn | Personalización en Aleph |
|-------------------|--------------------------|
| `Button` | Variantes: default(brand), secondary, ghost, destructive, outline |
| `Input` / `Textarea` | Focus ring brand color |
| `Select` | Radix-based, icons Lucide en triggers |
| `Checkbox` / `Switch` / `RadioGroup` | Accent brand |
| `Dialog` | Modal estándar: shadow-lg, radius-xl |
| `Sheet` | Drawer derecho por default; para formularios de detalle |
| `Command` | Command Palette global: ⌘K / Ctrl+K |
| `Sonner` (toast) | Ya instalado; estilos brand |
| `Table` | Con checkbox bulk, sort indicators, row actions |
| `Tabs` | Para settings internos y multi-panel |
| `Badge` | Extendido con variantes semánticas |
| `Tooltip` | Radix-based, delay 400ms |
| `DropdownMenu` | Con iconos Lucide |
| `Progress` | Color dinámico: brand/amber/red por valor |
| `Slider` | Accent brand |
| `Avatar` | Fallback con iniciales, tamaños sm/md/lg |
| `Skeleton` | Shimmer animation para loading states |
| `Popover` | Para filtros, pickers, info contextual |
| `Calendar` | Picker de fecha para filtros |

---

## 7. Patrones de Layout

### ❌ Sábana de cajas (prohibido)
```
[card] [card] [card]
[card] [card] [card]
[card] [card] [card]
← Todo el mismo tamaño. Plano. Sin jerarquía.
```

### ✅ Jerarquía visual (requerido)
```
[  CARD HERO grande — chart o métrica dominante  ] [stat card]
                                                   [stat card]
                                                   [stat card]
[ tabla o lista full-width con acciones por fila           ]
```

### Pattern: Bento Grid
- Una card dominante (60-70% del ancho)
- Stats pequeños apilados al costado
- Tabla o lista full-width abajo
- Nunca más de 4 columnas iguales en dashboard

### Pattern: Settings con sidebar interno
```
┌─────────────────────────────────────────────────┐
│  [Sidebar 220px]  │  [Contenido principal]       │
│  ─────────────   │  ───────────────────────────  │
│  General          │  [Hero: nombre + estado]      │
│  Integraciones    │  [Descripción de la sección]  │
│  Notificaciones   │  ─────────────────────────    │
│  Seguridad        │  [Filas de config visibles]   │
│  Equipo           │  label      [control/valor]   │
│                   │  label      [control/valor]   │
│                   │  ─────────────────────────    │
│                   │  [Editar → Sheet lateral]     │
└─────────────────────────────────────────────────┘
```
- Sidebar interno: 200-240px
- El contenido principal muestra el ESTADO ACTUAL (qué está configurado)
- Para editar detalles → `Sheet` lateral o `Dialog`
- Nunca formulario completo expuesto en la vista principal

---

## 8. Iconos — Lucide React

**Library:** `lucide-react ^0.513` (ya instalado)
- Tamaño en UI: `16px`
- Tamaño en KPI icons: `20px`
- Tamaño en empty states: `28px`
- Stroke width: `1.5` (default Lucide)

**Iconos clave del sistema:**
```
layout-dashboard   Dashboard
message-square     Conversaciones
database           Corpus
activity           Observabilidad
settings           Configuración
inbox              Inbox / Kanban
hand               Handoff (amber)
bot / brain        IA / modelo (violet)
zap                RAG activo (cyan)
users              Leads / contactos
trending-up/down   Deltas KPI
check-circle-2     Éxito / resuelto (green)
alert-circle       Error / advertencia (red)
command            Command Palette
send               Enviar mensaje
upload / file-up   Subir documento
trash-2            Eliminar
external-link      Abrir detalle
panel-right        Abrir drawer
move               Drag or reorder
```

---

## 9. Motion

**Principio:** motion que clarifica el flujo, nunca que distrae.

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* Elementos que entran */
--ease-in:     cubic-bezier(0.4, 0, 1, 1);       /* Elementos que salen */
--duration-fast:   120ms;   /* Hover, focus rings */
--duration-normal: 220ms;   /* Modals, sheets, toasts */
--duration-slow:   350ms;   /* Page transitions */
```

**Implementación:** `framer-motion` para componentes complejos (drawers, modals, kanban cards). CSS transitions para hover/focus simples.

**Siempre respetar:** `prefers-reduced-motion` — usar `useReducedMotion()` de framer-motion en cada componente animado.

---

## 10. Accesibilidad (WCAG 2.1 AA)

- Contraste mínimo: 4.5:1 texto normal, 3:1 texto grande
- Todos los inputs: label visible (no solo placeholder)
- Focus ring: `box-shadow: 0 0 0 3px rgba(13,148,136,.2)` (brand con transparencia)
- Keyboard nav completa: modals, command palette, drawers, kanban
- `aria-label` obligatorio en botones icon-only
- `aria-live` en toasts y estados que cambian sin acción del usuario

---

## 11. Tailwind Config (referencia de tokens)

Los tokens CSS de arriba se mapean en `frontend/tailwind.config.ts` como:
```
bg-brand, text-brand, border-brand
bg-brand-light, text-brand  → fondos tinted
text-text-2, text-text-3    → jerarquía de texto
bg-surface, bg-surface-2    → capas de superficie
```

Ver archivo para el mapeo completo.

---

## 12. Componentes de shadcn a instalar en Fase 0

```bash
yarn dlx shadcn@latest init
yarn dlx shadcn@latest add button card input label textarea select
yarn dlx shadcn@latest add badge dialog sheet command tabs separator
yarn dlx shadcn@latest add skeleton avatar tooltip dropdown-menu
yarn dlx shadcn@latest add scroll-area progress slider popover
yarn dlx shadcn@latest add table form calendar sonner
```
