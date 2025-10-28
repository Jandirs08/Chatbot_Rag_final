## Arquitectura del Chatbot (Frontend + Backend)

Este documento resume la arquitectura end-to-end del chatbot, cubriendo frontend (Next.js/React) y backend (FastAPI + RAG + MongoDB + ChromaDB).

### Tecnologías clave

- **Frontend**: Next.js (App Router), React, TypeScript, TailwindCSS
- **Backend**: FastAPI, Pydantic, Uvicorn
- **Base de datos**: MongoDB
- **Vector Store**: ChromaDB
- **RAG**: Embeddings + Retrieval con módulos propios

### Mapa de carpetas (alto nivel)

```
frontend/
├─ app/
│  ├─ api/                # Fetchers/cliente de API
│  ├─ chat/               # UI principal del chat
│  ├─ components/         # Componentes de UI reutilizables
│  ├─ hooks/              # Hooks personalizados
│  ├─ utils/              # Helpers de UI/estado
│  ├─ layout.tsx          # Layout raíz
│  └─ page.tsx            # Landing/dashboard
└─ ...

backend/
├─ api/                   # App FastAPI, routers y esquemas
├─ core/                  # Orquestación del bot y cadenas
├─ rag/                   # Embeddings, ingesta, retrieval y vector store
├─ memory/                # Memoria de conversaciones
├─ database/              # MongoDB
├─ utils/                 # Utilidades/cache
└─ storage/               # PDFs y datos de ChromaDB
```

### Diagrama global (flujo de usuario a respuesta)

```
Usuario (web) ──▶ Frontend (Next.js) ──▶ API Backend (FastAPI)
                                      │
                                      │ solicita/genera respuesta
                                      ▼
                               core.chain + rag.retrieval
                                      │
                       ┌──────────────┴──────────────┐
                       ▼                             ▼
               Vector Store (ChromaDB)        Memoria/MongoDB
                       ▲                             │
                       └────── embeddings ───────────┘

Respuesta ◀──────────────────────── stream/eventos ◀───────────
```

### Frontend: responsabilidades

- Renderiza UI de chat, documentos y dashboard.
- Gestiona estado de conversación y llamada a endpoints (`/api/chat`, `/api/pdf`, `/api/rag`, `/api/bot`, `/api/health`).
- Muestra streams de respuesta del backend para feedback en tiempo real.

Componentes relevantes:

- `frontend/app/chat/*`: vistas del chat y entrada del usuario.
- `frontend/app/components/*`: UI reusable (inputs, badges, modales, etc.).
- `frontend/app/api/*`: funciones utilitarias para llamadas HTTP/stream.

### Backend: responsabilidades

- Exponer endpoints REST/stream para chat, PDF, RAG, bot y health.
- Orquestar cadenas de prompts (`core/chain.py`), memoria, y recuperación de contexto (RAG).
- Persistencia en MongoDB; almacenamiento vectorial en archivos ChromaDB.

### Integración Front-Back (contratos)

- **Chat**: `POST /api/chat/stream` (stream SSE o chunked) y `POST /api/chat/clear`, `GET /api/chat/export`.
- **PDF**: `POST /api/pdf/upload`, `GET /api/pdf/list`, `DELETE /api/pdf/{id}`.
- **RAG**: `GET /api/rag/status`, `POST /api/rag/clear`.
- **Bot**: `GET /api/bot/state`, `POST /api/bot/toggle`.
- **Health**: `GET /api/health`.

Los modelos de request/response están centralizados en `backend/api/schemas/*`; el frontend consume estos contratos.

### Diagramas de despliegue

```
                    ┌─────────────────────────┐
                    │        Navegador        │
                    └───────────┬─────────────┘
                                │ HTTPS
                     ┌──────────▼──────────┐
                     │   Frontend (Next)   │
                     │  (Vercel/Node)      │
                     └──────────┬──────────┘
                                │ HTTPS
                     ┌──────────▼──────────┐
                     │   Backend (ASGI)    │
                     │ FastAPI + Uvicorn   │
                     └─────┬────────┬──────┘
                           │        │
                   ┌───────▼───┐  ┌─▼────────────┐
                   │ MongoDB   │  │  ChromaDB     │
                   └───────────┘  └──────────────┘
```

### Operación y mantenimiento

- Re-ingesta y limpieza del vector store vía endpoint RAG.
- Exportación de conversaciones para auditoría desde endpoint de chat.
- Monitorización básica vía endpoint de salud.

### Puesta en marcha local

1. Instalar dependencias de `backend/` y `frontend/`.
2. Levantar MongoDB y configurar variables en `backend/config.py`.
3. Arrancar Backend: `python backend/main.py` o `uvicorn backend.api.app:app --reload`.
4. Arrancar Frontend: `npm run dev` dentro de `frontend/`.

### Consideraciones de seguridad

- Validar tamaño y tipo de archivos PDF en subida.
- CORS configurado entre frontend y backend.
- Sanitización de entradas de usuario en chat y búsquedas.
