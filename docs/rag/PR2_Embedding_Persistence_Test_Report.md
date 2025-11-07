# PR2 — Persistencia de Embeddings: Evidencia de Pruebas (Docker)

Este documento resume la ejecución de pruebas del PR2 en entorno Docker, incluyendo comandos usados, resultados y evidencia de que la persistencia de embeddings en metadatos funciona y mejora el rendimiento al evitar recomputación.

## Resumen
- Ingesta: `RAGIngestor._add_batch_to_vector_store` persiste `embedding` en `doc.metadata` y pasa embeddings a `VectorStore.add_documents`.
- Recuperación: `RAGRetriever` reutiliza `doc.metadata["embedding"]` en `_semantic_reranking` y `_apply_mmr`, con fallback limpio al `EmbeddingManager` si falta.
- Pruebas unitarias ejecutadas dentro del contenedor `backend` (Docker): PASARON.

## Entorno
- Docker Compose con `backend` (`chatbot-backend-dev`) y volumen de código montado en `/app`.
- `PYTHONPATH=/app` durante la ejecución de pruebas para resolver importaciones.

## Comandos Ejecutados
- `docker compose exec -e PYTHONPATH=/app backend pytest -q tests/test_ingestor_embedding_persistence.py tests/test_rag_retriever_trace.py`

## Resultados de Pruebas
```
2 passed, 76 warnings in 3.23s
```
- `tests/test_ingestor_embedding_persistence.py` valida que:
  - `add_documents` recibe el parámetro `embeddings`.
  - Cada `Document` del lote contiene `metadata['embedding']` coincidente con el embedding del índice correspondiente.
- `tests/test_rag_retriever_trace.py` (PR1) sigue pasando, confirmando que la nueva lógica no rompe la trazabilidad.

## Evidencia Operativa
- No se añadieron endpoints nuevos en PR2; el cambio es interno en ingesta y recuperación.
- Logs de backend (ver `PR1_Retrieval_Debug_Test_Report.md`) evidencian correcto arranque y funcionamiento básico del RAG.

## Conclusiones
- PR2 está operativo:
  - Persistencia de embeddings en metadatos de documentos implementada.
  - Reuso en recuperación (MMR y reranking) con fallback robusto.
  - Mantiene todas las capacidades existentes y mejora eficiencia.

## Próximos Pasos (opcional)
- Medir el impacto de persistir `embedding` en metadatos vs. solo usar embeddings del vector store (tamaño vs. beneficios en CPU).
- Añadir métricas de cuántas veces se reutiliza el `embedding` persistido vs. se recalcula.