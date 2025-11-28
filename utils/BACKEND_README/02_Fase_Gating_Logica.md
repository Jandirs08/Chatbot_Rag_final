# 02 · Fase de Gating (Lógica de Activación RAG)

Este documento detalla el mecanismo de gating que decide si se activa RAG según la similitud de la query con el centroide del corpus.

- Archivos analizados: `rag/retrieval/retriever.py`, `core/bot.py`, `config.py`.
- Entorno relevante:
  - `RAG_GATING_SIMILARITY_THRESHOLD` → `settings.rag_gating_similarity_threshold` (default 0.45).

## Disparador: ¿Cuándo se llama `should_use_rag`?
- Ubicación: `core/bot.py` líneas ~120–170.
- Método: `async def get_context_async(self, user_input: str)`.
  - Flujo: antes de construir el prompt, evalúa `use_rag = await self.retriever.should_use_rag(user_input)` (líneas ~140–150).
  - Si `use_rag` es `False`, no recupera documentos; si es `True`, llama `retrieve_documents` y formatea contexto (líneas ~150–170).

## Lógica del Centroide

### Cálculo/recuperación del centroide
- Ubicación: `rag/retrieval/retriever.py`.
- Clase: `RAGRetriever` (líneas ~20–120 inicialización y utilidades).
- Método: `_ensure_centroid()` (líneas ~220–280).
  - Si `_centroid_embedding` está `None`:
    - Obtiene los vectores de la colección vía `client.scroll` con `with_vectors=True` (líneas ~235–250).
    - Prioriza el vector nativo de Qdrant: `p.vector`; como fallback usa `p.vectors` en escenarios multi-vector. Ya no se lee `payload["embedding"]`.
    - Suma componente a componente y divide por `N` para el promedio (líneas ~250–265).
    - Normaliza el vector resultante: `centroid = centroid / ||centroid||` (norma L2, líneas ~265–275).
    - Cachea en memoria `_centroid_embedding`.

### Fórmula: similitud coseno
- Método: `should_use_rag(query_text: str) -> bool` (líneas ~290–340).
- Pasos:
  1. `q = await embedding_manager.embed_query(query_text)` y normaliza a L2 (líneas ~300–310).
  2. `c = await self._ensure_centroid()` (línea ~312).
  3. `cos_sim = dot(q, c)` dado que ambos están normalizados (líneas ~315–325). Matemáticamente: `cos_sim = (q · c) / (||q|| * ||c||)`, pero al normalizar previamente, se reduce a `q · c`.

## Decisión: Threshold y efecto en flujo
- Comparación: `cos_sim >= self._gating_threshold` (líneas ~325–335).
  - `_gating_threshold` se inicializa en `__init__` con `settings.rag_gating_similarity_threshold` o por defecto `0.45` (líneas ~70–90).
- Retorno de `should_use_rag`:
  - Devuelve `True` si supera el umbral → el `Bot` activa RAG y llama `retrieve_documents`.
  - Devuelve `False` si no lo supera → el `Bot` no inyecta contexto de RAG y procede solo con conversación/LLM (líneas ~140–170 en `core/bot.py`).

## Métricas y tracing
- Decorador `@measure_time` en `retriever.py` perfila:
  - `query_processing`, `vector_retrieval`, `semantic_reranking`, `mmr_application`, `cache_operations` (clase `PerformanceMetrics`, líneas ~130–210).
- `retrieve_with_trace` retorna trazas detalladas con tiempos y lista de documentos (líneas ~350–420), útil para depurar gating + retrieval en conjunto.

---

## Puntos de verificación para debugging
- Verifique `_centroid_embedding` y reset vía `reset_centroid()` después de grandes cambios de corpus (líneas ~200–220).
- Ajuste `RAG_GATING_SIMILARITY_THRESHOLD` y registre `cos_sim` para calibrar activación.
- Confirme que `embed_query` devuelve dimensión correcta (`settings.default_embedding_dimension`). Si no, caerá en vector cero y `cos_sim` será 0.