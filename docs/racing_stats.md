# Racing & Stats Audit

Mapeo de todos los indicadores, métricas y estados de las páginas admin.
Identifica redundancia, polling agresivo y datos hardcodeados.

---

## Polling activo por página

| Página | Endpoint | Intervalo | Trigger adicional |
|---|---|---|---|
| `/conversations` | `GET /chat/conversations` | 10s | Botón refresh manual |
| `/conversations` | `GET /chat/history/{id}` | 5s | Al abrir conversación |
| `/inbox` | `GET /conversations/inbox` | 5s | Cada acción (takeover, release, complete...) |
| `/inbox` | `GET /chat/history/{id}` | 5s | Al abrir conversación |
| `/observability` | `GET /health/ready` | 15s | — |
| `/observability` | `GET /internal/status` | 15s | — |
| `/observability` | `GET /dashboard/observability` | 30s (toggle) | Botón refresh manual |
| `/settings` | `GET /bot/config` | On demand | `revalidateOnFocus` |

**Problema:** Conversations + Inbox simultáneos = 4 requests concurrentes cada 5s.
Inbox: cada acción dispara `refreshList()` encima del poll automático → duplicado en el mismo segundo.

---

## Métricas redundantes (mismo dato, múltiples fuentes)

| Métrica | Páginas que la muestran | Fuente |
|---|---|---|
| Lead score | Inbox (card + promedio por tab) + Conversations | `InboxConversation.lead_score` |
| Conteo de conversaciones | Inbox (tabs + columnas kanban) + Conversations (header) | Fetch independiente por página |
| Bot activo/inactivo | Settings (badge) + Inbox (implícito en `mode`) | `GET /bot/state` vs campo `mode` |
| `updated_at` | Inbox (stats contextuales) + Conversations (ordenamiento) | Mismo campo, recalculado por separado |

No existe store/contexto compartido. Cada página fetcha su propia copia sin compartir caché SWR.

---

## Cálculos pesados en Inbox (cada 5s)

Inbox recalcula en cada poll sin dependencias guardadas entre renders:

- `filteredConversations` — aplica filtros de canal, tab, búsqueda, vistos
- `columnedConversations` — distribuye en 6 columnas kanban
- `tabCounts` — cuenta por 4 tabs con filtros distintos
- Stats contextuales por tab:
  - Todos: score promedio, última actualización
  - Pendientes: espera promedio, más antiguo
  - Mías: sin responder >5m
  - Bot: sin clasificar, producto top

Hay `useMemo` pero recalcula igualmente si cualquier conversación cambia.

---

## Valores hardcodeados (datos falsos)

En `frontend/app/components/BotConfiguration.tsx` — sección "Estado del Sistema":

```tsx
<span>Hace 5 min</span>   // Actualización — HARDCODED
<span>3</span>            // Documentos — HARDCODED
<span>247</span>          // Consultas Hoy — HARDCODED
```

Estos tres números no tienen fuente de datos real. Son decorativos.

---

## Mapa de endpoints por página

### `/admin/conversations`
- `GET /chat/conversations?limit=50&skip={n}` — lista paginada
- `GET /chat/history/{id}` — mensajes de conversación abierta

### `/admin/inbox`
- `GET /conversations/inbox` — lista kanban
- `GET /chat/history/{id}` — mensajes de conversación abierta
- `POST /conversations/{id}/takeover`
- `POST /conversations/{id}/release`
- `POST /conversations/{id}/mark-viewed`
- `POST /conversations/{id}/complete`
- `POST /conversations/{id}/reopen`
- `POST /conversations/{id}/refresh-summary`
- `POST /conversations/{id}/agent-message`
- `GET /inbox/handoff-stats?days={n}`

### `/admin/observability`
- `GET /dashboard/observability` — KPIs, pipeline, throughput, gating
- `GET /health/ready` — estado MongoDB, Redis, Qdrant
- `GET /internal/status` — circuit breaker, vectores

### `/admin/settings`
- `GET /bot/config` — configuración completa
- `PUT /bot/config` — actualizar
- `POST /bot/config/reset` — resetear
- `GET /bot/runtime` — estado en ejecución
- `POST /bot/config/generate-prompt` — generador IA (nuevo)

---

## Propuestas de mejora

### Prioridad alta

1. **Inbox 5s → 10-15s** o migrar a SSE/WebSocket.
   Polling a 5s en lista de hasta N conversaciones con recálculo completo es costoso sin beneficio real si los agentes no reaccionan en menos de 10s.

2. **Eliminar `refreshList()` post-acción** o reemplazar por mutación local optimista + reconciliación lazy.
   Hoy: acción → refresh full list → nuevo ciclo de cálculo.
   Mejor: acción → mutate local → revalidate en background.

3. **Conectar los 3 hardcodeados en Settings** a datos reales:
   - "Hace 5 min" → `updated_at` de `BotConfigDTO`
   - "3 documentos" → `GET /rag/corpus/stats` o similar
   - "247 consultas" → `GET /chat/stats`
   O eliminarlos si no hay fuente disponible.

### Prioridad media

4. **Compartir caché SWR** entre Conversations e Inbox para métricas comunes (conteo, lead scores).

5. **Memoizar stats de Inbox** por `conversation_id + updated_at` para no recalcular cuando el dato no cambió.

---

*Generado: 2026-05-04 | Branch: codexv2*
