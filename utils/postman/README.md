# Documentación de Endpoints (Postman)

Esta guía describe todos los endpoints del backend, cómo llamarlos desde Postman, el formato de los cuerpos y respuestas, y los requisitos de autenticación.

## Base
- Base URL: `http://<host>:<port>` (por defecto suele ser `http://localhost:8000` si corres localmente)
- Prefijo global de API: `/_api/v1_`
- Autenticación: JWT Bearer
  - Obtén tokens con `POST /api/v1/auth/login`
  - Usa el token en el header: `Authorization: Bearer <ACCESS_TOKEN>`
  - Endpoints protegidos (solo admin): `/_api/v1/pdfs/*_`, `/_api/v1/rag/*_`, `/_api/v1/bot/*_`, `/_api/v1/users/*_`
  - Endpoints públicos: `/_api/v1/health_`, `/_api/v1/auth/*_`, `/_api/v1/chat/*_`

---

## Health
- Método y URL: `GET /api/v1/health`
- Auth: No requiere
- Headers: `Accept: application/json`
- Respuesta (200):
```json
{
  "status": "ok",
  "version": "1.0.0",
  "environment": "development"
}
```

---

## Auth

### Login
- Método y URL: `POST /api/v1/auth/login`
- Auth: No requiere
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "email": "admin@example.com",
  "password": "securepassword123"
}
```
- Respuesta (200):
```json
{
  "access_token": "<JWT_ACCESS>",
  "refresh_token": "<JWT_REFRESH>",
  "token_type": "bearer",
  "expires_in": 1800
}
```

### Perfil del usuario (actual)
- Método y URL: `GET /api/v1/auth/me`
- Auth: Requiere Bearer (usuario activo)
- Headers: `Authorization: Bearer <ACCESS_TOKEN>`
- Respuesta (200):
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "admin@example.com",
  "full_name": "Admin User",
  "is_active": true,
  "is_admin": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "last_login": "2024-01-01T12:00:00Z"
}
```

### Refresh Token
- Método y URL: `POST /api/v1/auth/refresh`
- Auth: No requiere
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "refresh_token": "<JWT_REFRESH>"
}
```
- Respuesta (200): Igual formato que login (nuevos `access_token` y `refresh_token`).

### Logout
- Método y URL: `POST /api/v1/auth/logout`
- Auth: Requiere Bearer
- Headers: `Authorization: Bearer <ACCESS_TOKEN>`
- Respuesta (200):
```json
{ "message": "Successfully logged out" }
```

---

## PDFs (admin)

### Subir PDF
- Método y URL: `POST /api/v1/pdfs/upload`
- Auth: Requiere Bearer (admin)
- Headers:
  - `Authorization: Bearer <ACCESS_TOKEN>`
  - `Content-Type: multipart/form-data`
- Body (form-data):
  - Key: `file` (Type: File) → Selecciona el archivo PDF
- Respuesta (200):
```json
{
  "status": "success",
  "message": "PDF subido exitosamente. El procesamiento continuará en segundo plano.",
  "file_path": "storage/documents/archivo.pdf",
  "pdfs_in_directory": ["archivo.pdf", "otro.pdf"]
}
```

### Listar PDFs
- Método y URL: `GET /api/v1/pdfs/list`
- Auth: Requiere Bearer (admin)
- Respuesta (200):
```json
{
  "pdfs": [
    {
      "filename": "archivo.pdf",
      "path": "storage/documents/archivo.pdf",
      "size": 123456,
      "last_modified": "2024-01-01T10:00:00"
    }
  ]
}
```

### Eliminar PDF
- Método y URL: `DELETE /api/v1/pdfs/{filename}`
- Auth: Requiere Bearer (admin)
- Path Params: `filename` (ej: `archivo.pdf`)
- Respuesta (200):
```json
{
  "status": "success",
  "message": "PDF 'archivo.pdf' eliminado exitosamente. La actualización del índice continuará en segundo plano."
}
```

### Descargar PDF
- Método y URL: `GET /api/v1/pdfs/download/{filename}`
- Auth: Requiere Bearer (admin)
- Respuesta: `application/pdf` (descarga)

### Ver PDF (inline)
- Método y URL: `GET /api/v1/pdfs/view/{filename}`
- Auth: Requiere Bearer (admin)
- Respuesta: `application/pdf` (visualización inline)

---

## RAG (admin)

### Estado RAG
- Método y URL: `GET /api/v1/rag/rag-status`
- Auth: Requiere Bearer (admin)
- Respuesta (200):
```json
{
  "pdfs": [
    {
      "filename": "archivo.pdf",
      "path": "storage/documents/archivo.pdf",
      "size": 123456,
      "last_modified": "2024-01-01T10:00:00"
    }
  ],
  "vector_store": {
    "path": "storage/vector_store",
    "exists": true,
    "size": 1024
  },
  "total_documents": 1
}
```

### Limpiar RAG
- Método y URL: `POST /api/v1/rag/clear-rag`
- Auth: Requiere Bearer (admin)
- Respuesta (200):
```json
{
  "status": "success",
  "message": "RAG limpiado exitosamente",
  "remaining_pdfs": 0,
  "vector_store_size": 0
}
```

### Retrieve Debug
- Método y URL: `POST /api/v1/rag/retrieve-debug`
- Auth: Requiere Bearer (admin)
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "query": "¿Qué dice el documento?",
  "k": 4,
  "filter_criteria": {"source": "archivo.pdf"},
  "include_context": true
}
```
- Respuesta (200):
```json
{
  "query": "¿Qué dice el documento?",
  "k": 4,
  "retrieved": [
    {
      "score": 0.54,
      "source": "archivo.pdf",
      "file_path": "storage/documents/archivo.pdf",
      "content_hash": "...",
      "chunk_type": "page",
      "word_count": 128,
      "preview": "Texto del chunk..."
    }
  ],
  "context": "Contexto agregado...",
  "timings": {"retrieve_ms": 120}
}
```

### Reindexar PDF
- Método y URL: `POST /api/v1/rag/reindex-pdf`
- Auth: Requiere Bearer (admin)
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "filename": "archivo.pdf",
  "force_update": true
}
```
- Respuesta (200):
```json
{
  "status": "success",
  "message": "Reindexación completada para 'archivo.pdf'",
  "filename": "archivo.pdf",
  "chunks_original": 12,
  "chunks_unique": 10,
  "chunks_added": 3
}
```

---

## Chat (público)

### Chat (SSE Streaming)
- Método y URL: `POST /api/v1/chat/`
- Auth: No requiere
- Headers:
  - `Content-Type: application/json`
  - `Accept: text/event-stream`
- Body (JSON):
```json
{
  "input": "Hola, ¿qué tal?",
  "conversation_id": null
}
```
- Respuesta: Stream de eventos SSE. Postman tiene soporte limitado para SSE; si lo necesitas, puedes usar `curl`:
```
curl -N -H "Accept: text/event-stream" -H "Content-Type: application/json" \
     -d '{"input":"Hola"}' http://localhost:8000/api/v1/chat/
```
- Evento `data` típico:
```json
{
  "streamed_output": "Respuesta del bot...",
  "ops": null
}
```

### Exportar conversaciones (Excel)
- Método y URL: `GET /api/v1/chat/export-conversations`
- Auth: No requiere
- Respuesta: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (descarga)

### Estadísticas
- Método y URL: `GET /api/v1/chat/stats`
- Auth: No requiere
- Respuesta (200):
```json
{
  "total_queries": 123,
  "total_users": 45,
  "total_pdfs": 7
}
```

---

## Bot (admin)

### Estado del bot
- Método y URL: `GET /api/v1/bot/state`
- Auth: Requiere Bearer (admin)
- Respuesta (200):
```json
{
  "is_active": true,
  "message": "Estado del bot obtenido exitosamente"
}
```

### Activar/Desactivar bot
- Método y URL: `POST /api/v1/bot/toggle`
- Auth: Requiere Bearer (admin)
- Respuesta (200):
```json
{
  "is_active": false,
  "message": "Bot desactivado"
}
```

### Runtime del bot
- Método y URL: `GET /api/v1/bot/runtime`
- Auth: Requiere Bearer (admin)
- Respuesta (200):
```json
{
  "model_name": "gpt-4o-mini",
  "temperature": 0.7,
  "max_tokens": 1024,
  "bot_name": "MiBot",
  "ui_prompt_extra_len": 120,
  "effective_personality_len": 1800
}
```

---

## Bot Config (admin)

### Obtener configuración
- Método y URL: `GET /api/v1/bot/config`
- Auth: Requiere Bearer (admin)
- Respuesta (200):
```json
{
  "system_prompt": "Instrucciones del sistema...",
  "temperature": 0.7,
  "updated_at": "2024-01-01T00:00:00Z",
  "bot_name": "MiBot",
  "ui_prompt_extra": "Ajustes adicionales..."
}
```

### Actualizar configuración
- Método y URL: `PUT /api/v1/bot/config`
- Auth: Requiere Bearer (admin)
- Headers: `Content-Type: application/json`
- Body (JSON) — campos opcionales:
```json
{
  "system_prompt": "Nueva personalidad...",
  "temperature": 0.5,
  "bot_name": "NuevoNombre",
  "ui_prompt_extra": "Texto adicional (<= 3000 chars)"
}
```
- Respuesta (200): igual formato que `GET /config`.

### Reset de configuración UI
- Método y URL: `POST /api/v1/bot/config/reset`
- Auth: Requiere Bearer (admin)
- Respuesta (200): igual formato que `GET /config` (con campos UI vaciados).

---

## Users (admin)

### Listar usuarios
- Método y URL: `GET /api/v1/users`
- Auth: Requiere Bearer (admin)
- Query Params:
  - `skip` (int, default 0)
  - `limit` (int, default 20)
  - `search` (string, opcional; busca por email/username)
  - `role` (string: `admin` | `user`, opcional)
  - `is_active` (bool, opcional)
- Respuesta (200):
```json
{
  "items": [
    {
      "id": "507f1f77bcf86cd799439011",
      "username": "admin",
      "email": "admin@example.com",
      "full_name": "Admin User",
      "is_active": true,
      "is_admin": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "last_login": "2024-01-01T12:00:00Z"
    }
  ],
  "total": 1,
  "skip": 0,
  "limit": 20
}
```

### Crear usuario
- Método y URL: `POST /api/v1/users`
- Auth: Requiere Bearer (admin)
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "username": "juan",
  "email": "juan@example.com",
  "password": "Password!2024",
  "full_name": "Juan Pérez",
  "is_admin": false
}
```
- Respuesta (201): igual estructura que `UserResponse` (ver ejemplo en listar usuarios).

### Actualizar usuario
- Método y URL: `PATCH /api/v1/users/{user_id}`
- Auth: Requiere Bearer (admin)
- Headers: `Content-Type: application/json`
- Body (JSON) — todos opcionales:
```json
{
  "email": "nuevo@example.com",
  "full_name": "Nuevo Nombre",
  "is_admin": true,
  "is_active": true,
  "password": "NuevaPass!2024"
}
```
- Nota: políticas básicas de contraseña en servidor (>= 8 chars, al menos una mayúscula y un símbolo).
- Respuesta (200): igual estructura que `UserResponse`.

### Eliminar usuario
- Método y URL: `DELETE /api/v1/users/{user_id}`
- Auth: Requiere Bearer (admin)
- Respuesta (204): sin contenido.

---

## Consejos para Postman
- Usa ambientes en Postman con variables: `baseUrl`, `accessToken`.
- Configura `Authorization` como `Bearer Token` y coloca `{{accessToken}}`.
- Para SSE (chat), Postman puede mostrar el flujo pero no siempre lo interpreta como eventos; si ves problemas, usa `curl` o clientes especializados.
- Para carga de archivos, selecciona `form-data` y el tipo `File` para la clave `file`.

## Errores comunes
- 401/403 en endpoints protegidos: revisa que el token sea válido y que el usuario sea admin.
- 413 al subir PDF: el archivo supera el límite configurado (`settings.max_file_size_mb`).
- 404 en descarga/visualización/eliminación de PDF: verifica el nombre del archivo exacto.

---

## Notas
- Algunos campos (por ejemplo nombres de modelo) dependen de la configuración activa y pueden variar.
- Las respuestas de ejemplo son representativas; el backend puede incluir campos adicionales o variar fechas/IDs.