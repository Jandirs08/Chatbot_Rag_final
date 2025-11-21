# Plan de Integración de WhatsApp — Backend ChatBot RAG

## Contexto Actual del Backend
- FastAPI y routers en `backend/api/app.py:423-437`; CORS y middleware de autenticación en `backend/api/app.py:385-405` y `backend/auth/middleware.py:1-90`.
- ChatManager orquesta I/O y persistencia: `backend/chat/manager.py:17-88` (respuesta completa) y `backend/chat/manager.py:89-149` (streaming SSE).
- Bot/LCEL y RAG: `backend/core/bot.py:21-176` (pipeline), `backend/rag/retrieval/retriever.py:86-117` y `backend/rag/vector_store/vector_store.py:245-283`.
- SSE público de chat en `backend/api/routes/chat/chat_routes.py:24-101`.
- MongoDB colecciones actuales: `messages` (`backend/database/mongodb.py:57-70`), `users` (`backend/database/user_repository.py:14-26` y `backend/database/mongodb.py:96-108`), `bot_config` (`backend/database/config_repository.py:25-31`).

## Objetivo
Integrar WhatsApp de forma mínima y directa, reutilizando el ChatManager, la persistencia en `messages` y el runtime del Bot. Sin introducir colas, dispatcher, reintentos avanzados ni limitadores de tasa avanzados.

## Módulos estrictamente necesarios

1) Webhook (ruta FastAPI)
- Nueva ruta pública `POST /api/v1/whatsapp/webhook` bajo `backend/api/routes/whatsapp/webhook_routes.py`.
- Agregar el path exacto a `PUBLIC_EXACT` en `backend/auth/middleware.py:16-35` para permitir acceso sin JWT.
- Responsabilidad: recibir eventos entrantes (mensajes de texto); extraer `wa_id` del remitente y el texto.
- Respuesta HTTP: 200 rápida con ack simple; manejo de errores con `HTTPException` como en rutas existentes.

2) Cliente de WhatsApp
- Módulo mínimo `backend/utils/whatsapp/client.py` (ligero, sin SDK externo si no es necesario).
- Funciones esenciales: `send_text(to_wa_id, text)` y `health_check()` opcional.
- Configuración por entorno (ejemplos): `WHATSAPP_API_BASE_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Mantenerlo genérico (compatible con Cloud API o similar) sin acoplar a un proveedor específico.

3) Repositorio de sesiones
- `backend/database/whatsapp_session_repository.py` para gestionar la colección `whatsapp_sessions`.
- Responsabilidad: mapear `wa_id` ⇄ `conversation_id` y metadatos básicos.
- Índices mínimos: único sobre `wa_id`; índice sobre `updated_at`.

4) Formatter básico
- `backend/utils/whatsapp/formatter.py`: normaliza el texto de salida a WhatsApp (trim, eliminación de saltos duplicados, máximo de caracteres si aplica).
- Sin plantillas avanzadas ni medios.

5) Adaptación mínima de ChatManager
- Reutilizar `ChatManager.generate_response(...)` (`backend/chat/manager.py:26-83`).
- Fuente marcada como `source="whatsapp"` para trazabilidad en `messages`.
- Seleccionar/construir `conversation_id` a partir del `wa_id` utilizando el repositorio de sesiones.

## Colecciones (solo las necesarias)
- `messages` (existente): se sigue usando tal cual para persistir interacción.
- `users` (existente): sin cambios.
- `bot_config` (existente): sin cambios.
- `whatsapp_sessions` (nueva y única requerida):
  - Campos mínimos:
    - `_id` (ObjectId)
    - `wa_id` (string, único)
    - `conversation_id` (string, UUID generado por el backend)
    - `phone_number_id` (string, opcional)
    - `created_at` (datetime UTC)
    - `updated_at` (datetime UTC)
  - Índices: `{ wa_id: 1 }` único; `{ updated_at: -1 }`.

## Flujo de Mensaje (simple y aplicable)
- Entrante:
  - Webhook recibe evento → extrae `wa_id` y `text`.
  - `WhatsappSessionRepository.get_or_create(wa_id)` devuelve/crea `conversation_id`.
  - Llamar `ChatManager.generate_response(text, conversation_id, source="whatsapp")`.
  - Enviar salida con `WhatsAppClient.send_text(wa_id, response_text)`.
  - Responder 200 al proveedor.
- Persistencia:
  - `ChatManager` ya guarda ambos mensajes en `messages` (`backend/chat/manager.py:73-76`).
  - `whatsapp_sessions` guarda el enlace `wa_id` ⇄ `conversation_id` y last-update.
- SSE:
  - No se usa para WhatsApp. El SSE existente (`backend/api/routes/chat/chat_routes.py:57-91`) permanece intacto.

## Cambios en Middleware y App
- `AuthenticationMiddleware.PUBLIC_EXACT`: añadir `"/api/v1/whatsapp/webhook"` (`backend/auth/middleware.py:16-35`).
- Registrar router `whatsapp` en `backend/api/app.py:423-437` con `prefix="/api/v1/whatsapp"` y tag `whatsapp`.
- CORS: sin cambios (mensajería entrante server-to-server).

## Configuración y Entorno
- Variables mínimas (nombres genéricos, sin acoplar):
  - `WHATSAPP_API_BASE_URL`
  - `WHATSAPP_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
- Fallbacks seguros: si faltan, el webhook solo ackea y loguea; el envío se deshabilita.

## Fases / PRs (de inicio a fin)
1. Base de ruta y middleware
   - Crear router `whatsapp` y registrar `POST /webhook`.
   - Agregar a `PUBLIC_EXACT` el path exacto del webhook.

2. Repositorio de sesiones (`whatsapp_sessions`)
   - CRUD mínimo: `get_or_create(wa_id)`, `touch(wa_id)`, `find_by_wa_id(wa_id)`.
   - Asegurar índices en el `lifespan` junto con `messages/users` (`backend/api/app.py:243-256`).

3. Cliente de WhatsApp
   - Implementar `send_text(to_wa_id, text)` usando `WHATSAPP_API_BASE_URL` + `WHATSAPP_TOKEN`.
   - Logging y retorno booleano.

4. Formatter básico
   - Función `format_text(text)` aplicada antes de enviar.

5. Adaptación mínima de ChatManager
   - Integración del flujo: obtener `conversation_id` del repo, invocar `generate_response` con `source="whatsapp"`.

6. Webhook end-to-end
   - Parseo seguro de payload; tolerar sólo mensajes de texto.
   - Invocar ChatManager; enviar respuesta; ack inmediato.

7. Pruebas funcionales simples (sin frontend)
   - Simular webhook con `curl` y payload mínimo.
   - Verificar inserciones en `messages` y envío (mock o entorno de prueba).

## Consideraciones de Seguridad y Simplicidad
- No introducir colas ni reintentos avanzados; confiar en la entrega del proveedor y en logs.
- Limitar tamaño de salida; sanitizar texto básico en formatter.
- Mantener todo acoplado a las rutas y estados ya existentes de la app (`app.state.*`).

## Resultado Esperado
- Mensajes entrantes de WhatsApp producen respuestas del Bot, persisten en `messages` y se devuelven al usuario vía el cliente WhatsApp.
- Cambios acotados, siguiendo patrones del proyecto, sin afectar SSE ni flujos actuales.