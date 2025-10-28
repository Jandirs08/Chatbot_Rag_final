## PRD — Backend Chatbot RAG

### 1. Propósito

Definir las capacidades, alcance, requisitos y criterios de aceptación del backend del chatbot con RAG (Retrieval-Augmented Generation). Este documento servirá como guía para desarrollo, QA, DevOps y stakeholders técnicos.

### 2. Objetivos

- Proveer una API robusta y segura para interacción conversacional.
- Ingerir, procesar y consultar documentos PDF para enriquecer respuestas vía RAG.
- Ofrecer observabilidad básica (salud, trazas, métricas mínimas) y herramientas de administración (limpieza de datos RAG).
- Permitir configuración del bot y compatibilidad con diferentes tipos de memoria conversacional.

### 3. Alcance (In-Scope)

- Exposición de endpoints REST con FastAPI para: chat, PDFs, RAG, bot y salud.
- Ingesta de PDFs, chunking, embeddings y almacenamiento en vector store (Chroma).
- Recuperación de contexto relevante para respuestas (RAGRetriever) y generación con LLM.
- Memoria conversacional configurable (base/local, Mongo, otras implementaciones).
- Configuración vía variables de entorno y archivo `.env` en `backend/`.

### 4. Fuera de alcance (Out-of-Scope)

- Interfaz de usuario (frontend) y widgets de chat.
- Gestión de facturación/planes, multi-tenant avanzado.
- Entrenamiento de modelos; solo inferencia e integración con proveedores (p.ej., OpenAI).
- Moderación de contenido avanzada más allá de validaciones básicas.

### 5. Usuarios/Personas

- Dev Backend/ML: integra nuevas fuentes y modelos.
- DevOps: despliega, monitoriza y escala el servicio.
- QA: valida funcionalidad y contratos de API.
- Analista/PM técnico: consulta estado del sistema y define métricas de éxito.

### 6. Suposiciones

- Python 3.10+, ejecución en entorno con permisos de lectura/escritura a `storage/`.
- Dependencias instaladas desde `backend/requirements.txt`.
- Claves/URIs configuradas en variables de entorno (p.ej., `OPENAI_API_KEY`, `MONGO_URI`).
- Vector store persistido localmente (Chroma) en `backend/storage/vector_store/`.

### 7. Requisitos funcionales

1. Chat conversacional

   - RF-CH-1: Endpoint para enviar mensajes y recibir respuesta enriquecida con RAG.
   - RF-CH-2: Soporte de memoria conversacional (seleccionable vía `settings.memory_type`).
   - RF-CH-3: Retornar también fuentes/citas cuando existan documentos relevantes.

2. Gestión de PDFs

   - RF-PDF-1: Subir uno o varios PDFs y almacenarlos en `storage/documents/pdfs/`.
   - RF-PDF-2: Listar PDFs almacenados y sus metadatos básicos.
   - RF-PDF-3: Borrar PDFs específicos y limpiar su huella en el vector store si aplica.

3. Ingesta y RAG

   - RF-RAG-1: Procesar PDFs en chunks (configurables: `chunk_size`, `chunk_overlap`).
   - RF-RAG-2: Generar embeddings para cada chunk con el modelo configurado (`embedding_model`).
   - RF-RAG-3: Persistir embeddings en vector store (Chroma) con `persist_directory` configurable.
   - RF-RAG-4: Recuperar top-k pasajes relevantes para una consulta.
   - RF-RAG-5: Endpoint de estado RAG con detalles de PDFs y vector store.
   - RF-RAG-6: Endpoint de limpieza RAG (PDFs y vector store) con confirmación.

4. Bot y configuración

   - RF-BOT-1: Endpoint para leer/actualizar parámetros runtime seguros del bot cuando sea posible.
   - RF-BOT-2: Validar `OPENAI_API_KEY` si `model_type == OPENAI` y fallar con error claro si falta.

5. Salud/Observabilidad
   - RF-HL-1: Endpoint `/api/v1/health` con estado 200 y payload mínimo.
   - RF-HL-2: Middleware de logging de requests con método, ruta, status y tiempo.

### 8. Requisitos no funcionales

- RNF-SEC: CORS configurable; permitir orígenes explícitos o `*` en entornos de desarrollo.
- RNF-PERF: Latencia P50 de respuesta de chat < 2.5s con contexto corto; P95 < 6s bajo carga moderada.
- RNF-ESC: Soportar concurrencia con async/await; capacidad de escalar vía múltiples réplicas.
- RNF-CONF: Variables de entorno centralizadas en `backend/config.py` y `.env`.
- RNF-OBS: Logs estructurados y medibles; trazas/breadcrumbs opcionales.
- RNF-RES: Integridad del vector store ante reinicios; lifecycle para cierre ordenado.
- RNF-DOC: Documentación de rutas y esquemas vía OpenAPI de FastAPI.

### 9. Endpoints (referencia)

- Salud: `GET /api/v1/health`
- Chat: prefijo `POST /api/v1/chat/...`
- PDFs: prefijo `/api/v1/pdfs` (subir, listar, borrar)
- RAG: prefijo `/api/v1/rag` (estado, limpiar)
- Bot: prefijo `/api/v1/bot` (config/acciones)

Nota: Detalles de cada ruta en `backend/api/routes/*` y esquemas en `backend/api/schemas/*`.

### 10. Flujo de alto nivel

1. Subida de PDF → almacenamiento en `storage/documents/pdfs/`.
2. Ingesta → chunking → embeddings → persistencia en Chroma.
3. Consulta de chat → recuperación top-k → generación con LLM → respuesta con citas.
4. Administración → estado RAG, limpieza condicional.

### 11. Configuración y parámetros clave

- `model_type`, `openai_api_key`, `embedding_model`.
- `chunk_size`, `chunk_overlap`.
- `vector_store_path`, `pdfs_dir`.
- `memory_type` (p.ej., `BASE_MEMORY`, `MONGO_MEMORY`).
- `cors_origins`, `host`, `port`, `log_level`.

### 12. Integraciones y dependencias

- Proveedor LLM (p.ej., OpenAI) para generación de texto y/o embeddings.
- Chroma como vector store embebido en disco.
- MongoDB (opcional) para historial/memoria persistente.
- FastAPI, Pydantic, Uvicorn.

### 13. Seguridad y cumplimiento

- Validación de tamaños y tipos de archivo PDF.
- Límites de tamaño de request y número de archivos.
- Sanitización de metadatos y rutas de archivo.
- Manejo seguro de `OPENAI_API_KEY` y secretos; nunca en logs.
- CORS restrictivo en producción; `allow_origins` específico.

### 14. Observabilidad y métricas

- Logs de cada request (método, ruta, status, latencia, body opcional en dev).
- Contadores básicos: número de PDFs, tamaño del vector store, número de consultas.
- Futuro: exportación de métricas Prometheus (fuera de alcance inmediato).

### 15. Experiencia de errores

- 400: Validaciones de payload o archivo inválido.
- 401/403: Acceso no autorizado si se introduce autenticación futura.
- 404: Recurso inexistente.
- 422: Esquemas inválidos (Pydantic).
- 500: Errores internos; mensaje seguro y trazas en logs.

### 16. Criterios de aceptación (resumen)

- CA-1: `GET /api/v1/health` responde 200 con JSON mínimo.
- CA-2: Subida de PDF, listado y borrado funcionales; archivos en `storage/documents/pdfs/`.
- CA-3: Ingesta genera embeddings y persiste en Chroma; recuperación retorna pasajes.
- CA-4: `POST /api/v1/chat/...` responde con texto y, cuando aplique, fuentes.
- CA-5: `GET /api/v1/rag/rag-status` refleja conteos y tamaños coherentes.
- CA-6: `POST/DELETE /api/v1/rag/clear-rag` limpia PDFs y vector store con confirmación.
- CA-7: Arranque falla temprano con mensaje claro si falta `OPENAI_API_KEY` cuando `model_type=OPENAI`.

### 17. Riesgos y mitigaciones

- R1: Tamaños grandes de PDFs → límites y procesamiento por lotes.
- R2: Falta de clave o cuota del proveedor → validación temprana y mensajes claros.
- R3: Corrupción del vector store → backups/limpieza segura vía endpoint y lifecycle ordenado.
- R4: Latencia alta del LLM → caché opcional y reducción de contexto.

### 18. Roadmap (próximos incrementos)

- Autenticación de API (tokens) y rate-limiting.
- Trazas distribuidas y métricas Prometheus.
- Soporte de múltiples espacios/tenants y políticas de retención.
- Indexación incremental y monitor de colas de ingesta.

### 19. Glosario

- RAG: Retrieval-Augmented Generation.
- Embeddings: Representaciones vectoriales de texto.
- Chroma: Almacén vectorial embebido en disco.
- Chunking: Partición de documentos en fragmentos para indexación.

### 20. Referencias

- Código principal: `backend/api/app.py`, `backend/core/*`, `backend/rag/*`.
- Rutas: `backend/api/routes/*`.
- Configuración: `backend/config.py`.
- Documentación adicional: `backend/README.md`.
