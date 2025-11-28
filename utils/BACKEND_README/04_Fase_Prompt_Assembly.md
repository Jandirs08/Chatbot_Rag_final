# 04 · Fase de Prompt Assembly (LCEL)

Este documento detalla cómo se arma el prompt y se ensambla el pipeline LCEL en el backend, integrando historia de conversación y (opcionalmente) contexto RAG antes de invocar el modelo.

- Archivos analizados: `backend/core/chain.py`, `backend/core/bot.py`, `backend/core/prompt.py`, `backend/config.py`.

## Componentes principales
- `ChainManager` (`core/chain.py`): construye el `prompt → model` y expone `runnable_chain`.
- `Bot` (`core/bot.py`): compone `{input, history, context} → prompt → model` usando LCEL (`RunnableMap`, `RunnableLambda`).
- `prompt.py`: define `BOT_NAME`, `BOT_PERSONALIDAD` y la plantilla base (`ASESOR_ACADEMICO_REACT_PROMPT`).

## Chain: prompt → model
- Ubicación: `core/chain.py` líneas ~1–105.
- Inicialización:
  - Construye `prompt_vars` con `BOT_NAME`, `BOT_PERSONALITY` y `ui_prompt_extra` desde `settings`.
  - `_build_model_kwargs` arma parámetros del modelo (ej. `temperature`, `model_name`, `max_tokens`) según `ModelTypes` (`OpenAI`, `Vertex`, etc.).
- Construcción:
  - `self.runnable_chain = self._prompt | self._model` (pipe LCEL directo).
  - Método `override_chain` permite reemplazar la chain interna por otra `Runnable`.

## Bot: montaje del pipeline LCEL
- Ubicación: `core/bot.py` líneas ~100–190.
- `Bot._build_pipeline()` crea:
  - `get_history_async(x)`: obtiene historia desde memoria (ver sección memoria) y la formatea para el prompt (`_format_history`), preservando un mensaje `system` con perfil del usuario si existe.
  - `get_context_async(x)`: evalúa gating y, si procede, obtiene contexto RAG con el `retriever`, formateando documentos con `format_context_from_documents`.
  - `loader = RunnableMap({"input": itemgetter("input"), "history": RunnableLambda(get_history_async), "context": RunnableLambda(get_context_async)})`.
  - `pipeline = loader | prompt_model_chain` y finalmente `self.chain_manager.override_chain(pipeline)`.

## Historia de conversación
- Ubicación: `core/bot.py` líneas ~106–133 y ~302–312.
- `get_history_async`: recoge `hist_list = await self.memory.get_history(conversation_id)`.
- `_format_history(hist_list)`: genera un bloque textual con roles:
  - `system`: perfil del usuario (si existe) inyectado al inicio.
  - `human`: prefijado como `Usuario:`.
  - `ai`: prefijado como `Asistente:`.
- Orden final: se unen con saltos de línea para incluirse en el prompt.

## Contexto RAG (opcional)
- `get_context_async` (misma clase): determina `use_rag = await self.retriever.should_use_rag(user_input)` y, si `True`, llama `retrieve_documents` y formatea.
- El contexto se añade como variable `context` al prompt template, situado en la zona de grounding.

## Prompt Template y variables
- Ubicación: `core/prompt.py` líneas ~1–46.
- `ASESOR_ACADEMICO_REACT_PROMPT` incluye:
  - Encabezado con reglas de respuesta, formato Markdown, y orientación didáctica.
  - Secciones para `{{context}}` (RAG), `{{history}}` (conversación) y la entrada actual `{{input}}`.
- Variables de entorno influyentes (`config.py`):
  - `SYSTEM_PROMPT`: puede sobreescribir personalidad base.
  - `TEMPERATURE`, `MAX_TOKENS`, `MODEL_NAME`: parámetros del modelo.
  - `UI_PROMPT_EXTRA`: permite añadir guías específicas de interfaz.

## Invocación y memoria posterior
- `Bot.__call__` (`core/bot.py` líneas ~211–238):
  - Invoca `self.chain_manager.runnable_chain.ainvoke(inp)`.
  - Normaliza el resultado a `final_text` y llama `add_to_memory(human, ai, conversation_id)` para persistir en memoria la interacción.

---

## Buenas prácticas y debugging
- Valide que `get_history_async` está retornando formato esperado; revise logs `[DEBUG-HISTORY]`.
- Ajuste `SYSTEM_PROMPT`, `UI_PROMPT_EXTRA`, `TEMPERATURE` según necesidad de estilo/creatividad.
- Use `override_chain` para pruebas A/B con diferentes prompts/modelos sin cambiar el resto del pipeline.