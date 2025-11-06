# Referencia de variables de entorno

Esta guía documenta todas las variables de entorno reconocidas por `backend/config.py` y su uso principal (incluyendo dónde intervienen en `backend/api/app.py`). Sirve como referencia previa al despliegue para configurar correctamente `.env`.

| Nombre | Descripción | Tipo | Valor por defecto | Uso principal |
| --- | --- | --- | --- | --- |
| `HOST` | Host de escucha del servidor | string | `"0.0.0.0"` | Arranque servidor (uvicorn) |
| `PORT` | Puerto de escucha del servidor | int | `8000` | Arranque servidor (uvicorn) |
| `WORKERS` | Número de workers del servidor | int | `4` | Concurrencia del servidor |
| `JWT_SECRET` | Secreto para firmar JWT | string | `None` | Autenticación; requerido en producción |
| `JWT_ALGORITHM` | Algoritmo JWT | string | `"HS256"` | Autenticación JWT |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Minutos de expiración del access token | int | `30` | Autenticación JWT |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Días de expiración del refresh token | int | `7` | Autenticación JWT |
| `CORS_ORIGINS` | Orígenes permitidos CORS (separados por comas) | string | `"*"` | CORS en `app.py` |
| `CORS_ORIGINS_WIDGET` | Orígenes CORS del widget | string | `""` (lista vacía) | CORS en `app.py` |
| `CORS_ORIGINS_ADMIN` | Orígenes CORS del panel admin | string | `""` (lista vacía) | CORS en `app.py` |
| `CORS_MAX_AGE` | Max-Age para CORS preflight | int | `3600` | CORS en `app.py` |
| `RATE_LIMIT` | Límite de peticiones (preparado) | int | `100` | Rate limiting (decoradores) |
| `SSL_KEYFILE` | Ruta al keyfile SSL | path | `None` | HTTPS (si aplica) |
| `SSL_CERTFILE` | Ruta al certfile SSL | path | `None` | HTTPS (si aplica) |
| `ENVIRONMENT` | Entorno de ejecución | string | `"development"` | Comportamiento de seguridad y CORS |
| `DEBUG` | Activa modo debug | bool | `False` | Modo desarrollo/logs |
| `LOG_LEVEL` | Nivel de log | string | `"DEBUG"` | Logging en `app.py` |
| `LOG_FILE` | Archivo de log | path | `"app.log"` | Logging a archivo (si se usa) |
| `LOG_FORMAT` | Formato del log | string | `"%(asctime)s - %(name)s - %(levelname)s - %(message)s"` | Logging global |
| `MODEL_TYPE` | Tipo de modelo (OPENAI, etc.) | string | `"OPENAI"` | Selección de LLM en `app.py` |
| `OPENAI_API_KEY` | API key del proveedor LLM | string | — (obligatoria) | Credenciales LLM, chequeada en `app.py` |
| `BASE_MODEL_NAME` | Nombre del modelo base de chat | string | `"gpt-3.5-turbo"` | Config LLM |
| `MAX_TOKENS` | Máximo de tokens de respuesta | int | `2000` | Config LLM |
| `TEMPERATURE` | Temperatura del modelo | float | `0.7` | Config LLM y bot config |
| `BOT_PERSONALITY_NAME` | Nombre de personalidad del bot | string | `None` | Personalización del bot |
| `SYSTEM_PROMPT` | Prompt del sistema base | string | `None` | Personalidad del bot (sobre-escrito en `lifespan`) |
| `BOT_NAME` | Nombre visible del bot | string | `None` | UI/Composición del prompt |
| `MAIN_PROMPT_NAME` | Prompt principal | string | `"ASESOR_ACADEMICO_REACT_PROMPT"` | Selección de prompt base |
| `AI_PREFIX` | Prefijo de mensajes de la IA | string | `"assistant"` | Formato conversación |
| `HUMAN_PREFIX` | Prefijo de mensajes del usuario | string | `"user"` | Formato conversación |
| `MONGO_URI` | URI de conexión a MongoDB | string | — (obligatoria) | Conexión Mongo; cliente en `lifespan` |
| `MONGO_DATABASE_NAME` | Nombre de base de datos Mongo | string | `"chatbot_rag_db"` | Config Mongo |
| `MONGO_COLLECTION_NAME` | Colección para historiales | string | `"chat_history"` | Config Mongo |
| `MONGO_MAX_POOL_SIZE` | Tamaño máximo de pool | int | `100` | Conexión Mongo |
| `MONGO_TIMEOUT_MS` | Timeout de conexión (ms) | int | `5000` | Conexión Mongo |
| `REDIS_URL` | URL de Redis | string | `None` | Caché de `VectorStore`; fallback a memoria |
| `REDIS_TTL` | TTL por defecto en Redis (s) | int | `3600` | Caché (cadena/vector) |
| `REDIS_MAX_MEMORY` | Límite de memoria Redis | string | `"2gb"` | Config Redis |
| `MEMORY_TYPE` | Tipo de memoria del bot | string | `"BASE_MEMORY"` | Memoria de conversación en `app.py` |
| `MAX_MEMORY_ENTRIES` | Máximo de entradas en memoria | int | `1000` | Memoria de conversación |
| `RAG_CHUNK_SIZE` | Tamaño de chunk de PDF | int | `700` | `PDFContentLoader` en `app.py` |
| `RAG_CHUNK_OVERLAP` | Solapamiento de chunks | int | `150` | `PDFContentLoader` en `app.py` |
| `MIN_CHUNK_LENGTH` | Longitud mínima de chunk | int | `100` | Preprocesado PDF |
| `MAX_FILE_SIZE_MB` | Tamaño máximo de PDF | int | `10` | Validación PDF |
| `RETRIEVAL_K` | Top-K final de recuperación | int | `4` | Recuperación RAG |
| `RETRIEVAL_K_MULTIPLIER` | Multiplicador para candidatos | int | `3` | Recuperación RAG (preselección) |
| `MMR_LAMBDA_MULT` | Peso lambda para MMR | float | `0.5` | Diversidad en recuperación |
| `SIMILARITY_THRESHOLD` | Umbral de similitud | float | `0.5` | Filtrado de resultados |
| `BATCH_SIZE` | Tamaño de lote en ingestión | int | `100` | Ingesta en `VectorStore` (app.py) |
| `DEDUP_THRESHOLD` | Umbral de deduplicación | float | `0.95` | Ingesta/limpieza |
| `MAX_CONCURRENT_TASKS` | Máximo de tareas concurrentes | int | `4` | Ingesta concurrente |
| `VECTOR_STORE_PATH` | Ruta de persistencia de Chroma | path | `"./backend/storage/vector_store/chroma_db"` | `VectorStore` en `app.py` |
| `DISTANCE_STRATEGY` | Estrategia de distancia (cosine, etc.) | string | `"cosine"` | `VectorStore` en `app.py` |
| `EMBEDDING_MODEL` | Modelo de embeddings | string | `"sentence-transformers/all-MiniLM-L6-v2"` | `EmbeddingManager` en `app.py` |
| `EMBEDDING_BATCH_SIZE` | Batch size de embeddings | int | `32` | Procesamiento de embeddings |
| `DEFAULT_EMBEDDING_DIMENSION` | Dimensión para fallbacks | int | `384` | Fallbacks en embeddings/vector store |
| `ENABLE_CACHE` | Habilita caché de resultados | bool | `True` | Caché en `VectorStore` |
| `CACHE_TTL` | TTL de caché (s) | int | `3600` | Caché en `VectorStore` |
| `STORAGE_DIR` | Directorio raíz de storage | path | `"./backend/storage"` | Organización de almacenamiento |
| `DOCUMENTS_DIR` | Directorio de documentos | path | `"./backend/storage/documents"` | Organización de almacenamiento |
| `PDFS_DIR` | Directorio de PDFs | path | `"./backend/storage/documents/pdfs"` | `PDFManager` en `app.py` |
| `CACHE_DIR` | Directorio de caché local | path | `"./backend/storage/cache"` | Caché local |
| `TEMP_DIR` | Directorio temporal | path | `"./backend/storage/temp"` | Archivos temporales |
| `BACKUP_DIR` | Directorio de backups | path | `"./backend/storage/backups"` | Copias de seguridad |
| `ENABLE_METRICS` | Habilita métricas | bool | `True` | Monitoreo |
| `METRICS_PORT` | Puerto de métricas | int | `9090` | Monitoreo |
| `ENABLE_TRACING` | Habilita tracing | bool | `False` | Observabilidad |
| `MAX_DOCUMENTS` | Máximo de documentos a devolver | int | `5` | Límite de recuperación |

Notas:
- Los campos de tipo “lista” se configuran como `string` separados por comas en `.env` y se normalizan internamente a listas en `config.py`.
- En producción (`ENVIRONMENT=production`), el arranque falla si `JWT_SECRET` está vacío, para evitar ejecuciones inseguras.
- Si `REDIS_URL` no está definido o Redis no conecta, el sistema usa caché en memoria en `VectorStore`.

## Subconjuntos prácticos

Para que no tengas que definir todas las variables, aquí van los mínimos recomendados:

- Desarrollo (mínimo funcional):
  - `OPENAI_API_KEY`
  - `MONGO_URI`
  - Opcional: `HOST`, `PORT` (tienen defaults), `PDFS_DIR` (ruta por defecto ya existe)

- Producción (mínimo seguro):
  - `ENVIRONMENT=production`
  - `JWT_SECRET`
  - `OPENAI_API_KEY`
  - `MONGO_URI`
  - `CORS_ORIGINS` (define tus dominios, evita `*`)
  - Opcional: `HOST`, `PORT`, `WORKERS`

### Embeddings y memoria (Render Free 512MB)

- Por defecto se usa un modelo local (`sentence-transformers/all-MiniLM-L6-v2`) que puede consumir bastante memoria al arrancar.
- Para reducir memoria en Render Free, puedes usar embeddings remotos de OpenAI:
  - Define `EMBEDDING_MODEL=openai:text-embedding-3-small` (requiere `OPENAI_API_KEY`).
  - El gestor de embeddings detecta el prefijo `openai:` y usa el servicio remoto, evitando cargar modelos pesados en RAM.
  - En entornos sin acceso a internet o sin API key, se mantiene el modelo local con carga perezosa.

- Opcionales recomendadas en producción:
  - `VECTOR_STORE_PATH` (monta almacenamiento persistente en cloud)
  - `PDFS_DIR` (directorio de PDFs)
  - `DISTANCE_STRATEGY`, `ENABLE_CACHE`, `CACHE_TTL`
  - `REDIS_URL` (si usas caché distribuido)
  - `LOG_LEVEL=INFO`, `METRICS_PORT`, `ENABLE_METRICS`
  - `EMBEDDING_MODEL` (si quieres cambiar el modelo por entorno)

Si una variable no está en tu `.env`, `config.py` usará su valor por defecto, y la aplicación arrancará con ese comportamiento.

## Variables de entorno del Frontend (Next.js)

El frontend solo expone variables con el prefijo `NEXT_PUBLIC_`. Estas son las necesarias:

- `NEXT_PUBLIC_API_URL`: URL base del backend incluyendo el prefijo `/api/v1`. No usar barra final.
  - Ejemplos:
    - Desarrollo: `http://localhost:8000/api/v1`
    - Render: `https://tu-api-render.onrender.com/api/v1`

- `NEXT_PUBLIC_WIDGET_URL` (opcional): URL base del widget para SSR/preview. Por defecto, el frontend infiere `window.location` y usa `/chat`.
  - Ejemplo: `https://tu-frontend-dominio.com/chat`

Notas Frontend:
- El archivo `frontend/app/lib/config.ts` normaliza la URL para evitar barras finales y duplicados de `/api/v1`.
- Para controlar el embedding del widget (`/chat`) en producción, puedes definir `CORS_ORIGINS_WIDGET` en el entorno de build del frontend. Se usa en `next.config.js` para establecer `frame-ancestors` en los headers de seguridad.