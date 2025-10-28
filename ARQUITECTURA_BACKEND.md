## Arquitectura del Backend

Este documento describe la estructura, componentes y flujos principales del backend del proyecto ChatBotRag.

### Tecnologías clave

- **Framework API**: FastAPI (ASGI)
- **Persistencia**: MongoDB (para memoria del chat y documentos)
- **Vector Store**: ChromaDB (archivos en `backend/storage/vector_store/chroma_db`)
- **Embeddings/RAG**: Módulos propios en `backend/rag/*`
- **Cache**: utilidades en `backend/utils/chain_cache.py` (opcional Redis según configuración)

### Estructura de carpetas (resumen)

```
backend/
├─ api/
│  ├─ app.py                 # Punto de entrada ASGI (FastAPI)
│  ├─ routes/
│  │  ├─ health/             # Endpoints de salud
│  │  ├─ pdf/                # Ingesta, listado y borrado de PDFs
│  │  ├─ rag/                # Estado y limpieza del vector store
│  │  ├─ chat/               # Chat (stream, clear, export)
│  │  └─ bot/                # Estado del bot (on/off)
│  └─ schemas/               # Pydantic models (request/response)
│
├─ core/
│  ├─ bot.py                 # Orquestación del bot
│  ├─ chain.py               # Cadenas de prompts/LLM
│  └─ prompt.py              # Prompts base
│
├─ rag/
│  ├─ embeddings/            # Gestión de embeddings
│  ├─ ingestion/             # Ingesta de documentos
│  ├─ pdf_processor/         # Limpieza/parsing de PDFs
│  ├─ retrieval/             # Recuperación de contexto
│  └─ vector_store/          # Abstracciones de la base vectorial
│
├─ memory/                   # Almacenamiento/memoria de conversaciones
├─ database/                 # Conexión a MongoDB
├─ common/                   # Constantes y objetos compartidos
├─ utils/                    # Utilidades y cache
├─ storage/                  # Archivos de usuario y vector store
└─ main.py                   # Arranque del servidor (uvicorn)
```

### Diagrama lógico (alto nivel)

```
          ┌───────────────┐        ┌───────────────┐
Request → │  FastAPI App  │ ─────→ │   Routers     │
          └──────┬────────┘        └──────┬────────┘
                 │                         │
                 │                         │
                 ▼                         ▼
           ┌──────────┐             ┌──────────┐
           │  core/   │             │  rag/     │
           │ chain    │◀──context──▶│ retrieval │
           └────┬─────┘             └────┬─────┘
                │                        │
         chat state/memoria              │
                │                        │
                ▼                        ▼
           ┌──────────┐            ┌────────────┐
           │ memory/  │            │ VectorStore │ (ChromaDB)
           └──────────┘            └────────────┘
                   │                       ▲
                   │                       │ embeddings
                   ▼                       │
               ┌────────┐                  │
               │MongoDB │◀─────────────────┘
               └────────┘
```

### Endpoints principales

- **Salud** (`/api/health`): estado del servicio, versión, entorno.
- **PDFs** (`/api/pdf`): subir/listar/eliminar documentos.
- **RAG** (`/api/rag`): estado del vector store y limpieza.
- **Chat** (`/api/chat`): stream de respuestas, limpiar historial, exportar conversaciones.
- **Bot** (`/api/bot`): obtener y alternar estado activo.

Los esquemas Pydantic para requests/responses están en `backend/api/schemas/*`.

### Flujo de una respuesta de chat

1. FastAPI recibe la solicitud (posible stream).
2. `core/chain.py` construye la cadena con el `prompt` y memoria de `memory/*`.
3. Si procede, `rag/retrieval` recupera contexto desde ChromaDB con embeddings.
4. Se genera la respuesta del modelo y se envía al cliente (streaming si aplica).
5. Se persiste/updatea memoria de conversación en MongoDB.

```
Usuario → /api/chat/stream ─▶ Router(chat) ─▶ core.chain ─▶ rag.retrieval ─▶ VectorStore
                                                  │
                                                  └─▶ memory + MongoDB ──▶ Respuesta(stream)
```

### Configuración y variables

- `backend/config.py`: carga de entorno (DB URIs, flags de cache, etc.).
- `backend/requirements.txt`: dependencias Python.
- Los datos persistentes (PDFs/vector store) viven en `backend/storage/*`.

### Ejecución local

1. Crear entorno virtual y `pip install -r backend/requirements.txt`.
2. Levantar MongoDB (local o Docker).
3. Ejecutar: `python backend/main.py` (o usar `uvicorn backend.api.app:app --reload`).

### Pruebas y utilidades

- Scripts de pruebas de rendimiento en `backend/dev/*`.
- Tests automatizados externos (TestSprite) disponibles en `testsprite_tests/*`.

### Notas operativas

- Limpieza de vector store vía endpoint RAG para re-ingestas.
- Evitar borrar manualmente `storage/vector_store` salvo que se regenere completamente.
