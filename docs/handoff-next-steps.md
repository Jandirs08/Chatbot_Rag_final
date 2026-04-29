# Handoff — Próximos Pasos

## Estado actual (2026-04-29)

Migración a tool calling completada. Sistema agentic en producción tras feature flag.

### Hecho
- **Bugs preexistentes corregidos**:
  - Race en `ConversationRepository.get_or_create` → `find_one_and_update + $setOnInsert` atómico
  - Polling timestamp `>` → ID-based dedup. Backend `/chat/history` expone `message_id`. Frontend usa `Set` contra estado actual de mensajes
- **Tool registry modular** (`backend/core/tools/`):
  - `base.py`: `ToolDefinition`, `ToolContext`, `ToolResult`, modes `terminal | continuation`
  - `registry.py`: singleton `ToolRegistry`
  - `bootstrap_tools(settings)`: registro condicional según flag
- **Streaming dispatcher** (`backend/chat/tool_dispatch.py`):
  - `consume_stream(chunks, ctx)` acumula `tool_call_chunks` de `AIMessageChunk`s
  - Emite `DispatchEvent(kind=text|tool_terminal|end)`
  - Continuation mode reservado (`NotImplementedError`) hasta tool 2
- **Handoff tool** (`request_human_handoff(reason)`):
  - `reason ∈ {user_request, low_confidence, out_of_scope}` (descartado `frustration` hasta tener evals)
  - Mode `terminal`: dispara SSE `lead_form` + clasificación background, no vuelve al modelo
  - Persiste `handoff_reason` + `handoff_at` en `conversations` doc
- **ChainManager**: acepta `tools=[...]`, invoca `model.bind_tools(...)` cuando soportado (ChatOpenAI ≥0.3, ChatVertexAI). Degrada limpio si no.
- **Bot.astream_raw**: chunks crudos para dispatcher, paralelo a `astream_chunked`
- **ChatManager.stream_with_tools**: mismo lock + sin cache + persist condicional según tool_fired
- **Prompt** (`BASE_PROMPT_TEMPLATE_SYSTEM`): bloque `<handoff_tool>` con reglas estrictas de cuándo llamar tool
- **Cleanup**: eliminado `services/classification/keywords.py`, `HANDOFF_PHRASES`, `HANDOFF_SOFT_KEYWORDS`, lógica `prior_user_msgs`
- **Métricas**: endpoint `GET /inbox/handoff-stats?days=30` + card `HandoffStatsCard.tsx` en admin inbox (3 columnas: user_request / low_confidence / out_of_scope + total)
- **Eval suite** (`backend/tests/evals/test_handoff_tool.py`):
  - 6 unit tests (mock LLM, dispatcher coverage)
  - 7 integration tests opt-in (`OPENAI_API_KEY_REAL`, `gpt-4o-mini`, ~$0.005/run)
- **Circular import fix**: `chat/__init__.py` vaciado. Submódulos importables sin pull de RAG/qdrant.
- **Requirements bumped**: `langchain*` a `>=0.3.0,<0.4.0`, `tiktoken>=0.7.0,<1.0.0`
- **Feature flag**: `ENABLE_AGENTIC_HANDOFF=true` en `.env`. Verificable en log: `Bound 1 tool(s) to model: ['request_human_handoff']`

### Calificación
- RAG retrieval: 8/10 (sin cambios)
- Handoff: **8/10** (era 4/10) — pendiente de validación en producción + integration evals con key real para confirmar

---

## Próximos pasos (post 2026-04-29)

### Inmediato
- [ ] **Bumpear `BASE_MODEL_NAME=gpt-4o-mini`** en `.env`. `gpt-3.5-turbo` soporta tool calling pero decide peor. gpt-4o-mini ~mismo precio, mejor reasoning.
- [ ] **Correr integration evals** con `OPENAI_API_KEY_REAL` antes de exponer a tráfico real. 7 casos cubren matriz mínima.
- [ ] **Validar en browser** los 6 casos del cuadro antes/después (saludo, precio, "necesito asesor", multi-idioma, out_of_scope, queja).
- [ ] **Monitorear card de métricas** primera semana. Si `low_confidence` >40% → falta contenido RAG. Si `out_of_scope` >20% → ajustar prompt o rangos del bot.

### Corto plazo
- [ ] **Regenerar `requirements.txt` formal** con `pip-compile requirements.in`. Ahora editado a mano (resolver actual válido pero no es lockfile).
- [ ] **Bug authz `agent-message`** (descartado por decisión de producto: cualquier admin toma cualquier conv). Reabrir si surge necesidad de permisos por agente.
- [ ] **Filtro de fechas en card de métricas**: hoy hardcoded a 30 días. Endpoint ya acepta `days`. Falta UI selector.
- [ ] **Backfill de `handoff_reason`**: stats arrancan desde 2026-04-29. Conversaciones previas no clasificadas.

### Medio plazo — Tool 2 (Agentic RAG real)
- [ ] **`search_documents` como tool continuation**:
  - Crear `backend/core/tools/retrieval_tool.py` con `mode="continuation"`
  - Schema: `search_documents(query: str, k: int)`
  - Handler invoca `rag_retriever.retrieve_documents`, retorna `ToolResult(content=formatted_docs)`
  - Implementar ReAct loop en `tool_dispatch.py` (placeholder ya marcado): tool_call → ToolMessage → re-invoke chain
  - Quitar RAG eager del pipeline LCEL en `bot._build_pipeline()` (mover a tool, no `get_context_async`)
  - Beneficios: skip RAG en saludos/conversacional, latencia menor, multi-step queries
- [ ] **Tests**: extender `test_handoff_tool.py` con casos multi-tool (handoff + retrieval coexistiendo)
- [ ] **Métricas RAG-as-tool**: count de cuántos turns invocan retrieval, calidad de queries reformuladas

### Medio plazo — WhatsApp agentic
- [ ] **Reabrir handoff por WhatsApp** (hoy `webhook_routes.py:62-64` skip total):
  - Reusar `chat_manager.stream_with_tools` adaptado: sin SSE, output a Twilio
  - Tool fire en WA → `mode=pending`, mensaje template "te conectamos con un asesor", clasificación background
  - No requiere lead capture (wa_id ya identifica contacto)
  - Decisión: tool variant por canal, o tool genérica con `ctx.extra["channel"]`

### Largo plazo (roadmap doc)
- [ ] **Self-correction loops**: tool puede pedir clarificación si confidence baja
- [ ] **Knowledge graph layer**: nodos entidad-relación sobre el corpus, queries dirigidas
- [ ] **SSE real-time inbox**: reemplaza polling 5s, requiere Redis Pub/Sub si >1 worker
- [ ] **Multi-tenant**: `tenant_id` en todas las colecciones + corpus RAG aislado por tenant

### Tech debt detectado
- 3 tests preexistentes fallan (no introducidos en este refactor):
  - `test_bot_streaming.py::test_astream_chunked_emits_first_chunk_immediately_and_then_buffers`
  - `test_gating.py::TestIsTrivialQuery::test_saludo_hola_ben`
  - `test_hierarchical_retriever.py::test_hierarchical_retriever_trace_includes_context_and_timings`
  - `test_reranking.py::TestSemanticReranking::test_pdf_priority_boost`
- Decidir: actualizar tests o arreglar comportamiento

---

## Siguiente paso: migrar a Tool Calling (Agentic Handoff)

### Por qué

Keywords son brittle:
- Cada usuario trae frases nuevas no listadas
- Falsos positivos eternos
- Cero contexto (bot no sabe si falló 3 veces)
- Mantenimiento infinito

Estándar de producción (ChatGPT, Intercom Fin, Zendesk AI, Glean): **tool calling**.

### Diseño objetivo

```
LLM tiene tool: request_human_handoff(reason: str)

System prompt indica al LLM cuándo llamarla:
- Usuario pide humano explícitamente
- Bot no puede responder con contexto disponible
- Bot detecta frustración tras intentos fallidos
- Bot detecta tema fuera de scope

Backend detecta tool_call → emite event: lead_form
Frontend muestra form (ya implementado)
```

Ventajas:
- Cero keywords
- Bot decide en contexto, no por matching
- Multi-idioma sin cambios
- Es la base para Agentic RAG completo

### Plan de implementación (1-2 días)

#### Fase 1 — Tool definition
- [ ] Crear archivo `backend/core/tools/handoff_tool.py`
- [ ] Definir tool con schema:
  ```python
  {
      "type": "function",
      "function": {
          "name": "request_human_handoff",
          "description": "Llama esta función cuando el usuario solicite explícitamente hablar con un humano, cuando no puedas responder con la información del contexto, o cuando detectes frustración tras intentos fallidos.",
          "parameters": {
              "type": "object",
              "properties": {
                  "reason": {
                      "type": "string",
                      "enum": ["user_request", "low_confidence", "frustration", "out_of_scope"],
                      "description": "Razón del handoff"
                  }
              },
              "required": ["reason"]
          }
      }
  }
  ```

#### Fase 2 — Bind tool al chain
- [ ] Modificar `backend/core/chain.py`
- [ ] Usar `model.bind_tools([handoff_tool])` (LangChain) o `tools=[...]` (OpenAI directo)
- [ ] Actualizar system prompt en `backend/core/prompt.py`:
  ```
  Tienes acceso a la función request_human_handoff. Llámala cuando:
  - El usuario pida explícitamente hablar con un asesor humano
  - No tengas información en el contexto para responder
  - El usuario muestre frustración tras intentos fallidos
  - El tema esté fuera de tu alcance

  No la llames para preguntas que sí puedes responder con el contexto.
  ```

#### Fase 3 — Detectar tool call en streaming
- [ ] Modificar `backend/core/bot.py` o `chat_manager` para detectar cuando el modelo decide invocar la tool
- [ ] Cuando se detecta `tool_call.name == "request_human_handoff"`:
  - Cancelar streaming normal
  - Emitir `event: lead_form` SSE
  - Loggear razón para analytics
  - Pasar a background task la clasificación

#### Fase 4 — Limpieza
- [ ] Eliminar `backend/services/classification/keywords.py` (o vaciarlo)
- [ ] Eliminar bloque keyword trigger en `chat_routes.py`
- [ ] Eliminar import de `HANDOFF_PHRASES`, `HANDOFF_SOFT_KEYWORDS`
- [ ] Eliminar lógica de `prior_user_msgs` count

#### Fase 5 — Testing
- [ ] Casos de prueba:
  - Saludo simple → no trigger
  - "Cuál es el precio?" → bot responde, no trigger
  - "Necesito hablar con humano" → trigger
  - "No me sirve esto" tras 2 fallos → trigger por frustración
  - Pregunta fuera de scope → trigger por out_of_scope
- [ ] Eval con casos en `backend/tests/evals/` para medir precisión

#### Fase 6 — Métricas
- [ ] Loguear razón de cada handoff: `user_request | low_confidence | frustration | out_of_scope`
- [ ] Dashboard en panel agente: % de handoffs por razón
- [ ] Detectar gaps en contenido RAG (muchos `low_confidence` = falta contenido)

---

## Otros pendientes (post tool-calling)

### Mejoras handoff
- [ ] Agente proactivo: ver conversaciones bot activas en tiempo real (SSE en lugar de polling 5s)
- [ ] Visibilidad agente al cliente (nombre/avatar del asesor)
- [ ] Auto-cerrar conversación tras N min sin actividad
- [ ] Notas internas del agente (privadas, no visibles al cliente)
- [ ] Historial de leads exportable

### Bugs preexistentes pendientes
- [x] ~~Race condition en `get_or_create`~~ — fixed (atomic upsert) 2026-04-29
- [x] ~~Polling timestamp comparison~~ — fixed (message_id dedup) 2026-04-29
- [ ] No hay verificación `assigned_agent_id` en `agent-message` endpoint (descartado por decisión de producto)

### Camino a Agentic RAG completo
1. ✅ Lead capture form (hecho)
2. ✅ Tool calling para handoff (hecho 2026-04-29)
3. **Tool calling para retrieval** ← siguiente (`search_documents` continuation mode)
4. Multi-step reasoning (ReAct loop en dispatcher)
5. Self-correction loops
6. Knowledge graph layer

---

## Comandos de operación

### Activar/desactivar
```bash
# .env
ENABLE_AGENTIC_HANDOFF=true   # tool calling activo
ENABLE_AGENTIC_HANDOFF=false  # bot sin handoff (degradado seguro)
```

Verificar en log de arranque: `Bound 1 tool(s) to model: ['request_human_handoff']`

### Eval suite
```bash
cd backend

# Unit (mock, gratis)
python -m pytest tests/evals/test_handoff_tool.py -m "not integration" -v

# Integration (real LLM, ~$0.005/run)
OPENAI_API_KEY_REAL=sk-... python -m pytest tests/evals/test_handoff_tool.py -m integration -v
```

### Métricas
- Card en `/admin/inbox` (top): counts últimos 30d por reason
- Endpoint: `GET /api/v1/inbox/handoff-stats?days=N` (admin only)

---

## Commits relacionados (referencia)

- `Refactor handoff: WhatsApp closed + web lead capture` — refactor inicial
- `Fix agent message visibility + release banner sync` — polling fixes
- `Tighten lead trigger keywords + threshold` — hotfix temporal (borrado en migración agentic)
- `feat(handoff): migrate to LLM tool calling` — 2026-04-29 (esta migración)

---
NABLE_AGENTIC_HANDOFF=true en .env

Eval suite (Layer 1 + 2)                                                                                                   
                                                                                                                             
  - backend/tests/evals/test_handoff_tool.py — 6 unit tests (mock LLM, verifican dispatcher) + 7 integration tests (real
  gpt-4o-mini, opt-in con OPENAI_API_KEY_REAL)                                                                               
  - Casos unit: text-only, tool_call con args split, mixed text+tool, tool desconocida, args malformados, sin index
  - Casos integration: saludo no-trigger, "necesito asesor" trigger, multi-idioma, queja, out_of_scope
  - Marker integration registrado en pyproject.toml (warnings limpios)

  Run:
  cd backend
  python -m pytest tests/evals/test_handoff_tool.py -m "not integration" -v   # unit, gratis
  OPENAI_API_KEY_REAL=sk-... python -m pytest tests/evals/test_handoff_tool.py -m integration -v   # real LLM

  Bound 1 tool(s) to model: ['request_human_handoff']

  docker compose build --no-cache backend