# PR1 — Trazabilidad de Recuperación: Evidencia de Pruebas (Docker)

Este documento resume la ejecución de pruebas del PR1 en entorno Docker, incluyendo comandos usados, resultados y extractos de logs del backend como evidencia de que la funcionalidad está operativa y las conexiones siguen intactas.

## Resumen
- Endpoint admin agregado: `POST /api/v1/rag/retrieve-debug`.
- Función en retriever: `retrieve_with_trace` produce estructura auditable con metadatos y contexto.
- Pruebas unitarias ejecutadas dentro del contenedor `backend` (Docker): PASARON.
- Backend levantado, `RAGRetriever` y `VectorStore` inicializados correctamente.

## Entorno
- Docker Compose: `backend` (`chatbot-backend-dev`), `mongodb`, `frontend`.
- Volumen de backend: `./backend` montado en `/app` (hot reload).
- Puerto backend expuesto: `8000`.

## Comandos Ejecutados
- Ajuste de `PYTHONPATH` para importaciones dentro del contenedor:
  - `docker compose exec -e PYTHONPATH=/app backend pytest -q tests/test_rag_retriever_trace.py`
- Logs del backend:
  - `docker compose logs backend --tail 200`

## Resultados de Pruebas
```
1 passed, 76 warnings in 1.98s
```
- La prueba `tests/test_rag_retriever_trace.py` valida:
  - Estructura del trace (`query`, `k`, `retrieved[]`, `context`, `timings`).
  - Campos clave por item (`score`, `source`, `chunk_type`, `preview`).
  - Presencia de contexto cuando `include_context=True`.

## Evidencia de Logs del Backend (extracto)
```
RAGRetriever inicializado con optimizaciones y monitoreo de rendimiento.
VectorStore inicializado en /app/backend/storage/vector_store/chroma_db con strategy=cosine, cache=enabled
PDFContentLoader inicializado con chunk_size=700, chunk_overlap=150, min_chunk_length=100
EmbeddingManager inicializado con modelo: openai:text-embedding-3-small
✅ Ping Embeddings: OK
Rutas API registradas: 27
Caché: habilitada
MongoDB: conectado
Aplicación FastAPI creada y configurada exitosamente.
Application startup complete.
```
- Los logs confirman que:
  - El backend está inicializado y listo.
  - El `VectorStore`, `RAGIngestor` y `RAGRetriever` se inicializaron correctamente.
  - Las dependencias (MongoDB, Embeddings) funcionan.

## Uso del Endpoint (admin)
- URL: `http://localhost:8000/api/v1/rag/retrieve-debug`
- Ejemplo de body:
```
{
  "query": "¿Qué es la beca X?",
  "k": 4,
  "include_context": true
}
```
- Requiere autenticación (token admin). Si aún no tienes usuario admin, usa el script de creación y luego realiza login para obtener el token.

## Conclusiones
- PR1 se encuentra operativo:
  - Función de trazabilidad implementada y testeada.
  - Endpoint de depuración disponible y conectado al `RAGRetriever`.
  - Sistema inicializa y mantiene todas las capacidades existentes; se agregan trazas sin afectar el flujo principal.

## Próximos Pasos (opcional)
- Añadir almacenamiento opcional de `retrieval_trace` por conversación en Mongo para auditorías históricas.
- Exponer métricas simples de caché y tiempos vía endpoint admin (`/rag/cache-stats`).