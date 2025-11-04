# Arquitectura de Prompt e Instrucciones del Chatbot

Este documento explica dónde se definen y cómo se aplican las instrucciones del chatbot (prompt del sistema, personalidad, rol, temperatura y contexto), y qué tocar para cambiar el “asesor académico” a otro rol (por ejemplo, “chatbot vendedor”).

## Visión General

- Backend concentra el “prompt del sistema” y la personalidad base.
- El `ChainManager` monta la cadena con el modelo y asegura que el prompt incluya contexto e historial.
- El `Bot` orquesta memoria, herramientas y ejecución del agente (LangChain ReAct).
- En Frontend hay una UI de “Configuración del Bot” que hoy es estática; podemos conectarla al backend para editar el prompt y temperatura.

## Ubicaciones Clave

### 1) backend/core/prompt.py
- `BOT_NAME`: Nombre por defecto del bot (`"Asesor Virtual Académico"`).
- `BOT_PERSONALITY`: Texto con personalidad, rol y estilo conversacional (incluye “Responder SIEMPRE en ESPAÑOL”).
- `BASE_PROMPT_TEMPLATE`: Plantilla del prompt (incluye herramientas, formato ReAct y variables: `{tools}`, `{tool_names}`, `{history}`, `{input}`, `{agent_scratchpad}`).
- `get_asesor_academico_prompt(...)`: Genera el prompt usando `BOT_NAME` y `BOT_PERSONALITY`.
- `get_custom_prompt(nombre, ...)`: Permite cambiar el `nombre` manteniendo la misma personalidad base.

Cambiar a “chatbot vendedor”:
- Sustituir `BOT_NAME = "Chatbot Vendedor"` y editar `BOT_PERSONALITY` (rol, rasgos, estilo).
- O usar `get_custom_prompt("Chatbot Vendedor", ...)` si quieres variar solo el nombre.

### 2) backend/core/chain.py
- Importa `prompt_module` y valida que el prompt tenga `context` y `history`:
  - Si faltan, los inyecta dinámicamente en la plantilla con `PromptTemplate`.
- Compone `self.chain = self._prompt | self._base_model` y define `runnable_chain` que el `Bot` consume.
- Limpia residuos de formato ReAct en la respuesta final.

### 3) backend/core/bot.py
- Instancia `ChainManager` y “enciende” el agente.
- Carga historial de conversación (`memory`) y formatea `agent_scratchpad` para ReAct.
- Expone `AgentExecutor` con `tools`, `max_iterations`, etc.

### 4) backend/memory/*
- `BaseChatbotMemory` y variantes (Mongo) generan un mensaje `system` con contexto resumido y lo inyectan al inicio del historial.
- Esto complementa el prompt principal con contexto de conversación persistente.

### 5) Frontend/app/components/BotConfiguration.tsx
- UI para editar `prompt` y `temperature` (actualmente local, no persiste).
- Se puede conectar a un endpoint (p.ej. `PATCH /api/v1/bot/config`) para guardar cambios en `settings` o un storage.

## Flujo de Construcción del Prompt

1. `ChainManager` prepara el modelo (`ModelTypes` y parámetros).
2. Usa `prompt_module` (base/persona) y valida variables requeridas.
3. Inyecta `context` e `history` si faltan.
4. `Bot` añade `agent_scratchpad` (pasos intermedios de ReAct) y herramientas.
5. Se ejecuta la cadena; el parser flexible extrae `Final Answer`.

## Parámetros de Modelo

- `backend/core/chain.py` toma `settings.base_model_name` y parámetros (p.ej. temperatura) dependiendo del proveedor (`OPENAI`, `VERTEX`, etc.).
- Ajustes actuales se leen de `config.py` (settings); temperatura en Frontend es UI-only hoy.

## Cómo convertir a “Chatbot Vendedor” en 3 pasos

1. Editar `backend/core/prompt.py`:
   - `BOT_NAME = "Chatbot Vendedor"`
   - Reescribir `BOT_PERSONALITY` con rol y estilo de ventas (tono persuasivo, llamadas a la acción, manejo de objeciones, etc.).

2. Exponer configuración (opcional, recomendado):
   - Crear endpoint `GET/POST/PATCH /api/v1/bot/config` que guarde `bot_name`, `personality`, `base_prompt_template` y `temperature` en BD (Mongo) o `settings`.
   - Conectar `BotConfiguration.tsx` para persistir cambios.

3. Probar con `backend/tests` (añadir casos PR#11 extras):
   - Asegurar que `ChainManager` sigue inyectando `context/history` correctamente.
   - Validar respuesta en español y estilo vendedor.

## Riesgos y Consideraciones

- **Consistencia del idioma**: `BOT_PERSONALITY` exige español; si cambias el idioma, ajusta la instrucción.
- **Herramientas**: Si un rol requiere herramientas nuevas (catálogo, precios), registrar `tools` y describirlas en el prompt.
- **Persistencia**: La UI actual no guarda el prompt; sin endpoint, el cambio es “en duro”.

## Roadmap Sugerido (rápido)

1. Backend: `GET/PUT /api/v1/bot/config` (guardar/leer temperatura, nombre del bot y extras del prompt).
2. Frontend: pantalla de Ajustes con controles mínimos (temperatura, nombre del bot, instrucciones adicionales bloqueadas por defecto) y vista previa del prompt efectivo.
3. Tests: endpoint de configuración (auth requerido, validaciones de rango y persistencia), y validación de recarga en runtime para aplicar cambios.

## Referencias de Código

- `backend/core/prompt.py` — personalidad y plantillas base (guardrails canónicos).
- `backend/core/chain.py` — composición segura del prompt: base + `ui_prompt_extra`, y validación de variables requeridas.
- `backend/core/bot.py` — ejecución del agente y recarga en runtime.
- `backend/memory/base_memory.py` — inserta contexto `system` en historial.
- `frontend/app/components/BotConfiguration.tsx` — UI para temperatura, nombre del bot y extras (bloqueado), con toasts.
- `frontend/app/dashboard/settings/page.tsx` — pantalla de Ajustes protegida (admin).

## Configuración Dinámica (Complemento Seguro)

- Base: `BOT_PERSONALITY` y `BASE_PROMPT_TEMPLATE` mantienen idioma, uso de herramientas y formato ReAct.
- Complemento desde UI: `ui_prompt_extra` se añade como bloque “Instrucciones adicionales” sin tocar el formato ni variables.
- Nombre del bot (`bot_name`): permite branding sin alterar la estructura.
- Parámetros expuestos: `temperature` (0..1), y opcionalmente `model_name` en fases posteriores.
- Validaciones: clamped en backend; edición del extra bloqueada por defecto en UI.

---

Si quieres, implemento ahora el endpoint `GET/PUT /api/v1/bot/config` y conecto la pantalla de Configuración para que puedas cambiar entre “asesor académico” y “vendedor” sin tocar código.