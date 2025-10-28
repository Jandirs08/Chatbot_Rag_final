# Inventario del Proyecto ChatBot RAG

## Descripcion Funcional
La solucion implementa un chatbot conversacional con recuperacion aumentada (RAG) para responder consultas sobre documentos PDF propios. El frontend basado en Next.js ofrece la interfaz de chat con actualizaciones en tiempo real, paneles de control y utilidades para gestionar contenido y configuraciones del asistente (`frontend/app/components/ChatWindow.tsx:32`, `frontend/app/dashboard/page.tsx:5`).

El backend en FastAPI expone APIs de chat, RAG y administracion (`backend/api/app.py:148`). Integra LangChain para componer prompts, memoria conversacional y agentes (`backend/core/bot.py:32`, `backend/chat/manager.py:18`), persiste historiales en MongoDB (`backend/database/mongodb.py:11`) y administra el ciclo de vida de documentos mediante ingestion, embeddings y vector store Chroma (`backend/rag/ingestion/ingestor.py:19`, `backend/rag/vector_store/vector_store.py:21`).

## Inventario de Arquitectura
- Frontend Next.js y Chakra UI para chat, panel y widget embebible (`frontend/app/chat/page.tsx:8`, `frontend/app/components/ChatWindow.tsx:32`).
- API FastAPI con configuracion centralizada y ciclo de vida controlado (`backend/api/app.py:148`, `backend/main.py:66`).
- Orquestador conversacional LangChain con memoria y cache opcional (`backend/core/bot.py:32`, `backend/chat/manager.py:18`, `backend/utils/chain_cache.py:16`).
- Pipeline RAG que cubre ingestion, deduplicacion, embeddings y recuperacion (`backend/rag/ingestion/ingestor.py:19`, `backend/rag/retrieval/retriever.py:89`).
- Almacenamiento de PDFs y vector store persistente sobre disco (`backend/storage/documents/pdf_manager.py:15`, `backend/rag/vector_store/vector_store.py:21`).
- Persistencia de sesiones en MongoDB y configuracion unificada de la aplicacion (`backend/database/mongodb.py:11`, `backend/config.py:13`).

## Inventario de Tecnologias

### Lenguajes y Runtimes
| Plataforma | Version | Evidencia / Notas |
| --- | --- | --- |
| Python 3.11-slim | Imagen base del backend (`Dockerfile:1`) | Ejecuta FastAPI y tareas de ingestion. |
| Node.js 20-alpine | Imagen base del frontend (`frontend/Dockerfile:1`) | Ejecuta Next.js en build y produccion. |
| Next.js 14.1.x | Dependency principal (`frontend/package.json:62`) | Router y renderizado del frontend. |
| TypeScript 5.3.x | Tooling de frontend (`frontend/package.json:72`) | Tipado de componentes y servicios. |
| MongoDB 6.x (docker) | Servicio `mongo:latest` (`docker-compose.yml:2`) | Base de datos documental para historiales. |

### Frameworks y Librerias Clave
| Area | Tecnologia | Version / Restriccion | Uso |
| --- | --- | --- | --- |
| Backend | FastAPI | `>=0.104,<1.0` (`backend/requirements.txt:2`) | Framework HTTP y definicion de endpoints. |
| Backend | Uvicorn | `>=0.24,<1.0` (`backend/requirements.txt:3`) | Servidor ASGI para FastAPI. |
| Backend | LangChain suite | `langchain*` 0.1.x (`backend/requirements.txt:9-14`) | Construccion de cadenas, agentes y RAG. |
| Backend | ChromaDB | `0.4.24` (`backend/requirements.txt:16`) | Vector store persistente. |
| Backend | Motor / PyMongo | `>=3.3` / `>=4.5` (`backend/requirements.txt:42-43`) | Cliente asincrono para MongoDB. |
| Backend | Redis (driver) | `>=5.0` (`backend/requirements.txt:44`) | Cache distribuida para respuestas y vectores. |
| Backend | Presidio Analyzer/Anonymizer | `>=2.2` (`backend/requirements.txt:23-24`) | Proteccion PII opcional. |
| Backend | Unstructured + OCR stack | varias (`backend/requirements.txt:28-38`) | Extraccion de texto desde PDFs e imagenes. |
| Backend | Prometheus client | `>=0.17` (`backend/requirements.txt:65`) | Exposicion de metricas. |
| Frontend | React 18 | `^18.2.0` (`frontend/package.json:64`) | Libreria de UI base. |
| Frontend | Chakra UI | `^2.8.2` (`frontend/package.json:15`) | Componentes estilizados para dashboard y chat. |
| Frontend | Tailwind CSS | `3.4.x` (`frontend/package.json:71`) | Utilidades de estilo y temas. |
| Frontend | fetch-event-source | `^2.0.1` (`frontend/package.json:18`) | Consumo SSE para streaming de respuestas. |
| Frontend | LangChain JS | `^0.3.25` (`frontend/package.json:58`) | Abstracciones para trazas y clientes web. |

### Servicios de Infraestructura Requeridos
| Servicio | Rol en la solucion | Notas de despliegue |
| --- | --- | --- |
| MongoDB | Persistir historiales de chat y configuraciones (`backend/database/mongodb.py:11`) | En AWS puede usar Atlas o DocumentDB; requiere red privada. |
| ChromaDB (filesystem) | Almacenar embeddings y metadatos (`backend/rag/vector_store/vector_store.py:21`) | Necesita disco persistente (EBS/EFS) replicable. |
| Redis (opcional) | Cachear respuestas y consultas (`backend/utils/chain_cache.py:52`) | Mejora latencia; si se omite se usa cache en memoria. |
| LLM Provider (OpenAI / Vertex / LlamaCPP) | Generar respuestas (`backend/models/model_types.py:1`) | Requiere credenciales segun proveedor elegido. |
| LangSmith (opcional) | Trazado y depuracion de cadenas (`backend/.env.example:19`) | SaaS de observabilidad; habilitar solo si se cargan claves. |
| Almacenamiento de PDFs | Guardar archivos fuente (`backend/storage/documents/pdf_manager.py:27`) | Para AWS considerar S3/EFS con montaje para FastAPI. |
| HuggingFace Hub | Descarga de modelo sentence-transformers (`backend/rag/embeddings/embedding_manager.py:12`) | Permitir salida a internet o cachear modelo en imagen. |

## Inventario de Configuracion

### Backend (`backend/.env`)
#### Nucleo y Seguridad
| Variable | Descripcion | Necesaria |
| --- | --- | --- |
| `HOST` | IP/interface para Uvicorn. | Si |
| `PORT` | Puerto expuesto por FastAPI. | Si |
| `WORKERS` | Cantidad de workers ASGI (cuando aplica). | Opcional |
| `ENVIRONMENT` | Entorno logico (`development`, `staging`, `production`). | Si |
| `DEBUG` | Activa modo debug y trazas verbosas. | Opcional |
| `LOG_LEVEL` | Nivel de log (DEBUG-CRITICAL). | Si |
| `LOG_FILE` | Archivo destino de logs. | Opcional |
| `LOG_FORMAT` | Formato de log personalizado. | Opcional |
| `API_KEY` | Token propio para proteger endpoints sensibles. | Recomendado |
| `JWT_SECRET` | Llave simetrica para JWT emitidos por la API. | Opcional |
| `JWT_ALGORITHM` | Algoritmo JWT (por defecto HS256). | Opcional |
| `CORS_ORIGINS` | Lista de origenes permitidos. | Si |
| `RATE_LIMIT` | Cupo maximo de peticiones segun politica interna. | Opcional |
| `SSL_KEYFILE` | Ruta a llave TLS si se termina SSL en la app. | Opcional |
| `SSL_CERTFILE` | Ruta a certificado TLS. | Opcional |

#### Modelos, Persistencia y Cache
| Variable | Descripcion | Necesaria |
| --- | --- | --- |
| `MODEL_TYPE` | Proveedor LLM (`OPENAI`, `VERTEX`, `LLAMA-CPP`). | Si |
| `OPENAI_API_KEY` | Credencial para OpenAI cuando `MODEL_TYPE=OPENAI`. | Depende |
| `BASE_MODEL_NAME` | Nombre del modelo LLM a invocar. | Si |
| `MAX_TOKENS` | Limite de tokens por respuesta. | Opcional |
| `TEMPERATURE` | Creatividad de generacion. | Opcional |
| `BOT_PERSONALITY_NAME` | Perfil predefinido de prompt. | Opcional |
| `SYSTEM_PROMPT` | Prompt base custom. | Opcional |
| `MAIN_PROMPT_NAME` | Plantilla principal a cargar. | Si |
| `AI_PREFIX` | Prefijo de rol para el asistente. | Opcional |
| `HUMAN_PREFIX` | Prefijo de rol para el usuario. | Opcional |
| `MONGO_URI` | Cadena de conexion a MongoDB. | Si |
| `MONGO_DATABASE_NAME` | Nombre de base de datos Mongo. | Si |
| `MONGO_COLLECTION_NAME` | Coleccion para historiales. | Si |
| `MONGO_MAX_POOL_SIZE` | Pool maximo de conexiones Mongo. | Opcional |
| `MONGO_TIMEOUT_MS` | Timeout de operaciones Mongo. | Opcional |
| `MEMORY_TYPE` | Estrategia de memoria (BASE, MONGO, CUSTOM). | Opcional |
| `MAX_MEMORY_ENTRIES` | Limite de mensajes retenidos en memoria. | Opcional |
| `REDIS_URL` | Endpoint Redis para cache distribuida. | Opcional |
| `REDIS_TTL` | Vida util del cache en segundos. | Opcional |
| `REDIS_MAX_MEMORY` | Politica de memoria para Redis remoto. | Opcional |
| `ENABLE_CACHE` | Activa/desactiva cache de LangChain. | Opcional |
| `CACHE_TTL` | TTL aplicado a respuestas cacheadas. | Opcional |
| `MAX_DOCUMENTS` | Numero maximo de documentos RAG por consulta. | Opcional |
| `CLEAR_VECTOR_STORE` | Si `true`, limpia embeddings al iniciar (`backend/main.py:66`). | Opcional |

#### RAG, Archivos y Observabilidad
| Variable | Descripcion | Necesaria |
| --- | --- | --- |
| `RAG_CHUNK_SIZE` | Longitud de fragmentos al dividir PDFs. | Opcional |
| `RAG_CHUNK_OVERLAP` | Solape entre fragmentos consecutivos. | Opcional |
| `MIN_CHUNK_LENGTH` | Longitud minima aceptada por chunk. | Opcional |
| `MAX_FILE_SIZE_MB` | Peso maximo permitido para subida de PDFs. | Si |
| `RETRIEVAL_K` | Numero base de documentos recuperados. | Opcional |
| `RETRIEVAL_K_MULTIPLIER` | Ajuste del fetch cuando se usa MMR. | Opcional |
| `MMR_LAMBDA_MULT` | Lambda para Maximal Marginal Relevance. | Opcional |
| `SIMILARITY_THRESHOLD` | Umbral minimo de similitud vectorial. | Opcional |
| `BATCH_SIZE` | Tamano de lote para ingestion RAG. | Opcional |
| `DEDUP_THRESHOLD` | Umbral de deduplicacion de chunks. | Opcional |
| `MAX_CONCURRENT_TASKS` | Paralelismo maximo en ingestion. | Opcional |
| `DISTANCE_STRATEGY` | Metodologia de distancia (cosine/euclidean). | Opcional |
| `EMBEDDING_BATCH_SIZE` | Tamano de lote al generar embeddings. | Opcional |
| `STORAGE_DIR` | Directorio raiz de almacenamiento interno. | Opcional |
| `DOCUMENTS_DIR` | Ruta para documentos procesados. | Opcional |
| `PDFS_DIR` | Carpeta de PDFs originales. | Si |
| `CACHE_DIR` | Carpeta de cache local. | Opcional |
| `TEMP_DIR` | Directorio temporal para procesos. | Opcional |
| `BACKUP_DIR` | Destino de respaldos de archivos. | Opcional |
| `ENABLE_ANONYMIZER` | Activa proteccion PII via Presidio. | Opcional |
| `ENABLE_METRICS` | Expone metricas Prometheus. | Opcional |
| `METRICS_PORT` | Puerto de metricas. | Opcional |
| `ENABLE_TRACING` | Activa traceo distribuido (OpenTelemetry). | Opcional |

Nota: el `.env` de ejemplo incluye claves heredadas como `MAX_CACHE_SIZE` o `VECTOR_STORE_*` que no estan modeladas en `backend/config.py:13`; validar si deben migrarse o eliminarse antes del despliegue.

### Frontend (`frontend/.env`)
| Variable | Descripcion | Necesaria |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | URL base para streaming SSE del chat. | Si |
| `NEXT_PUBLIC_API_URL` | URL del backend utilizada por servicios REST. | Si |
| `NEXT_PUBLIC_BACKEND_URL` | Prefijo especifico para rutas RAG y bot. | Si |
| `NEXT_PUBLIC_VITE_WIDGET_URL` | Ubicacion del widget embebible previo a deploy. | Opcional |

### Integraciones Opcionales
| Variable | Descripcion | Contexto |
| --- | --- | --- |
| `LANGCHAIN_TRACING_V2` | Activa trazas avanzadas de LangChain. | Declarada en plantillas (`backend/.env.example:19`, `frontend/.env.example:9`). |
| `LANGCHAIN_ENDPOINT` | Endpoint del servicio LangSmith. | Requiere suscripcion LangSmith. |
| `LANGCHAIN_API_KEY` | Credencial para LangSmith. | Guardar como secreto gestionado. |
| `LANGCHAIN_PROJECT` | Nombre del proyecto en LangSmith. | Util para agrupar runs. |
| `SERPAPI_API_KEY` | Llave para herramientas SERP en LangChain. | Necesaria solo si se habilita el tool de busqueda. |

Las credenciales sensibles encontradas en `backend/.env` deben rotarse y migrarse a un gestor de secretos antes de un despliegue en AWS.
