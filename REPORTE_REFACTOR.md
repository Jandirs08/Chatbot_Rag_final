# REPORTE DE REFACTORIZACIÓN

Este reporte prioriza acciones de limpieza enfocadas en: código muerto, duplicación (DRY), malos olores, manejo de errores deficiente y complejidad innecesaria. No se incluyen soluciones en código; solo se describe el problema y la acción requerida.

## 🔴 CRÍTICO (Eliminación Segura / Lógica Rota)

- Problema: Endpoint incorrecto para limpiar conversación (lógica rota)
  Ubicación: `frontend/app/components/ChatWindow.tsx:222`
  Acción Requerida: Corregir la ruta del endpoint de limpieza para que apunte a `"/api/v1/chat/clear/{conversation_id}"` (actualmente usa `"/clear/{conversationId}"` sin el prefijo), o reutilizar un servicio común de API que garantice consistencia de rutas.

## 🟠 ALTO (Refactorización Urgente / DRY)

- Problema: DRY violado e inconsistencia de configuración de base de URL de API en frontend
  Ubicación: `frontend/app/utils/constants.tsx:1-2`, `frontend/app/lib/constants.ts:1-2`, `frontend/app/lib/config.ts:1-2`, `frontend/app/lib/services/ragService.ts:1-2`
  Acción Requerida: Unificar en un único módulo de configuración (una sola constante y una sola variable de entorno pública) y actualizar todos los servicios y componentes para usarlo. Evitar combinaciones de `apiBaseUrl`, `API_URL`, `API_BASE_URL` y distintos nombres de env (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BACKEND_URL`).

- Problema: Uso de `print()` con colorama para logs (evitar y unificar logging)
  Ubicación: `backend/core/chain.py:107-113`, `backend/core/chain.py:117-120`
  Acción Requerida: Sustituir los `print()` por el logger ya presente en el módulo (`self.logger`) con niveles adecuados (`info`, `warning`, `error`), eliminando dependencias de colorama para salida de consola.

- Problema: Manejo de errores deficiente: bloque `except:` vacío en middleware de logging
  Ubicación: `backend/api/app.py:183`
  Acción Requerida: Especificar el tipo de excepción (`Exception`) y registrar el error con el logger. Evitar bloques vacíos que silencien errores durante lectura de cuerpo (`await request.body()`); en caso de cuerpos grandes o streaming, registrar de forma segura o omitir la lectura.

- Problema: Duplicación de responsabilidades al limpiar historial (bypass del `ChatManager`)
  Ubicación: `backend/api/routes/chat/chat_routes.py:100` y `backend/chat/manager.py:90`
  Acción Requerida: Centralizar la operación de limpieza del historial invocando el método del `ChatManager` desde el router. Evitar llamar directamente a la base de datos desde el router para mantener una única fuente de verdad.

## 🟡 MEDIO (Buenas Prácticas / "Code Smells")

- Problema: Importaciones sin uso en componente principal de chat
  Ubicación: `frontend/app/components/ChatWindow.tsx:8-10`, `frontend/app/components/ChatWindow.tsx:14`
  Acción Requerida: Eliminar importaciones no utilizadas (`marked`, `Renderer`, `hljs`, `applyPatch`) para reducir peso y mejorar claridad.

- Problema: Verbosidad excesiva en `console.log` dentro de flujo SSE
  Ubicación: `frontend/app/components/ChatWindow.tsx` (varias líneas en `sendMessage` y callbacks SSE)
  Acción Requerida: Reducir logs a los mínimos necesarios y/o encapsular con un util de logging con niveles (dev/prod), evitando ruido y coste innecesario en producción.

- Problema: Importación de `asyncio` no utilizada
  Ubicación: `backend/core/bot.py:1`
  Acción Requerida: Eliminar la importación no utilizada para evitar confusión sobre el uso de corutinas en este módulo.

- Problema: Inconsistencia en nombres de variables de configuración de API
  Ubicación: `frontend/app/utils/constants.tsx`, `frontend/app/lib/constants.ts`, `frontend/app/lib/config.ts`, `frontend/app/lib/services/ragService.ts`
  Acción Requerida: Alinear nombres de constantes y env vars (ej., usar solo `API_URL` y `NEXT_PUBLIC_API_URL`) y documentar el contrato esperado (`incluye /api/v1` o no) para prevenir errores de concatenación.

- Problema: Lectura del cuerpo de la petición en middleware de logging puede ser costosa o no segura
  Ubicación: `backend/api/app.py` (middleware `log_requests`)
  Acción Requerida: Evitar leer el cuerpo en todos los casos; condicionar por método/tamaño, o registrar metadatos sin cuerpo. En SSE y cargas grandes, el cuerpo no debe leerse por defecto.

## 🔵 BAJO (Opcional / Nomenclatura)

- Problema: Nomenclatura y consistencia de rutas y servicios en frontend
  Ubicación: `frontend/app/lib/services/*`, `frontend/app/components/ChatWindow.tsx`
  Acción Requerida: Homogeneizar la construcción de rutas (prefijo `/api/v1` consistente) y mover la lógica de red (SSE incluido) a servicios reutilizables para mejorar cohesión y legibilidad.

---

## ✅ Estado de pruebas (Docker) — 29/10/2025

- Arranque: `docker-compose up -d` correcto. Servicios activos:
  - Backend en `http://localhost:8000` (uvicorn).
  - Frontend en `http://localhost:3000` (Next.js).
- Bot:
  - `GET /api/v1/bot/state` → 200 OK con `is_active` correcto.
  - `POST /api/v1/bot/toggle` → 200 OK alterna estado (activado/desactivado).
- Chat (SSE):
  - `POST /api/v1/chat/stream_log` con JSON → 400 `"JSON malformado en la solicitud"`.
  - Observación: coherente con el problema crítico del middleware que lee el cuerpo; priorizar corrección en `backend/api/app.py`.
- PDFs:
  - `GET /api/v1/pdfs/list` → 200 OK con `{"pdfs": []}`.
- RAG:
  - `POST /api/v1/rag/clear-rag` → 200 `status: warning`; vector store parcialmente limpiado.
  - `GET /api/v1/rag/rag-status` → 200 OK, vector store existente y tamaño reportado.
- Exportación:
  - `GET /api/v1/chat/export-conversations` → 200 con archivo `conversaciones_*.xlsx` generado.
- Verificación de eliminación de clear conversation:
  - `POST /api/v1/chat/clear/prueba-1` → 404 Not Found (endpoint eliminado).
- Frontend:
  - UI accesible en `http://localhost:3000`. Sin botón de “limpiar conversación”. Estado se pierde al refrescar (como se acordó).

## 🎯 Impacto del refactor aplicado

- Se eliminó la funcionalidad de “clear conversation” en:
  - Frontend: botón y handler de `ChatWindow.tsx` removidos.
  - Backend: endpoint `/chat/clear/{conversation_id}` y métodos asociados (`ChatManager.clear_history`, `Bot.reset_history`, `MongodbClient.clear_conversation_history`).
- Comportamiento ahora: conversaciones no persisten entre refrescos; no existe ruta ni lógica de borrado explícito.
- Próximo paso crítico recomendado:
  - Corregir manejo de cuerpo en middleware de `backend/api/app.py` para permitir `await request.json()` en SSE sin 400.
  - Unificar `NEXT_PUBLIC_API_URL` como variable pública de frontend y revisar prefijo `/api/v1` para evitar duplicación (ej.: logs muestran `GET /api/v1/api/v1/pdfs/list`).

- ✅ **RESUELTO**: Comentarios y líneas de depuración obsoletas en RAG
  Ubicación: `backend/rag/retrieval/retriever.py`, `backend/rag/ingestion/ingestor.py`
  Acción Aplicada: Se eliminaron comentarios de depuración obsoletos y código de ejemplo comentado al final de ambos archivos para mantener el código limpio y claro.

- ✅ **RESUELTO**: Estilo de logs en setup y scripts
  Ubicación: `setup.sh`, `backend/main.py`
  Acción Aplicada: Se estandarizaron mensajes de logs con prefijos consistentes ([SETUP], [DOCKER], [SERVER], etc.) y se reemplazaron todos los `print` por logging apropiado en `main.py` para uniformidad.

---

Notas finales:
- Priorizar primero la corrección del endpoint de limpieza de conversación (CRÍTICO) y la unificación de configuración de API (ALTO), ya que afectan directamente la funcionalidad y mantenibilidad.
- Las limpiezas de importaciones y reducción de logs son de fácil aplicación y mejoran calidad sin riesgo.