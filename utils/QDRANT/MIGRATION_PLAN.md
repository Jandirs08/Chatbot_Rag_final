# Plan de Migración "Rip and Replace" — ChromaDB a Qdrant

## Objetivo
- Sustituir completamente ChromaDB por Qdrant en el backend RAG, eliminando dependencias, código y variables de entorno de Chroma.
- Hacer la configuración agnóstica al entorno: local (Docker) y producción (Qdrant Cloud) usando `QDRANT_URL` y `QDRANT_API_KEY`.

## Alcance y Supuestos
- No hay datos a migrar: la colección puede arrancar vacía.
- Se acepta reinicio del servidor: no se requiere zero‑downtime.
- Eliminación total de Chroma: limpieza de dependencias, código, rutas y telemetría.

## Cambios en Dependencias
- Remover en `backend/requirements.txt`:
  - `langchain-chroma` (línea `backend/requirements.txt:13`)
  - `chromadb` (línea `backend/requirements.txt:15`)
- Mantener `langchain-community` (provee integración Qdrant en versiones recientes) o añadir explícita:
  - `qdrant-client>=1.7.0`
  - (Opcional) `langchain-qdrant` si se desea wrapper dedicado; con `langchain-community==0.0.36` suele estar disponible `Qdrant`.

## Variables de Entorno (agnóstico a entorno)
- Añadir en `backend/.env`:
  - `QDRANT_URL` (local: `http://localhost:6333`; prod: endpoint de Qdrant Cloud)
  - `QDRANT_API_KEY` (vacío en local; usar API key en prod)
- Eliminar o ignorar `VECTOR_STORE_PATH` (actualmente `backend/.env:72`). Qdrant no persiste en disco de la app.
- Eliminar `CHROMA_TELEMETRY_ENABLED` en el arranque (`backend/api/app.py:100-104`).

## Docker (entorno local)
- Añadir servicio Qdrant en `docker-compose.yml` y enrutar backend:

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: chatbot-qdrant-dev
    restart: unless-stopped
    ports:
      - "6333:6333" # HTTP
      - "6334:6334" # gRPC
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - chatbot-network

  backend:
    environment:
      - QDRANT_URL=http://qdrant:6333
      - QDRANT_API_KEY=
      # ... resto de variables

volumes:
  qdrant_data:
    name: chatbot-qdrant-data
```

- En producción (Qdrant Cloud): usar `QDRANT_URL` y `QDRANT_API_KEY` propios; no se despliega el servicio Qdrant.

## Refactor de Código (por archivo)

### 1) Vector Store
- Archivo: `backend/rag/vector_store/vector_store.py`
- Eliminaciones/ajustes:
  - Cambiar import `Chroma` por `Qdrant` y `QdrantClient`:
    - Remover `from langchain_community.vectorstores import Chroma` (`backend/rag/vector_store/vector_store.py:24`).
    - Añadir `from qdrant_client import QdrantClient` y (opcional) `from langchain_community.vectorstores import Qdrant`.
  - Eliminar lógica de `sqlite3`/persistencia local y prechequeos (`backend/rag/vector_store/vector_store.py:85-163, 165-242`).
  - Reemplazar `self.store._collection.add/get/count/delete` por llamadas Qdrant:
    - Ingesta: `client.upsert(collection_name, points=[PointStruct(id, vector, payload)])`.
    - Borrado: `client.delete(collection_name, points_selector=...)` con filtros por `payload`.
    - Conteo: usar `client.scroll(..., limit=0, with_payload=False, with_vectors=False)` o mantener tamaño vía metadatos.
    - Búsqueda: `client.search(collection_name, vector=query_embedding, limit=k, filter=Filter(...))`.
- Inicialización sugerida (pseudo‑código):

```python
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, OptimizersConfigDiff, HnswConfigDiff

class VectorStore:
    def __init__(..., embedding_function: Any, ...):
        self.client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
        dim = settings.default_embedding_dimension
        collection = "rag_collection"
        if collection not in [c.name for c in self.client.get_collections().collections]:
            self.client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
                hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
                optimizers_config=OptimizersConfigDiff(default_segment_number=1)
            )
```

- Operaciones de añadir/buscar (mapeo de metadatos):

```python
from qdrant_client.http.models import PointStruct, Filter, FieldCondition, MatchValue

def add_documents(self, docs, embeddings=None):
    points = []
    for i, doc in enumerate(docs):
        vec = embeddings[i] if embeddings else self._get_document_embedding(doc.page_content).tolist()
        points.append(PointStruct(id=str(uuid.uuid4()), vector=vec, payload=doc.metadata | {"text": doc.page_content}))
    self.client.upsert(collection_name="rag_collection", points=points)

def retrieve(self, query, k, filter=None, use_mmr=False):
    qvec = self.embedding_function.embed_query(query)
    qfilter = None
    if filter:
        must = [FieldCondition(key=k, match=MatchValue(v)) for k, v in filter.items()]
        from qdrant_client.http.models import Filter as QFilter
        qfilter = QFilter(must=must)
    results = self.client.search(collection_name="rag_collection", query_vector=qvec, limit=k, filter=qfilter)
    return [Document(page_content=r.payload.get("text"), metadata=r.payload | {"score": r.score}) for r in results]
```

### 2) Ingesta RAG
- Archivo: `backend/rag/ingestion/ingestor.py`
- Ajustar verificación de “ya procesado” para Qdrant:
  - Reemplazar `collection.get(where={"source": pdf_path.name})` (`backend/rag/ingestion/ingestor.py:145-147`) por `client.search` con `filter=FieldCondition(key="source", match=MatchValue(pdf_path.name))` y `limit=1`.
- Mantener limpieza de metadatos básicos (strings/números) antes de upsert.

### 3) Recuperación RAG
- Archivo: `backend/rag/retrieval/retriever.py`
- No requiere grandes cambios si `VectorStore.retrieve(...)` devuelve `List[Document]` como hoy.
- Verificar que `lambda use_mmr` permanezca en el retriever (MMR y reranking se conservan).

### 4) Arranque de la App
- Archivo: `backend/api/app.py`
  - Eliminar `CHROMA_TELEMETRY_ENABLED` (`backend/api/app.py:100-104`).
  - `VectorStore` ya no necesita `persist_directory`; cambiar inicialización para usar Qdrant y dimensión del embedding:
    - Bloque `VectorStore(...)` (`backend/api/app.py:142-151`): pasar `embedding_function`, `distance_strategy`, `cache_enabled/cache_ttl/batch_size` y que internamente construya `QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)`.

### 5) Configuración
- Archivo: `backend/config.py`
  - Añadir campos:
    - `qdrant_url: str = Field(default="http://localhost:6333", env="QDRANT_URL")`
    - `qdrant_api_key: Optional[SecretStr] = Field(default=None, env="QDRANT_API_KEY")`
  - Mantener `default_embedding_dimension` (`backend/config.py:116-120 aprox.`) para crear la colección con tamaño correcto.
  - Deprecate `vector_store_path` (`backend/config.py:104`) y actualizar README.

## Limpieza de Chroma (código y runtime)
- Remover imports y uso de `Chroma` y `_collection`:
  - `backend/rag/vector_store/vector_store.py:24, 85-242, 268-279, 569-600, 734-763`.
- Eliminar carpeta de persistencia local:
  - `backend/storage/vector_store/chroma_db/` del runtime y cualquier referencia en README (`backend/README.md:34-42, 75-104`).
- Quitar bloque de telemetría Chroma en arranque (`backend/api/app.py:100-104`).

## Pruebas y Validación
- Local (Docker):
  - Levantar `docker-compose` con Qdrant incluido.
  - Verificar creación automática de colección `rag_collection`.
  - Ejecutar ingesta de PDFs y consultar:
    - `POST /api/v1/rag/ingest` sobre PDFs de `backend/storage/documents/pdfs`.
    - `POST /api/v1/chat/ask` con preguntas para validar recuperación.
- Producción (Qdrant Cloud):
  - Configurar `QDRANT_URL` y `QDRANT_API_KEY`.
  - Verificar que la colección se cree con `size=default_embedding_dimension` y `distance=cosine`.

## Checklist de Cambios
- Dependencias:
  - [ ] Eliminar `langchain-chroma` y `chromadb`.
  - [ ] Añadir `qdrant-client` (y opcional `langchain-qdrant`).
- Entorno:
  - [ ] Añadir `QDRANT_URL` y `QDRANT_API_KEY` a `.env`.
  - [ ] Quitar referencias a `VECTOR_STORE_PATH` si no se usa.
- Docker:
  - [ ] Añadir servicio `qdrant` en `docker-compose.yml`.
  - [ ] Exportar `QDRANT_URL=http://qdrant:6333` en el `backend`.
- Código:
  - [ ] Refactor de `VectorStore` para usar `QdrantClient`.
  - [ ] Ajustar `Ingestor` para “ya procesado” con filtros Qdrant.
  - [ ] Eliminar telemetría y persistencia de Chroma en `app.py`.
  - [ ] Actualizar `config.py` con `qdrant_url` y `qdrant_api_key`.
- Documentación/README:
  - [ ] Sustituir menciones a “Chroma” por “Qdrant”.

## Notas de Diseño
- Distancia: mantener `cosine` para compatibilidad con `text-embedding-3-small` (1536 dims).
- Payload: incluir `text` y metadatos limpios; evitar tipos complejos.
- Filtros: mapear `where` (Chroma) a `Filter` Qdrant con `FieldCondition/MatchValue`.
- HNSW: configurar `M=16`, `ef_construct=200`, `search_ef` vía `client.search` con `limit`; `ef` puede ajustarse si se expone.

## Rollback (si fuera necesario)
- Reinstalar `langchain-chroma` y `chromadb`.
- Restaurar `VectorStore` original y `VECTOR_STORE_PATH`.
- Quitar `qdrant-client` y servicio Qdrant de `docker-compose`.

---

Referencias de código citadas:
- `backend/requirements.txt:13-16`
- `backend/.env:72`
- `backend/api/app.py:100-104`, `backend/api/app.py:142-151`
- `backend/rag/vector_store/vector_store.py:24`, `backend/rag/vector_store/vector_store.py:85-163`, `backend/rag/vector_store/vector_store.py:165-242`, `backend/rag/vector_store/vector_store.py:268-279`, `backend/rag/vector_store/vector_store.py:569-600`, `backend/rag/vector_store/vector_store.py:734-763`
- `backend/rag/ingestion/ingestor.py:145-147`
- `backend/config.py:104`, `backend/config.py:116-130`
- `backend/README.md:34-42, 75-104`

## Plan por Fases (PRs de inicio a fin)

### PR0 — Preparación y rastreo
- Crear rama `feat/migrate-qdrant` y issue de seguimiento.
- Acordar dimensiones de embedding (`1536`) y distancia (`cosine`).
- Criterios de aceptación:
  - Rama y issue creados; plan aprobado.
- Rollback: N/A.

### PR1 — Dependencias y entorno base
- `backend/requirements.txt`: eliminar `langchain-chroma`, `chromadb`; añadir `qdrant-client`.
- `backend/config.py`: añadir `qdrant_url`, `qdrant_api_key`.
- `backend/.env`: añadir `QDRANT_URL`, `QDRANT_API_KEY` (vacío en local).
- Criterios de aceptación:
  - Build de backend correcto; imports de `qdrant_client` válidos.
- Rollback:
  - Revertir archivo de requisitos; quitar campos nuevos en `config.py` y `.env`.

### PR2 — Infra local (Docker) con Qdrant
- `docker-compose.yml`: añadir servicio `qdrant` con puerto `6333`, volumen `qdrant_data`.
- `backend` service: inyectar `QDRANT_URL=http://qdrant:6333`.
- Criterios de aceptación:
  - `docker compose up` levanta Qdrant y backend; Qdrant responde `GET /ready`.
- Rollback:
  - Eliminar servicio `qdrant` y variables asociadas.

### PR3 — Refactor de `VectorStore` (Chroma → Qdrant)
- `backend/rag/vector_store/vector_store.py`:
  - Sustituir import y inicialización a `QdrantClient`.
  - Crear colección `rag_collection` si no existe con `size=1536` y `Distance.COSINE`.
  - Implementar `add_documents`, `delete_documents`, `retrieve` usando `upsert/search/delete` de Qdrant.
  - Eliminar toda lógica de `sqlite3`, `_collection`, persistencia en disco y telemetría.
- Criterios de aceptación:
  - Ingesta y búsqueda básicas funcionan con Qdrant; sin errores de import.
- Rollback:
  - Revertir archivo al uso de `Chroma`.

### PR4 — Ajustes en Ingesta y comprobación “ya procesado”
- `backend/rag/ingestion/ingestor.py`:
  - Reemplazar `collection.get(where={"source": ...})` por `search` con `Filter(FieldCondition("source"==...))` `limit=1`.
  - Mantener limpieza de metadatos y batching.
- Criterios de aceptación:
  - PDFs re‑ingestados reemplazan fragmentos según `content_hash`; no se duplican.
- Rollback:
  - Volver a la comprobación basada en Chroma.

### PR5 — Arranque de app y limpieza de Chroma
- `backend/api/app.py`:
  - Eliminar `CHROMA_TELEMETRY_ENABLED` y cualquier referencia a `persist_directory` del store.
- `backend/README.md`: actualizar diagramas y rutas, quitar `chroma_db`.
- Borrar en runtime la carpeta `backend/storage/vector_store/chroma_db/` si existiera.
- Criterios de aceptación:
  - Arranque sin warnings/telemetría de Chroma; logs limpios.
- Rollback:
  - Revertir cambios y restaurar documentación.

### PR6 — Pruebas de integración y endpoints
- Probar `POST /api/v1/rag/ingest` con PDFs de `backend/storage/documents/pdfs`.
- Probar `POST /api/v1/chat/ask` y `GET /api/v1/rag/trace` para validación de recuperación y trazas.
- Añadir tests básicos si el proyecto ya usa `pytest` (`backend/requirements.txt:59-65`).
- Criterios de aceptación:
  - Recuperación coherente con filtros; latencias aceptables.
- Rollback:
  - Revertir PR y mantener endpoints actuales con fallback.

### PR7 — Producción (Qdrant Cloud)
- Configurar `QDRANT_URL` y `QDRANT_API_KEY` de Cloud en el entorno de despliegue.
- Validar creación/uso de `rag_collection` con `size=1536` y `cosine`.
- Ejecutar smoke tests de ingesta y búsqueda.
- Criterios de aceptación:
  - Conectividad estable; ingesta y consultas OK; sin errores 401/403.
- Rollback:
  - Revertir a configuración local o restablecer Chroma temporalmente.

### PR8 — Post‑migración y endurecimiento
- Revisar que no queden rutas, flags o dependencias de Chroma.
- Documentar configuración final y límites conocidos.
- Opcional: exponer `search_ef`/`filters` avanzados y tuning.
- Criterios de aceptación:
  - Codebase sin referencias a Chroma; Qdrant documentado.
- Rollback:
  - N/A (cierre del ciclo).

## Flujo sugerido de despliegue
- Merge secuencial PR1→PR2→PR3→PR4→PR5→PR6 en entorno dev.
- Verificación QA en dev, luego PR7 para producción.
- Cierre con PR8 y etiqueta de release.