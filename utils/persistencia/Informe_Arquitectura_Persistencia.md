# Informe de Arquitectura de Persistencia y Manejo de Identidades del Chatbot RAG

## Resumen Ejecutivo

Este informe propone una arquitectura sencilla y robusta para persistir conversaciones del chatbot, soportar identidades anónimas mediante `session_id`, integrar un `userKey` cuando exista login (por ejemplo Moodle), y preparar el camino hacia un plugin nativo sin romper la arquitectura actual. También define colecciones/tablas recomendadas, endpoints, y el comportamiento del frontend embebido tanto en sitios sin login como con login.

La base actual del backend es sólida (FastAPI, ciclo de vida con `lifespan`, managers centralizados, streaming SSE, caché e índices en MongoDB). La mayor brecha es la ausencia de una capa explícita de “Conversación” (metadatos), un mecanismo estándar para resumes, y la persistencia en el frontend (se pierde el contexto al refrescar). Este plan introduce una colección `conversations`, normaliza `messages`, añade endpoints claros y flujos de inicialización en el cliente, con compatibilidad progresiva hacia Moodle y escenarios multi-tenant.

---

## Análisis Inicial del Backend

- Puntos fuertes
  - FastAPI bien estructurado con `create_app` y `lifespan` que inicializa recursos compartidos (`Bot`, `ChatManager`, `MongoDB client`, etc.).
  - `ChatManager` persiste pares de mensajes (`user` y `assistant`) en MongoDB bajo `conversation_id` usando `database.mongodb.MongodbClient`.
  - Índices en MongoDB (`conversation_id` + `timestamp`, `timestamp`, `role`) para consultas de historial y análisis simples.
  - Endpoint de chat `/api/v1/chat/` con respuesta en streaming (SSE) y control de caché HTTP.
  - Claridad semántica: en `common/objects.py` se especifica la convención para usar `conversation_id` como `session_id` donde LangChain lo requiera. 
  - Utilidades de exportación (`/chat/export-conversations`) y métricas básicas (`/chat/stats`).

- Puntos débiles
  - No existe colección/metadatos de “Conversación”; solo `messages` con `conversation_id`. Falta estado, propietario, canal, origen, etc.
  - Frontend genera `conversationId` al montar y no lo persiste (se pierde al refrescar). No hay `resumeConversation`.
  - No hay soporte formal para `session_id` anónimo (solo UUID ad-hoc desde el cliente) ni para `userKey` de integradores (Moodle, LMS, sitio).
  - Duplicación conceptual: `memory/custom_memory.py` guarda `message_turn` con otra forma; esto puede generar inconsistencia con `messages`.
  - Falta rate limiting, retention/archiving y controles de privacidad/PII.

- Riesgos
  - Crecimiento indefinido de `messages` sin política de retención.
  - Dificultad para auditar/segmentar conversaciones por sitio, curso, integrador o usuario.
  - Sin endpoints para “crear/conectar” una conversación de manera explícita, el cliente siempre debe “inventar” el `conversation_id`.
  - Futuras integraciones (plugin Moodle) requieren metadatos consistentes (userKey, site_id, context_id), hoy ausentes.

---

## Análisis del Frontend Embebido (/chat)

- Implementación actual
  - `frontend/app/chat/page.tsx` crea `conversationId` con `crypto.randomUUID()` en `useMemo` y lo pasa a `ChatWindow`.
  - `ChatWindow` usa `useChatStream(conversationId)` para enviar mensajes vía SSE a `/api/v1/chat/`.
  - Comentario explícito: “la sesión se pierde al refrescar pantalla”. No hay localStorage ni endpoint de `resume`.

- Comunicación con backend
  - El hook `useChatStream` envía `{ input, conversation_id }` por POST a `/api/v1/chat/`.
  - No hay recuperación del historial ni inicialización/creación explícita de conversación.

- Consecuencia
  - La persistencia depende totalmente de que el cliente mantenga su `conversation_id` en memoria; al refrescar, se pierde.

---

## Diseño Técnico Propuesto

### Principios
- Separar metadatos de conversación (`conversations`) de los mensajes (`messages`).
- Definir flujos para identidades:
  - Anónimas: `session_id` estable en el navegador (localStorage), sin login.
  - Autenticadas/externas: `userKey` y `site_id` (ej. Moodle, LMS, portal), opcionalmente `context_id` (curso).
- Endpoints explícitos para crear, enviar, obtener historial, y reanudar.
- Mantener compatibilidad con `/api/v1/chat/` mientras se incorporan endpoints nuevos.

### Entidades
- Conversation (metadatos)
  - `conversation_id` (UUID)
  - `created_at`, `last_activity_at`
  - `status` (`active`, `closed`, `archived`)
  - `channel` (`embed`, `moodle`, `api`, etc.)
  - `site_id` (ej. `moodle-34`, `site-12`)
  - `user_key` (ej. `user-123` o `moodle_user_456`)
  - `session_id` (anónimo; localStorage)
  - `context_id` (opcional: curso, módulo, sección)
  - `tenant_id` (opcional multi-tenant)
  - `metadata` (objeto: UA, referer, widget_id, etc.)

- Message
  - `conversation_id`
  - `role` (`user`, `assistant`)
  - `content`
  - `timestamp`
  - `token_usage` (opcional)
  - `source` (opcional: RAG, manual)

### Generación y uso de `session_id` anónimo
- Frontend al inicializar:
  - Lee `localStorage.getItem('chatbot_session_id')`.
  - Si no existe, genera `session_id = crypto.randomUUID()` y lo guarda.
- Backend ofrece `/api/v1/conversations/resume` que recibe `{ session_id, site_id?, channel? }` y:
  - Busca la última conversación `active` por `session_id` y `site_id`.
  - Si existe, retorna `conversation_id` y estado; si no, crea nueva (`createConversation`).

### Integración de `userKey`
- Cuando haya login, el integrador (Moodle) pasa `userKey` (y `site_id`, `context_id`).
- `resume` prioriza `userKey + site_id (+ context_id)` para encontrar/crear conversación.
- `session_id` se usa como respaldo, pero la conversación se vincula al `userKey`.
- Formato flexible de `site_id`: `moodle-34`, `site-12`.

### Compatibilidad y limpieza
- Mantener `/api/v1/chat/` vigente; internamente puede apoyarse en `conversations` para actualizar `last_activity_at`.
- Normalizar una sola forma de persistencia de mensajes (`messages`).
- Deprecar la escritura duplicada en `custom_memory` (o adaptarla para leer/escribir solo `messages`).

---

## Arquitectura Final Recomendada

- Backend (FastAPI)
  - `conversations` (colección nueva)
  - `messages` (colección actual, ajustada/normalizada)
  - Routers nuevos: `/api/v1/conversations/*` para `create`, `resume`, `history`, `list`.
  - `ChatManager` sigue generando respuestas y guardando mensajes; además actualiza `last_activity_at` de la conversación.

- Frontend (Next.js)
  - Inicialización del widget: obtener/crear `session_id` en localStorage.
  - Llamar `resume` para obtener un `conversation_id` estable.
  - Enviar y renderizar mensajes vía `/api/v1/chat/` usando ese `conversation_id`.
  - Agregar `getHistory` para precargar historial al montar.

---

## Endpoints Recomendados

- `POST /api/v1/conversations/create`
  - Body: `{ session_id?, user_key?, site_id?, channel?, context_id?, metadata? }`
  - Respuesta: `{ conversation_id, status }`
  - Crea conversación con metadatos; si ya existe una activa para la misma clave primaria (p. ej., `user_key + site_id + context_id`), puede devolver la existente.

- `POST /api/v1/conversations/resume`
  - Body: `{ session_id?, user_key?, site_id?, channel?, context_id? }`
  - Lógica: buscar última `active` por `user_key + site_id + context_id`; si no, por `session_id + site_id + channel`; si no existe, crea nueva.
  - Respuesta: `{ conversation_id, status }`

- `GET /api/v1/conversations/{conversation_id}/history`
  - Respuesta: `[{ role, content, timestamp }]`
  - Usa el cliente Mongo para leer de `messages`.

- `POST /api/v1/chat/send` (opcional) o mantener `POST /api/v1/chat/`
  - Body: `{ input, conversation_id }`
  - Streaming SSE como hoy. Internamente, actualizar `last_activity_at` en `conversations`.

- `GET /api/v1/conversations/list` (admin)
  - Filtros: `site_id`, `user_key`, `status`, `date_range`.

- `POST /api/v1/conversations/{conversation_id}/close`
  - Cierra/archiva.

---

## Comportamiento del Frontend Embebido

- Inicialización (sin login)
  - Leer/crear `session_id` en localStorage.
  - Llamar `resume` con `{ session_id, site_id: 'site-12', channel: 'embed' }`.
  - Recibir `conversation_id`.
  - Llamar `getHistory` y popular UI.
  - Enviar mensajes con `{ input, conversation_id }` vía `/api/v1/chat/`.

- Inicialización (con login, Moodle)
  - El integrador entrega `userKey`, `site_id` y opcional `context_id`.
  - Llamar `resume` con `{ user_key, site_id: 'moodle-34', context_id, channel: 'moodle' }`.
  - Recibir `conversation_id`; precargar historial y continuar.
  - `session_id` puede persistir en localStorage como fallback, pero el ownership principal es por `userKey`.

---

## Esquema de Base de Datos / Colecciones

### conversations
```json
{
  "conversation_id": "uuid",
  "created_at": "2025-01-01T12:00:00Z",
  "last_activity_at": "2025-01-01T12:05:00Z",
  "status": "active", // active | closed | archived
  "channel": "embed", // embed | moodle | api
  "site_id": "moodle-34",
  "user_key": "user-123", // opcional
  "session_id": "uuid",   // opcional
  "context_id": "course-567", // opcional
  "tenant_id": "tenant-1", // opcional
  "metadata": { "widget_id": "chat-abc", "ua": "..." }
}
```

Índices recomendados:
- Único (parcial opcional): `{ user_key: 1, site_id: 1, context_id: 1, status: 1 }` para `active`.
- Frecuentes: `{ session_id: 1, site_id: 1, channel: 1, status: 1, last_activity_at: -1 }`.
- TTL opcional sobre `archived` con campo `archived_at`.

### messages
```json
{
  "conversation_id": "uuid",
  "role": "user", // user | assistant
  "content": "Hola...",
  "timestamp": "2025-01-01T12:01:00Z",
  "token_usage": { "input": 123, "output": 456 }, // opcional
  "source": "rag" // opcional
}
```

Índices:
- `{ conversation_id: 1, timestamp: 1 }` (ya existente)
- `{ role: 1 }` (ya existente)

### Notas de normalización
- Unificar la persistencia en `messages` y usar `conversations` para metadatos. Evitar duplicar estructura en `custom_memory`.

---

## Fases de Implementación (Migración)

1) Bootstrap de `conversations`
- Crear colección e índices.
- Añadir lógica en `ChatManager` o middleware para actualizar `last_activity_at`.
- Endpoint `resume` que crea si no existe.

2) Frontend persistente (embed)
- Guardar `session_id` en localStorage.
- Implementar llamadas a `resume` y `getHistory`.
- Seguir usando `/api/v1/chat/` para enviar.

3) Integración con `userKey` (Moodle/LMS)
- Soportar `user_key`, `site_id`, `context_id` en `resume` y `create`.
- Definir reglas de ownership y prioridad de matching.

4) Plugin Moodle y multi-tenant
- Asegurar endpoints estables y documentación.
- Añadir filtros/analytics por `site_id`, `context_id`, `user_key`.

5) Hardening
- Rate limits por `session_id`/`user_key`/IP.
- Retención/archiving: cerrar y archivar conversaciones con TTL.
- Observabilidad (Prometheus, logs estructurados, trazas).

---

## Endpoints: Ejemplos de Contratos

- POST `/api/v1/conversations/resume`
```json
{
  "session_id": "uuid",
  "site_id": "site-12",
  "channel": "embed"
}
```
Respuesta:
```json
{ "conversation_id": "uuid", "status": "active" }
```

- GET `/api/v1/conversations/{conversation_id}/history`
Respuesta:
```json
[{ "role": "user", "content": "Hola", "timestamp": "..." }]
```

- POST `/api/v1/chat/` (actual)
```json
{ "input": "Pregunta...", "conversation_id": "uuid" }
```
Streaming SSE idéntico al actual.

---

## Comportamiento Ideal del Frontend Embebido al Inicializarse

- Leer/crear `session_id` en localStorage.
- Invocar `resume` con `session_id`, `site_id` y `channel`.
- Si `userKey` existe, invocar `resume` con `user_key` + `site_id` (+ `context_id`).
- Pre-cargar historial (`getHistory`).
- Mantener `conversation_id` constante para toda la sesión del widget.

---

## Consideraciones Futuras

- Analytics
  - Contadores por `site_id`, curso (`context_id`), `user_key`.
  - Eventos: inicio/fin de conversación, tokens, tiempo de respuesta, satisfacción.

- Multi-tenant / multi-curso
  - `tenant_id` y `context_id` en `conversations`.
  - Filtros y dashboards por tenant/curso.

- Seguridad
  - Rate limits por IP/`session_id`/`user_key`.
  - Sanitización y control de PII en mensajes.
  - JWT opcional en `resume`/`history` si el integrador lo requiere.

- Rendimiento
  - Caché de prompts/contexto; paginación en `history`.
  - Índices compuestos y TTL en `archived`.

- Compatibilidad LCEL
  - Mantener la convención `conversation_id == session_id` para memoria LangChain cuando aplique.
  - Evitar duplicar storage en `custom_memory`; centralizar en `messages`.

---

## Qué partes del backend modificar y qué reutilizar

- Reutilizar
  - `ChatManager`, `MongodbClient` (añadiendo métodos para `conversations`).
  - Routers existentes (`/chat`) y su streaming SSE.
  - Índices actuales de `messages`.

- Modificar/Añadir
  - Nueva colección `conversations` y repositorio asociado.
  - Nuevos endpoints `/api/v1/conversations/*`.
  - Actualizar `ChatManager` para refrescar `last_activity_at`.
  - Simplificar/normalizar `custom_memory` para no duplicar persistencia.

---

## Conclusión

La propuesta introduce una capa de metadatos `conversations` y flujos de `resume/create` que resuelven la persistencia tras refrescos, habilitan identidades anónimas y autenticadas, y preparan una evolución fluida hacia un plugin Moodle. Mantiene el endpoint `/api/v1/chat/` y la estructura actual, minimizando deuda técnica y abriendo el camino para escalabilidad y limpieza del almacenamiento.