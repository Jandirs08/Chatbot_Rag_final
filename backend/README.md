```
 ____                    _                 _       ____ _           _           _   
| __ )  ___  __ _  __ _| |__   ___   ___ | | __  / ___| |__   __ _| |__   ___ | |_ 
|  _ \ / _ \/ _` |/ _` | '_ \ / _ \ / _ \| |/ / | |   | '_ \ / _` | '_ \ / _ \| __|
| |_) |  __/ (_| | (_| | |_) | (_) | (_) |   <  | |___| | | | (_| | |_) | (_) | |_ 
|____/ \___|\__, |\__,_|_.__/ \___/ \___/|_|\_\  \____|_| |_|\__,_|_.__/ \___/ \__|
             |___/                                                                  
```

# Backend Chatbot RAG

Sistema backend robusto y modular para un chatbot con capacidades RAG (Retrieval-Augmented Generation), autenticación JWT, middleware de protección administrativa, streaming SSE, y persistencia en MongoDB. Este documento describe la arquitectura, módulos, flujos internos y contratos principales de la API, sin incluir guías de despliegue ni instalación.

## Arquitectura General (ASCII)

```
                          +-------------------------------------------+
                          |               FastAPI App                 |
                          |        (create_app + lifespan)            |
                          +--------------------+----------------------+
                                               |
       +---------------------------------------+---------------------------------------+
       |                     Routers / Controladores (API)                            |
       |   /health   /auth   /chat   /pdfs   /rag   /bot   /users                     |
       +--------------------------------------------------------------------------------+
       | Middleware: AuthenticationMiddleware (protege /pdfs, /rag, /bot, /users)       |
       +--------------------------------------------------------------------------------+
       | Servicios core:                                                               |
       | - ChatManager (gestión de diálogo, logs en MongoDB)                           |
       | - Bot (LCEL + ChainManager + Memoria + Tools)                                 |
       | - RAGRetriever (búsqueda contextual, reranking, MMR)                          |
       +--------------------------------------------------------------------------------+
       | Subsistema RAG:                                                               |
       | - PDFContentLoader (chunking)  - EmbeddingManager                              |
       | - VectorStore (Qdrant + caché) - RAGIngestor (ingesta asincrónica)            |
       | - RAG gating premium (centroide + similitud)                                  |
       +--------------------------------------------------------------------------------+
       | Persistencia: MongoDB (collections: messages, users, bot_config)               |
       +--------------------------------------------------------------------------------+
       | Storage: documentos/pdfs; vector_store/ (persistencia local; Qdrant externo)  |
       +--------------------------------------------------------------------------------+
       | Utilidades: logging_utils, deploy_log, chain_cache                              |
       +--------------------------------------------------------------------------------+
```

## Mapa de Carpetas (backend)

```text
backend/
├── api/
│   ├── app.py                 # Inicialización FastAPI, lifespan, CORS, middleware, routers
│   ├── auth.py                # Endpoints de autenticación (login/me/refresh/logout)
│   ├── routes/                # Routers por dominio
│   │   ├── bot/
│   │   ├── chat/
│   │   ├── health/
│   │   ├── pdf/
│   │   ├── rag/
│   │   └── users/
│   └── schemas/               # Esquemas Pydantic centralizados
│       ├── base.py
│       ├── chat.py
│       ├── config.py
│       ├── health.py
│       ├── pdf.py
│       └── rag.py
├── auth/
│   ├── dependencies.py        # Dependencias FastAPI (get_current_user, require_admin, etc.)
│   ├── jwt_handler.py         # Creación/verificación de tokens
│   ├── middleware.py          # Protección de rutas admin vía JWT
│   └── password_handler.py    # Hash/verify
├── cache/
│   ├── manager.py             # Facade para caché
│   ├── memory_backend.py      # Backend en memoria
│   └── redis_backend.py       # Backend Redis opcional
├── chat/
│   └── manager.py             # Orquestación de respuestas y registro en MongoDB
├── core/
│   ├── bot.py                 # Agente LCEL, memoria, contexto RAG
│   ├── chain.py               # ChainManager, prompts y modelo
│   └── prompt.py              # Personalidad y plantillas principales
├── database/
│   ├── config_repository.py   # Configuración del bot (system_prompt, nombre, UI extra)
│   ├── mongodb.py             # Cliente MongoDB, índices
│   ├── user_repository.py     # Repositorio de usuarios (CRUD, índices)
│   
├── memory/
│   ├── base_memory.py
│   └── memory_types.py        # Enum + mapping
├── rag/
│   ├── embeddings/embedding_manager.py
│   ├── ingestion/ingestor.py
│   ├── pdf_processor/pdf_loader.py
│   ├── retrieval/retriever.py
│   └── vector_store/vector_store.py
├── storage/
│   ├── documents/
│   │   ├── pdf_manager.py
│   │   └── pdfs/                           # Carpeta de PDFs
│   └── vector_store/                       # Persistencia local del vector store
├── common/
│   ├── constants.py
│   └── objects.py             # Message, roles, convenciones conversation_id
├── models/
│   ├── auth.py                # DTOs auth (LoginRequest, TokenResponse, etc.)
│   ├── model_types.py         # Tipos auxiliares
│   └── user.py                # Modelo de usuario
├── utils/
│   ├── logging_utils.py       # Filtros y supresión de ruido (cl100k_base)
│   ├── chain_cache.py
│   ├── deploy_log.py          # Resumen de arranque y diagnósticos
│   ├── memory/
│   │   └── memory_audit_report.md
│   └── rag_type_detector.py
├── config.py                  # Pydantic Settings (CORS, JWT, RAG, etc.)
├── main.py                    # Punto de entrada (Uvicorn)
├── requirements.txt
├── tests/                     # Pruebas
│   ├── conftest.py
│   └── test_auth_validation.py
└── Dockerfile                 # Docker backend
```

## Flujo Interno de Datos

- Recepción: el cliente envía una solicitud al router correspondiente (por ejemplo, `/api/v1/chat/`).
- Middleware: AuthenticationMiddleware permite libre acceso a `/health`, `/auth`, `/chat`; exige usuario admin para `/pdfs`, `/rag`, `/bot`, `/users`.
- Lifespan de app: al iniciar, se crean y comparten en `app.state` los managers y recursos (PDFManager, EmbeddingManager, VectorStore, RAGIngestor, RAGRetriever, Bot, ChatManager, MongoDB client). Al cerrar, se liberan ordenadamente.
- ChatManager: valida estado del bot, parsea `ChatRequest`, genera respuesta llamando al `Bot` y guarda ambos mensajes en MongoDB (`messages`), manteniendo índices para rendimiento.
 - Bot (LCEL): ChainManager compone el prompt con personalidad, historial (memoria configurable) y contexto RAG (si `enable_rag_lcel` está activo). Ejecuta la cadena directamente vía LCEL (sin agentes ni parsers ReAct).
- RAG: RAGRetriever consulta `VectorStore` (Qdrant), aplica reranking semántico o MMR, y opcionalmente cachea resultados; formatea contexto para el prompt.
- Gating premium: antes de recuperar, se evalúa la similitud del embedding de la consulta contra un centroide de documentos; si está por debajo del umbral, se omite inyección de contexto.
- Streaming SSE: el endpoint de chat retorna `StreamingResponse` emitiendo eventos `data` y `end` para consumo progresivo en el frontend.
- Logging y observabilidad: middleware de logging registra método, ruta, tiempo y—si `DEBUG`—cuerpo. Se suprimen warnings/tiktoken. Excepciones globales devuelven respuestas con `detail` consistente.

## Endpoints Principales

| Endpoint | Método | Descripción | Auth |
|---|---|---|---|
| `/api/v1/health` | GET | Health check del backend | Público |
| `/api/v1/auth/login` | POST | Autentica y emite tokens JWT (access/refresh) | Público |
| `/api/v1/auth/me` | GET | Perfil del usuario autenticado | Requiere token |
| `/api/v1/auth/refresh` | POST | Renueva access token con refresh | Público |
| `/api/v1/auth/logout` | POST | Logout lógico (cliente elimina tokens) | Requiere token |
| `/api/v1/chat/` | POST | Chat con respuesta en streaming SSE | Público |
| `/api/v1/chat/export-conversations` | GET | Exporta conversaciones a Excel | Público |
| `/api/v1/chat/stats` | GET | Métricas básicas de uso y PDFs | Público |
| `/api/v1/pdfs/upload` | POST | Sube PDF y dispara ingesta asíncrona | Admin |
| `/api/v1/pdfs/list` | GET | Lista PDFs disponibles en storage | Admin |
| `/api/v1/pdfs/{filename}` | DELETE | Elimina PDF y sus embeddings del vector store | Admin |
| `/api/v1/pdfs/download/{filename}` | GET | Descarga directa del PDF | Admin |
| `/api/v1/pdfs/view/{filename}` | GET | Visualización inline del PDF | Admin |
| `/api/v1/rag/rag-status` | GET | Estado del RAG (PDFs, tamaño vector store) | Admin |
| `/api/v1/rag/clear-rag` | POST | Limpia PDFs y el almacén vectorial | Admin |
| `/api/v1/rag/retrieve-debug` | POST | Traza detallada de recuperación (auditoría) | Admin |
| `/api/v1/rag/reindex-pdf` | POST | Reindexa un PDF específico | Admin |
| `/api/v1/bot/state` | GET | Estado activo/inactivo del bot | Admin |
| `/api/v1/bot/toggle` | POST | Activa/desactiva el bot | Admin |
| `/api/v1/bot/runtime` | GET | Inspección de configuración runtime | Admin |
| `/api/v1/bot/config` | GET | Obtiene configuración persistida del bot | Admin |
| `/api/v1/bot/config` | PUT | Actualiza configuración y recarga chain | Admin |
| `/api/v1/bot/config/reset` | POST | Limpia campos UI y recarga chain | Admin |
| `/api/v1/users/users` | GET | Lista paginada de usuarios con filtros | Admin |
| `/api/v1/users/users` | POST | Crea usuario (validaciones de unicidad) | Admin |
| `/api/v1/users/users/{user_id}` | PATCH | Actualiza campos (validaciones y política de password) | Admin |
| `/api/v1/users/users/{user_id}` | DELETE | Elimina usuario | Admin |

## Dependencias Clave y Propósito

| Paquete | Rol en el sistema |
|---|---|
| `fastapi`, `uvicorn` | Framework ASGI y servidor para routing, middleware y streaming.
| `pydantic` v2, `pydantic-settings`, `python-dotenv` | Modelado/validación de datos y configuración tipada.
| `python-jose[cryptography]`, `passlib`, `bcrypt` | Manejo de JWT y hashing de contraseñas.
| `motor`, `pymongo` | Cliente async de MongoDB y operaciones de repositorio/índices.
| `langchain-core`, `langchain`, `langchain-openai` | Orquestación LCEL y modelos LLM.
| `qdrant-client` | Almacenamiento vectorial (Qdrant) para RAG.
| `tiktoken` | Tokenización eficiente; se suprimen logs ruidosos.
| `openai` | Cliente para proveedores OpenAI cuando `MODEL_TYPE=OPENAI`.
| `pypdf` | Lectura básica de PDF para ingestión sin OCR.
| `numpy`, `pandas`, `xlsxwriter` | Procesamiento de datos y exportación de conversaciones a Excel.
| `scikit-learn` | Cálculos de similitud/cosinor y utilidades en RAG.
| `orjson`, `ujson`, `aiofiles`, `httpx` | Rendimiento en JSON, IO asíncrono y HTTP.
| `prometheus-client`, `opentelemetry-*` | Métricas y trazabilidad opcional.
| `colorama` | Mejor UX en consola para mensajes de arranque.
| `pytest*`, `black`, `isort`, `flake8`, `mypy` | Calidad, pruebas y estilo de código.

## Ciclo de Vida del Chatbot

- Arranque: `lifespan` inicializa PDF/Embeddings/VectorStore/RAGIngestor/RAGRetriever/Bot/ChatManager y MongoDB con índices.
- Recepción: el endpoint `/api/v1/chat/` recibe `ChatRequest` y valida que el bot esté activo.
- Contexto: si `enable_rag_lcel` está activo, el `Bot` intenta inyectar contexto RAG (k configurable) al prompt. Previo a recuperar, se aplica gating premium por similitud de consulta-centroide; si no supera el umbral, no se recupera ni se inyecta contexto.
- Memoria: se consulta la memoria (base o Mongo) para el historial y se formatea al prompt.
 - Generación: LCEL invoca el modelo (OpenAI u otros) directamente, y devuelve la respuesta textual sin formato de agentes.
- Persistencia: `ChatManager` almacena el par de mensajes (human/assistant) en MongoDB.
- Respuesta: se emite vía SSE en tiempo real; al finalizar se envía evento `end`.
- Cierre: limpieza ordenada de recursos (vector store, embeddings, Mongo) y liberación de ejecutores.

## Conceptos Técnicos Destacados

- Modularización de Routers: separación por dominios (`auth`, `chat`, `pdfs`, `rag`, `bot`, `users`, `health`) con `include_router` y prefijos coherentes.
- Lifespan Pattern: inicialización centralizada de servicios en `app.state` y teardown controlado.
- Middleware de Autenticación: estrategia de listas blancas/negras por prefijo; validación de token + verificación admin; respuestas JSON estandarizadas.
- Repository Pattern: `UserRepository` y `ConfigRepository` encapsulan acceso Mongo (índices, validaciones, actualizaciones).
- RAG optimizado: `VectorStore` con caché (memoria/Redis), backups automáticos ante incompatibilidades de esquema, MMR y reranking semántico.
- Gating por centroide (premium): `RAGRetriever.should_use_rag(query)` genera embedding de consulta y lo compara contra el centroide de embeddings del corpus (cargado lazy desde Qdrant y cacheado). Si la similitud es menor al umbral configurable (`settings.rag_gating_similarity_threshold`, default ~0.40–0.45), se desactiva la inyección RAG para esa consulta.
- Normalización de embeddings: extracción robusta desde Qdrant soportando `payload["embedding"]`, `payload["vector"]`, `payload["text_vector"]`, `point.vector` y vectores nombrados; siempre se normaliza a `np.ndarray(float32)`.
- Prompt Engineering composable: `ChainManager` compone personalidad base + extras UI sin sobreescribir la base; garantiza presencia de `context` y `history`.
- SSE Streaming: diseño de `StreamingResponse` con eventos `data`, `error`, `end` para experiencias reactivas.
- Logging y Resiliencia: filtros de ruido (`cl100k_base`), reducción de verbosidad, handlers globales; validaciones pydantic y manejo de errores consistente.
- Seguridad y CORS: validaciones estrictas en producción (JWT_SECRET obligatorio), CORS derivado de configuración y client origin, control de `max_age`.
- Trazabilidad RAG: endpoint de auditoría `retrieve-debug` devuelve traza y métricas; ingesta y reindex sincronizada.

---

Este documento es la referencia técnica interna del backend. Su propósito es aportar claridad arquitectónica, dominios funcionales, contratos y flujos, manteniendo identidad visual y foco en el diseño del sistema.