# Auditoría de uso de módulos (backend)

Este documento clasifica los módulos del backend según su uso actual en la aplicación, apoyado por revisión de imports reales en `backend/main.py` y `backend/api/app.py`, y un análisis automatizado con `vulture --min-confidence 80`.

## Criterios de clasificación
- 🔵 Core activo: se importa o ejecuta en tiempo de app (routers, middleware, managers, servicios inicializados en `lifespan`).
- 🟠 Latente / legacy: existe pero no se referencia directamente desde `main.py` o `api/app.py` y no participa en el arranque por defecto. Puede ser usado por configuración especial.
- 🔴 Muerto: no se importa en ningún lado o contiene funciones/variables nunca usadas.

## 🔵 Core activo
- `backend/main.py`: punto de entrada; crea `app` y arranca Uvicorn.
- `backend/api/app.py`:
  - `create_app` + `lifespan`: inicializa `PDFManager`, `PDFContentLoader`, `EmbeddingManager`, `VectorStore`, `RAGIngestor`, `RAGRetriever`, `Bot`, `ChatManager`, `MongoDB client`.
  - CORS (`fastapi.middleware.cors`), `AuthenticationMiddleware`, handlers globales de excepciones.
  - Registro de routers.
- Routers activos (registrados en `api/app.py`):
  - `backend/api/routes/health/health_routes.py`
  - `backend/api/routes/auth.py` (importado como `from .auth import router as auth_router`)
  - `backend/api/routes/chat/chat_routes.py`
  - `backend/api/routes/pdf/pdf_routes.py`
  - `backend/api/routes/rag/rag_routes.py`
  - `backend/api/routes/bot/bot_routes.py`
  - `backend/api/routes/bot/config_routes.py`
  - `backend/api/routes/users/users_routes.py`
- Autenticación y seguridad:
  - `backend/auth/middleware.py` (AuthenticationMiddleware) — agregado vía `app.add_middleware(...)`.
  - `backend/auth/jwt_handler.py`, `backend/auth/dependencies.py`, `backend/auth/password_handler.py` — usados por `api/auth.py` y routers protegidos.
- Managers y core del bot:
  - `backend/chat/manager.py` — inyectado en `app.state` y usado por `/api/v1/chat`.
  - `backend/core/bot.py` — instancia del agente LCEL; importa y usa `ChainManager` y memoria.
  - `backend/core/chain.py`, `backend/core/prompt.py` — construcción de prompts y cadena; importados por `Bot`.
- Subsistema RAG:
  - `backend/rag/embeddings/embedding_manager.py`
  - `backend/rag/vector_store/vector_store.py`
  - `backend/rag/ingestion/ingestor.py`
  - `backend/rag/retrieval/retriever.py`
  - `backend/rag/pdf_processor/pdf_loader.py`
- Almacenamiento de documentos:
  - `backend/storage/documents/pdf_manager.py` (exportado por `storage/documents/__init__.py`).
- Base de datos:
  - `backend/database/mongodb.py` (cliente persistente + índices).
  - `backend/database/user_repository.py`, `backend/database/config_repository.py`.
- Utilidades:
  - `backend/utils/logging_utils.py` (setup y helpers de logging).
  - `backend/utils/deploy_log.py` (resumen de startup).
  - `backend/utils/chain_cache.py` (usado por `core/bot.py` vía `utils.__init__`).
- Configuración:
  - `backend/config.py` — `Settings` y `settings` globales.
- Esquemas API:
  - `backend/api/schemas.py` + `backend/api/schemas/*` — importados por routers.
- Comunes:
  - `backend/common/constants.py`, `backend/common/objects.py` — usados por `chat/manager.py` y `core/bot.py`.

## 🟠 Latente / legacy
- `backend/auth/password_handler_bcrypt.py` — alternativa de hashing; no referenciada por `api/app.py` ni routers actuales. Puede servir como fallback/experimento.
- Archivos de documentación:
  - `backend/core/README.md`, `backend/models/README.md` — no forman parte de la ejecución.
- Paquetes `__init__.py` no directamente referenciados por `api/app.py` (aunque algunos se importan indirectamente): `backend/common/__init__.py`, `backend/core/__init__.py`, `backend/models/__init__.py`. Rol de inicialización, no lógica activa por sí mismos.

## 🔴 Muerto (no importado / código no utilizado)
- No importado en el backend actual (según búsqueda y vulture):
  - `backend/auth/password_handler_bcrypt.py` — sin referencias en el árbol de `backend/`.
- Señales de código no utilizado reportadas por `vulture` (confianza ≥80):
  - `backend/core/chain.py:29` — variable no usada `custom_bot_personality_str` (100%).
  - `backend/memory/base_memory.py:18` — import no usado `ConfigDict` (90%).
  - `backend/memory/custom_memory.py:8` — import no usado `BaseChatMessageHistory` (90%).
  - `backend/memory/custom_memory.py:12` — import no usado `MessageTurn` (90%).
  - `backend/rag/retrieval/retriever.py:570` — código inalcanzable después de `return` (100%).

## Notas y próximos pasos sugeridos
- Validar si se requiere `password_handler_bcrypt.py`; si no, moverlo a una rama legacy o eliminarlo.
- Limpiar imports no usados en memoria y `ChainManager` para reducir ruido y riesgo de errores.
- Revisar el punto con código inalcanzable en `RAGRetriever` y ajustar el flujo.
- Mantener alineado `Settings.vector_store_path` con rutas de persistencia reales (`./backend/storage/...`). La carpeta `backend/backend/storage` contiene datos (PDFs y Chroma) y no código.

---
Este documento se basa en:
- Inspección de `backend/main.py` y `backend/api/app.py` (routers, middleware, managers inicializados).
- Búsquedas semánticas en el árbol `backend/`.
- Resultado de `vulture backend/ --min-confidence 80`.