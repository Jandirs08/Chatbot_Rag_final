# Environment Variables Audit

This report summarizes how environment variables are defined and used across the backend and frontend, highlights legacy or inactive variables, and provides recommendations to streamline configuration.

## Summary

- Backend relies on Pydantic `Settings` to map env vars with sensible defaults and validators.
- Core areas covered: server/runtime, security/JWT, LLM, RAG (ingestion/retrieval/embeddings), storage paths, caching/Redis, metrics/tracing, CORS, logging, MongoDB, and prompts/personality.
- Frontend exposes only two public envs for API and widget URLs.
- A handful of env vars are defined but unused, or superseded by canonical settings.

## Backend: Active Variables

- Server/Runtime
  - `ENVIRONMENT` (default `development`), `DEBUG`, `LOG_LEVEL` used for runtime behavior and logging. `HOST`, `PORT` are defined; `PORT` read in `main.py` and Dockerfile.
  - `CORS_ORIGINS`, `CORS_ORIGINS_WIDGET`, `CORS_ORIGINS_ADMIN`, `CORS_MAX_AGE` actively shape middleware in `api/app.py`.

- Security/JWT
  - `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_REFRESH_TOKEN_EXPIRE_DAYS` used by `auth/jwt_handler.py` and API routes. `JWT_SECRET` required in production (checked in `config.py`).

- LLM Configuration
  - `OPENAI_API_KEY`, `BASE_MODEL_NAME`, `TEMPERATURE`, `MAX_TOKENS` used in `core/chain.py` and wired via dynamic config routes.

- RAG Ingestion/Processing
  - `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `MAX_FILE_SIZE_MB` used in PDF processing and validation.
  - Retrieval: `RETRIEVAL_K`, `RETRIEVAL_K_MULTIPLIER`, `MMR_LAMBDA_MULT`, `SIMILARITY_THRESHOLD` used in retriever/vector store.
  - Batching: `BATCH_SIZE` used in ingestion and vector store operations.
  - Embeddings: `EMBEDDING_MODEL`, `EMBEDDING_BATCH_SIZE` used by `EmbeddingManager`.
  - Feature toggle: `ENABLE_RAG_LCEL` enables automatic context injection in `Bot` and logs in `chat/manager.py`.

- Storage Paths
  - `VECTOR_STORE_PATH` and `PDFS_DIR` used to initialize `VectorStore` and `PDFManager`.
  - Backup dir logic present for Chroma sysdb incompatibility.

- Caching/Redis
  - `ENABLE_CACHE`, `CACHE_TTL` used by chain cache and vector store.
  - `REDIS_URL` optional; when set, Redis-backed cache is used, otherwise in-memory cache.

- MongoDB Connection and Memory
  - `MONGO_URI` canonical (fallback to `MONGODB_URI`); used to create `AsyncIOMotorClient`.
  - `MONGO_DATABASE_NAME`, `MONGO_COLLECTION_NAME` used by memory implementations.
  - `MONGO_MAX_POOL_SIZE`, `MONGO_TIMEOUT_MS` defined; pool/timeout not directly referenced in client init (potential future use).

- Prompts and Roles
  - `MAIN_PROMPT_NAME`, `AI_PREFIX`, `HUMAN_PREFIX` used for prompt loading and message role assignment.
  - `system_prompt` handled via config repository/routes with safeguards to prevent overriding canonical personality.
  - `bot_name` can be set via dynamic config (not an env), applied by `ChainManager`.

## Backend: Inactive or Legacy Variables

- Logging
  - `LOG_FILE`, `LOG_FORMAT` defined in settings but not used by `utils/logging_utils.py` (which only reads `LOG_LEVEL`).

- Redis
  - `REDIS_TTL` defined but unused; cache TTL is controlled via `CACHE_TTL`, and Redis `setex` caps to 1 hour internally.
  - `REDIS_MAX_MEMORY` defined but unused in code.

- Rate Limiting
  - `RATE_LIMIT` defined; route decorators are commented out and `.env` references `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_SECONDS` as eliminated.

- Metrics/Tracing
  - `ENABLE_METRICS`, `METRICS_PORT` present but only logged; no metrics server wiring identified.
  - `ENABLE_TRACING` present; tracing libraries in requirements but instrumentation not active.

- SSL
  - `SSL_KEYFILE`, `SSL_CERTFILE` defined but not passed to Uvicorn in `main.py`.

- Concurrency
  - `MAX_CONCURRENT_TASKS` defined but not referenced by ingestion or async tooling.

- Personality Name
  - `BOT_PERSONALITY_NAME` defined but not used; personality and bot name come from `core/prompt.py` and dynamic config.

## Frontend: Active Variables

- `NEXT_PUBLIC_API_URL` normalized in `app/lib/config.ts` and exported as `API_URL`; all services should consume this via `constants.ts`.
- `NEXT_PUBLIC_WIDGET_URL` used by `WidgetPreview.tsx` with sensible default.

## Recommendations

- Remove or deprecate truly unused envs
  - Logging: drop `LOG_FILE`, `LOG_FORMAT` unless a custom file handler/formatter is added.
  - Redis: drop `REDIS_TTL`, `REDIS_MAX_MEMORY` or wire them where applicable.
  - Rate limiting: either remove `RATE_LIMIT` or re-enable decorators with clear config names.
  - Concurrency: remove `MAX_CONCURRENT_TASKS` or implement usage in ingestion.
  - Personality name: remove `BOT_PERSONALITY_NAME` unless integrated with prompt assembly.

- Align TTL semantics
  - Consolidate on `CACHE_TTL` across both in-memory and Redis; remove the separate `REDIS_TTL` to avoid confusion.

- Metrics and tracing
  - If desired, add Prometheus instrumentation and OTEL setup gated by `ENABLE_METRICS`/`ENABLE_TRACING`. Otherwise, mark these as future/experimental.

- SSL handling
  - If running Uvicorn with TLS, plumb `SSL_KEYFILE`/`SSL_CERTFILE` into `uvicorn.run(...)` or document reverse-proxy TLS strategy.

- Security hardening
  - Ensure `JWT_SECRET` is mandatory in non-development environments; current checks already enforce this for `production`.

- Frontend consistency
  - Continue routing all calls through `API_URL`. Avoid adding `NEXT_PUBLIC_API_BASE_URL` or similar duplicates.

## Quick Map (Examples)

- Server: `ENVIRONMENT`, `DEBUG`, `LOG_LEVEL`, `HOST`, `PORT`, `CORS_*`
- Security: `JWT_*`
- LLM: `OPENAI_API_KEY`, `BASE_MODEL_NAME`, `TEMPERATURE`, `MAX_TOKENS`
- RAG: `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `MAX_FILE_SIZE_MB`, `RETRIEVAL_K`, `SIMILARITY_THRESHOLD`, `RETRIEVAL_K_MULTIPLIER`, `MMR_LAMBDA_MULT`, `BATCH_SIZE`, `EMBEDDING_MODEL`, `EMBEDDING_BATCH_SIZE`
- Storage: `VECTOR_STORE_PATH`, `PDFS_DIR`
- Cache: `ENABLE_CACHE`, `CACHE_TTL`, optional `REDIS_URL`
- Mongo: `MONGO_URI` (fallback `MONGODB_URI`), `MONGO_DATABASE_NAME`, `MONGO_COLLECTION_NAME`
- Prompts: `MAIN_PROMPT_NAME`, `AI_PREFIX`, `HUMAN_PREFIX`, optional `system_prompt`

---

Generated by the env audit task to aid configuration hygiene and future maintenance.