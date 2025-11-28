# 05 · Fase de Response (Streaming) y Persistencia en DB

Este documento cubre cómo se generan respuestas en streaming, cómo se persiste el historial en la base de datos y cómo interactúa la memoria con el flujo.

- Archivos analizados: `backend/core/bot.py`, `backend/chat/manager.py`, `backend/database/mongodb.py`, `backend/memory/base_memory.py`.

## Respuesta no streaming (normal)
- Ubicación: `chat/manager.py` líneas ~29–120.
- Método: `async def generate_response(input_text, conversation_id, source=None, debug_mode=False)`.
- Flujo:
  1. Cache lookup por `conversation_id + input_hash` si `ENABLE_CACHE` está activo.
  2. Si cache MISS, invoca el Bot: `result = await self.bot(bot_input)` con timeout `settings.llm_timeout`.
  3. Normaliza `result["output"]` y guarda en cache.
  4. Si `debug_mode=False`, persiste dos mensajes en MongoDB: `USER_ROLE` con `input_text` y `ASSISTANT_ROLE` con `response_content`.
  5. En `debug_mode=True`, construye `DebugInfo` con documentos recuperados (`self.bot._last_retrieved_docs` si está disponible).

## Respuesta en streaming
- Ubicación: `chat/manager.py` líneas ~238–380.
- Método: `async def generate_streaming_response(...)`.
- Flujo:
  1. Inserta mensaje del usuario en DB si `debug_mode=False`.
  2. Si hay respuesta cacheada, emite `final_text`, persiste en DB y memoria, y retorna.
  3. Construye `bot_input = {"input": input_text, "conversation_id": conversation_id}`.
  4. Obtiene `stream = self.bot.astream_chunked(bot_input)`.
  5. Espera el primer chunk (`__anext__`) con timeout y lo emite; luego itera `async for chunk in stream` agregando y emitiendo.
  6. Al terminar, persiste `ASSISTANT_ROLE` en DB y añade a memoria: `await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)`.
  7. Cachea `final_text` si `ENABLE_CACHE`.

## Generación de chunks en el Bot
- Ubicación: `core/bot.py` líneas ~240–287.
- Método: `async def astream_chunked(x: Dict[str, Any], min_chunk_chars: int = 128)`.
- Flujo:
  - Invoca `self.chain_manager.runnable_chain.astream(inp)` para obtener partes de salida del LLM.
  - Función auxiliar `_extract_text(part)` (definida en el mismo archivo) extrae texto del evento.
  - Acumula en `buffer` y emite cuando `len(buffer) >= min_chunk_chars` para evitar chunks demasiado pequeños.
  - Al final, emite el residuo si existe.

## Persistencia en MongoDB
- Ubicación: `database/mongodb.py` líneas ~57–69.
- Método: `async def add_message(conversation_id, role, content, source=None)`.
- Inserta documento con campos:
  - `conversation_id`: id de la sesión/conversación.
  - `role`: `human`/`ai` o `USER_ROLE`/`ASSISTANT_ROLE` según capa que lo invoque.
  - `content`: texto del mensaje.
  - `source`: origen (ej. `embed-default`), opcional.
  - `timestamp`: `datetime.now(timezone.utc)`.
- Manejo de errores: loggea y no hace raise; revisar errores frecuentes de conectividad si el insert falla.

## Memoria del chatbot (para el prompt)
- Ubicación: `memory/base_memory.py`.
- Clase: `BaseChatbotMemory` (implementa `AbstractChatbotMemory`).
- Persistencia in-memory por sesión:
  - `add_message(session_id, role, content)`: guarda en `_message_history[session_id]` y recorta a `k_history`.
  - Para `role == "human"`, extrae un perfil del texto (`_extract_profile`) con claves `{nombre, edad, gustos, metas}` y lo mantiene en `_profiles`.
  - `get_history(session_id)`: retorna mensajes ordenados y, si hay perfil, inserta un `system` con las claves del perfil al inicio.

## Interacción Cache/Memoria/DB
- Cache: `utils/cache` mediante `ChatbotCache` y `cache.manager`; controla respuestas repetidas por conversación.
- Memoria: se usa para `history` que alimenta el prompt (no es la misma que la DB; es contexto de conversación en curso).
- DB: persistencia durable para auditoría/reportes; no interviene directamente en el prompt.

---

## Recomendaciones operativas
- Ajuste `min_chunk_chars` en `Bot.astream_chunked` si necesita chunks más finos.
- Verifique `ENABLE_CACHE` y `CACHE_TTL` para equilibrar latencia y frescura.
- Si la base crece, indexe `conversation_id` e idealmente `timestamp` en la colección `messages`.
- Para trazas, habilite logs de `ChatManager` y `Bot` a nivel `debug`.