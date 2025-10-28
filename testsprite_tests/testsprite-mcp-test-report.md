### TestSprite - Reporte de Pruebas

Fecha: 2025-10-17 Proyecto: ChatBotRag-main

Resumen: 10 pruebas ejecutadas | 6 aprobadas | 4 fallidas

### Requisitos y Casos de Prueba

#### Requisito: Salud del servicio (Health API)

- Caso: TC001-verify_health_api_returns_correct_status_version_environment
  - Endpoint probado: GET /api/v1/health/health
  - Resultado: FALLIDO (esperado 200, recibido 404)
  - Causa probable: Discrepancia de ruta. La aplicación registra `health_router` con prefijo `/api/v1` y define la ruta como `/health`, por lo que el endpoint efectivo es `/api/v1/health`. La prueba apunta a `/api/v1/health/health`.
  - Sugerencias:
    - Opción A (backend): Cambiar el registro del router a prefijo `/api/v1/health` en `backend/api/app.py` para que la ruta final sea `/api/v1/health/health`.
    - Opción B (pruebas/cliente): Usar `GET /api/v1/health`.

#### Requisito: Gestión de PDFs (Subir, Listar, Eliminar)

- Caso: TC002-verify_pdf_upload_endpoint_handles_file_upload_and_size_limit

  - Endpoint probado: POST /api/v1/pdfs/upload
  - Resultado: FALLIDO (el nombre subido no aparece en `pdfs_in_directory`)
  - Observaciones:
    - Tras subir, la API devuelve `file_path` y `pdfs_in_directory` derivado de `list_pdfs()`. Se esperaba que el `basename(file_path)` estuviera presente en `pdfs_in_directory`.
    - Posibles causas: desalineación de directorios entre `PDFManager.save_pdf` y `list_pdfs` por `settings.pdfs_dir`; diferencias de mayúsculas/minúsculas; normalización del nombre; o carrera mínima (aunque el guardado es síncrono).
  - Sugerencias:
    - Garantizar que `PDFManager` use el mismo directorio base para guardar y listar (ver `backend/api/app.py` y `backend/storage/documents/pdf_manager.py`).
    - Normalizar el nombre: en la respuesta, incluir siempre `uploaded_filename = Path(file_path).name` y añadirlo explícitamente a `pdfs_in_directory` si aún no está.
    - Añadir aserción/registro temporal para verificar el directorio efectivo y el contenido tras el guardado.

- Caso: TC003-verify_pdf_list_endpoint_returns_all_pdfs

  - Endpoint probado: GET /api/v1/pdfs/list
  - Resultado: APROBADO

- Caso: TC004-verify_pdf_delete_endpoint_removes_specified_pdf
  - Endpoint probado: DELETE /api/v1/pdfs/{filename}
  - Resultado: FALLIDO (mensaje no contiene "deleted"/"removed")
  - Observaciones: El backend devuelve mensaje en español: "PDF '<name>' eliminado exitosamente...". La prueba busca palabras clave en inglés.
  - Sugerencias:
    - Opción A (backend): Ajustar el mensaje para incluir palabra clave en inglés, p.ej. "deleted" junto al texto en español.
    - Opción B (pruebas): Aceptar mensajes en español que contengan "eliminado".

#### Requisito: Estado del RAG

- Caso: TC005-verify_rag_status_endpoint_returns_correct_vector_store_and_pdf_status

  - Endpoint probado: GET /api/v1/rag/rag-status
  - Resultado: APROBADO

- Caso: TC006-verify_rag_clear_endpoint_clears_vector_store_and_updates_status
  - Endpoint probado: POST /api/v1/rag/clear-rag
  - Resultado: APROBADO

#### Requisito: Chat

- Caso: TC007-verify_chat_stream_log_endpoint_streams_responses_and_handles_invalid_input

  - Endpoint probado: POST /api/v1/chat/stream_log
  - Resultado: APROBADO

- Caso: TC008-verify_chat_clear_endpoint_clears_conversation_history
  - Endpoint probado: POST /api/v1/chat/clear/{conversation_id}
  - Resultado: FALLIDO (500 en vez de 200)
  - Causa probable: `chat_manager.db.clear_conversation` no disponible/no configurado. En `backend/api/routes/chat/chat_routes.py` se asume existencia de `chat_manager.db` y método `clear_conversation`.
  - Sugerencias:
    - Implementar `clear_conversation(conversation_id)` en `backend/database/mongodb.py` y asegurarse de inyectarlo en `ChatManager`.
    - Manejar gracefully el caso inexistente (devolver 200 con mensaje si no hay historial para ese `conversation_id`).

#### Requisito: Estado del Bot

- Caso: TC009-verify_chat_export_conversations_endpoint_generates_excel_file

  - Endpoint probado: GET /api/v1/chat/export-conversations
  - Resultado: APROBADO

- Caso: TC010-verify_bot_state_endpoints_get_and_toggle_bot_activity
  - Endpoints probados: GET /api/v1/bot/state, POST /api/v1/bot/toggle
  - Resultado: APROBADO

### Recomendaciones de Corrección (prioridad)

1. Alinear ruta Health:

   - Backend: cambiar prefijo del router de salud a `/api/v1/health` o
   - Cliente/Pruebas: consumir `GET /api/v1/health`.

2. Consistencia al subir PDF (TC002):

   - Asegurar mismo directorio en `save_pdf` y `list_pdfs` (usar `settings.pdfs_dir`).
   - Incluir explícitamente `basename(file_path)` en `pdfs_in_directory`.

3. Mensaje DELETE en PDFs (TC004):

   - Ajustar a bilingüe o relajar aserción de pruebas para aceptar español.

4. Limpieza de historial de chat (TC008):
   - Implementar `clear_conversation` en la capa de datos y cablear en `ChatManager`.
   - Devolver 200 aun si no hay historial, con mensaje claro.

### Evidencia

- Fuente de rutas backend: `backend/api/app.py`, `backend/api/routes/*`.
- Gestor de PDFs: `backend/storage/documents/pdf_manager.py`.
- Resultados crudos: `testsprite_tests/tmp/test_results.json`.
