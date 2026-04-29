# Handoff — Próximos Pasos

## Estado actual (2026-04-28)

Refactor de handoff completado:
- WhatsApp handoff cerrado (sin keyword trigger)
- Web: lead capture en lugar de "esperando asesor"
- Polling con header `X-Conversation-Mode` para detectar release
- Removido auto-mensaje "Estás en conversación con un asesor"
- Trigger keywords con threshold (phrase explícita vs soft + historial)

**Calificación arquitectónica del handoff: 4/10**
RAG retrieval: 8/10. Handoff: bandaid sobre keywords.

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
- [ ] Race condition en `get_or_create` (`conversation_repository.py:38`) — usar `find_one_and_update` con upsert
- [ ] Polling timestamp comparison usa `>` no `>=` (puede perder mensajes con mismo timestamp) — usar message ID
- [ ] No hay verificación `assigned_agent_id` en `agent-message` endpoint (cualquier admin puede mandar a cualquier conv)

### Camino a Agentic RAG completo
1. ✅ Lead capture form (hecho)
2. **Tool calling para handoff** ← siguiente
3. Tool calling para retrieval (bot decide cuándo buscar)
4. Multi-step reasoning (ReAct pattern)
5. Self-correction loops
6. Knowledge graph layer

---

## Commits relacionados (referencia)

- `Refactor handoff: WhatsApp closed + web lead capture` — refactor inicial
- `Fix agent message visibility + release banner sync` — polling fixes
- `Tighten lead trigger keywords + threshold` — hotfix temporal (a borrar tras tool-calling)
