# RAG Technical Review — Revisión Técnica Profunda

**Tipo de sistema**: RAG experimental/real (no toy, no enterprise crítico)  
**Fecha de análisis**: 2026-01-12  
**Objetivo**: Identificar riesgos latentes, bombas de tiempo, y mejoras de alto impacto

## 📋 Executive Summary

Este RAG es técnicamente sólido con patrones bien pensados (embeddings cacheados, MMR, RAG gating con centroide, deduplicación por hash, etc.). Sin embargo, hay 7 bombas de tiempo críticas que pueden explotar con escala o uso prolongado, y mejoras de alto impacto que son relativamente simples de implementar.

### Lo que está bien diseñado

- ✅ Deduplicación por `content_hash` (normalizado) evita duplicados semánticos
- ✅ Cache en múltiples niveles (embeddings, RAG results, LLM responses)
- ✅ RAG gating con centroide (evita retrieval innecesario)
- ✅ Streaming SSE con timeout en primer chunk
- ✅ Soporte de MMR para diversidad

---

## 🚨 Hallazgos Críticos

### [HALLAZGO #1] Chunking fijo sin adaptación a estructura del documento

**Descripción**: El sistema usa `chunk_size=500` y `chunk_overlap=50` fijos para todos los PDFs (`config.py:L102-103`). PyMuPDFLoader extrae texto plano y luego se segmenta con ventana deslizante (`ingestor.py:L101-104`). No hay reconocimiento de:

- Headers/títulos
- Listas
- Tablas
- Párrafos semánticos
- Cambios de sección

**Por qué puede ser una bomba de tiempo**: Con PDFs complejos (técnicos, legales, manuales con tablas), los chunks cortan arbitrariamente en mitad de:

- **Tablas** → metadata corrupta en retrieval
- **Listas numeradas** → pérdida de contexto secuencial
- **Headers** que dan contexto crítico a los párrafos siguientes

**Escenario real**: un PDF de pricing con tablas → el retrieval devuelve "fragmento 3: $450" sin el contexto de qué producto es.

| Métrica | Valor |
|---------|-------|
| **Nivel de severidad** | Alto |
| **Probabilidad de que aplique a ESTE RAG** | Alta - Los pdfs/ en utils contienen 20 PDFs reales. Sin inspeccionar su estructura interna, es estadísticamente probable que al menos algunos tengan tablas o listas que se rompan mal. |
| **Nivel de confianza en el diagnóstico** | Alta - Patrón común en RAGs que usan chunking fijo. Verificable inspeccionando chunks indexados en Qdrant con retrieve-debug. |

**Recomendación conceptual**: Implementar chunking semántico/estructural:

1. **Fase 1** (low-hanging fruit): Usar RecursiveCharacterTextSplitter con separadores de párrafos/líneas en vez de ventana deslizante ciega
2. **Fase 2** (ideal): Detectar estructura (ej: pymupdf con layout mode o unstructured library) y chunkar respetando boundaries naturales
3. **Medio camino**: Ajustar `min_chunk_length=100` más agresivamente y validar que chunks tengan frases completas (no corten mid-sentence)

> [!NOTE]
> No implementar chunking recursivo ultra-sofisticado (overkill). El 80% del problema se resuelve con separadores inteligentes y validación de frases completas.

---

### [HALLAZGO #2] RAG Gating con centroide puede quedar stale silenciosamente

**Descripción**: El gating usa un centroide calculado de todos los embeddings en Qdrant (`retriever.py:L680-788`). El recálculo tiene protecciones:

- Cache TTL implícito vía `_last_corpus_size_check_time`
- Invalidación automática si cambia `count()` total
- Lock async para evitar recalcs simultáneos

**Sin embargo**:

- Si el cache de Redis se limpia externamente (flush, restart, eviction por memoria), el centroide desaparece
- El código intenta recalcular en background (`L278-286`), PERO si no hay event loop corriendo (ej: durante `config.py` import), el schedule falla silenciosamente
- Mientras tanto, `gating_async()` compara contra `self._centroid_embedding = None` y hace fail-open (`L907`): `return ("no_centroid", True)` → siempre usa RAG sin validación semántica

**Por qué puede ser una bomba de tiempo**:

- **Costo oculto**: Si el centroide está stale, TODAS las queries pasan gating → retrieval masivo + embeddings + LLM context window inflado → facturas de OpenAI se disparan
- **Latencia**: Retrieval innecesario en queries simples ("hola", "gracias") que deberían skipear RAG
- **Calidad degradada**: Context pollution con docs irrelevantes (porque el filtro semántico está roto)

**Escenario real**:

1. Redis se reinicia por deploy
2. Durante 5-10 min hasta que el background task recalcula, todas las conversaciones activas hacen retrieval indiscriminado
3. Admin no se da cuenta hasta ver logs de costos

| Métrica | Valor |
|---------|-------|
| **Nivel de severidad** | Alto |
| **Probabilidad de que aplique a ESTE RAG** | Media - Depende de frecuencia de Redis restarts, volumen de tráfico concurrente, y si hay monitoreo de costos |
| **Nivel de confianza en el diagnóstico** | Alta - Code path verificable: ver `gating_async()` línea 857-858 donde se agenda sin esperar, y línea 907 del fallback. |

**Recomendación conceptual**:

1. **Health check crítico**: Agregar endpoint `/api/v1/rag/gating-health` que exponga:
   - `centroid_loaded: bool`
   - `last_recalc_timestamp`
   - `corpus_size`
   - Este endpoint debería alertar si `centroid_loaded == false` por >2 minutos

2. **Persistencia dual**: Además de Redis, guardar centroide en MongoDB como fallback (pequeño doc ~1KB). Si cache miss, cargar desde Mongo antes de recalcular.

3. **Fail-closed conservador**: En lugar de fail-open, si no hay centroide Y corpus_size > 50, hacer fail-closed (skip RAG) excepto en queries con interrogativos obvios. Evita context pollution masivo.

> [!NOTE]
> El código ya tiene lógica de invalidación robusta (L842-848 detecta cambios de corpus). El problema es la persistencia del centroide fuera de Redis.

---

### [HALLAZGO #3] Embeddings cacheados sin version tracking → incompatibilidad silenciosa

**Descripción**: Los embeddings se cachean con key: `emb:doc:{model_name}:{sha256(text)}` (`embedding_manager.py:L80`). El `model_name` viene de `settings.embedding_model` (ej: "openai:text-embedding-3-small").

**Problema**: Si cambias de modelo (ej: text-embedding-3-small → text-embedding-3-large para mejor calidad), las keys cambian... PERO:

- **Qdrant conserva vectores viejos**: Los puntos en Qdrant siguen teniendo embeddings del modelo antiguo
- **Queries usan modelo nuevo**: El `embed_query()` genera con el nuevo modelo
- **Similitud semántica corrupta**: Estás comparando embeddings de dimensiones diferentes o espacios semánticos incompatibles

**Escenario dramático**:

1. Cambias dimensión de 1536 → 3072
2. Código hace fallback a vector cero (`L123`) si detecta inconsistencia
3. TODOS los docs retrieval tienen score ~0 → RAG "se apaga" silenciosamente

**Por qué puede ser una bomba de tiempo**: Típico en evolución de sistemas:

1. Pruebas con modelo barato
2. Upgrade a modelo premium
3. Olvidas reindexar PDFs
4. Users reportan "el chatbot ya no responde con contexto"

| Métrica | Valor |
|---------|-------|
| **Nivel de severidad** | Medio |
| **Probabilidad de que aplique a ESTE RAG** | Media - Depende de policy de actualizaciones. Si es experimental y están probando modelos, alta probabilidad. |
| **Nivel de confianza en el diagnóstico** | Alta - El código tiene validación de dimensión (`L85-88`), pero no version tracking. |

**Recomendación conceptual**:

1. **Metadata en Qdrant**: Agregar `embedding_model_version` y `embedding_dimension` a cada punto. Durante retrieval, filtrar solo puntos con modelo compatible.

2. **Migration endpoint**: Crear `POST /api/v1/rag/migrate-embeddings` que:
   - Scroll todos los puntos
   - Re-embediza con modelo nuevo
   - Actualiza en batch
   - Progreso trackeable

3. **Config validation**: Al arrancar, verificar que `settings.default_embedding_dimension` coincide con una sample de Qdrant. Si no, loguear WARNING masivo.

> [!NOTE]
> El fallback a vector cero es defensivo pero oculta el problema. Mejor: fallar ruidosamente con RuntimeError al detectar incompatibilidad, forzando al admin a tomar acción.

---

### [HALLAZGO #4] Cache manager falla ruidosamente en init si Redis no conecta ✅ RESUELTO

**Descripción**: `cache/manager.py:L25-53` inicializa Redis y hace `client.ping()`. Si falla, lanza RuntimeError y muere el proceso.

```python
except Exception as e:
    _logger.critical(f"FALLO CRÍTICO DE REDIS: {e}")
    raise RuntimeError("Conexión a Redis fallida - Backend detenido") from e
```

**Por qué puede ser una bomba de tiempo**: Entornos típicos:

- **Local dev**: Redis no está corriendo → uvicorn main:app crashea inmediatamente, confundiendo a desarrolladores nuevos
- **Staging/Prod**: Redis temporal unavailable (network blip, container restart) → todo el backend se cae en vez de degradar gracefully
- **Docker Compose**: Race condition si el backend arranca antes que Redis → restart loop infinito

| Métrica | Valor |
|---------|-------|
| **Nivel de severidad** | Alto (disponibilidad) |
| **Probabilidad de que aplique a ESTE RAG** | Alta - README menciona Docker Compose, es común tener race conditions en startup. |
| **Nivel de confianza en el diagnóstico** | Alta - Código explícito: raise RuntimeError. |
| **Estado** | ✅ **RESUELTO** - Implementada degradación elegante con retry logic y fallback a InMemoryCache |

**Recomendación conceptual** (IMPLEMENTADO):

1. **Graceful degradation**: Si Redis falla, crear InMemoryCache temporal con WARNING logs masivos. Sistema corre degradado pero funcional. ✅

2. **Retry logic**: En `_init_backend()`, hacer 3 intentos con exponential backoff antes de fallar. Útil para race conditions de startup. ✅

3. **Health check separado**: No validar Redis en import-time. Mover la conexión a un lifespan event de FastAPI y marcar /health como unhealthy si falla. ✅

---

### [HALLAZGO #5] Memory window size fijo sin paginación → explosión de tokens en conversaciones largas

**Descripción**: `memory/base_memory.py:L115` usa `.limit(self.window_size)` fijo (default=5 mensajes). El historial se inserta en el prompt como string:

```python
formatted_hist = self.bot._format_history(hist)
# → "User: ...\nAssistant: ...\n" × N
```

**Problemas**:

- **Window size en mensajes, no tokens**: 5 mensajes pueden ser 100 tokens o 5000 tokens dependiendo de la verbosidad
- **Sin truncamiento**: Si un mensaje user/assistant tiene 2000 tokens, entra completo
- **Prompt explosion**: Con window=5 y mensajes largos, el historial puede consumir 80% del context window del LLM

**Por qué puede ser una bomba de tiempo**:

- **Conversaciones técnicas**: User pega código o logs largos → mensajes de 1000+ tokens
- **Costo silencioso**: Cada turno procesa tokens masivos de historial innecesario
- **Latencia**: LLMs lentos con context window grande

**Escenario**:

1. Usuario hace pregunta técnica con traceback de 50 líneas
2. Window conserva ese mensaje completo × 5 turnos
3. Cada respuesta paga 5× lo esperado en input tokens

| Métrica | Valor |
|---------|-------|
| **Nivel de severidad** | Medio |
| **Probabilidad de que aplique a ESTE RAG** | Media - Depende del domain. Si es soporte técnico o compliance (donde users copian docs largos), muy alta. |
| **Nivel de confianza en el diagnóstico** | Alta - Patrón común en chatbots. El código usa tiktoken para contar tokens en debug (`chat/manager.py:L22-31`) pero NO para limitar historial. |

**Recomendación conceptual**:

1. **Token-based window**: En lugar de `.limit(5)`, hacer:

```python
MAX_HISTORY_TOKENS = 1500
cumulative_tokens = 0
for msg in reversed(messages):
    tok = count_tokens(msg['content'])
    if cumulative_tokens + tok > MAX_HISTORY_TOKENS:
        break
    cumulative_tokens += tok
    history.append(msg)
```

2. **Summarization light**: Para conversaciones >10 turnos, resumir turnos antiguos con LLM barato (gpt-3.5-turbo) y guardar en metadata especial `{role: "system", content: "Resumen de conversación anterior: ..."}`.

3. **User-facing truncation**: Si un mensaje excede 500 tokens, truncar con "..." y guardar el completo en DB para auditabilidad.

> [!NOTE]
> El código ya tiene tiktoken importado (lazy load), reusar eso. No agregar dependencias nuevas.

---

### [HALLAZGO #6] Sin rate limiting en ingesta de PDFs → DoS por upload masivo

**Descripción**: `api/routes/pdf_routes.py` (no inspeccionado directamente, inferido de README) permite `POST /api/v1/pdfs/upload`. No hay evidencia de:

- Rate limiting en este endpoint específico
- Queue/throttling de procesamiento
- Límite de PDFs concurrentes en ingesta

El `RAGIngestor.ingest_single_pdf()` (`ingestor.py:L91-169`) es bloqueante y cpu/io intensivo:

- `PyMuPDFLoader.load()` → extracción de texto (CPU)
- `embedding_manager.embed_documents()` → API calls masivos a OpenAI
- `vector_store.add_documents()` en batches → upserts a Qdrant

**Por qué puede ser una bomba de tiempo**: Escenario de abuso (malicious o no):

1. Admin sube 10 PDFs de 200 páginas cada uno simultáneamente
2. Backend procesa 10 PDFs en paralelo → 2000 páginas × chunks = ~8000 embed calls a OpenAI
3. OpenAI rate limits → errores en cascada
4. Qdrant se satura con upserts concurrentes
5. Otros requests (chat) se bloquean porque FastAPI thread pool está consumido

| Métrica | Valor |
|---------|-------|
| **Nivel de severidad** | Alto |
| **Probabilidad de que aplique a ESTE RAG** | Media - Si solo hay 1-2 admins internos, baja. Si hay UI de PDF upload expuesta, media-alta. |
| **Nivel de confianza en el diagnóstico** | Media - No vi el código de rutas directamente, pero `RAGIngestor` evidentemente no tiene throttling interno. |

**Recomendación conceptual**:

1. **Queue ingesta**: Usar `asyncio.Queue` con workers limitados (ej: 2 workers, 1 PDF por worker). Uploads van a cola, se procesan secuencialmente.

2. **Rate limit endpoint**: Si slowapi ya está en dependencies (`requirements.txt:L48`), aplicar decorador `@limiter.limit("5/hour")` en upload.

3. **Progress tracking**: Guardar ingesta en colección `pdf_ingestion_jobs` con estados `queued/processing/completed/failed`. UI polling de estado.

> [!NOTE]
> El sistema ya tiene `batch_size=100` configurado (`config.py:L115`), pero eso es por embedding batch, no límite de concurrencia global.

---

### [HALLAZGO #7] Version pins demasiado estrechos en dependencies → lock-in riesgoso

**Descripción**: `requirements.txt` tiene versiones:

```
langchain-core==0.1.52  # EXACT pin
langchain==0.1.17
langchain-community==0.0.36
langchain-openai==0.0.5
```

Exact pins (`==`) en lugar de rangos compatibles (`>=X,<Y`).

**Problemas**:

- **Security patches bloqueados**: Si LangChain publica 0.1.53 con CVE fix, no se actualiza automáticamente
- **Dependency hell**: Si otra lib requiere `langchain-core>=0.1.53`, conflicto irreconciliable
- **Obsolescencia**: LangChain es un proyecto en rápida evolución. Versiones de enero 2024 (0.0.36 community) pueden tener bugs ya resueltos

**Por qué puede ser una bomba de tiempo**: En 6-12 meses:

1. Quieres usar feature nuevo de LangChain (ej: mejor streaming)
2. Upgrade requiere refactor porque la API cambió
3. Acumulas deuda técnica

| Métrica | Valor |
|---------|-------|
| **Nivel de severidad** | Bajo |
| **Probabilidad de que aplique a ESTE RAG** | Alta (inevitable con el tiempo) |
| **Nivel de confianza en el diagnóstico** | Alta - Archivos de requirements estándar. |

**Recomendación conceptual**:

1. **Semver ranges**: Cambiar a:

```
langchain-core>=0.1.52,<0.3.0
langchain>=0.1.17,<0.3.0
```

Permite patches/minor updates, bloquea breaking changes.

2. **Dependabot**: Si usas GitHub, habilitar Dependabot para PRs automáticos de seguridad.

3. **Test suite robusto**: Antes de flexibilizar pins, asegurar que tienes tests que detecten breaking changes en upgrades.

> [!NOTE]
> Este es el trade-off clásico: stability vs freshness. Para RAG experimental, inclinarse hacia freshness (rangos amplios). Para production crítico, lockfiles estrictos.

---

## 🟡 Hallazgos Menores

### [HALLAZGO #8] Similarity threshold muy bajo (0.3) → ruido en retrieval

**Descripción**: `config.py:L111`: `similarity_threshold: float = 0.3`. Con similitud coseno normalizada (0-1), 0.3 es MUY permisivo.

**Impacto**:

- Documentos marginalmente relevantes pasan el filtro
- Context polluted con info tangencial
- LLM puede generar respuestas inconsistentes

**Recomendación**: Experimentar con threshold 0.5-0.6. Para queries críticas, ser más conservador (devolver menos docs pero más relevantes).

**Severidad**: Bajo | **Probabilidad**: Media | **Confianza**: Alta

---

### [HALLAZGO #9] Mock mode en producción es un riesgo de seguridad

**Descripción**: `config.py:L58`: `mock_mode: bool = Field(default=False, env="MOCK_MODE")`. Si alguien accidentalmente setea `MOCK_MODE=true` en producción:

- Todos los embeddings son vectores cero (`embedding_manager.py:L58-63`)
- LLM responde con texto mock (`bot.py:L250-252`)
- Users reciben respuestas fake sin saber

**Recomendación**: Validación en `config.py`:

```python
if self.environment == "production" and self.mock_mode:
    raise ValueError("MOCK_MODE no permitido en producción")
```

**Severidad**: Medio | **Probabilidad**: Baja | **Confianza**: Alta

---

### [HALLAZGO #10] JWT secret validation solo en production → dev/staging vulnerables

**Descripción**: `config.py:L278-289` valida `JWT_SECRET` solo si `environment == "production"`. En staging/dev, puede estar ausente o weak → autenticación comprometida.

**Recomendación**: Validar `JWT_SECRET` en TODOS los environments, con mensaje claro de que puede ser dummy en dev local.

**Severidad**: Medio | **Probabilidad**: Media si staging es público | **Confianza**: Alta

---

## ✅ Cosas Bien Diseñadas (Reconocimiento)

1. **Deduplicación robusta** (`ingestor.py:L51-62, L115-118`): `content_hash_global` normalizado evita duplicados semánticos. Excelente.

2. **Cache invalidation inteligente** (`retriever.py:L999-1005`): Usar prefijos (`rag:`, `vs:`, `resp:`) permite invalidación quirúrgica. Bien pensado.

3. **Streaming con timeout** (`chat/manager.py:L323`): Esperar primer chunk con timeout evita hang infinito. UX-forward.

4. **Centroid lock async** (`retriever.py:L224-228, L687-688`): Evita race conditions en recálculo. Sofisticado.

5. **Payload indexes en Qdrant** (`vector_store.py:L107-132`): Crear índices en `source`, `pdf_hash`, `content_hash_global` acelera filtrado. Performance-conscious.

---

## 📊 Priorización de Fixes

| Hallazgo | Severidad | Impacto | Esfuerzo Fix | Prioridad |
|----------|-----------|---------|--------------|-----------|
| #4 Cache manager crash ✅ | Alto | Alto | Bajo (2h) | 🔴 P0 ✅ RESUELTO |
| #1 Chunking fijo | Alto | Alto | Medio (1 día) | 🔴 P0 |
| #2 Centroid stale | Alto | Medio | Medio (4h) | 🟠 P1 |
| #6 PDF upload DoS | Alto | Medio | Medio (4h) | 🟠 P1 |
| #3 Embedding version | Medio | Alto | Alto (2 días) | 🟠 P1 |
| #5 Token explosion | Medio | Medio | Medio (4h) | 🟡 P2 |
| #9 Mock mode | Medio | Bajo | Bajo (15min) | 🟡 P2 |
| #7 Version pins | Bajo | Bajo | Bajo (30min) | 🟢 P3 |
| #8 Similarity threshold | Bajo | Bajo | Bajo (test) | 🟢 P3 |
| #10 JWT staging | Medio | Bajo | Bajo (15min) | 🟢 P3 |

---

## 🎯 Quick Wins (Bajo esfuerzo, alto impacto)

- ✅ **Fix #4** (Cache graceful degradation): 2 horas → evitas downtime total - **COMPLETADO**
- **Fix #9** (Mock mode validation): 15 min → evitas incidente catastrófico
- **Fix #10** (JWT validation): 15 min → hardening básico
- **Ajustar similarity_threshold a 0.5**: 0 código, solo config

---

## 🔬 Tests de Validación Recomendados

Para verificar estos issues en tu sistema actual:

### Test 1: Centroid Staleness

```bash
# Limpia Redis
redis-cli FLUSHALL

# Hacer query inmediatamente
curl -X POST http://localhost:8000/api/v1/chat \
  -d '{"input":"¿Cuál es el precio?"}' \
  -H "Content-Type: application/json"

# Revisar logs: debería ver "no_centroid" en gating_reason
```

### Test 2: Chunking Quality

```bash
# Endpoint de debug
curl -X POST http://localhost:8000/api/v1/rag/retrieve-debug \
  -d '{"query":"tabla de precios", "k":5}' \
  -H "Authorization: Bearer <token>"

# Inspeccionar `text` de cada item:
# - ¿Se cortó a mitad de celda?
# - ¿Tiene contexto del header de tabla?
```

### Test 3: Token Explosion

```python
# Script Python
import requests

long_message = "Mi código:\n" + ("x = 1\n" * 1000)  # 1000 líneas
for i in range(10):
    requests.post("http://localhost:8000/api/v1/chat", json={
        "input": long_message,
        "conversation_id": "test_session",
        "debug_mode": True
    })
    # Revisar debug_info.input_tokens → debería crecer linealmente
```

---

## 💡 Mejoras Arquitecturales (Futuro)

Estas NO son urgentes, pero aumentarían robustez:

1. **Observability**: Integrar OpenTelemetry para traces distribuidos (RAG → Qdrant → OpenAI → LLM)
2. **Hybrid search**: Combinar bm25 (keyword) + vector similarity para queries con términos técnicos específicos
3. **Query classification**: Usar LLM barato para clasificar queries en categories (faq, technical, small_talk) y rutear a pipelines optimizados
4. **Async PDF processing**: Mover ingesta a Celery/RQ workers separados del proceso FastAPI

---

## 📝 Conclusión

Este RAG tiene fundamentos sólidos (cache inteligente, gating, deduplicación). Los problemas principales son:

- ✅ **Bombas de tiempo operacionales** (cache fail ~~, centroid stale~~) → fix con health checks + persistencia - **Cache manager resuelto**
- **Calidad de retrieval** limitada por chunking naive → mejorar con estructura semántica
- **Costos ocultos** (token explosion, rate limiting) → implementar limits conservadores

**Siguiente paso inmediato**: Implementar fixes P0 (~~#4~~ ✅ y #1) en una branch separada y validar en staging antes de production.