# Refactor: Configuración Dinámica del Chatbot (Prompt y Temperatura)

## Resumen Ejecutivo

- Objetivo: mover `system_prompt` y `temperature` de configuración “en duro” a una configuración dinámica y editable desde UI, persistida en MongoDB y aplicada en tiempo real.
- Stack actual: FastAPI (backend), Next.js (frontend), MongoDB (historial y usuarios). Seguridad admin con JWT y middleware ya operativo.
- Estrategia: crear repositorio/colección `bot_config`, exponer API `GET/PUT` protegida, recargar la cadena del bot en runtime y añadir página de Ajustes en el frontend.
- Este documento define el análisis técnico, relaciones internas y el plan de PRs con criterios de aceptación, rollback y riesgos.

---

## Estado Actual (Análisis)

- Configuración base (`backend/config.py`):
  - Define `model_type`, `base_model_name`, `max_tokens`, `temperature`, `system_prompt`, `bot_personality_name`, `main_prompt_name`, `ai_prefix`, `human_prefix`.
  - `system_prompt` puede provenir de `.env`, pero la lógica usa preferentemente plantillas en `prompt.py` si no hay override.

- Prompt y cadena (`backend/core/prompt.py`, `backend/core/chain.py`):
  - `prompt.py` contiene `BOT_NAME`, `BOT_PERSONALITY`, `BASE_PROMPT_TEMPLATE`, `ASESOR_ACADEMICO_REACT_PROMPT` y helpers para generar prompt.
  - `chain.py` carga la plantilla principal desde `settings.main_prompt_name` (por defecto `ASESOR_ACADEMICO_REACT_PROMPT`). Inyecta variables `{context}`, `{history}` si faltan.
  - Determina `bot_personality` así:
    - Si `settings.bot_personality_name` existe, intenta cargar texto desde `prompt.py`.
    - Si no, usa `settings.system_prompt` si está definido.
    - Si ninguno, usa vacío.
  - LLM kwargs (`temperature`, `model_name`, `max_tokens`, etc.) se leen de `settings` y se adaptan por proveedor (`OPENAI`/`VERTEX`).

- Bot y flujo de chat (`backend/core/bot.py`, `backend/chat/manager.py`):
  - `Bot` crea `ChainManager` y `AgentExecutor` (ReAct flexible), carga `history`, `agent_scratchpad` y herramientas.
  - `ChatManager` orquesta RAG (si aplica), envía al bot y persiste mensajes en Mongo (`messages`). No modifica `settings` en runtime.

- FastAPI app y ciclo de vida (`backend/api/app.py`):
  - En `lifespan`, inicializa y guarda en `app.state`: `settings`, PDF/RAG managers, `Bot`, `ChatManager`, `MongodbClient`.
  - Routers registrados: `health`, `auth`, `pdfs`, `rag`, `chat`, `bot`, `users`.
  - `AuthenticationMiddleware` protege rutas admin (`/api/v1/pdf`, `/api/v1/rag`, `/api/v1/bot`, `/api/v1/users`). Chat y auth son públicas.

- Autenticación frontend:
  - `frontend/app/lib/services/authService.ts`: `TokenManager` y `authenticatedFetch` añaden `Authorization: Bearer <token>`.
  - `frontend/middleware.ts` y `useAuthGuard` protegen páginas admin.

- UI de configuración:
  - `frontend/app/components/BotConfiguration.tsx`: formulario con estado local (`prompt`/`temperature`) y toasts, sin persistencia ni llamadas a API.
  - No existe página `/settings` dedicada; el componente es reutilizable.

- Persistencia en Mongo (`backend/database/mongodb.py`):
  - Solo maneja `messages` e índices de historial. No hay repositorio/categoría para configuración del bot.

### Conclusión

- La personalidad/prompt viven en `prompt.py` y/o `settings.system_prompt`, y la temperatura en `settings.temperature`. No hay API ni persistencia para editarlos desde UI.
- Mongo se usa para historial; agregaremos `bot_config`.
- La recarga dinámica requiere reconstruir `ChainManager`/`AgentExecutor` o proveer un método de recarga en `Bot`.

---

## Mapa de Relaciones y Flujo

- Entrada Usuario → `chat_routes.py` → `ChatManager.generate_response()` → decide RAG → `Bot` (`agent_executor`) → `ChainManager` (`PromptTemplate + LLM`).
- `ChainManager` arma kwargs del modelo desde `settings` e inserta `{bot_personality}`, `{history}`, `{context}`.
- `settings` se fija al iniciar la app; cambios en `.env` o `settings` no se aplican en runtime hoy.
- Seguridad: `AuthenticationMiddleware` protege `/api/v1/bot/*` para admin; podemos colgar config ahí.

---

## Decisiones de Diseño

- Colección `bot_config` única (`_id: "default"`), con `system_prompt`, `temperature`, `updated_at`.
- API `GET/PUT /api/v1/bot/config` protegida por admin (PUT). GET también admin-only para mantener confidencialidad del prompt.
- Recarga en runtime: tras PUT, actualizar `app.state.settings` y reconstruir `ChainManager`/`AgentExecutor` a través de `Bot.reload_chain(settings)`.
- Compatibilidad: `bot_personality_name` sigue soportado; si está presente, tiene prioridad. Documentar preferencia por `system_prompt` cuando la configuración es dinámica.

---

## Plan de PRs

### PR #1 — Modelo y Repositorio de Configuración (MongoDB)

- Crear `ConfigRepository` con métodos:
  - `get_config()` → retorna y hace upsert por defecto a partir de `settings` si no existe.
  - `update_config(system_prompt?, temperature?)` → actualiza campos y devuelve el nuevo estado.
- Colección: `bot_config` (documento `_id: "default"`).
- Validación: `temperature ∈ [0,1]`.

Archivos:
- `backend/database/config_repository.py` (nuevo).

Criterios de aceptación:
- `get_config` retorna valores correctos y si no existe crea por defecto.
- `update_config` persiste cambios y respeta validaciones.

Rollback:
- Eliminar archivo y colección; no afecta otras rutas.

---

### PR #2 — API FastAPI: GET/PUT /api/v1/bot/config (Admin)

- Schemas Pydantic:
  - `BotConfigDTO` (output) con `system_prompt`, `temperature`, `updated_at`.
  - `UpdateBotConfigRequest` (input) con `system_prompt?`, `temperature?`.
- Router:
  - `GET /api/v1/bot/config` → devuelve configuración actual.
  - `PUT /api/v1/bot/config` → actualiza configuración.
- Seguridad: protegidas por `AuthenticationMiddleware` bajo `/api/v1/bot/*`.

Archivos:
- `backend/api/schemas/config.py` (nuevo).
- `backend/api/routes/bot/config_routes.py` (nuevo).
- Registrar router en `backend/api/app.py`.

Criterios de aceptación:
- Validaciones y códigos de estado (`422` por payload inválido, `401/403` por auth, `200` por éxito).

Rollback:
- Quitar router y schemas; sin impacto en el resto.

---

### PR #3 — Integración Runtime en Bot/Chain

- Aplicar configuración al iniciar:
  - En `lifespan` de `app.py`, leer/sembrar `bot_config` y sincronizar `app.state.settings` antes de crear `Bot`.
- Recarga dinámica tras PUT:
  - Añadir `Bot.reload_chain(settings)` para reconstruir `ChainManager` y `AgentExecutor` con los nuevos valores, mantener `tools` y memoria.
  - En `config_routes.py` (PUT), tras persistir, invocar recarga.

Archivos:
- `backend/core/bot.py` (método `reload_chain`).
- `backend/api/app.py` (cargar config en `lifespan`).
- `backend/api/routes/bot/config_routes.py` (invocar recarga tras PUT).

Criterios de aceptación:
- Cambios a `system_prompt`/`temperature` via PUT se reflejan inmediatamente en nuevas respuestas.
- Fallos en recarga se informan con `500`; estado antiguo se mantiene estable.

Rollback:
- Desactivar recarga en PUT; requerir reinicio para aplicar.

---

### PR #4 — Frontend: Página de Ajustes y Refactor del Componente

- Página admin `frontend/app/dashboard/settings/page.tsx`:
  - Protegida: `useAuthGuard({ requireAdmin: true })`.
  - Cargar config con `GET /api/v1/bot/config` al montar.
  - Enviar cambios con `PUT /api/v1/bot/config` usando `authenticatedFetch`.
- Refactor `BotConfiguration.tsx` para recibir props (`prompt`, `temperature`, `onSave`, `onReset`, `isLoading`, `error`) y dejar la gestión en la página.
- Opcional: `frontend/app/lib/services/botConfigService.ts` para encapsular llamadas.

Archivos:
- `frontend/app/dashboard/settings/page.tsx` (nuevo).
- `frontend/app/components/BotConfiguration.tsx` (modificar para props/controlado).
- `frontend/app/lib/services/botConfigService.ts` (opcional, nuevo).

Criterios de aceptación:
- UI muestra valores actuales, permite editar y guardar con feedback.
- Rutas protegidas; no accesible sin admin.
- Cambios se aplican en tiempo real (gracias a PR #3).

Rollback:
- Volver a componente con estado local y quitar la página.

---

### PR #5 — Pruebas y Documentación

- Tests backend:
  - `test_bot_config_routes.py`:
    - GET sin token → 401/403.
    - GET con admin → 200 y DTO correcto.
    - PUT con `temperature` fuera de rango → 422.
    - PUT con admin → 200 y verificación de persistencia y recarga.
- Documentación:
  - Actualizar `README.md` y `PROMPT_ARQUITECTURA.md` sección “Configuración del Bot”: endpoints, seguridad, límites, notas de runtime.

Archivos:
- `backend/tests/test_bot_config_routes.py` (nuevo).
- `README.md`/`PROMPT_ARQUITECTURA.md` (modificar).

Criterios de aceptación:
- Tests pasan localmente; docs claras para mantenimiento.

Rollback:
- Solo afecta archivos de test/docs.

---

## Endpoints Propuestos (Especificación)

```http
GET /api/v1/bot/config
Authorization: Bearer <token_admin>

Response 200 (application/json)
{
  "system_prompt": "...",
  "temperature": 0.7,
  "updated_at": "2025-01-01T12:00:00Z"
}

PUT /api/v1/bot/config
Authorization: Bearer <token_admin>
Content-Type: application/json

Request
{
  "system_prompt": "...", // opcional
  "temperature": 0.8       // opcional, 0..1
}

Response 200 (application/json)
{
  "system_prompt": "...",
  "temperature": 0.8,
  "updated_at": "2025-01-01T12:05:00Z"
}
```

---

## Riesgos y Consideraciones

- Seguridad: mantener GET/PUT bajo ruta protegida admin para evitar exposición del prompt.
- Consistencia: si `bot_personality_name` coexiste con `system_prompt`, definir prioridad (recomendado: prioridad a configuración dinámica).
- Observabilidad: loggear actualizaciones, recargas y errores.
- Rendimiento: la recarga reconstruye `ChainManager`/`AgentExecutor`; coste aceptable dado que es poco frecuente.
- Backwards compatibility: sin cambios en `BASE_PROMPT_TEMPLATE`; mantener comportamiento de inyección de `{context}` y `{history}`.

---

## Criterios de Aceptación Globales

- Un admin puede ver y editar la configuración desde UI.
- Cambios persisten en Mongo y se aplican al bot sin reiniciar.
- API responde con validaciones y errores adecuados.
- Tests y documentación actualizados.

---

## Próximos Pasos

1. Aprobación del plan.
2. Implementar PR #1 (repositorio/config en Mongo).
3. Implementar PR #2 (API GET/PUT protegida).
4. Implementar PR #3 (recarga runtime del bot).
5. Implementar PR #4 (UI de Ajustes y refactor componente).
6. Implementar PR #5 (tests y documentación).

---

## Nota

Este documento no introduce cambios de código en el proyecto todavía; sirve como guía para la ejecución ordenada por PRs.