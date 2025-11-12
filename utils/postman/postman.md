# Guía Postman: Auth, PDFs y RAG

Esta guía te permite usar Postman para interactuar con los endpoints de autenticación, gestión de PDFs y RAG de tu API.

## Base URL
- Local (Uvicorn): `http://localhost:8000`
- Todas las rutas de abajo se montan bajo el prefijo `{/api/v1/...}`.

Si estás usando Docker/Compose, valida el puerto expuesto del backend y ajusta `baseUrl` según tu despliegue.

## Requisitos
- Usuario admin activo (necesario para endpoints protegidos: PDFs y RAG).
- Si aún no tienes un admin, revisa `utils/crear_admin/crear_admin.py`.
- Variables de entorno `.env` configuradas para el backend (JWT, DB, etc.).

## Entorno en Postman
1. Crea un ambiente en Postman con variables:
   - `baseUrl` = `http://localhost:8000`
   - `accessToken` = (se completará tras login)
   - `refreshToken` = (se completará tras login)
2. (Opcional) Pre-request Script a nivel de colección para añadir el header `Authorization` automáticamente:
   ```javascript
   // Si existe accessToken en el entorno, añadirlo como Bearer
   const token = pm.environment.get('accessToken');
   if (token) {
     pm.request.headers.add({ key: 'Authorization', value: `Bearer ${token}` });
   }
   ```

---

## Autenticación (Auth)

- POST `{{baseUrl}}/api/v1/auth/login`
  - Body (JSON):
    ```json
    {
      "email": "admin@example.com",
      "password": "tu_password_segura"
    }
    ```
  - Respuesta:
    ```json
    {
      "access_token": "...",
      "refresh_token": "...",
      "token_type": "bearer",
      "expires_in": 1800
    }
    ```
  - Tests (guardar tokens en el ambiente):
    ```javascript
    const data = pm.response.json();
    pm.environment.set('accessToken', data.access_token);
    pm.environment.set('refreshToken', data.refresh_token);
    ```

- GET `{{baseUrl}}/api/v1/auth/me` (protegido)
  - Headers: `Authorization: Bearer {{accessToken}}`
  - Devuelve perfil del usuario actual.

- POST `{{baseUrl}}/api/v1/auth/refresh`
  - Body (JSON):
    ```json
    { "refresh_token": "{{refreshToken}}" }
    ```
  - Tests (actualizar tokens):
    ```javascript
    const data = pm.response.json();
    pm.environment.set('accessToken', data.access_token);
    pm.environment.set('refreshToken', data.refresh_token);
    ```

- POST `{{baseUrl}}/api/v1/auth/logout`
  - Headers: `Authorization: Bearer {{accessToken}}`
  - Nota: el logout es básicamente client-side; elimina los tokens de tu ambiente en Postman si quieres cerrar sesión.

> Importante: Los endpoints `pdfs/*` y `rag/*` requieren usuario admin por el `AuthenticationMiddleware`.

---

## PDFs

- POST `{{baseUrl}}/api/v1/pdfs/upload` (protegido)
  - Headers: `Authorization: Bearer {{accessToken}}`
  - Body: `form-data`
    - Key: `file` (Type: `File`) -> selecciona el PDF a subir.
  - Respuesta exitosa (procesado en background):
    ```json
    {
      "status": "success",
      "message": "PDF subido exitosamente. El procesamiento continuará en segundo plano.",
      "file_path": "storage/documents/DocRag1.pdf",
      "pdfs_in_directory": ["DocRag1.pdf", "..." ]
    }
    ```
  - Notas:
    - Tamaño máximo permitido según `MAX_FILE_SIZE_MB` en configuración.
    - El índice vectorial se actualiza en background.

- GET `{{baseUrl}}/api/v1/pdfs/list` (protegido)
  - Lista PDFs disponibles con `filename`, `path`, `size`, `last_modified`.

- DELETE `{{baseUrl}}/api/v1/pdfs/{filename}` (protegido)
  - Elimina el PDF del filesystem y borra documentos asociados en el vector store en background.
  - Respuesta:
    ```json
    { "status": "success", "message": "PDF 'DocRag1.pdf' eliminado exitosamente. La actualización del índice continuará en segundo plano." }
    ```

- GET `{{baseUrl}}/api/v1/pdfs/download/{filename}` (protegido)
  - Devuelve el archivo para descarga.

- GET `{{baseUrl}}/api/v1/pdfs/view/{filename}` (protegido)
  - Renderiza el PDF inline.

---

## RAG

- GET `{{baseUrl}}/api/v1/rag/rag-status` (protegido)
  - Devuelve:
    ```json
    {
      "pdfs": [ { "filename": "DocRag1.pdf", "path": "...", "size": 12345, "last_modified": "2024-01-01T12:00:00" } ],
      "vector_store": { "path": "storage/vector_store", "exists": true, "size": 1000 },
      "total_documents": 1
    }
    ```

- POST `{{baseUrl}}/api/v1/rag/clear-rag` (protegido)
  - Limpia el vector store y el directorio de PDFs.
  - Respuesta (ejemplo):
    ```json
    {
      "status": "success",
      "message": "RAG limpiado exitosamente",
      "remaining_pdfs": 0,
      "vector_store_size": 0
    }
    ```

- POST `{{baseUrl}}/api/v1/rag/retrieve-debug` (protegido)
  - Body (JSON):
    ```json
    {
      "query": "¿Qué cubre el documento?",
      "k": 4,
      "filter_criteria": { "source": "DocRag1.pdf" },
      "include_context": true
    }
    ```
  - Devuelve trazas de recuperación con `retrieved[]` y `context` (si se solicitó).

- POST `{{baseUrl}}/api/v1/rag/reindex-pdf` (protegido)
  - Body (JSON):
    ```json
    {
      "filename": "DocRag1.pdf",
      "force_update": true
    }
    ```
  - Respuesta:
    ```json
    {
      "status": "success",
      "message": "Reindexación completada para 'DocRag1.pdf'",
      "filename": "DocRag1.pdf",
      "chunks_original": 120,
      "chunks_unique": 115,
      "chunks_added": 5
    }
    ```

---

## Consejos y Errores Comunes
- 401/403 en PDFs/RAG: asegúrate de usar `Authorization: Bearer {{accessToken}}` y que el usuario sea admin.
- `413` al subir PDFs: el archivo excede `MAX_FILE_SIZE_MB`.
- `404` en `download/view/delete`: revisa el `filename` exacto retornado por `list`.
- Tokens expiran según `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`; usa `refresh` para renovar.

## Ejemplos cURL (opcional)
- Login:
  ```bash
  curl -X POST "{{baseUrl}}/api/v1/auth/login" \
       -H "Content-Type: application/json" \
       -d '{"email":"admin@example.com","password":"tu_password_segura"}'
  ```
- Subir PDF:
  ```bash
  curl -X POST "{{baseUrl}}/api/v1/pdfs/upload" \
       -H "Authorization: Bearer {{accessToken}}" \
       -F "file=@utils/pdfs/DocRag1.pdf"
  ```
- Retrieve Debug:
  ```bash
  curl -X POST "{{baseUrl}}/api/v1/rag/retrieve-debug" \
       -H "Authorization: Bearer {{accessToken}}" \
       -H "Content-Type: application/json" \
       -d '{"query":"¿Qué cubre el documento?","k":4,"filter_criteria":{"source":"DocRag1.pdf"},"include_context":true}'
  ```

---

## Cómo organizar tu Colección en Postman
- Carpeta `Auth`: `login`, `me`, `refresh`, `logout` (guardar tokens en tests).
- Carpeta `PDFs`: `upload`, `list`, `delete/{filename}`, `download/{filename}`, `view/{filename}`.
- Carpeta `RAG`: `rag-status`, `clear-rag`, `retrieve-debug`, `reindex-pdf`.

Con esto podrás probar rápidamente tu API de RAG/PDF desde Postman.