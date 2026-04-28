# Handoff humano — Plan completo

Plan estándar de industria para handoff bot → agente humano en chatbots conversacionales (soporte, ventas, educación). Basado en patrones de Intercom, Zendesk, Kommo, Kustomer, HubSpot, Drift, Front.

**Glosario rápido:**
- **Agente** = asesor = persona real que opera el inbox y toma conversaciones. Términos intercambiables.
- **Conversación** = hilo único entre un cliente y el sistema, identificado por `conversation_id`, sin importar canal.
- **Canal** = medio (WhatsApp, web widget, Instagram, email).
- **Handoff** = transferencia de control bot → humano (o humano → bot).
- **Inbox** = panel del agente donde ve y responde conversaciones.

---

## Tabla de contenidos

- [Tier 0 — Fundamentos (modelo de datos)](#tier-0--fundamentos-modelo-de-datos)
- [Tier 1 — Handoff manual mínimo](#tier-1--handoff-manual-mínimo)
- [Tier 2 — Agente responde desde el inbox](#tier-2--agente-responde-desde-el-inbox)
- [Tier 3 — Triggers de handoff (cómo se inicia)](#tier-3--triggers-de-handoff-cómo-se-inicia)
- [Tier 4 — Disponibilidad, presence, asignación, SLA](#tier-4--disponibilidad-presence-asignación-sla)
- [Tier 5 — Colaboración entre agentes](#tier-5--colaboración-entre-agentes)
- [Tier 6 — Real-time push (SSE / WebSocket)](#tier-6--real-time-push-sse--websocket)
- [Tier 7 — Multi-canal y escala](#tier-7--multi-canal-y-escala)
- [Tier 8 — Analytics y observabilidad](#tier-8--analytics-y-observabilidad)
- [Casos límite que debes resolver](#casos-límite-que-debes-resolver)
- [Anti-patrones a evitar](#anti-patrones-a-evitar)

---

## Tier 0 — Fundamentos (modelo de datos)

Sin esto nada funciona. Refactor base.

### Colección `conversations` (nueva o extendida)

```
conversation_id        : str (PK)
channel                : "whatsapp" | "web" | "instagram" | ...
external_id            : str   # wa_id, session_id, etc.
mode                   : "bot" | "pending" | "human" | "paused"
status                 : "open" | "snoozed" | "resolved" | "archived"
assigned_agent_id      : str | None
priority               : 0 (normal) | 1 (alta) | 2 (urgente)
tags                   : [str]
created_at             : datetime
updated_at             : datetime
last_user_msg_at       : datetime
last_agent_msg_at      : datetime | None
unread_for_agent       : int
sla_first_response_at  : datetime | None   # deadline
sla_resolution_at      : datetime | None
metadata               : dict   # email cliente, nombre, etc.
```

**Estados `mode`:**
- `bot` — bot responde, agente no involucrado.
- `pending` — cliente pidió humano, sin agente asignado, en cola.
- `human` — agente asignado y responde.
- `paused` — bot apagado, ningún agente asignado (modo monitoreo / debug).

**Estados `status`** (ortogonal a `mode`):
- `open` — activa.
- `snoozed` — pausada hasta cierta fecha.
- `resolved` — agente cerró.
- `archived` — fría, >N días sin actividad.

### Colección `messages` (extender)

```
message_id, conversation_id, timestamp, content
sender_type   : "user" | "bot" | "agent" | "system"
agent_id      : str | None
internal      : bool   # True = nota interna, no visible al cliente
delivery      : "sending" | "sent" | "delivered" | "read" | "failed"
attachments   : [...]
```

`sender_type=system` cubre eventos visibles al cliente ("Te conectamos con un asesor") y notas internas (`internal=true`).

### Colección `agents`

```
user_id            : FK a users
display_name       : str
avatar_url         : str
status             : "online" | "busy" | "offline"
capacity           : int   # max chats concurrentes (típico 3-5)
current_load       : int   # cuántos chats human asignados
last_heartbeat_at  : datetime
skills             : [str]   # routing por tema (opcional)
```

### Colección `conversation_events` (auditoría)

```
event_id, conversation_id, timestamp, type, actor_id, payload
```

Tipos: `mode_changed`, `assigned`, `transferred`, `note_added`, `tag_added`, `resolved`, `reopened`.

### Índices MongoDB

```
conversations: (mode, status, updated_at)
conversations: (assigned_agent_id, status)
conversations: (channel, external_id)   # unique
messages:      (conversation_id, timestamp)
events:        (conversation_id, timestamp)
```

---

## Tier 1 — Handoff manual mínimo

**Objetivo:** agente puede tomar control y devolver. Bot deja de responder cuando hay humano.

### Backend

| Endpoint | Función |
|---|---|
| `POST /conversations/{id}/takeover` | Asigna agente actual, `mode=human`, log evento, decrementa `current_load` previo si reasigna. |
| `POST /conversations/{id}/release` | `mode=bot`, libera agente, log. |
| `POST /conversations/{id}/pause` | `mode=paused`, bot apagado sin asignación. |

**Modificación crítica al webhook entrante (WhatsApp / chat web):**

```python
async def handle_incoming_message(conv, text):
    if conv.mode in ("human", "pending", "paused"):
        await save_message(conv, text, sender_type="user")
        await publish_event("new_message", conv)
        return  # NO llama LLM
    # else: flujo bot normal
    await bot_respond(conv, text)
```

Lock estricto. Bug aquí = doble respuesta = experiencia rota.

### Frontend (inbox)

- Badge `[BOT]` / `[HUMANO]` / `[PENDIENTE]` en cada conversación.
- Botón "Tomar" en conversación seleccionada.
- Botón "Devolver al bot" cuando humano.
- System message visible en historial cuando cambia modo: "— Juan tomó la conversación —".

### Casos cubiertos

- Cliente sigue escribiendo, agente ve mensajes nuevos en panel.
- Agente termina, devuelve al bot, bot retoma con contexto.

### Lo que NO cubre todavía

- Real-time push (sigue con polling).
- Cliente no tiene forma de pedir humano (solo agente proactivo).
- Sin presence ni horario.

---

## Tier 2 — Agente responde desde el inbox

**Objetivo:** agente envía mensajes al cliente vía el mismo canal de origen.

### Backend

| Endpoint | Función |
|---|---|
| `POST /conversations/{id}/agent-message` | Valida agente asignado, persiste msg con `sender_type=agent`, llama adaptador del canal (WhatsAppClient.send_text, web push), publica evento. |

Adaptador por canal: una función `send(conversation, text)` que enruta según `channel`. Hoy solo WhatsApp y web — fácil de extender.

### Frontend

- Composer (textarea + botón) abajo de cada conversación humana.
- Enter envía, Shift+Enter newline.
- Optimistic update: pinta msg en gris hasta confirmación.
- Estados visibles: `enviando` / `enviado` / `fallido` con retry.
- Ctrl+K para foco rápido.

### Casos cubiertos

- Conversación humana bidireccional real.
- Cliente recibe mensaje firmado/sin firmar según convención.

### Convención de firma (recomendada)

- **Primer** mensaje del agente firmado: `*Hola, soy Juan del equipo. [respuesta]*`.
- Mensajes siguientes sin firma para no ser ruidoso.
- Cuando otro agente toma (transfer): nuevo mensaje firmado con su nombre.

---

## Tier 3 — Triggers de handoff (cómo se inicia)

Tres caminos. Industria los usa todos en paralelo.

### A. Explícito por cliente (no negociable, primer feature)

**Web widget:**
- Botón "Hablar con asesor" en header.
- Click → POST `/conversations/{id}/request-human`.
- Bot envía system message: "Te paso con un asesor".

**WhatsApp:**
- Keywords detectados al inicio del flujo bot: `asesor`, `humano`, `agente`, `persona`, `reclamo`, `queja`, `hablar con alguien`.
- Comando explícito `/asesor` o `/humano`.
- Lista parametrizable en config.

### B. Implícito (bot decide ofrecer)

Solo agregar después de Tier 2 estable. Triggers conservadores:

- **Confidence baja del RAG**: si el retrieval no encuentra docs relevantes y el bot iba a responder "no encontré info" → mejor "¿quieres que te pase con un asesor?".
- **Repetición**: cliente reformula misma intención 3 veces → ofrecer humano.
- **Sentiment fuerte negativo**: detector simple (insultos, "horrible", "pésimo", mayúsculas excesivas) → ofrecer humano.
- **Off-topic claro**: pregunta fuera del scope del bot → ofrecer humano.

**Patrón:** bot **ofrece**, no transfiere unilateral. "Veo que esto es complejo, ¿prefieres hablar con un asesor?". Cliente confirma → handoff.

### C. Proactivo agente

- Agente entra al inbox, ve conversación complicada, hace takeover sin que cliente pida.
- Útil para QA y supervisión.

### Implementación handoff request

```python
async def request_human_handoff(conv_id):
    conv = await get_conversation(conv_id)
    if not is_within_business_hours():
        return await offline_reply(conv)
    if not await any_agent_online():
        return await all_busy_reply(conv)
    conv.mode = "pending"
    await publish_event("handoff_requested", conv)
    await send_to_user(conv, "Te conectamos con un asesor, espera un momento.")
    # Si auto-asignación está activada (Tier 4), encolar en queue
```

---

## Tier 4 — Disponibilidad, presence, asignación, SLA

**Objetivo:** sistema sabe quién está, asigna solo, mide tiempos. Sin esto el handoff es prometer al vacío.

### Horario laboral

Config global o por canal:
```
business_hours: { mon: "09:00-18:00", ..., sat: null, sun: null }
timezone: "America/Lima"
holidays: ["2026-01-01", ...]
```

### Mensajes automáticos según contexto

| Situación | Mensaje al cliente |
|---|---|
| Pide humano, hay agente online en horario | "Te conectamos con un asesor, te responde en breve." |
| Pide humano, en horario pero todos busy | "Todos los asesores ocupados. Hay X esperando, tiempo estimado Y min." |
| Pide humano, fuera de horario | "Atendemos L-V 9-18h. Tu mensaje queda registrado, te respondemos al volver. Mientras, puedo seguir ayudándote yo." |
| Pide humano, día festivo | Variante de fuera de horario. |

**Regla de oro:** no prometer humano si no hay nadie. Honestidad > optimismo.

### Presence (heartbeat)

- Frontend agente: `POST /agent/heartbeat` cada 20s mientras la pestaña está visible.
- Backend: actualiza `last_heartbeat_at` en Redis con TTL 60s.
- Cron cada 30s: agentes con TTL expirado → `status=offline`, libera sus chats activos → vuelven a `pending`.

### Asignación automática

Cuando una conversación entra `mode=pending`:

```
agentes_candidatos = agents.filter(
    status="online",
    current_load < capacity,
    skills ⊇ conv.required_skills
)
si vacío: queue (espera evento agente_disponible)
elegir: el de menor current_load (least-loaded)
   o: round-robin
   o: por skill match (routing avanzado)
asignar: conv.assigned_agent_id = X, mode=human, agent.current_load += 1
publicar: assigned_to_agent (notif al agente)
```

**Lock optimista** para evitar doble asignación bajo concurrencia:

```python
result = await conversations.update_one(
    {"_id": conv_id, "assigned_agent_id": None},
    {"$set": {"assigned_agent_id": agent_id, "mode": "human"}}
)
if result.modified_count == 0:
    # alguien más lo tomó, retry o pasar
```

### SLA

Dos timers por conversación:

- **First response** — cliente pide humano → debe haber respuesta agente en ≤N min (típico 2-5).
- **Resolution** — desde apertura hasta `resolved` (típico 24h).

Cron cada 30s busca conversaciones cerca de vencer:
- Faltan <20% del tiempo: notif al supervisor (Slack/email).
- Vencido: escalate (reasignar a supervisor) o fallback bot con disculpa.

### Capacidad por agente

`capacity` típico 3-5 chats concurrentes. Configurable por agente (junior=2, senior=5). Evita asignar más allá. Si todos saturados → cola.

---

## Tier 5 — Colaboración entre agentes

Sin esto, equipo de >2 agentes se pisa.

- **Notas internas**: `messages.internal=true`, visible solo en inbox, nunca al cliente. UI las pinta diferente (fondo amarillo).
- **Mention** `@nombre` en notas → notif al agente mencionado.
- **Transferir conversación**: `POST /conversations/{id}/transfer { to_agent_id, reason }`. System message visible al cliente: "— Te paso con María, especialista en X —".
- **Plantillas (canned responses)**: colección `templates` con slash commands `/saludo`, `/cierre`. Variables: `{nombre_cliente}`, `{producto}`.
- **Tags + filtros**: `tags=["billing", "vip"]`. Inbox filtra por tag.
- **Read receipts** entre agentes: cuando supervisor lee, log; útil para auditoría.
- **Bulk actions** en inbox: cerrar varias, reasignar varias.

---

## Tier 6 — Real-time push (SSE / WebSocket)

Hasta aquí puedes vivir con polling SWR cada 5-10s. Si el volumen sube o quieres UX instantáneo:

### SSE — recomendado por defecto

**Por qué SSE y no WebSocket:**
- Unidireccional server→cliente cubre 95% del caso (mensajes nuevos, eventos de estado).
- Cliente→server con POST normal funciona fino.
- Reconecta automático con `Last-Event-ID`.
- HTTP/2 multiplexa, atraviesa proxies, simple.

### WebSocket — solo si necesitas

- Typing indicators bidireccional ("Juan está escribiendo…").
- Cursor compartido / co-browsing.
- Voz/video en el futuro.

**Decisión:** empezar SSE. WebSocket solo si typing indicator es requisito.

### Backplane Redis Pub/Sub

Obligatorio cuando tienes >1 worker uvicorn (deploy escalable). Sin Redis, agente conectado al worker A no recibe eventos publicados por worker B.

```
Canal global    : inbox:global               (todos los agentes)
Canal por agente: agent:{id}:events           (solo asignados a él)
Canal por conv  : conversation:{id}:events    (subscritos viendo el chat)
```

**Alternativa sin Redis:** MongoDB Change Streams. Watcheas colección `messages` y `conversations`. Menos infra, más acoplado a DB. Válido en single-tenant.

### Endpoints SSE

```
GET /inbox/stream            → eventos globales del inbox del agente
GET /conversations/{id}/stream → eventos de una conversación específica
```

Eventos tipados: `new_message`, `mode_changed`, `assigned`, `agent_typing`, `delivery_status`, `presence_changed`.

### Reconnection

- Backend manda `id: <ts>` por evento.
- Cliente envía `Last-Event-ID` al reconectar.
- Backend reentrega eventos posteriores desde un buffer (Redis Stream con TTL 5min).

---

## Tier 7 — Multi-canal y escala

### Adaptadores por canal

Cada canal implementa interfaz común:

```python
class ChannelAdapter(Protocol):
    async def send_text(conv, text): ...
    async def send_template(conv, template_id, vars): ...
    async def receive_webhook(payload): ...   # normaliza a evento interno
    capabilities: { audio, image, buttons, list }
```

Canales típicos: WhatsApp Business (Twilio/Cloud API), web widget, Instagram DM, Messenger, Telegram, email.

### Web widget embebible

`<script src="cdn.tu.com/widget.js" data-bot="abc"></script>` → carga iframe → conecta al backend. Mismo modelo `conversation`, `channel="web"`.

### Multi-tenant (SaaS)

Si vendes a varios clientes:
- `tenant_id` en TODAS las colecciones.
- Bot config por tenant.
- Corpus RAG separado por tenant.
- Aislamiento estricto en queries.

### Escala estimada por tier

| Setup | Capacidad cómoda |
|---|---|
| 1 worker uvicorn + MongoDB + polling | 50-200 chats activos, 5 agentes |
| 2 workers + Redis pub/sub + SSE | 500-2000 chats, 50 agentes |
| 4+ workers + Redis cluster + sharding | 10k+ chats, 200+ agentes |

Para producto mediano (no SaaS gigante), Tier 6 con 2 workers basta.

---

## Tier 8 — Analytics y observabilidad

Sin métricas no sabes si el handoff funciona.

### KPIs por conversación

- **TTFR** (Time To First Response) — desde request humano hasta primer msg agente.
- **AHT** (Average Handle Time) — duración total conversación humana.
- **CSAT** — encuesta post-chat 1-5 estrellas.
- **FCR** (First Contact Resolution) — % resueltas sin reabrir.
- **Bot deflection** — % conversaciones resueltas por bot sin handoff.

### Dashboards

- Tiempo real: chats pending, agentes online, queue length.
- Histórico: TTFR/AHT/CSAT por agente, por día, por tag.
- Alertas: queue > X, TTFR > Y, CSAT < Z.

### Logs estructurados

Cada evento de handoff con: `conversation_id`, `tenant_id`, `agent_id`, `from_mode`, `to_mode`, `latency_ms`, `reason`.

---

## Casos límite que debes resolver

Lista exhaustiva. Cada uno necesita decisión explícita.

| # | Caso | Política recomendada |
|---|---|---|
| 1 | Cliente pide humano, hay agente online en horario | Auto-assign al de menor carga, mode=human. |
| 2 | Cliente pide humano, todos busy | Queue + mensaje "X delante de ti, ~Y min". |
| 3 | Cliente pide humano, fuera de horario | NO transferir. Mensaje "atendemos L-V 9-18". Marcar `needs_human=true` para priorizar al abrir. |
| 4 | Agente toma pero cierra browser sin liberar | Heartbeat 20s, timeout 60s, libera y reasigna. Cliente no ve nada (transparente). |
| 5 | Cliente desaparece (no responde) en mode=human | Auto-resolve a las 24-48h sin actividad cliente. |
| 6 | Agente responde, cliente nunca contesta | Auto-resolve 48h. |
| 7 | Doble respuesta (bot + agente simultáneo) | Lock estricto webhook: `mode != bot` ⇒ bot calla. Crítico. |
| 8 | Cliente quiere volver al bot | Comando `/bot` + botón "Volver al bot" en widget. |
| 9 | Múltiples agentes click "Tomar" simultáneo | Lock optimista: `update_one({assigned_agent_id: None})`. Loser ve "ya lo tomó X". |
| 10 | Agente quiere monitorear sin responder | mode=paused: bot off, sin agente, supervisor lee. |
| 11 | Cliente WhatsApp manda audio/imagen en mode=human | Persiste, agente ve, agente responde texto. |
| 12 | Cliente WhatsApp manda audio/imagen en mode=bot | Bot dice "solo texto por ahora" o transcribe (Whisper). |
| 13 | Pasaron 24h en WhatsApp sin contactar al cliente | Necesitas template aprobado por Meta para reabrir. |
| 14 | Agente transfiere a otro agente | System message al cliente, reasigna, ambos ven historial completo. |
| 15 | Supervisor quiere intervenir conversación de junior | Modo "shadow" (observa sin enviar) o takeover forzado con notif al junior. |
| 16 | Cliente envía info sensible (DNI, tarjeta) | PII redaction antes de loggear, alerta al agente. |
| 17 | Bot detecta intent "humano" pero confianza baja | Pregunta confirmación: "¿quieres hablar con un asesor?". |
| 18 | Cliente abre múltiples sesiones (web + WhatsApp) | Conversaciones separadas por `(channel, external_id)`. Identidad cliente unificada por `customer_id` opcional. |
| 19 | Cliente VIP entra | `priority=2`, salta a inicio de queue, agente notif. |
| 20 | Sistema cae mientras agente escribía | Frontend persiste draft local. Al reconectar, restaura. |

---

## Anti-patrones a evitar

- **Prometer humano sin verificar disponibilidad.** Daña confianza más que esperar.
- **Auto-handoff agresivo desde día 1.** Falsos positivos enojan. Empieza explícito + manual.
- **Mezclar canales en un mismo `conversation_id`.** Mantén separados, unifica identidad por `customer_id` aparte.
- **Bot respondiendo en `mode=human`.** Lock estricto en webhook. Test exhaustivo.
- **Agente "online" sin heartbeat reciente.** Confiar en flag manual = chats colgados.
- **WebSocket bidi en MVP.** Sobreingeniería. SSE + POST cubre 95%.
- **Sin auditoría de transferencias.** Imposible hacer QA. Log todo evento.
- **Asignación FIFO sin considerar carga.** Junior con 5 chats no debe recibir el sexto. Usa least-loaded o capacity.
- **Plantillas hardcoded en el código.** Cámbialas a colección editable por admin.
- **No tener forma de devolver al bot.** Cliente queda atrapado en "humano que ya cerró".

---

## Roadmap sugerido (de menos a más)

| Fase | Tiers | Esfuerzo | Resultado |
|---|---|---|---|
| Sprint 1 | 0 + 1 | 3-5 días | Modelo datos + handoff manual + lock webhook. Agente puede tomar y devolver. |
| Sprint 2 | 2 | 2-3 días | Composer en inbox. Agente envía mensajes al cliente. |
| Sprint 3 | 3A + 3C | 2 días | Cliente pide humano vía botón/keyword. Agente proactivo. |
| Sprint 4 | 4 | 3-4 días | Horario, presence, auto-assign, SLA, mensajes contextuales. |
| Sprint 5 | 5 | 3 días | Notas internas, transferir, plantillas, tags. |
| Sprint 6 | 6 | 3-4 días | SSE + Redis pub/sub. UX en tiempo real. |
| Sprint 7 | 3B + 8 | 4-5 días | Auto-detect implícito conservador + analytics. |
| Sprint 8+ | 7 | continuo | Multi-canal, multi-tenant, escala. |

**Total a producto completo:** ~4-5 semanas de un dev full-time. MVP usable (Sprint 1+2+3A): **~1 semana**.

---

## Decisiones que necesitas tomar antes de codear

1. **Live chat vs ticket.** ¿Cliente espera respuesta en minutos o en horas? Cambia SLA, presence, UX.
2. **Horario laboral fijo o 24/7.** Define si necesitas mensaje fuera-de-horario.
3. **Capacity por agente.** Default 3, ajustar según industria.
4. **Auto-assign o free-for-all.** Auto = más complejo pero justo. Free = simple, pero agentes se pisan.
5. **Redis sí o no.** Si planeas >1 worker → sí desde Tier 6. Single worker → MongoDB change streams ok.
6. **WebSocket en algún momento.** Solo si typing indicator es requisito. Si no, nunca.
7. **Multi-tenant ahora o después.** Si vas SaaS, Tier 0 debe incluir `tenant_id` desde el inicio. Refactor posterior es doloroso.

Una vez decidas estos 7 puntos, el plan se concreta a tu caso.
