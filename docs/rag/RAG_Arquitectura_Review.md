# Revisión de Arquitectura RAG (Retrieval-Augmented Generation)

Este documento analiza la modularidad, mejores prácticas, eficiencia, trazabilidad y manejo de errores del sistema RAG en este repositorio, y propone un plan de PRs para mejorar de forma priorizada. Al final se incluyen pasos de prueba para verificar la conectividad del flujo.

## Resumen Ejecutivo
- La arquitectura RAG está bien modularizada: ingesta (`RAGIngestor` + `PDFContentLoader`), embeddings (`EmbeddingManager`), almacenamiento vectorial (`VectorStore`), recuperación (`RAGRetriever`) y generación (`ChainManager`/`Bot`).
- Se usan buenas prácticas modernas de LangChain (LCEL con `PromptTemplate` y `Runnable`), aunque la integración del RAG en la cadena es manual desde `ChatManager`.
- Hay optimizaciones claras: deduplicación de chunks basada en embeddings, caché en `VectorStore` (opcional Redis) y en `RAGRetriever`, MMR y reranking semántico.
- La observabilidad del contexto recuperado es razonable a nivel de logs y formateo de contexto, pero falta un canal explícito para inspeccionar, auditar y persistir trazas de recuperación por pregunta.
- El manejo de errores es robusto y generalmente “fail-soft”: fallback a vectores de ceros y continuidad sin RAG si no hay resultados, aunque conviene ajustar algunos fallbacks y dimensionalidad.

## Hallazgos (ordenados de más crítico a más bajo)

### Críticos
- Recuperación sin trazabilidad auditable por API:
  - `RAGRetriever.format_context_from_documents` crea un contexto, pero no expone en una respuesta serializable los detalles de cada chunk (score, `content_hash`, `source`, `chunk_type`, etc.).
  - `ChatManager.generate_response` no persiste ni devuelve un “trace” de recuperación. Esto dificulta validaciones posteriores y auditorías de relevancia.
- Cálculo de embeddings de documentos durante MMR y reranking:
  - En `_apply_mmr` y `_semantic_reranking` se re-calculan embeddings de documentos; `VectorStore._mmr_search` intenta leer `doc.metadata["embedding"]`, pero ese metadato no se guarda en la ingesta.
  - Esto añade coste innecesario y riesgo de inconsistencias de dimensión si cambian modelos.
- Uso directo de `Chroma._collection` y manejo de dummy:
  - Se interactúa con la API interna de Chroma (`_collection`) y se añaden/eliminan “dummy docs” para inicialización. Es frágil ante cambios internos.
  - Hay lógica de “get”/“delete” basada en metadatos que sería más segura usando métodos públicos de `Chroma` y/o filtros soportados oficialmente.

### Altos
- Fallback a vectores de ceros con dimensiones no garantizadas:
  - En `VectorStore._get_document_embedding` y `EmbeddingManager` se usan vectores de ceros si hay error, con dimensiones dependientes de `settings.default_embedding_dimension` o números fijos (p. ej., 384). Si embeddings provienen de OpenAI (`text-embedding-3-small` ~1536), se debe estandarizar la dimensión.
- Integración RAG → LLM fuera del grafo LCEL:
  - `ChainManager` usa LCEL (`PromptTemplate` | modelo), pero la inyección del contexto RAG ocurre en `ChatManager` mediante concatenación de strings.
  - Integrar el retriever como `Runnable` (p. ej., `RunnableLambda`) facilitaría trazado y pruebas, y haría más consistente el pipeline.
- Deduplicación durante ingesta costosa:
  - `_deduplicate_chunks` calcula embeddings de todos los chunks para deduplicar. Funciona pero puede optimizarse (LSH/simple hashing + similitud puntual) o hacerse incremental.

### Medios
- Cachés heterogéneos y TTLs:
  - `VectorStore` y `RAGRetriever` tienen cachés diferentes. Falta una política unificada de TTL y métricas de aciertos.
- Timeouts y límites razonables:
  - `RAGRetriever.retrieve_documents` limita `initial_k` y usa timeouts. Correcto, pero conviene configurar por `settings` y documentar supuestos de latencia.
- Logs informativos pero no estructurados:
  - Hay buenos logs, pero sería útil emitir objetos JSON con campos clave para trazabilidad automática.

### Bajos
- Calidad de chunk metadata:
  - `PDFContentLoader` añade metadata útil (`chunk_type`, `quality_score`, `word_count`…), excelente; se puede enriquecer con `page_number`, `document_id`.
- Validación de prompt/contexto en `ChainManager`:
  - Correcta. Se asegura de que `{context}` y `{history}` existan.
- Heurística de uso de RAG:
  - En `ChatManager`, evitar RAG en consultas muy cortas es práctico. Podría hacerse configurable (`min_words_for_rag`).

## Mejores Prácticas y LCEL
- Se usa LCEL en `core/chain.py` con `PromptTemplate` y `Runnable` (`self._prompt | self._base_model`). Correcto y actual.
- Sugerencia: encapsular el paso de recuperación como `Runnable` integrado al chain:
  - Crear `RunnableLambda` que, dado `{input}`, llame al retriever y devuelva `{context}` formateado junto a `{input}`.
  - El chain final quedaría algo como: `retrieve_context_runnable | prompt.partial(...) | llm`.
- Reducir uso de APIs internas de Chroma; preferir `similarity_search`, `max_marginal_relevance_search` cuando sea posible.

## Eficiencia
- Evitar recomputar embeddings en recuperación:
  - Persistir embeddings (o identificadores) en los metadatos durante la ingesta para reuso en MMR/reranking.
- Unificar dimensión de embeddings:
  - Definir `settings.embedding_dimension` consistente con el modelo de OpenAI y usarla para verificaciones y fallbacks.
- Optimizar deduplicación de chunks:
  - Combinar hashing (`content_hash`) con un umbral de similitud opcional (actualmente presente). Evaluar LSH si el volumen crece.

## Trazabilidad (Observability)
- Exponer trazas de recuperación por pregunta:
  - Nuevo endpoint (solo admin) para inspección: `GET /rag/last-retrieval?conversation_id=...` o `POST /rag/retrieve-debug` con `{query, k}`.
  - Responder con:
    - `query`, `k`, `retrieved`: lista con `{score, source, content_hash, chunk_type, word_count, preview}`.
    - `context`: string usado para el LLM.
    - `timings`: métricas de `PerformanceMetrics`.
- Persistir “retrieval_trace” opcional en Mongo por conversación y turno.
- Emitir logs JSON estructurados de las listas de chunks seleccionados.

## Manejo de Errores
- Cuando `vector_store.retrieve(...)` devuelve vacío, la cadena actual cae sin RAG, lo cual es correcto.
- Ajustes sugeridos:
  - Fallback de embeddings con dimensión uniforme y log de advertencia único por petición.
  - Manejar explícitamente mismatches de dimensión con métricas y conteo.
  - Separar “no hay documentos” de “error” en respuestas API con códigos y mensajes claros.

## Plan de PRs (orden sugerido)

1) Trazabilidad de Recuperación (Alta Prioridad)
- Crear función `retrieve_with_trace(query, k)` en `RAGRetriever` que devuelva documentos + metadatos clave (score, hash, source, tipo, word_count) y el contexto.
- Añadir endpoint admin `POST /rag/retrieve-debug` en `backend/api/routes/rag/rag_routes.py`.
- Opcional: Persistir `retrieval_trace` por conversación en Mongo.

2) Persistencia de Embeddings de Documentos (Alta Prioridad)
- En `RAGIngestor._add_batch_to_vector_store`, incluir `embedding` en `doc.metadata` antes de añadir al store.
- Ajustar `VectorStore.add_documents` para respetar (y no borrar) metadatos enriquecidos.
- En `RAGRetriever._apply_mmr/_semantic_reranking`, reutilizar `doc.metadata["embedding"]`.

3) Unificación de Dimensión y Fallbacks (Alta Prioridad)
- Agregar `settings.embedding_dimension` acorde al modelo OpenAI seleccionado.
- Usar esa dimensión en todos los fallbacks a ceros. Eliminar dimensiones fijas (384) y lecturas ambiguas.

4) Integración LCEL del RAG (Media)
- Crear `RunnableLambda` que obtenga `{context}` desde `RAGRetriever` y alimentarlo al `ChainManager`.
- Esto permitirá trazar el pipeline con `astream_log` y facilitar pruebas.

5) Uso de APIs Públicas de Chroma (Media)
- Reemplazar `_collection.get/add/delete` por métodos públicos (`add_texts`, `similarity_search_by_vector`, `max_marginal_relevance_search`) donde sea viable.
- Documentar filtros soportados y remover lógica de “dummy doc”.

6) Caché y Métricas Consolidadas (Media)
- Unificar TTLs y contadores de aciertos. Exponer `/rag/cache-stats` (admin) con métricas simples.

7) Test y Validación (Media)
- Añadir tests unitarios de: deduplicación, retrieve vacío, MMR fallback, trazabilidad (`retrieve-debug`).
- Incluir pruebas e2e usando `docs/scripts/e2e_rag_tests.ps1`.

## Pruebas Rápidas de Conectividad

- Backend corriendo: `uvicorn backend.main:app --reload` (o Docker compose según `docs/USO_DOCKER.md`).
- Health:
  - `GET http://localhost:8000/api/v1/health/health`
- Subir PDF (usa script existente):
  - Ejecutar `docs/scripts/e2e_rag_tests.ps1` (PowerShell) o:
  - `curl -s -X POST -F "file=@docs/scripts/sample.pdf" http://localhost:8000/api/v1/pdfs/upload`
- Listar PDFs:
  - `GET http://localhost:8000/api/v1/pdfs/list`
- Chat con stream y ver contexto RAG:
  - `curl -s -H "Content-Type: application/json" -d '{"input":"Prueba de RAG con OpenAI embeddings","conversation_id":null}' http://localhost:8000/api/v1/chat/stream_log`
- Estado RAG:
  - `GET http://localhost:8000/api/v1/rag/rag-status`
- (Tras implementar PR1) Depuración de recuperación:
  - `POST http://localhost:8000/api/v1/rag/retrieve-debug` con `{"query":"...","k":4}` y verificar el listado de chunks y scores.

---

Checklist de salud tras cambios:
- Se generan respuestas aunque no haya contexto RAG (fallback sano).
- Dimensiones de embeddings uniformes y saneadas en fallbacks.
- Trazas de recuperación disponibles por API y/o persistidas.
- Caches con TTL y métricas visibles.
- Tests básicos pasan y script E2E produce resultados coherentes.

## Estado de PRs

**PR 3 — Unificación de Dimensión y Fallbacks: COMPLETADO**

- Cambios aplicados:
  - Se unificó el fallback de dimensión de embeddings en `backend/rag/vector_store/vector_store.py` para usar `settings.default_embedding_dimension` de forma consistente.
  - Se eliminó la dimensión fija `384` y la lógica ad-hoc de “dummy embedding” para inferir dimensión, evitando incoherencias.
  - `EmbeddingManager` ya utilizaba `default_embedding_dimension`; se mantiene y consolida el criterio.

- Conexiones revisadas:
  - `EmbeddingManager` → devuelve listas con dimensión uniforme en fallbacks.
  - `VectorStore._get_document_embedding` → ahora retorna `np.zeros(dim)` usando la misma dimensión configurada.
  - `RAGRetriever` → funciona sin cambios; al usar embeddings del manager o del store, no hay mismatches de dimensión por fallbacks.

- Pequeña prueba de validación:
  1) Comprobar dimensión de fallback del gestor de embeddings (Python REPL):
     ```python
     from backend.rag.embeddings.embedding_manager import EmbeddingManager
     from backend.config import settings
     em = EmbeddingManager(settings.embedding_model)
     vec = em.embed_text("")  # texto vacío fuerza fallback
     assert len(vec) == settings.default_embedding_dimension, (len(vec), settings.default_embedding_dimension)
     print("OK: fallback embeddings dimension", len(vec))
     ```
  2) (Opcional) Forzar fallback en VectorStore creando una instancia con una función de embedding inválida para verificar longitud coherente:
     ```python
     import numpy as np
     from backend.rag.vector_store.vector_store import VectorStore
     from backend.config import settings

     class BadEmb:
         def embed_query(self, x):
             raise RuntimeError("forced error")

     vs = VectorStore(persist_directory=str(settings.vector_store_path), embedding_function=BadEmb())
     import asyncio
     emb = asyncio.run(vs._get_document_embedding("test"))
     assert isinstance(emb, np.ndarray) and emb.shape[0] == settings.default_embedding_dimension
     print("OK: vector_store fallback dimension", emb.shape)
     ```

- Resultado esperado:
  - Ambas pruebas deben imprimir “OK” y confirmar que la dimensión coincide con `DEFAULT_EMBEDDING_DIMENSION` (por defecto 1536).
-
**PR 1 — Trazabilidad de Recuperación: COMPLETADO**

- Cambios aplicados:
  - Nueva función `retrieve_with_trace` en `RAGRetriever` que retorna estructura auditable: `query`, `k`, `retrieved` (lista de items con `score`, `source`, `file_path`, `content_hash`, `chunk_type`, `word_count`, `preview`), `context` y `timings`.
  - Nuevo endpoint admin `POST /api/v1/rag/retrieve-debug` que expone la traza con modelos Pydantic (`RetrieveDebugRequest`, `RetrieveDebugItem`, `RetrieveDebugResponse`).
  - Manejo de errores robusto: en caso de fallo, responde estructura vacía sin afectar el runtime del sistema.

- Conexiones revisadas:
  - `api/app.py` ya inyecta `rag_retriever` en `app.state`; el endpoint lo usa directamente.
  - El endpoint vive en `backend/api/routes/rag/rag_routes.py`, módulo protegido por `AuthenticationMiddleware` (solo admin).
  - No se alteran flujos existentes de chat; la traza es complementaria y no intrusiva.

- Pequeña prueba de validación:
  - Unit test añadido `backend/tests/test_rag_retriever_trace.py` con doble dummy de `VectorStore` y `EmbeddingManager` para verificar estructura y campos claves, sin tocar dependencias reales.

- Uso rápido:
  - `POST http://localhost:8000/api/v1/rag/retrieve-debug` con body `{ "query": "...", "k": 4, "include_context": true }` y token admin.
  - Revisa `retrieved[]` para ver los chunks y `timings` para métricas.

**PR 2 — Persistencia de Embeddings de Documentos: COMPLETADO**

- Cambios aplicados:
  - `RAGIngestor._add_batch_to_vector_store`: persiste `embedding` en `doc.metadata` al añadir lotes y pasa los embeddings explícitos al `VectorStore`.
  - `RAGRetriever`: reutiliza `doc.metadata["embedding"]` en `_semantic_reranking` y `_apply_mmr` para evitar recomputación.
  - Compatibilidad: si no existe `embedding` en metadatos, se calcula con `EmbeddingManager` como fallback.

- Conexiones revisadas:
  - Ingesta → VectorStore: metadatos enriquecidos con `embedding` y embeddings por lote coherentes.
  - Recuperación → Reranking/MMR: preferencia por embeddings persistidos; fallback seguro cuando faltan.

- Pruebas de validación:
  - `backend/tests/test_ingestor_embedding_persistence.py` verifica persistencia en metadatos y paso de embeddings a `add_documents`.
  - Ejecutadas junto con `test_rag_retriever_trace.py` en Docker; ambas pasan.

- Resultado esperado:
  - Menor recomputación en recuperación y mejor rendimiento.
  - Menos posibilidades de mismatch de dimensión y mayor trazabilidad.