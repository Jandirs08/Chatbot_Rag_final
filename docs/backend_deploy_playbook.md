# Playbook de Despliegue Backend (FastAPI) — Render / Railway

Este documento guía el despliegue del backend (FastAPI/Python) en Render o Railway, con prácticas de producción. El backend vive en `./backend`, el entrypoint de la aplicación es `backend.main:app`, se usa `requirements.txt` y hay un `Dockerfile` funcional. El proyecto está orientado a un chatbot RAG (MongoDB + OpenAI) sin OCR ni Unstructured.

## Diagnóstico de Preparación
- Listo
  - App FastAPI inicializada en `backend/api/app.py` con routers: `health`, `auth`, `pdfs`, `rag`, `chat`, `bot`, `users`.
  - Entry point `backend.main:app` compatible con `uvicorn backend.main:app`.
  - CORS configurado dinámicamente vía `settings.cors_origins`, `settings.cors_origins_widget`, `settings.cors_origins_admin`.
  - Middleware de autenticación (`AuthenticationMiddleware`) protege rutas administrativas (`pdfs`, `rag`, `bot`, `users`). El chat y auth son públicos.
  - MongoDB usado para estado/configuración y usuarios; cliente inicializado y con índices.
  - RAG: Vector store Chroma con persistencia local, embeddings vía `SentenceTransformer` (`all-MiniLM-L6-v2` por defecto), PDF loading con `PyPDFLoader` (sin OCR).
  - Dockerfile en `backend/Dockerfile` instala dependencias y expone el puerto `8000`.
  - Health check: `GET /api/v1/health`.

- Atención / posibles ajustes
  - Persistencia de Chroma: el `vector_store_path` por defecto es `./backend/storage/vector_store/chroma_db` dentro del contenedor. En PaaS con filesystem efímero, se recomienda disco persistente y/o volumen montado.
  - JWT en producción: `config.py` aborta el arranque si `ENVIRONMENT=production` y `JWT_SECRET` está vacío. Obligatorio configurar `JWT_SECRET`.
  - Variables en `.env.example` vs `config.py`:
    - `MODEL_NAME` (ejemplo) vs `BASE_MODEL_NAME` (config real). Usar `BASE_MODEL_NAME`.
    - `UPLOAD_DIR` y `PERSIST_DIRECTORY` (ejemplo) no se usan; la app usa `PDFS_DIR` y `vector_store_path` (esta última sin `env=` definido).
    - Rate limiting: `.env.example` tiene `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS`, pero el código usa `RATE_LIMIT` y los decoradores están comentados.
  - Dockerfile sin `CMD`: en PaaS con Docker, especificar `Start Command` (uvicorn) en la plataforma.
  - Cold start embeddings: `SentenceTransformer` descarga el modelo en el primer arranque. Recomendable predescargar en build para menor latencia inicial.
  - CORS en producción: el validador no permite `"*"`. Debe definirse una lista explícita de orígenes.
  - Redis opcional: si `REDIS_URL` no está, cae a caché en memoria. Para escalar, usar Redis gestionado.

## Checklist de Variables y Configuraciones

Variables obligatorias (producción):
- `ENVIRONMENT=production`
- `OPENAI_API_KEY` (modelo `OPENAI` activo)
- `MONGO_URI` (cadena de conexión válida; ejemplo Atlas/servicio PaaS)
- `JWT_SECRET` (no vacío en producción)

Red y servidor:
- `HOST=0.0.0.0`
- `PORT` (Render/Railway lo inyectan; usar en Start Command)

CORS:
- `CORS_ORIGINS` (coma-separado o JSON list; ejemplo `https://tu-frontend.com`)
- `CORS_ORIGINS_WIDGET` (si se incrusta en dominios de clientes)
- `CORS_ORIGINS_ADMIN` (panel de administración)
- `CORS_MAX_AGE` (opcional)

RAG y almacenamiento:
- `PDFS_DIR` (por defecto `./backend/storage/documents/pdfs`; montar a disco persistente si se requiere)
- `ENABLE_CACHE` (por defecto `True`)
- `CACHE_TTL` (por defecto `3600`)
- `EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2` (por defecto)
- `DISTANCE_STRATEGY=cosine` (si se desea modificar)

Opcionales de RAG (ajuste fino):
- `RAG_CHUNK_SIZE` (por defecto `700`)
- `RAG_CHUNK_OVERLAP` (por defecto `150`)
- `RETRIEVAL_K`, `RETRIEVAL_K_MULTIPLIER`, `MMR_LAMBDA_MULT`, `SIMILARITY_THRESHOLD`
- `BATCH_SIZE`, `DEDUP_THRESHOLD`, `MAX_CONCURRENT_TASKS`

Redis (caché escalable):
- `REDIS_URL` (si se desea usar caché distribuida; si falta, usa caché en memoria)
- `REDIS_TTL` (TTL para otras utilidades; vector store usa `CACHE_TTL`)

Logging y métricas:
- `LOG_LEVEL=INFO` (recomendado en producción)
- `ENABLE_METRICS` y `METRICS_PORT` (si se expone métricas; hay dependencias pero no endpoint dedicado aún)

Inconsistencias a tener en cuenta:
- `vector_store_path` en `config.py` no mapea a env. Si se requiere cambiar en cloud, se recomienda añadir soporte de env en futuro o montar volumen en la ruta por defecto.
- `.env.example` incluye claves no usadas (`UPLOAD_DIR`, `PERSIST_DIRECTORY`, `MODEL_NAME`). Usar las de `config.py`.

## Despliegue en Render

Opción A — Docker (recomendado para monorepo):
- Servicio Web, tipo Docker
- Contexto: raíz del repo
- Dockerfile: `backend/Dockerfile`
- Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Variables de entorno:
  - `ENVIRONMENT=production`
  - `OPENAI_API_KEY`, `MONGO_URI`, `JWT_SECRET`
  - `CORS_ORIGINS` y otros CORS según dominios
  - Opcional: `REDIS_URL`
- Persistencia (Chroma y PDFs):
  - Añadir Persistent Disk
  - Montar en `/app/backend/storage` (o subdirectorios) para que `PDFS_DIR` y `vector_store_path` persistan.
- Health check: `GET /api/v1/health`

Opción B — Nativo (Python):
- Root Directory del servicio: `backend`
- Build Command: `pip install --no-cache-dir -r requirements.txt`
- Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Variables: igual que en Docker
- Persistencia: configurar Persistent Disk y marcar `PDFS_DIR` dentro del punto de montaje (por ejemplo `/data/pdfs`);
  - Nota: `vector_store_path` no es configurable por env de forma nativa, se sugiere montar volumen en `./backend/storage/vector_store/chroma_db` dentro del servicio.

## Despliegue en Railway

Opción A — Nixpacks (auto build):
- Crear servicio desde el repo, `Root Directory`: `backend`
- Railway detecta Python; instalará `requirements.txt` automáticamente
- Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Variables: `ENVIRONMENT=production`, `OPENAI_API_KEY`, `MONGO_URI`, `JWT_SECRET`, CORS, `REDIS_URL` opcional
- Volumen: añadir plugin de Volumes (o Shared Volume) y montar a `/app/backend/storage` para persistencia de Chroma y PDFs

Opción B — Docker:
- Subir/usar `backend/Dockerfile`
- Start Command igual que Render
- Variables y Volumen igual que Opción A

## Comandos de Build y Start

Local sin Docker:
- `python -m venv .venv && .venv\Scripts\activate` (Windows) o `source .venv/bin/activate`
- `pip install -r backend/requirements.txt`
- `uvicorn backend.main:app --host 0.0.0.0 --port 8000`

Local con Docker:
- `docker build -t rag-backend ./backend`
- `docker run -p 8000:8000 \
  -e ENVIRONMENT=production \
  -e OPENAI_API_KEY=sk-... \
  -e MONGO_URI='mongodb+srv://...' \
  -e JWT_SECRET='...' \
  -v $(pwd)/backend/storage:/app/backend/storage \
  rag-backend \
  uvicorn backend.main:app --host 0.0.0.0 --port 8000`

## Validación Post-Deploy
- Health: `GET /api/v1/health` debe responder `status=ok` con `environment=production`
- RAG status: `GET /api/v1/rag/rag-status` devuelve PDFs y detalles del vector store
- Chat: probar `POST /api/v1/chat/stream` (según tu contract actual) y verificar streaming
- Auth y protegidas: crear usuario admin y probar `GET /api/v1/pdfs` o `GET /api/v1/rag/rag-status` (deben exigir auth)

## Recomendaciones de Producción
- CORS: configurar orígenes explícitos; el wildcard `*` está bloqueado por validador en producción
- Embeddings: predescargar `sentence-transformers/all-MiniLM-L6-v2` en build para evitar cold start
  - Ejemplo (sugerencia para futuro Dockerfile):
    - `RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"`
- Persistencia: usar disco persistente; si no es posible, considerar vector store remoto
- Redis: habilitar `REDIS_URL` para cache distribuido en entornos con múltiples instancias
- Logging: `LOG_LEVEL=INFO` en producción; habilitar request logging (ya hay middleware de logging de requests)
- Workers: ejecutar `uvicorn` con `--workers` acorde a CPU (2–4 para instancias pequeñas)
- Seguridad: `JWT_SECRET` fuerte y rotación; `DEBUG=False`; TLS suele terminarse en el proxy del PaaS
- Rate limiting: si se requiere, revisar decoradores y variables para alinearlos (`RATE_LIMIT` vs `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS`)

## Notas Técnicas
- Entrypoint: `backend.main:app`
- Puerto: usar `PORT` inyectado por plataforma
- Almacenamiento por defecto:
  - PDFs: `PDFS_DIR=./backend/storage/documents/pdfs`
  - Vector store (Chroma): `./backend/storage/vector_store/chroma_db` (no configurable por env actualmente)
- Health: `/api/v1/health`
- OCR: deshabilitado; `PyPDFLoader` para textos embebidos