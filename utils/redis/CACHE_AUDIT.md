# Auditoría de Caché — Chatbot RAG

Este documento resume todos los mecanismos de caché en el backend y frontend, su configuración, dependencias y recomendaciones prácticas.

## Alcance
- Backend: caché del LLM, caché del RAG Retriever, comportamiento de caché del Vector Store y caché del cliente MongoDB.
- Frontend: encabezados de caché HTTP, caché de assets y envoltorios de solicitudes.
- Configuración y dependencias relevantes para la caché.

## Caché en Backend

### Caché del LLM (ChatbotCache)
- Ubicación: `backend/utils/chain_cache.py`
- Comportamiento:
  - Envuelve la caché global de LangChain mediante `set_llm_cache(...)`.
  - Soporta `InMemoryCache` por defecto y `RedisCache` cuando `REDIS_URL` está configurado y la librería `redis` está disponible.
  - Respeta `settings.enable_cache` y `settings.cache_ttl`.
  - Incluye una estructura básica de métricas (`CacheMetrics`), no expuesta por API actualmente.
- Dependencias:
  - Requiere `langchain-community` (presente).
  - Cliente Python de `redis` opcional para caché con Redis (NO presente en `backend/requirements.txt`).
- Notas:
  - Si falta `REDIS_URL` o Redis es inaccesible, hace fallback transparente a `InMemoryCache`.
  - El TTL aplica a entradas del LLM; no afecta a las cachés del RAG.

### Caché del RAG Retriever
- Ubicación: `backend/rag/retrieval/retriever.py`
- Comportamiento:
  - Mantiene un `_query_cache` en memoria indexado por `(query, k, filter_criteria)`.
  - Devuelve resultados cacheados cuando está habilitado; registra tiempos en `PerformanceMetrics` bajo `cache_operations`.
  - Se limpia como parte del flujo `/rag/clear-rag`.
- Configuración:
  - Controlado por el constructor `cache_enabled` (indirectamente por el wiring en `api/app.py`).
  - Sin TTL ni límite de tamaño; caché basada en diccionario simple.
- Recomendación:
  - Añadir TTL y límites de tamaño para evitar crecimiento sin control.
  - Si hay Redis, opcionalmente centralizar resultados en Redis para coherencia con la caché del LLM.

### Comportamiento de Caché del Vector Store
- Ubicación: `backend/rag/vector_store/vector_store.py`
- Comportamiento:
  - Inicializa un `_query_cache` en memoria y (opcionalmente) un `redis_client` cuando `settings.redis_url` es válido.
  - La implementación actual NO cachea resultados de `retrieve`; la caché se menciona solo para invalidación.
  - `_invalidate_cache()` vacía la base de datos Redis si está conectada; de lo contrario limpia la caché en memoria.
  - `delete_documents()` y `delete_collection()` llaman a `_invalidate_cache()` tras mutaciones.
- Dependencias:
  - Uso opcional del cliente Redis solo para invalidación.
  - Usa Qdrant para la búsqueda vectorial (`qdrant-client`).
- Riesgos:
  - `flushdb()` borra toda la base de datos Redis, peligroso si se comparte con otros servicios.
  - `_query_cache` en memoria no se usa para lecturas y carece de TTL/límites de tamaño.
- Recomendaciones:
  - Si se adopta caché de resultados en Redis, usar prefijos de clave (p. ej., `vs:`) y TTL.
  - Sustituir `flushdb()` por invalidación selectiva por prefijo o patrón (`vs:*`).
  - Si se mantiene en memoria, añadir TTL y hacer cumplir `max_cache_size` de acuerdo con `settings.max_cache_size`.

### Caché del Cliente de MongoDB
- Ubicación: `backend/database/mongodb.py`
- Comportamiento:
  - Usa `functools.lru_cache(maxsize=1)` en `get_mongodb_client()` para mantener una sola instancia de cliente.
  - Ejecuta `.ensure_indexes()` en el arranque.
- Notas:
  - Es caché de instancia, no de datos.

## Caché en Frontend

### Envoltorios de solicitudes
- Ubicación: `frontend/app/lib/services/authService.ts` y servicios que usan `authenticatedFetch`.
- Comportamiento:
  - Añade encabezados `Authorization` y `Content-Type: application/json`.
  - Sin encabezados `Cache-Control` explícitos; se confía en el comportamiento del servidor.
  - El endpoint de streaming de chat establece `Cache-Control: no-cache` en las respuestas (`backend/api/routes/chat/chat_routes.py`).

### Caché de assets y rutas
- Ubicación: `frontend/next.config.js`
- Comportamiento:
  - Imágenes: `minimumCacheTTL` de 30 días.
  - Assets estáticos: `Cache-Control: public, max-age=31536000, immutable` para `_next/static`.
  - No se detectan utilidades SWR o de caché en fetch en los servicios; las solicitudes son `fetch` directas.

## Resumen de Configuración
- Ubicación: `backend/config.py`
- Campos relevantes:
  - `enable_cache` (bool): habilita la caché del LLM (vía ChatbotCache) y marca componentes aware de caché.
  - `cache_ttl` (int): TTL usado por la caché del LLM respaldada por Redis.
  - `redis_url` (SecretStr | None): habilita cachés con Redis cuando está presente y accesible.
  - `max_cache_size` (int): disponible para cachés locales; no se aplica actualmente en Vector Store o RAG Retriever.
  - Toggles y umbrales del RAG: `retrieval_k`, `retrieval_k_multiplier`, `mmr_lambda_mult`, `similarity_threshold`.

## Dependencias
- `backend/requirements.txt` incluye `langchain-community`, `motor`, `pymongo` y `qdrant-client`.
- Falta el cliente Python de `redis`; necesario para activar la caché con Redis en el LLM.
- Sugerencia de añadido:
  - `redis>=4.6.0` (o compatible) como cliente de Redis para Python.

## Recomendaciones
1) Añadir `redis` a `backend/requirements.txt` y configurar `REDIS_URL` para habilitar la caché del LLM en Redis de forma fiable.
2) Introducir TTL y límites de tamaño en la caché del RAG Retriever para evitar crecimiento sin control.
3) Implementar caché de lectura en `VectorStore.retrieve` (opcional) con TTL y prefijos de clave, evitando `flushdb()`.
4) Sustituir `flushdb()` por invalidación con espacio de nombres (p. ej., borrar claves que coincidan con `vs:*`).
5) Exponer un endpoint simple de métricas usando `ChatbotCache.get_metrics()` si se requiere observabilidad.
6) Mantener `Cache-Control: no-cache` para endpoints de streaming; considerar políticas explícitas para APIs JSON cuando sea necesario.

## Verificación rápida
- Caché del LLM:
  - Asegurar que `REDIS_URL` está definido y la librería `redis` instalada.
  - En el arranque, los logs deberían reportar `RedisCache initialized with TTL` o fallback a `InMemoryCache`.
- Limpieza del RAG:
  - Invocar `POST /rag/clear-rag`; se espera reinicio de la colección en VectorStore y limpieza de la caché del RAG Retriever.
- Frontend:
  - Los assets estáticos deben servirse con encabezados de caché inmutables de 1 año según `next.config.js`.

## Resumen del estado actual
- Caché del LLM: funcional vía LangChain; Redis opcional y aún no instalado.
- RAG Retriever: caché simple en memoria sin TTL; se limpia mediante endpoint de administración.
- Vector Store: solo invalidación de caché; no hay caché de lectura implementada.
- Frontend: caché de assets configurada; las solicitudes API no se cachean en cliente más allá de los valores por defecto del navegador.

## Objetivo y Acciones (ANTES de refactorizar)

Objetivo: confirmar con absoluta certeza qué cachés existen realmente, dónde están, qué código está inactivo y qué claves se usan. Esto debe hacerse ANTES de cualquier refactor.

✔️ Acciones:
- 0.1 Crear un inventario REAL — Buscar todas las menciones a `cache`, `redis`, `ttl`, `lru`, `memory`, `flushdb`.
  - Ejemplos de comandos:
    - `grep -R "cache" -n backend/`
    - `grep -R "Redis" -n backend/`
    - `grep -R "flush" -n backend/`
    - `grep -R "redis" -n backend/`
    - `grep -R "memo" -n backend/`
    - `grep -R "LRU" -n backend/`
- 0.2 Verificar requirements y dependencias — Confirmar existencia real de:
  - `redis` (cliente Python) — ACTUALMENTE: no presente.
  - `langchain-community` — ACTUALMENTE: presente (`0.0.36`).
  - `qdrant-client` — ACTUALMENTE: presente (>=`1.7.0`).
- 0.3 Revisar variables de entorno — Inventariar:
  - `ENABLE_CACHE` (presente en `.env`).
  - `CACHE_TTL` (presente en `.env`).
  - `REDIS_URL` (soportada en `config.py`).
  - No se usan `REDIS_HOST`, `REDIS_PASSWORD` individuales; se centraliza en `REDIS_URL`.
- 0.4 Confirmar si Redis realmente se usa o siempre hace fallback — Revisar logs de arranque:
  - Mensajes esperados: `RedisCache inicializado ...` o `InMemoryCache inicializado`.
  - Nota: en el entorno actual faltan dependencias (`langchain` core), por lo que el arranque falla; la lógica de fallback está verificada por análisis estático del código.

Inventario REAL (del código):
- LLM Cache (`utils/chain_cache.py`):
  - Tipos: `InMemoryCache` y `RedisCache` (LangChain Community).
  - Claves: gestionadas internamente por LangChain (no se generan claves propias aquí).
  - Estado actual: sin cliente `redis` en requirements → Fallback a `InMemoryCache`.
- RAG Retriever (`rag/retrieval/retriever.py`):
  - Caché in-memory `_query_cache` con claves `f"{query}_{k}_{filter_key}"`, con límite de ~1000 entradas; sin TTL.
  - Estado actual: activo.
- Vector Store (`rag/vector_store/vector_store.py`):
  - Inicializa `_query_cache` in-memory; intenta `redis.from_url(...)` si hay `REDIS_URL` y cliente disponible.
  - Invalidation: si `redis_client` activo, ejecuta `flushdb()` (borra toda la DB de Redis); si no, `clear()` del caché local.
  - Estado actual: sin cliente `redis` → invalidación sólo local; no se cachean lecturas.
- MongoDB Client (`database/mongodb.py`):
  - `@lru_cache(maxsize=1)` para una sola instancia de cliente (caché de instancia, no de datos).

Conclusión de certeza (actual):
- Redis no está operativo por ausencia del paquete `redis`; cualquier ruta Redis hace fallback.
- La caché real en uso es: LLM en memoria (LangChain InMemoryCache), retriever in-memory con claves simples, y Vector Store sin caché de lectura (sólo invalidación local).
- Las claves utilizadas explícitamente en el proyecto: las del retriever (`query_k_filter`) y las internas de LangChain para LLM.