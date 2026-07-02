# Auditoría Backend — Informe Completo

> **Fecha:** 2026-06-27  
> **Scope:** `backend/` — ~130 archivos Python  
> **Metodología:** 5 agentes ECC en paralelo (seguridad, errores silenciosos, malas prácticas, código muerto, arquitectura)

---

## Resumen Ejecutivo

| Dimensión | Crítico | Alto | Medio | Bajo |
|-----------|:-------:|:----:|:-----:|:----:|
| Seguridad | 2 | 5 | 6 | 4 |
| Errores silenciosos | 5 | 8 | 4 | — |
| Malas prácticas | 2 | 11 | 8 | 4 |
| Código muerto | — | 5 | 3 | 2 |
| Arquitectura | — | 7 | 4 | — |

> **Acción inmediata:** rotar las 4 credenciales reales encontradas en `backend/.env` antes de cualquier deploy.

---

## Bloque 1 — Seguridad Crítica

### 🔴 SEC-C1: Credenciales reales en disco

**Archivo:** `backend/.env` líneas 18, 53-54, 58

El archivo no está en git (`.gitignore` correcto) pero contiene claves activas:

| Credencial | Línea | Acción |
|-----------|-------|--------|
| OpenAI API key (`sk-proj-...`) | 18 | Rotar en platform.openai.com |
| Twilio Account SID | 53 | Rotar en console.twilio.com |
| Twilio Auth Token | 54 | Rotar en console.twilio.com |
| Resend API key (`re_...`) | 58 | Rotar en resend.com |

**Fix:** usar un secrets manager (Doppler, AWS Secrets Manager) o inyectar como variables de entorno en el deployment. Nunca credenciales reales en `.env` local.

---

### 🔴 SEC-C2: JWT secret = placeholder conocido

**Archivo:** `backend/.env:11`, `backend/config.py:192-199`

```
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
```

El guard de producción verifica que no esté vacío pero no que sea diferente del placeholder. Un atacante puede forjar tokens admin sin credenciales.

**Fix:**
```python
# config.py — agregar en el startup guard
if jwt_secret == "your-super-secret-jwt-key-change-this-in-production-min-32-chars":
    raise ValueError("JWT_SECRET es el placeholder por defecto — cámbialo")
if len(jwt_secret) < 32:
    raise ValueError("JWT_SECRET debe tener al menos 32 caracteres")
```
Generar con `python -c "import secrets; print(secrets.token_hex(32))"`.

---

## Bloque 2 — Seguridad Alta

### 🟠 SEC-H1: Historial sin autenticación
**`api/routes/chat/chat_routes.py:276`**

`GET /history/{conversation_id}` usa `get_optional_current_user` — auth completamente opcional. Cualquier persona con un ID puede leer hasta 2,000 mensajes.

**Fix:** cambiar a `Depends(get_current_active_user)` o emitir un token de sesión firmado en la creación de la conversación.

---

### 🟠 SEC-H2: Session injection vía `conversation_id` libre
**`chat_routes.py:94`**

```python
conversation_id = chat_input.conversation_id or str(uuid.uuid4())
```

El caller elige su propio ID sin validación de ownership. Un atacante puede inyectar mensajes en la conversación de otro usuario.

**Fix:** validar que sea UUID v4 válido; en sesiones autenticadas, verificar que el `conversation_id` pertenezca al usuario autenticado.

---

### 🟠 SEC-H3: Token blacklist falla-abierto con Redis caído
**`backend/auth/token_blacklist.py:30`**

```python
return False  # fail open — tokens revocados se aceptan durante outages de Redis
```

**Fix:** hacer configurable con `TOKEN_BLACKLIST_FAIL_SAFE=true` para ambientes de alta seguridad.

---

### 🟠 SEC-H4: Rate limits por proceso — bypasseable con múltiples workers
**`backend/utils/rate_limiter.py:36-41`**

Fallback a `memory://` cuando Redis no está disponible. Con 4 workers uvicorn el límite efectivo es `4×`.

**Fix:** si `workers > 1` y Redis no está disponible, fallar en startup en lugar de degradar silenciosamente.

---

### 🟠 SEC-H5: Excepciones internas expuestas al cliente
**`chat_routes.py:267`, `rag_routes.py:82, 170`**

```python
detail=f"Error interno del servidor: {str(e)}"  # puede contener URIs con contraseñas
```

**Fix:** log completo server-side con `exc_info=True`, devolver solo `"Internal server error"` al cliente.

---

### Seguridad Media (resumen)

| ID | Archivo:Línea | Problema | Fix |
|----|--------------|---------|-----|
| SEC-M1 | `config_fragments.py:33` | CORS wildcard `*` por defecto (solo bloqueado en `production`) | Bloquear también en `staging`; default = lista vacía |
| SEC-M2 | `webhook_routes.py:178` | `X-Forwarded-Proto` falsificable para Twilio signature | Confiar solo desde IPs de proxy conocidas |
| SEC-M3 | `chat_routes.py:688` | Borrado irreversible de TODO el sistema en una llamada | Soft-delete + confirmación de 2 pasos |
| SEC-M4 | `password_handler.py:90` | Resultado de auth logueado en DEBUG | Eliminar ese log completamente |
| SEC-M5 | `auth/permissions.py:25` | Todos los permisos colapsan a `is_admin` (el argumento `permission` se descarta) | Implementar RBAC real con `user.permissions: List[str]` |
| SEC-M6 | `chat_routes.py:483` | Export de 50,000 documentos sin paginación — riesgo OOM | Cap en 10,000, cursor-based pagination |

---

## Bloque 3 — Errores Silenciosos Críticos

### 🔴 SIL-C1: Todos los errores LLM devuelven `200 OK`
**`backend/chat/handlers/non_streaming.py:127-155`**

Rate limits, timeouts, connection errors — todos se convierten en un string amigable devuelto como respuesta normal. El HTTP layer no puede distinguir "LLM caído" de "respuesta real". Stack traces perdidos.

**Fix:** propagar como excepción tipada `LLMUnavailableError`; loguear con `exc_info=True` en nivel `ERROR`.

---

### 🔴 SIL-C2: Audit log completo tragado
**`backend/utils/audit.py:13-18`**

```python
try:
    logger.info(...)
except Exception:
    pass  # eventos de seguridad desaparecen silenciosamente
```

Login, cambios de config, acciones admin pueden fallar sin ninguna indicación.

**Fix:** quitar el try/except o como mínimo escribir a `sys.stderr` como último recurso.

---

### 🔴 SIL-C3: DLQ WhatsApp pierde mensajes sin traza
**`backend/api/routes/whatsapp/webhook_routes.py:131-144`**

```python
except Exception as e:
    log_error(f"CRITICAL: {e}", wa_id)  # sin exc_info — stack trace perdido
    try:
        await dlq.record(...)
    except Exception:
        pass  # mensaje perdido permanentemente, sin log
```

**Fix:** agregar `exc_info=True` al log principal; en el fallo del DLQ, loguear a nivel `ERROR` en lugar de `pass`.

---

### 🔴 SIL-C4: IDs fantasma en conversaciones WhatsApp
**`webhook_routes.py:259-261`**

```python
except Exception as e:
    log_error(f"Error DB sesión: {e}", wa_id)
    conversation_id = f"fallback_{wa_id}"  # historial fragmentado permanentemente
```

**Fix:** si la DB de sesión cae, devolver 503 a Twilio (que reintentará) en lugar de proceder con un ID falso.

---

### 🔴 SIL-C5: Cache miss y cache error son indistinguibles
**`backend/chat/handlers/non_streaming.py:54-55, 97-98`**

```python
except Exception:
    cached_response = None  # outage de Redis invisible — cero visibilidad operacional
```

**Fix:** agregar `logger.warning("Cache GET failed", exc_info=True)` como mínimo, igual que hace `manager.py:179-181`.

---

### Errores Silenciosos Altos (resumen)

| ID | Archivo:Línea | Problema | Impacto |
|----|--------------|---------|---------|
| SIL-H1 | `database/mongodb.py:226` | Error en `list_recent_conversations` devuelve `{"items":[], "total":0}` | Inbox parece vacío cuando Mongo cae |
| SIL-H2 | `database/mongodb.py:133` | Índices de unicidad no creados si falla | Cuentas duplicadas posibles |
| SIL-H3 | `rag/ingestion/hierarchical_ingestion_service.py:152,184` | Cache invalidation post-ingesta silenciosa | Chunks stale servidos tras borrar/actualizar docs |
| SIL-H4 | `cache/redis_backend.py:115,129` | `delete()` e `invalidate_prefix()` fallan sin log | Entradas stale permanecen indefinidamente |
| SIL-H5 | `rag/retrieval/hierarchical_retriever.py:213` | HyDE cache set silencioso | LLM re-llamado cada request — costo oculto |
| SIL-H6 | `core/tools/retrieval_tool.py:342` | Cross-turn cache write silencioso | Vector store re-consultado — latencia/costo amplificados |
| SIL-H7 | `chat/handlers/agentic.py:460` | Finally block de métricas logueado solo en DEBUG | Invisible en producción |
| SIL-H8 | `api/routes/whatsapp/webhook_routes.py:31-37` | Helper `log_error` traga sus propios fallos | El sistema de logging puede fallar sin nadie saberlo |

### Errores Silenciosos Medios (resumen)

| ID | Archivo:Línea | Problema |
|----|--------------|---------|
| SIL-M1 | `chat_routes.py:327` | Mongo falla → modo `"bot"` por defecto → UI muestra handoff incorrecto |
| SIL-M2 | `api/bot_state_repo.py:59` | Redis write del estado bot falla sin log → workers con estado stale |
| SIL-M3 | `webhook_routes.py:248` | Notificación rate-limit al usuario falla sin log |
| SIL-M4 | `database/mongodb.py:59` | URI de MongoDB (con contraseña) guardado como atributo — visible en tracebacks |

---

## Bloque 4 — Malas Prácticas

### 🔴 PRAC-C1: `time.sleep()` bloquea el event loop
**`backend/rag/embeddings/embedding_manager.py:128, 260`** y **`backend/cache/manager.py:78`**

`time.sleep()` en métodos síncronos llamados desde pipelines async congela uvicorn entero.

**Fix:**
```python
# Antes
time.sleep(0.01)
# Después — dentro de función async
await asyncio.sleep(0.01)
# O envolver el método sync
result = await asyncio.to_thread(sync_method, args)
```

---

### 🟠 PRAC-H1: JWT singleton sin threading lock
**`backend/auth/jwt_handler.py:139-143`**

```python
def get_jwt_handler() -> JWTHandler:
    global _jwt_handler_instance
    if _jwt_handler_instance is None:      # race condition
        _jwt_handler_instance = JWTHandler(get_settings())
    return _jwt_handler_instance
```

El singleton de MongoDB en `mongodb.py:37` ya usa `threading.Lock` — replicar ese patrón.

---

### 🟠 PRAC-H2: Twilio auth token en texto plano en MongoDB
**`backend/database/config_repository.py:20`**

`BotConfig.twilio_auth_token: Optional[str]` se persiste verbatim. Cualquier developer con acceso a Mongo ve la credencial activa.

**Fix:** usar `pydantic.SecretStr` y cifrar antes de escribir.

---

### 🟠 PRAC-H3: Funciones y archivos gigantes

| Archivo | Líneas | Límite | Problema |
|---------|--------|--------|---------|
| `rag/retrieval/retriever.py` | **966** | 800 | 4+ responsabilidades mezcladas |
| `api/app.py` | **804** | 800 | Al límite |
| `api/routes/chat/chat_routes.py` | **723** | 800 | `chat_stream_log()` = 204 líneas |
| `rag/retrieval/hierarchical_retriever.py` | **685** | 800 | — |
| `api/routes/bot/config_routes.py` | **653** | 800 | — |
| `chat/handlers/agentic.py` — `stream_with_tools()` | **290** | 50 | Mezcla 8 responsabilidades |
| `chat/handlers/non_streaming.py` — `generate_response()` | **185** | 50 | — |

---

### 🟠 PRAC-H4: Rutas instancian MongoDB directamente (15+ veces)
**`chat_routes.py:36,108,322`**, **`inbox_routes.py` (10+ veces)**, **`webhook_routes.py:41,81,134`**

```python
# Patrón repetido 15+ veces — hardcoded en cada ruta
getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
```

**Fix:** un único `Depends(get_db)` inyectado por FastAPI en todas las rutas.

---

### 🟠 PRAC-H5: `update_config()` tiene 9 parámetros
**`database/config_repository.py:63`**

**Fix:** crear `UpdateBotConfigParams` dataclass — nuevo campo = 1 lugar a actualizar, no 3.

---

### Malas Prácticas Medias (resumen)

| ID | Archivo | Problema |
|----|---------|---------|
| PRAC-M1 | `config_fragments.py:47` | `LOG_LEVEL` default `"DEBUG"` en todos los entornos |
| PRAC-M2 | `config_routes.py:126,138` | Globals mutables sin `threading.Lock` — race condition en multi-worker |
| PRAC-M3 | `config.py:175` | Usa `print()` para errores críticos de startup en vez de `logger.critical()` |
| PRAC-M4 | `chat/handlers/agentic.py:371,379` | Imports dentro del cuerpo de función en hot path |
| PRAC-M5 | `rag/retrieval/retriever.py:587` | 8-10 `logger.info()` por request en hot path — infla logs en producción |
| PRAC-M6 | Múltiples | Funciones públicas sin type hints de retorno |
| PRAC-M7 | Múltiples | Mensajes de log con emojis — rompen grep y log aggregators |
| PRAC-M8 | Múltiples | Mezcla de comentarios en español e inglés en el mismo archivo |

---

## Bloque 5 — Código Muerto & Redundancias

### Eliminaciones seguras (sin cambios en tests)

| Ítem | Archivo | Detalle |
|------|---------|---------|
| Archivo completo | `utils/rag_type_detector.py` | Script CLI — mover a `scripts/` |
| `build_enterprise_startup_summary` alias | `utils/deploy_log.py:105-107` | Zero callers en todo el codebase |
| Clase `ChatbotLogger` + `get_component_logger` | `utils/logging_utils.py:124-211` | Ningún archivo importa esto (88 líneas) |
| Método `_group_documents_by_type()` | `rag/retrieval/retriever.py:960-965` | Zero callers |
| 10 imports zombie | `chat/manager.py:22,30,32,36-41` | `BotMessage`, `consume_stream`, `ToolContext`, `AIMessage`, `ToolMessage`, 4 constantes |
| `from dataclasses import replace` | `rag/retrieval/hierarchical_retriever.py:8` | Nunca invocado |
| `from rag.ingestion.models import ParentDocument` | `rag/retrieval/hierarchical_retriever.py:16` | Nunca referenciado |
| Clase `CacheMetrics` + 3 métodos `ChatbotCache` | `utils/chain_cache.py:13-131` | Duplica `MetricsCollector`; dead |

### Módulos redundantes (requieren cuidado)

| Redundancia | Diagnóstico | Acción |
|-------------|-------------|--------|
| `utils/chain_cache.py` entero | `CacheManager` lo reemplazó. `_init_cache()` solo loguea. | Eliminar; actualizar `core/bot.py` |
| `api/routes/rag/corpus_state.py` (12 líneas) | Adapter de 1 función que re-expone `rag/corpus_state.py` | Inlinear en `rag_routes.py` y eliminar |
| `utils/hashing.py` — `hash_text_md5` | Usa SHA-256 pero se llama MD5 — nombre engañoso | Renombrar a `hash_text_sha256` |

---

## Bloque 6 — Arquitectura & Reorganización

### Violaciones de capas actuales

| # | Ubicación | Violación |
|---|-----------|-----------|
| 1 | `api/bot_state_repo.py` | Repositorio (Redis+Mongo) viviendo en la capa HTTP |
| 2 | `api/bot_state_repo.py:16` | Un repo importa una ruta (`from .routes.bot.config_routes`) — inversión de dependencia |
| 3 | `api/auth.py` (497 líneas) | Lógica de negocio en rutas (login, token rotation, reset) |
| 4 | `memory/base_memory.py` | 3 responsabilidades: acceso Mongo + lógica de perfil + regex español |
| 5 | `models/auth.py` | DTOs de API (`LoginRequest`, `TokenResponse`) en la carpeta de modelos de dominio |
| 6 | `utils/whatsapp/` | Cliente de integración externa en `utils/` |
| 7 | `utils/rag_type_detector.py` | Script CLI de diagnóstico en `utils/` |

### Confusión de nombres (pares problemáticos)

| Nombre actual | Problema | Nombre propuesto |
|--------------|---------|-----------------|
| `core/request_context.py` | Estado por-turno de RAG — no es contexto HTTP | `chat/turn_context.py` |
| `utils/request_context.py` | Solo maneja el correlation ID de logging | `infra/request_id.py` |
| `memory/` | Parece cache de app; es memoria de conversación del chatbot | `chat/memory/` |
| `models/model_types.py` | Mapea providers LLM — no es un modelo de dominio | `core/llm_providers.py` |
| `api/auth.py` | "auth" = rutas aquí, library en `auth/` — mismo nombre, distinto rol | `api/routes/auth/auth_routes.py` |

### Estructura propuesta

```
backend/
├── main.py
├── config.py
├── config_fragments.py
│
├── api/                         # Solo HTTP: routers + schemas de transporte
│   ├── app.py
│   ├── routes/
│   │   ├── auth/auth_routes.py        ← thin, llama a services/auth_service.py
│   │   ├── bot/{bot_routes,config_routes}.py
│   │   ├── chat/chat_routes.py
│   │   ├── rag/rag_routes.py          ← inlinear corpus_state adapter aquí
│   │   ├── pdf/ inbox/ dashboard/ debug/ health/ users/ whatsapp/ assets/
│   └── schemas/
│       ├── auth.py                    ← desde models/auth.py
│       └── base.py pagination.py chat.py rag.py health.py pdf.py config.py
│
├── domain/                      ← renombrar models/
│   ├── user.py
│   └── message.py               ← desde common/objects.py
│
├── services/
│   ├── auth_service.py          ← extraer flujo login/refresh/reset de api/auth.py
│   ├── email_service.py
│   ├── classification/
│   └── inbox/
│
├── auth/                        # biblioteca auth (sin cambios en scope)
│   ├── jwt_handler.py password_handler.py middleware.py
│   ├── dependencies.py permissions.py token_blacklist.py
│
├── chat/
│   ├── manager.py handlers/ grounding.py verifier.py tool_dispatch.py
│   ├── locks.py cache_key.py debug.py
│   ├── turn_context.py          ← renombrar core/request_context.py
│   └── memory/                  ← mover desde memory/
│       ├── base_memory.py memory_types.py
│       └── profile_extractor.py ← extraer regex español de base_memory.py
│
├── core/
│   ├── bot.py chain.py prompt.py
│   ├── llm_providers.py         ← renombrar models/model_types.py
│   └── tools/
│
├── rag/                         # sin cambios estructurales
│   ├── corpus_centroid.py corpus_state.py
│   └── embeddings/ ingestion/ retrieval/ vector_store/
│
├── database/                    # todos los repos + cliente mongo
│   ├── mongodb.py
│   ├── bot_config_repository.py ← mover desde api/bot_state_repo.py
│   └── [resto de repositories sin cambios]
│
├── cache/                       # sin cambios
│
├── integrations/                ← nuevo: clientes externos
│   └── whatsapp/                ← mover desde utils/whatsapp/
│
├── infra/                       ← fusionar utils/ + common/
│   ├── request_id.py            ← renombrar utils/request_context.py
│   ├── constants.py             ← desde common/constants.py
│   ├── chunk_utils.py           ← desde common/chunk_utils.py
│   └── [resto de utils/ sin cambios de nombre]
│
└── scripts/                     # migraciones + herramientas de diagnóstico
    ├── migrate_categories_to_v2.py
    ├── backfill_inbox_message_stats.py
    └── rag_type_detector.py     ← mover desde utils/
```

---

## Plan de Acción Priorizado

### Semana 1 — CRÍTICO (no deployar sin esto)

- [ ] **SEC-C1** — Rotar las 4 credenciales de `.env` (OpenAI, Twilio ×2, Resend)
- [ ] **SEC-C2** — Cambiar JWT secret + validación de longitud/entropy en startup
- [ ] **SIL-C1** — `non_streaming.py:127-155`: propagar errores LLM como excepción tipada, no `200 OK`
- [ ] **SIL-C2** — `audit.py`: quitar `except: pass` del audit log
- [ ] **SIL-C3** — `webhook_routes.py:143`: loguear fallo de DLQ, nunca `pass`
- [ ] **SIL-C4** — `webhook_routes.py:259`: devolver 503 a Twilio cuando falla DB de sesión
- [ ] **PRAC-C1** — Reemplazar `time.sleep()` en rutas async con `await asyncio.sleep()`

### Semana 2 — ALTO (calidad & seguridad funcional)

- [ ] **SEC-H1** — Auth requerido en `GET /history/{id}`
- [ ] **SEC-H2** — Validar ownership de `conversation_id` en `POST /`
- [ ] **SEC-H5** — Devolver `"Internal server error"` genérico (no `str(e)`) al cliente
- [ ] **SIL-H1** — `mongodb.py:226`: relanzar excepción en vez de devolver vacío
- [ ] **SIL-H2** — `mongodb.py:133`: relanzar si los índices de unicidad no se crean
- [ ] **SIL-H3/H4** — Agregar `logger.warning` en cache invalidation y Redis delete
- [ ] **PRAC-H1** — Threading lock en JWT singleton (`jwt_handler.py:139`)
- [ ] **PRAC-H2** — Cifrar Twilio auth token antes de persistir en MongoDB
- [ ] **Limpieza dead code** — 8 ítems de eliminación segura (tabla Bloque 5)

### Semana 3 — MEDIO (arquitectura & coupling)

- [ ] **ARQ-1** — Mover `api/bot_state_repo.py` → `database/bot_config_repository.py` + romper import invertido
- [ ] **ARQ-2** — Extraer `services/auth_service.py` desde `api/auth.py` (497 líneas)
- [ ] **ARQ-3** — Mover `memory/` → `chat/memory/`; extraer regex a `profile_extractor.py`
- [ ] **ARQ-4** — Fusionar `utils/` + `common/` → `infra/`
- [ ] **ARQ-5** — Renombrar `core/request_context.py` → `chat/turn_context.py`
- [ ] **ARQ-6** — Renombrar `utils/request_context.py` → `infra/request_id.py`
- [ ] **ARQ-7** — Eliminar `utils/chain_cache.py` vestigial; actualizar `core/bot.py`
- [ ] **PRAC-H4** — Centralizar acceso a MongoDB con `Depends(get_db)` (15+ duplicados)
- [ ] **PRAC-M1** — Cambiar `LOG_LEVEL` default de `"DEBUG"` a `"INFO"`

### Semana 4 — REFACTOR estructural

- [ ] **ARQ-8** — Partir `rag/retrieval/retriever.py` (966 líneas) en `_retriever_base.py` + recortar métodos muertos en producción
- [ ] **PRAC-H3** — Descomponer `stream_with_tools()` (290 líneas) en `_run_react_loop()`, `_persist_turn()`, `_record_metrics()`
- [ ] **PRAC-H5** — Crear `UpdateBotConfigParams` dataclass para reemplazar función de 9 parámetros
- [ ] **SEC-M5** — Implementar RBAC real en `permissions.py` (actualmente todo colapsa a `is_admin`)
- [ ] **SEC-M4** — Eliminar log de resultado de password verification en `password_handler.py:90`
- [ ] **ARQ-9** — Mover `models/auth.py` → `api/schemas/auth.py`; renombrar `models/` → `domain/`
- [ ] **ARQ-10** — Renombrar `models/model_types.py` → `core/llm_providers.py`

---

## Orden recomendado para los moves de arquitectura

Hacer **un commit por move**, correr suite de tests tras cada uno:

1. `utils/rag_type_detector.py` → `scripts/` *(sin cambio de imports)*
2. Renombrar `utils/request_context.py` → `infra/request_id.py`
3. Renombrar `core/request_context.py` → `chat/turn_context.py`
4. Mover `api/bot_state_repo.py` → `database/bot_config_repository.py` *(romper import invertido primero)*
5. Eliminar `utils/chain_cache.py` *(actualizar `core/bot.py`)*
6. Inlinear `api/routes/rag/corpus_state.py` en `rag_routes.py` y eliminar
7. Mover `memory/` → `chat/memory/`
8. Mover `utils/whatsapp/` → `integrations/whatsapp/`
9. Fusionar `utils/` + `common/` → `infra/`
10. Renombrar `models/` → `domain/` + mover `models/auth.py` → `api/schemas/auth.py`

---

*Generado por auditoría ECC · 5 agentes en paralelo · 2026-06-27*
