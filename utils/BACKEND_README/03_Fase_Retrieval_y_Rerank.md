# 03 · Fase de Retrieval y Rerank

Este documento describe cómo se transforma la query del usuario, cómo se realizan las búsquedas en Qdrant, y cómo se aplican los algoritmos de refinamiento (MMR y semantic reranking) incluyendo thresholds.

- Archivos analizados: `rag/retrieval/retriever.py`, `rag/vector_store/vector_store.py`, `config.py`.
- Entorno relevante:
  - `RETRIEVAL_K`, `RETRIEVAL_K_MULTIPLIER`, `MMR_LAMBDA_MULT`, `SIMILARITY_THRESHOLD`, `PDF_PRIORITY_FACTOR` (si existe en `settings`).

## Query Transformation
- Ubicación: `rag/retrieval/retriever.py` líneas ~360–430.
- Método: `retrieve_documents(query_text: str, initial_k: int = None)`.
- Transformaciones:
  - Embedding de la query: `embed_query(query_text)` con normalización L2 (líneas ~370–385).
  - No se reescribe la query textual; se opera sobre su embedding.
  - Detección de consulta trivial: si `len(query_text.strip()) < 2`, retorna vacío (líneas ~365–370).

## Vector Search (Qdrant)
- Parámetros de tamaño:
  - `initial_k = settings.retrieval_k * settings.retrieval_k_multiplier` si no se proporciona (líneas ~385–395).
- Búsqueda inicial:
  - Usa `vector_store.search(query_embedding, limit=initial_k, score_threshold=settings.similarity_threshold)` (líneas ~395–410).
- Filtros de metadata en la query:
  - Si hay filtros, se pasan como `QFilter` (ej. por `source` o `pdf_hash`) desde `vector_store.search` (ver `rag/vector_store/vector_store.py` líneas ~210–260). Por defecto, no aplica filtros adicionales.
- `vector_store.search` en Qdrant:
  - `client.search(collection_name="rag_collection", query_vector=query_embedding, limit=limit, score_threshold=threshold, with_payload=True)` (líneas ~230–260).
  - Retorna `List[ScoredPoint]` con `payload` y `score`.

## Algoritmos de Refinamiento

### Semantic Reranking
- Método: `_semantic_reranking(query_embedding, candidates)` (líneas ~430–520 en `retriever.py`).
- Score compuesto:
  - `semantic_similarity` (cosine) contra cada candidato.
  - `quality_score` (metadata de chunk).
  - `length_score` (basado en `word_count`/`char_count`).
  - `content_type_score` (`_get_content_type_score(chunk_type)`; headers/listas/paragraphs ponderados).
  - `pdf_priority_factor` si el `source` termina en `.pdf` (configurable en `settings`, líneas ~60–90 si presente).
- `final_score = w_sem*semantic + w_quality*quality + w_length*length + w_type*type + w_pdf*pdf_factor` (ponderaciones internas, líneas ~460–500).
- Ordena descendente por `final_score` y corta a `settings.retrieval_k` (líneas ~500–520).

### MMR (Maximal Marginal Relevance)
- Método: `_apply_mmr(query_embedding, candidates, lambda_mult=settings.mmr_lambda_mult)` (líneas ~520–620).
- Selección iterativa:
  - Relevancia: similitud con query.
  - Diversidad: penaliza similitud con seleccionados.
  - Fórmula: `score = lambda*sim(query, doc) - (1-lambda)*max(sim(doc, selected))`.
  - `MMR_LAMBDA_MULT` controla el trade-off: valores altos → más relevancia, bajos → más diversidad.
- Devuelve `top_k` documentos equilibrados en diversidad y relevancia.

### Thresholding de Similaridad
- Parámetro: `SIMILARITY_THRESHOLD` (en `settings`) pasado al `vector_store.search`.
- Efecto: Qdrant filtra resultados con `score` (cosine sim) por debajo del umbral antes de cualquier reranking.

## Salida: Estructura de `Documents`
- Cada documento retornado por `retrieve_documents` contiene:
  - `content`: `doc.page_content` (texto del chunk) o `payload['text']` si se trabaja desde `ScoredPoint`.
  - `metadata`: diccionario enriquecido desde `payload` del vector store:
    - `source`, `file_path`, `chunk_type`, `content_hash`, `quality_score`, `word_count`, `char_count`, `page_number`, `pdf_hash`.
  - `score`: sim inicial de Qdrant y/o `final_score` tras reranking (líneas ~430–520).

---

## Checks útiles de debugging
- Log de `PerformanceMetrics` para tiempos de `vector_retrieval`, `semantic_reranking`, `mmr_application` (líneas ~130–210 en `retriever.py`).
- Confirme `initial_k` vs `retrieval_k` tras reranking para cortes correctos.
- Verifique que `MMR_LAMBDA_MULT` no esté en extremos (0 o 1) que afecten excesivamente diversidad/relevancia.