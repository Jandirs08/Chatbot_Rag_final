# HandOff + Clasificación de Leads — Plan Unificado

Sistema de transferencia bot → agente con clasificación inteligente de conversaciones.
No es Zendesk. No es básico. Es el punto medio correcto para equipos de 1-5 agentes.

---

## Visión del sistema

```
Usuario escribe
    ↓
Webhook recibe → mode == "bot"?
    ├─ SÍ → flujo normal (LLM + RAG, sin cambios, sin latencia extra)
    └─ NO → guardar mensaje, notificar inbox, bot calla
    
Trigger detectado (keyword / confusión / agente proactivo)
    ↓
conv.mode = "pending"  [síncrono, inmediato]
    ↓
BackgroundTask: classify_conversation()  [async, no bloquea nada]
    → OpenAI gpt-4o-mini: historial → JSON {category, urgency, summary}
    → conv.category, conv.urgency, conv.ai_summary actualizados
    ↓
Inbox muestra conv clasificada
    ↓
Agente elige, toma, responde, devuelve al bot
```

---

## Categorías genéricas

Tres categorías aplicables a cualquier negocio (fertilizantes, cursos, servicios, etc.):

| Categoría | Código | Cuándo | Color |
|---|---|---|---|
| Oportunidad | `oportunidad` | Intención de compra, precio, volumen, negociación | Rojo |
| Interés | `interes` | Explorando, pidiendo info, no urgente | Amarillo |
| Requiere Atención | `requiere_atencion` | Problema, queja, confusión, bloqueado, reclamo | Naranja |

El LLM recibe el historial y clasifica. El sistema no sabe de fertilizantes ni cursos — el prompt le da contexto del negocio vía `bot_name` y `ui_prompt_extra` que ya existen en `BotConfig`.

---

## Modelo de datos

### Extender colección `messages` existente (MongoDB)

**No se crea colección nueva.** Se añaden campos a nivel de sesión/conversación.

### Nueva colección `conversations`

```python
{
  "conversation_id": str,          # FK → messages.conversation_id (ya existe)
  "channel": "whatsapp" | "web",
  "external_id": str,              # wa_id o session_id
  "mode": "bot" | "pending" | "human",   # estado principal
  "category": "oportunidad" | "interes" | "requiere_atencion" | None,
  "urgency": "alta" | "media" | "baja" | None,
  "ai_summary": str | None,        # 2-3 líneas generadas por LLM
  "assigned_agent_id": str | None,
  "pending_since": datetime | None,
  "created_at": datetime,
  "updated_at": datetime
}
```

**Índices:**
```
(mode, updated_at)          # inbox query principal
(channel, external_id)      # lookup por wa_id, unique
(assigned_agent_id, mode)   # convs del agente
```

### `WhatsAppSessionRepository` ya mapea `wa_id → conversation_id`

Solo añadir `mode` al documento de sesión o crear `conversations` paralela. Opción recomendada: nueva colección `conversations` referenciada por `conversation_id`.

---

## Análisis de latencia

**Respuesta corta: cero impacto en el flujo de chat.**

```
Mensaje usuario → webhook (200 ms máx para Twilio)
    ↓
process_message_background() — ya corre en BackgroundTask, no bloquea webhook
    ↓ (si mode == "bot")
ChatManager → LLM → respuesta WhatsApp   [flujo existente, sin cambios]

Clasificación corre en OTRO BackgroundTask, disparado solo cuando mode → "pending"
No comparte hilo, no comparte lock, no comparte cola con el flujo de chat.
```

**Patrón ya existe en `webhook_routes.py:154`** — `background_tasks.add_task(process_message_background, ...)`. La clasificación usa el mismo patrón.

**Latencia de clasificación:** 800ms–2s (gpt-4o-mini). No importa — nadie la espera. El agente ve el resultado cuando abre el inbox.

---

## Llamadas a OpenAI — estrategia

### Modelo separado para clasificación

| | Chat principal | Clasificación |
|---|---|---|
| Modelo | `settings.base_model_name` (gpt-3.5-turbo por defecto) | `gpt-4o-mini` hardcoded |
| Tokens | 2000–4000 (con RAG context) | ~500 (historial comprimido) |
| Propósito | Respuesta conversacional | Extracción estructurada |
| Coste aprox | ~$0.003/conv | ~$0.0002/conv |

**Misma API key** (`settings.openai_api_key`). Cliente OpenAI directo, no via LangChain — la clasificación no necesita chains ni memoria.

```python
# Sin LangChain — llamada directa, simple, predecible
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=settings.openai_api_key)
response = await client.chat.completions.create(
    model="gpt-4o-mini",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": CLASSIFICATION_PROMPT},
        {"role": "user", "content": conversation_text}
    ],
    max_tokens=200,
    temperature=0
)
```

### ¿Genera cola con las peticiones de chat?

No. OpenAI maneja rate limits por RPM/TPM a nivel de API key. A volúmenes normales (<100 convs/día) no hay contención. Si hubiera, la clasificación falla silenciosamente — `category=None` — y el inbox muestra la conv sin clasificar. El chat nunca se afecta.

---

## ¿Esto es Agentic RAG?

No. Tabla comparativa:

| | Este sistema | Agentic RAG |
|---|---|---|
| Pasos LLM | 1 (extracción JSON) | N (razona, decide, actúa) |
| Herramientas | Ninguna | Retrieval, APIs, búsqueda |
| Retrieval | No (historial = contexto) | Sí, multi-source |
| Complejidad | Baja | Alta |
| Latencia | 800ms–2s | 3s–15s |

El sistema usa LLM como **clasificador estructurado**, no como agente. El historial de conversación ya ES el contexto — no se necesita retrieval adicional.

Agentic RAG aplicaría si quisieras: "analiza esta conv, busca en CRM si el cliente compró antes, consulta inventario, genera briefing completo". Eso es v3 cuando tengas volumen real. Hoy no.

---

## Triggers de handoff

Tres caminos, implementar en orden:

### A. Keywords configurables (implementar primero)

```python
DEFAULT_KEYWORDS = ["precio", "cotizar", "asesor", "humano", "persona",
                    "reclamo", "queja", "no entiendo", "ayuda", "urgente"]
```

Configurables desde `BotConfig` — campo `handoff_keywords: list[str]`. Bot detecta → `mode=pending` → clasificación en background.

### B. Detección de confusión (implementar segundo)

Trigger: misma sesión, ≥3 mensajes del usuario sin resolución (bot respondió pero usuario reformuló).
Bot ofrece: *"Veo que esto puede necesitar atención personalizada, ¿quieres hablar con un asesor?"*
Usuario confirma → `mode=pending`.

Señal proxy simple: contar mensajes consecutivos del usuario sin respuesta satisfactoria (heurística: usuario envía mensaje, bot responde, usuario envía otro mensaje dentro de 2 min = no resolvió).

### C. Agente proactivo (gratis, viene con Tier 1)

Agente ve conversación en inbox (cualquier mode), hace takeover. No necesita trigger automático.

---

## Módulos a crear

```
backend/
├── services/
│   └── classification/
│       ├── __init__.py
│       ├── classifier.py          # classify_conversation(conversation_id) → ClassificationResult
│       ├── prompt.py              # CLASSIFICATION_PROMPT (system prompt)
│       └── schemas.py             # ClassificationResult(category, urgency, summary)
│
├── database/
│   └── conversation_repository.py # CRUD para colección conversations
│
└── api/
    └── routes/
        └── inbox/
            ├── __init__.py
            ├── inbox_routes.py    # GET /inbox, POST /conversations/{id}/takeover, /release
            └── schemas.py         # ConversationCard, InboxResponse
```

**Modificaciones a archivos existentes:**
- `webhook_routes.py` — añadir check `conv.mode` + spawn clasificación si → pending
- `chat/manager.py` — respetar `mode` antes de llamar LLM (1 línea de guard)

---

## Fases de implementación

### Fase 1 — Plomería (3 días)

**Objetivo:** el bot calla cuando hay humano. Nada más.

1. Crear `conversation_repository.py` — CRUD colección `conversations`
2. `GET /conversations/{channel}/{external_id}` — lookup o crear conv
3. Modificar `webhook_routes.py`: si `conv.mode in ("pending", "human")` → save message, return, skip LLM
4. `POST /conversations/{id}/takeover` → `mode=human`, `assigned_agent_id`
5. `POST /conversations/{id}/release` → `mode=bot`, limpiar asignación

Verificación: mensaje WhatsApp durante `mode=human` → guardado, bot no responde.

### Fase 2 — Clasificación en background (2 días)

**Objetivo:** cuando conv → pending, LLM clasifica asíncronamente.

1. Crear `services/classification/classifier.py`
2. Prompt que recibe historial comprimido + contexto del bot (`bot_name`, `ui_prompt_extra`)
3. Output JSON: `{category, urgency, summary}`
4. Disparar como `BackgroundTask` cuando `mode` cambia a `pending`
5. Actualizar `conv.category`, `conv.urgency`, `conv.ai_summary`

Verificación: keyword trigger → conv.mode=pending → esperar 2s → conv.category clasificada.

### Fase 3 — Inbox (2 días)

**Objetivo:** agente ve convs pendientes con contexto.

1. `GET /inbox/pending` — lista convs con `mode=pending`, ordenadas por urgency + pending_since
2. `GET /inbox/active` — convs del agente con `mode=human`
3. Frontend: card por conversación mostrando `category`, `urgency`, `ai_summary`, tiempo esperando
4. Botón "Tomar" → POST takeover
5. Vista de historial completo de mensajes al abrir conv
6. Botón "Devolver al bot" → POST release

### Fase 4 — Triggers automáticos (2 días)

1. Keywords: leer `handoff_keywords` de `BotConfig`, detectar en incoming message → `mode=pending`
2. Confusión: contador de intercambios sin resolución → bot ofrece asesor
3. Ambos caminos: disparar clasificación background

**Total: ~9 días para sistema completo funcional.**

---

## Prompt de clasificación

```
Eres un asistente que analiza conversaciones de {bot_name}.
Negocio: {ui_prompt_extra}

Analiza el historial y responde SOLO con JSON:
{
  "category": "oportunidad" | "interes" | "requiere_atencion",
  "urgency": "alta" | "media" | "baja",
  "summary": "2-3 líneas describiendo qué necesita el usuario y por qué necesita atención humana"
}

Criterios:
- oportunidad: intención clara de compra, negociación de precio, pedido de volumen, comparación con competencia
- interes: curiosidad, preguntas informativas, sin urgencia
- requiere_atencion: problema técnico, queja, proceso bloqueado, frustración, confusión persistente

Historial:
{conversation_history}
```

---

## Lo que NO se construye (ahora)

- SLA timers y alertas de vencimiento
- Presencia/heartbeat de agentes (online/offline)
- Auto-asignación automática (agente elige libre)
- Transferencia entre agentes
- Notas internas entre agentes
- WebSocket / SSE real-time (polling SWR cada 5s es suficiente para el volumen inicial)
- Multi-tenant
- Kanban drag-and-drop

Se agrega cuando el volumen real lo justifique. Datos primero, features después.

---

## Decisiones ya tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Modelo clasificación | `gpt-4o-mini` | Barato, rápido, suficiente para extracción |
| Framework LLM | OpenAI directo (no LangChain) | Sin overhead, JSON mode nativo |
| Real-time | Polling SWR 5s | Suficiente, cero infra extra |
| Storage | MongoDB existente | Sin nueva infra |
| Clasificación bloqueante | No — BackgroundTask | Cero impacto en chat |
| Auto-asignación | No en v1 | Agente elige según contexto |
| Categorías configurables | No en v1 | 3 genéricas cubren 95% de casos |

---

## Roadmap post-MVP

Cuando tengas datos reales de uso:

1. **Métricas de conversión**: qué % de `oportunidad` cierra venta → calibrar prompt
2. **Canned responses**: respuestas rápidas por categoría para el agente
3. **Notificaciones**: push/email al agente cuando llega `oportunidad` + `urgency=alta`
4. **SSE real-time**: si el polling genera fricción visible
5. **Resumen global**: kAI Analítica (propuesta #3) — RAG sobre tabla messages para tendencias
