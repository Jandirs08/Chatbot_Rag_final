# Fase 3 – Diagnóstico y evaluación

## Contexto
Se ejecutó análisis estático en backend con `flake8` y `bandit`. En frontend no fue posible ejecutar `eslint` por políticas de PowerShell y falta de instalación de módulos; se realizó revisión estática manual.

## Resultados técnicos
- Flake8 (parcial): múltiples `E501 line too long` en módulos RAG (retriever, vector_store) y utilidades; `F401` imports no usados; `F841` variables no usadas en tests.
- Bandit:
  - Bajo: `B101 assert_used` en tests, `B110 try/except/pass` en `api/app.py`.
  - Probable alto/medio: uso de `pickle` (B301/B302) en `rag/vector_store/vector_store.py` y `md5` (B303) en `pdf_loader`.
- Frontend (manual): middleware de auth correcto, CSP configurada para `/chat`, servicios API con manejo de errores; se advierte dependencia de `API_URL` y normalización de rutas.

## Métricas/inferencias
- Latencia: middleware de `log_requests` en backend mide tiempo de procesamiento; falta exportación Prometheus para agregación sistemática.
- CPU/RAM: no se instrumentó; `docker-compose` sugiere desarrollo con recarga (`--reload`) que añade overhead.
- Endpoints sensibles: `/api/v1/chat/stream_log` (público) por volumen y SSE; `/api/v1/pdfs/*` y `/api/v1/rag/*` (protegidos) por operaciones IO y CPU.

## Observaciones
- CORS en producción permite `*` si no se configura; riesgo de exposición.
- `jwt_secret` opcional; inicio debería fallar si falta en producción.
- `pickle` y `md5` deben estar acotados y/o reemplazados salvo uso controlado.

## Recomendaciones
- Instrumentar métricas con `prometheus-client` (contador y histograma de latencia por ruta), endpoint `/metrics`.
- Endurecer CORS y CSP, validar orígenes con `CORS_ORIGINS_*` explícitos.
- Añadir pruebas de streaming y manejo de inputs malformados para `/chat/stream_log`.
- Migrar `pickle` y `md5` donde sea razonable; documentar y filtrar fuentes de datos.