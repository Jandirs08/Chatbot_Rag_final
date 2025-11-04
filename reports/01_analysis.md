# Fase 1 – Análisis estructural y estático

## Contexto
Proyecto full-stack para un chatbot RAG con FastAPI (backend) y Next.js 14 (frontend). Se analizó arquitectura, seguridad, rendimiento y calidad de código utilizando revisión estática y linters donde fue posible.

## Hallazgos principales

### Backend
- Framework y organización: FastAPI con `create_app` en `backend/api/app.py`. Routers bien separados: `health`, `auth`, `chat` (público), `pdfs`, `rag`, `bot`, `users`. Middleware de autenticación (`auth/middleware.py`) aplicado globalmente.
- Configuración: `pydantic-settings` en `config.py`. Valida API key de OpenAI según `model_type`. `jwt_secret` es opcional (riesgo en producción). CORS por helper `get_cors_origins_list()`: por defecto `*`, en desarrollo se fuerza a `http://localhost:3000`.
- RAG: Módulos de embeddings, vector store y retrieval organizados. Uso de `pickle` para serialización en `rag/vector_store/vector_store.py` y `md5` en `pdf_loader` para hashing (potencialmente inseguro si se usa como criptográfico).
- Chat: Endpoint `POST /api/v1/chat/stream_log` público con streaming SSE, valida JSON y `ChatRequest` correctamente, verifica `bot.is_active` y maneja errores con `StreamingResponse`.
- Base de datos: MongoDB via `motor`, repositorios en `backend/database/*`. `ConfigRepository` para runtime config del bot.
- Observabilidad: Logging central y middleware de latencia. `prometheus-client` listado en `requirements.txt` pero no observado su uso.
- Pruebas: Suite de tests en `backend/tests` para auth, CORS, users y bot config.

### Linters Backend
- Flake8 (muestra parcial):
  - Muchos `E501 line too long` en `rag/retrieval/retriever.py`, `rag/vector_store/vector_store.py`, utilidades y tests.
  - Varios `F401 imported but unused` y algunos `F841 local variable ... assigned but never used` en tests y scripts.
- Bandit:
  - Predomina `B101 assert_used` en tests (esperable en tests, bajo).
  - `B110 try/except/pass` en `api/app.py` (bajo; ocultación silenciosa de errores).
  - Hallazgos relevantes probables: uso de `pickle` (B301/B302) y `md5` (B303) en módulos RAG.

### Frontend
- Next.js 14 con `app/` router, componentes UI, hooks de autenticación y streaming (`useChatStream`). Middleware de Next (`middleware.ts`) protege rutas salvo `/chat` y login; usa cookie `auth_token`.
- Seguridad en headers: `next.config.js` incorpora CSP `frame-ancestors` diferenciada entre dev/prod y `X-Frame-Options` para rutas no `/chat`.
- Estado: Contexto de auth `AuthContext` robusto con refresco, reducer y efectos. Servicios API separados (`lib/services/*`) con `authenticatedFetch` y `API_URL`.
- Accesibilidad y rendimiento: Componentes UI con Tailwind y Radix. Streaming SSE en `ChatWindow` a través de hook; falta revisión de foco y ARIA en componentes de chat.
- Linter: Configurado `eslint: next/core-web-vitals`. Ejecución bloqueada por política de PowerShell y `node_modules` sin `eslint`. Se realizó revisión estática manual.

### Integración
- Variables env en `docker-compose.yml`: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BACKEND_URL` (comentado). Servicios frontend usan `API_URL` y normalizan rutas para evitar duplicar `/api/v1`.
- Comunicación: Fetch clásico y SSE para chat. Rutas protegidas usan token Bearer; widgets y CSP controlan embebido de `/chat`.

### Infraestructura
- `docker-compose.yml`: servicios `mongodb`, `backend`, `frontend` con volúmenes para hot-reload. Backend arranca con `uvicorn main:app --reload`.
- Dockerfile base (raíz) instala Python 3.11 y dependencias del sistema para PDF/OCR; no multistage.
- Setup scripts (`setup.bat/.sh`) crean `.env` y facilitan arranque local o Docker.

### Código general
- Legibilidad buena en API y middleware; módulos RAG con funciones largas y líneas extensas.
- Naming consistente, imports centralizados en `api/schemas`.
- Duplicaciones menores en formateo y utilidades; algunos imports innecesarios.

## Severidad (resumen)
- Crítico: `jwt_secret` opcional en producción; uso de `pickle` y `md5` sin aclaración de contexto y protección; CORS `*` por defecto en producción.
- Alto: Exceso de líneas largas y complejidad en RAG; falta métricas prometheus activas; headers CSP dependen de `CORS_ORIGINS_WIDGET` sin validación.
- Medio: Imports no usados, asserts en tests, `try/except/pass` silencioso; accesibilidad UI mejorable.

## Recomendaciones
- Exigir `JWT_SECRET` en producción y abortar si falta.
- Sustituir `pickle` por formatos seguros (json/msgpack) o validar/firmar fuentes; documentar si sólo se usa con datos confiables.
- Reemplazar `md5` por `sha256` para hashing de deduplicación, o documentar explícitamente que no es uso criptográfico.
- Endurecer CORS en producción a lista explícita; eliminar `*`.
- Activar métricas (`prometheus-client`) para `/chat` y errores; mantener middleware de latencia.
- Reducir longitud de líneas y complejidad en módulos RAG; aplicar `black`/`isort` y `flake8` en pre-commit.
- Añadir pruebas de accesibilidad y foco al chat; revisar ARIA.

## Prioridad
- 🔴 Crítico: secretos, CORS, `pickle`/`md5`.
- 🟠 Alto: observabilidad, rendimiento RAG, CSP efectiva.
- 🟡 Medio: estilo, limpieza de imports, accesibilidad UI.