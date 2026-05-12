# AUTOPSIA_UI — Auditoría Dashboard + Observabilidad
**Fecha:** 2026-05-12  
**Alcance:** `/dashboard` · `/admin/observability`  
**Archivos analizados:** 9

---

## Problemas Críticos

### `observability/page.tsx` — 578 líneas, 1 componente
- Viola single responsibility. Split necesario: Header, KPIs, Services, Pipeline, Throughput, Gating, Tokens
- 6 `useMemo` con dependencias solapadas → consolidar en objeto memoizado único
- 3 `useSWR` separados → 1 endpoint o batched fetch
- 6 `useRingBuffer` con patrón idéntico → array/object initialization
- Sin error boundary — falla silenciosa si cambia shape del dato
- 2 alert banners con estilos duplicados → extraer componente

### `dashboard/page.tsx` — 505 líneas
- `AlertCircle` importado pero no usado (línea 14) → dead import
- Gradient IDs hardcodeados (`grad-mensajes`) → usar `useId()`
- `todayStr`/`lastRefreshStr` inicializan como string vacío → flash de estado vacío en mount
- Funciones `fmt`, `fmtNum`, `fmtHour` repetidas en múltiples archivos → necesitan utils compartida

---

## Código Muerto

| Archivo | Qué | Dónde |
|---------|-----|-------|
| `dashboard/page.tsx` | Import `AlertCircle` no usado | línea 14 |
| `DashboardClient.tsx` | `_checked: boolean` en `handleBotToggle` nunca usado | línea 63 |
| `telemetry.css` | Clase `.t-tile-deep` sin uso detectado | líneas 155–160 |

---

## Rendimiento

| Archivo | Problema | Fix |
|---------|---------|-----|
| `GatingBars.tsx` | `[...items].sort()` en cada render | Envolver en `useMemo` |
| `PipelineWaterfall.tsx` | `p50Opacity * 0.28` calculado inline múltiples veces | Extraer a variable |
| `DashboardStats.tsx` | `requestAnimationFrame` cleanup no garantizado si efecto re-corre durante animación | Cancelar en cleanup con `cancelAnimationFrame(raf)` |
| `telemetry.css` | Font family `'Space Grotesk', system-ui, sans-serif` repetida 6+ veces | `var(--font-heading)`, `var(--font-mono)` |
| `HelpTooltip.tsx` | `delayDuration={0}` → tooltip aparece instantáneo, puede hacer flash | Usar 200ms por defecto |
| `DashboardClient.tsx` | `fmt()` definida dentro de `useEffect` → recrea en cada ejecución | Extraer fuera del efecto |

---

## Redundancia

- `fmt()` / `fmtNum()` / `fmtHour()` duplicadas en `DashboardClient.tsx`, `dashboard/page.tsx`, `DashboardStats.tsx` → mover a `lib/format.ts`
- Alert banners duplicados en observability con estilos idénticos → componente `<AlertBanner>`
- `color-mix(in oklab, ...)` repetido en CSS → CSS custom properties para tints comunes
- Checks `s.p50 != null` dispersos en `PipelineWaterfall.tsx` → pre-computar booleans `hasPData`, `hasP95Data`

---

## Accesibilidad

| Archivo | Problema | Fix |
|---------|---------|-----|
| `GatingBars.tsx` | Checkmark SVG con `aria-hidden` sin equivalente semántico | Añadir `role="img"` + `aria-label` o texto visualmente oculto |
| `HelpTooltip.tsx` | `aria-label="Más información"` genérico | Label contextual basado en contenido del tooltip |
| `telemetry.css` | `prefers-reduced-motion` solo aplica a `.t-glyph` | Cubrir `t-breathe`, `t-data-enter`, `t-num-fade` también |

---

## Calidad de Código

| Archivo | Problema |
|---------|---------|
| `DashboardStats.tsx` | `duration` en dependency array de `useEffect` pero nunca cambia (hardcodeado) |
| `DashboardStats.tsx` | `useCountUp` chequea `prefersReduced.current` en cada render pero refs no disparan re-render |
| `TelemetryMetric.tsx` | `key={value}` en span para animación — anti-patrón, keys deben ser IDs estables |
| `PipelineWaterfall.tsx` | `COLS = "8rem 1fr 5rem 4.5rem 3rem"` sin documentar propósito de cada columna |
| `GatingBars.tsx` | 13 label-description hardcodeados — debería venir de API o i18n |
| `observability/page.tsx` | Thresholds mágicos (`15s`, `8s`) sin documentar por qué esos valores |

---

## Prioridades de Acción

| # | Prioridad | Tarea |
|---|-----------|-------|
| 1 | 🔴 Alto | Refactorizar `observability/page.tsx` en sub-componentes |
| 2 | 🔴 Alto | Extraer `fmt*` helpers a `lib/format.ts` compartida |
| 3 | 🟡 Medio | `useMemo` en `GatingBars` sort + cleanup correcto en `DashboardStats` animation |
| 4 | 🟡 Medio | `useId()` para gradient IDs en dashboard |
| 5 | 🟡 Medio | Cubrir todas las animaciones con `prefers-reduced-motion` |
| 6 | 🟢 Bajo | Limpiar dead imports y clase `.t-tile-deep` CSS |
| 7 | 🟢 Bajo | `delayDuration` default en `HelpTooltip` |

---

## Totales

| Categoría | Cantidad |
|-----------|---------|
| Problemas de rendimiento | 6 |
| Código muerto | 3 |
| Redundancia | 4 |
| Calidad de código | 6 |
| Accesibilidad | 3 |
| **Total** | **22** |
