🚀 Plan de Migración: Embeddings a OpenAI

1. Resumen del Objetivo

- Problema: El backend de FastAPI (con LangChain) está demasiado pesado para el plan gratuito de Render debido a dependencias de embeddings locales (p. ej., `sentence-transformers`, que arrastra paquetes grandes como `torch` y `transformers`). Esto impacta el tamaño de la build, el consumo de RAM al inicio y la velocidad de deploy.
- Objetivo: Migrar la lógica de generación de embeddings del modelo local a la API de OpenAI usando `langchain-openai` con el modelo `text-embedding-3-small`. Mantener exactamente la funcionalidad actual del RAG (ingesta, búsqueda por similitud y generación de respuestas), reduciendo la huella de dependencias y el consumo de recursos.

2. Análisis del Flujo Actual

Archivos donde se inicializa/usa el modelo de embeddings:
- `backend/rag/embeddings/embedding_manager.py`
  - Inicializa embeddings con dos modos:
    - Local: carga perezosa de `SentenceTransformer` (modelo por defecto `all-MiniLM-L6-v2`).
    - OpenAI: si el nombre del modelo empieza por `openai:`, usa `OpenAIEmbeddings` de `langchain-openai`.
  - Funciones clave:
    - `embed_documents(texts: List[str]) -> List[List[float]]`: genera embeddings para lotes de textos.
    - `embed_query(query: str) -> List[float]`: genera embedding para consultas.
    - `async embed_text(text: str) -> List[float]`: helper async usado para pings y verificaciones, delega en `embed_query`.
    - `get_embedding_model()`: devuelve el objeto del proveedor (OpenAI o `SentenceTransformer`).

- `backend/api/app.py`
  - Instancia `EmbeddingManager(model_name=settings.embedding_model)` en el arranque y lo inyecta en `VectorStore`, `RAGIngestor` y `RAGRetriever`.
  - Hace un ping ligero de embeddings con `await app.state.embedding_manager.embed_text("ping")`.
  - Ajusta niveles de log para `sentence_transformers` y `transformers` (ruido de librerías locales).

- `backend/rag/ingestion/ingestor.py`
  - Usa `self.embedding_manager.embed_documents(chunk_texts)` en `_deduplicate_chunks` para eliminar duplicados por similitud antes de indexar.
  - Agrega documentos y, si están disponibles, embeddings precomputados al `VectorStore` por lotes.
  - Funciones clave que dependen de embeddings:
    - `ingest_single_pdf(...)`
    - `_deduplicate_chunks(chunks, return_embeddings=True)` (deduplicación con embeddings).
    - `_add_batch_to_vector_store(...)` (agregado con embeddings opcionales).

- `backend/rag/vector_store/vector_store.py`
  - Inicializa `Chroma` como almacenamiento vectorial con `embedding_function=self.embedding_function` (inyectado, puede ser `EmbeddingManager`).
  - Calcula embeddings de documentos puntualmente si no están en metadatos:
    - `_get_document_embedding(content: str) -> np.ndarray` usando `embed_query` o `encode` según disponibilidad.
  - Búsqueda por similitud en Chroma vía `similarity_search_by_vector_with_relevance_scores` usando el embedding de la consulta.
  - Funciones clave:
    - `_initialize_store()` (configuración y documento dummy opcional).
    - `_get_document_embedding(...)`.
    - `_similarity_search(query_embedding, k, filter)`.
    - `_mmr_search(...)` (aplica MMR sobre resultados iniciales).

- `backend/rag/retrieval/retriever.py`
  - Usa `self.embedding_manager.embed_query(...)` en:
    - `_semantic_reranking(query, docs)`: reordena candidatos por similitud (coseno) + señales.
    - `_apply_mmr(query, docs, k, lambda_mult)`: diversidad de resultados mediante MMR.
  - Importa `HuggingFaceEmbeddings` pero no instancia (resto de código se apoya en `EmbeddingManager`).

- `backend/config.py`
  - Configuración del modelo de embeddings: `embedding_model` por defecto `sentence-transformers/all-MiniLM-L6-v2` y `default_embedding_dimension`=384 (usado en fallbacks).

3. Plan de Acción (Formato To-Do List)

[ ] Tarea 1: Refactorizar Lógica de Embeddings

- Archivo(s) a modificar: 
  - `backend/rag/embeddings/embedding_manager.py`
  - `backend/config.py`
  - `backend/api/app.py` (solo ajustes de configuración/logs si aplica)

- Acción: Reemplazar la instanciación de `SentenceTransformer`/modo local por `OpenAIEmbeddings` de `langchain-openai` como modo por defecto.
  - Usar `OpenAIEmbeddings(model="text-embedding-3-small")`.
  - Mantener la API de `EmbeddingManager` (`embed_documents`, `embed_query`, `embed_text`) para no romper flujos de ingesta/retrieval.
  - Actualizar `settings.embedding_model` a un valor con prefijo `openai:` (p. ej., `openai:text-embedding-3-small`) para seleccionar el proveedor sin tocar más código.
  - Ajustar dimensiones por defecto para fallbacks a `settings.default_embedding_dimension = 1536` (coincide con `text-embedding-3-small`).

- Nota: Gestionar `OPENAI_API_KEY` a través de variables de entorno.
  - Validar en el arranque que `settings.openai_api_key` está presente cuando `settings.model_type == "OPENAI"` (ya existe validación).
  - Documentar el uso de `EMBEDDING_MODEL=openai:text-embedding-3-small` en `.env`/Render.

[ ] Tarea 2: Análisis y Limpieza de Dependencias

- Archivo a modificar: `backend/requirements.txt`

- Acción: Analizar librerías usadas únicamente por el modelo de embeddings local y eliminar.
  - Candidatas a eliminar y justificación:
    - `sentence-transformers`: solo se usa para `SentenceTransformer` en `EmbeddingManager`. Quitarla elimina su cadena de dependencias pesadas.
    - `langchain-huggingface`: importada pero no instanciada/usable en el flujo actual; mantenerla arrastra `transformers` y `torch` indirectamente. Quitarla reduce tamaño.
    - Indirectas removidas al quitar las anteriores: `transformers`, `torch`, `scipy` (típicamente arrastradas por `sentence-transformers`/`huggingface`).

- Acción: Asegurar dependencias necesarias para OpenAI.
  - Mantener `langchain-openai`.
  - Añadir explícitamente `openai>=1.x` (cliente oficial) para asegurar compatibilidad en runtime con `langchain-openai`.
  - Mantener `tiktoken`.

- Acción: Revisar referencias de logs a librerías locales.
  - Opcional: eliminar/ajustar en `api/app.py` los `logging.getLogger("sentence_transformers"|"transformers")` si ya no están presentes para evitar ruido innecesario.

[ ] Tarea 3: Configuración de Entorno

- Acción: Añadir `OPENAI_API_KEY` a las variables de entorno en Render y local (`.env`).
  - `OPENAI_API_KEY=<tu_api_key>`
  - `EMBEDDING_MODEL=openai:text-embedding-3-small`
  - `DEFAULT_EMBEDDING_DIMENSION=1536`
  - Mantener el resto de configuración de RAG (directorios, batch size, etc.).

[ ] Tarea 4: Verificación y Pruebas Locales

- Acción: Ejecutar el backend localmente después de los cambios.
  - Comandos sugeridos:
    - Activar entorno y deps: `cd backend && pip install -r requirements.txt`
    - Lanzar API: `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`

- Acción: Prueba End-to-End para confirmar funcionalidad principal.
  - Probar endpoint de “subir documento” (nueva indexación con OpenAI):
    - `POST /api/v1/pdfs/upload` con `multipart/form-data` (`file`=PDF), espera `200` y mensaje de procesamiento en segundo plano.
    - Confirmar listados: `GET /api/v1/pdfs/list`.
  - Probar endpoint de “chat” (búsqueda por similitud + respuesta):
    - `POST /api/v1/chat/stream_log` con JSON `{ "input": "Pregunta basada en el PDF" }`.
    - Verificar que responde y que usa contexto del documento (retrieval correcto).
  - Validar métricas básicas:
    - Arranque sin descargar modelos locales.
    - Sin picos de RAM inicial por `torch/transformers`.

4. Beneficios y Resultados Esperados

- Reducción de Tamaño:
  - Quitar `sentence-transformers` y `langchain-huggingface` elimina cadenas de dependencias muy pesadas (`torch`, `transformers`, `scipy`).
  - Reducción estimada de la build: cientos de MB (en muchos entornos, entre ~500 MB y >1 GB), lo cual es crítico para límites de Render Free.

- Consumo de RAM:
  - Elimina la carga de modelos locales en el arranque; la RAM inicial baja drásticamente (ahorro típico de cientos de MB).
  - El uso de `OpenAIEmbeddings` es remoto y ligero; mantiene la memoria estable.

- Velocidad de Deploy:
  - Menos paquetes para descargar/compilar -> deploys mucho más rápidos y menos fallos por timeouts.

- Mantenibilidad:
  - Simplifica el código: se conserva una única ruta de embeddings (OpenAI) manteniendo la misma interfaz (`EmbeddingManager`).
  - Se reduce la complejidad de carga perezosa y handling de fallback de modelos locales.

Notas finales:
- La migración propuesta no cambia el flujo RAG: la ingesta sigue generando embeddings y almacenando en Chroma; el retrieval continúa calculando el embedding de consulta y usando búsqueda por similitud + MMR y reranking semántico.
- Alinear la dimensión por defecto con el modelo (`1536` para `text-embedding-3-small`) evita inconsistencias en fallbacks y comparaciones.

5. Impacto en Código y Archivos (Reducción estimada)

- `backend/rag/embeddings/embedding_manager.py`
  - Supresión de la rama local `SentenceTransformer` (carga perezosa y uso): ≈ 30–40 líneas menos.
    - `_load_st` y variable `_ST`: ≈ 8 líneas.
    - Rama `SentenceTransformer` en `__init__`: ≈ 3–4 líneas.
    - Rama local en `embed_documents(...)`: ≈ 10–12 líneas.
    - Rama local en `embed_query(...)`: ≈ 8 líneas.
    - Parte de `get_embedding_model()` que carga ST: ≈ 3–4 líneas.
- `backend/api/app.py`
  - Remover ajustes de logging específicos de `sentence_transformers`/`transformers`: 2–3 líneas.
- `backend/rag/retrieval/retriever.py`
  - Eliminar import no utilizado `from langchain_huggingface import HuggingFaceEmbeddings`: 1 línea.
- `backend/requirements.txt`
  - Eliminar: `sentence-transformers`, `langchain-huggingface` (2 líneas menos).
  - Añadir: `openai>=1.x` (1 línea más). Neto: −1 línea.
- Archivos eliminados: ninguno (se mantiene la arquitectura, solo se simplifica la ruta de embeddings).

Total estimado de reducción en código: ≈ 35–50 líneas.