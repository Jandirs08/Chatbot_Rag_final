# Backend Quality Audit — 2026-06-26

**Scope:** `backend/` · 25,229 líneas · 80+ archivos Python  
**Agentes:** python-reviewer, fastapi-reviewer, security-reviewer, silent-failure-hunter, refactor-cleaner

---

## Scores por Área

| Área | Score | Veredicto |
|---|---|---|
| Python Quality (calidad general, complejidad) | 5.8/10 | BLOCK |
| FastAPI (async, DI, schemas) | 6.1/10 | WARN |
| Security (auth, secrets, webhooks) | 6.0/10 | BLOCK |
| Silent Failures (errores tragados) | 4.0/10 | BLOCK |
| Dead Code (código muerto, duplicación) | 7.2/10 | OK |
| **GLOBAL** | **5.8/10** | **BLOCK** |

## Resumen de Issues

| Severidad | Count |
|---|---|
| CRITICAL | 8 |
| HIGH | 23 |
| MEDIUM | 18 |
| LOW | 6 |
| **Total** | **55** |

---

## SPRINT 1 — Inmediato (no deployar sin esto)

| # | Issue | Archivo | Línea | Fix |
|---|---|---|---|---|
| S1.1 | Credenciales live en .env | `backend/.env` | 27, 125-126, 132 | Rotar OpenAI + Twilio + Resend |
| S1.2 | bcrypt.checkpw síncrono en `async def login` (~300ms bloquea event loop) | `api/auth.py` | 103 | `await asyncio.to_thread(verify_password, ...)` |
| S1.3 | bcrypt.hashpw síncrono en 4 rutas async | `api/routes/users/users_routes.py` | 146, 215 | Mismo fix |
| S1.4 | Raw exception strings en HTTP 4xx/5xx responses | `api/routes/chat/chat_routes.py` | 91, 269, 511 | `detail="Error interno"` genérico; log completo server-side |
| S1.5 | `retrieve_documents` retorna `[]` en cualquier crash — indistinguible de corpus vacío | `rag/retrieval/retriever.py` | 784-790 | Re-raise como `RetrievalBackendUnavailableError` |
| S1.6 | Todos los errores LLM → string amigable → HTTP 200 OK — monitoring ve 100% success aunque LLM esté caído | `chat/handlers/non_streaming.py` | 139-155 | Raise `HTTPException` en errores reales |

### Detalle S1.1 — Credenciales en `.env`
```
OPENAI_API_KEY=sk-proj-HoqHh0OoEEPs...   # línea 27
TWILIO_ACCOUNT_SID=AC94f18c5d9...         # línea 125
TWILIO_AUTH_TOKEN=c639cd1be8ea...         # línea 126
RESEND_API_KEY=re_5HPHnWKh_HM...          # línea 132
```
`.env` está en `.gitignore` — no trackeado en git. Rotar igual. Riesgo: máquina comprometida, IDE sync, `git add .` accidental.

### Detalle S1.2/S1.3 — bcrypt async fix
```python
# auth.py:103
if not await asyncio.to_thread(verify_password, login_data.password, user.hashed_password):
    ...

# users_routes.py:146
hp = await asyncio.to_thread(hash_password, req.password)
```

### Detalle S1.5 — retriever re-raise
```python
# retriever.py línea 784 — reemplazar:
except Exception as exc:
    logger.error("Error retrieve_documents: %s", exc, exc_info=True)
    return []
# con:
except Exception as exc:
    logger.error("Error retrieve_documents: %s", exc, exc_info=True)
    self._last_gating_reason = "unexpected_error"
    raise RetrievalBackendUnavailableError(RETRIEVAL_UNAVAILABLE_MESSAGE) from exc
```

---

## SPRINT 2 — Esta semana (alta deuda técnica)

| # | Issue | Archivo | Línea | Fix |
|---|---|---|---|---|
| S2.1 | Token blacklist fail-open — Redis error → tokens revocados aceptados | `auth/token_blacklist.py` | 30 | Fail-closed para refresh tokens; fail-open solo para access tokens |
| S2.2 | JWT_SECRET placeholder pasa validación (60 chars, non-empty) | `config.py` | 192-199 | Add known-weak check + entropy validator |
| S2.3 | Qdrant sync client en ruta async | `api/routes/rag/rag_routes.py` | 133 | `asyncio.to_thread` o `AsyncQdrantClient` |
| S2.4 | `Path.write_bytes(5MB)` síncrono en `async def upload_logo` | `api/routes/assets/assets_routes.py` | 94 | `aiofiles.open` async |
| S2.5 | `reload_chain` estado inconsistente si `_build_pipeline()` lanza — bot silenciosamente en estado inválido | `core/bot.py` | 97-114 | Snapshot + rollback en exception |
| S2.6 | `redis_backend` — 3x `except Exception: pass` sin logs | `cache/redis_backend.py` | 79-84, 106-116, 118-132 | `logger.warning(..., exc_info=True)` en cada uno |
| S2.7 | `twilio_auth_token` declarado como `str` no `SecretStr` — aparece en repr/logs | `config_fragments.py` | 207-208 | `Optional[SecretStr]` |
| S2.8 | `str(exc)` en HTTP 500 detail — info leak | `api/routes/rag/rag_routes.py` | 82, 170, 210, 258 | Mensaje genérico + log interno |
| S2.9 | `chat_stream_log` parsea `request.json()` manualmente — bypasea DI y OpenAPI | `api/routes/chat/chat_routes.py` | 64-91 | Declarar `chat_input: ChatRequest` como parámetro typed |
| S2.10 | `users_routes.py` bypasea `UserRepository` — accede `mongodb_client.db[collection]` directo | `api/routes/users/users_routes.py` | 92-94, 163-169 | Agregar métodos a `UserRepository` |
| S2.11 | `_lexical_search` retorna `[]` con WARNING — mitad del pipeline híbrido muerta sin alerta real | `rag/retrieval/hierarchical_retriever.py` | 477-483 | Elevar a `logger.error(..., exc_info=True)` |
| S2.12 | `reload_chain` rollback faltante | `core/bot.py` | 97-114 | Ver fix abajo |

### Detalle S2.5 — bot.py rollback
```python
def reload_chain(self, new_settings=None):
    old_settings = self.settings
    old_chain_manager = self.chain_manager
    try:
        if new_settings is not None:
            self.settings = new_settings
        self.chain_manager = ChainManager(settings=self.settings, model_type=None, tools=self._tools)
        self._build_pipeline()
        self.logger.info("Chain reloaded successfully.")
    except Exception as e:
        self.settings = old_settings
        self.chain_manager = old_chain_manager
        self.logger.error("reload_chain failed — rolled back: %s", e, exc_info=True)
        raise
```

### Detalle S2.1 — token blacklist fail-closed selectivo
```python
async def is_blacklisted(self, jti: str, token_type: str = "access") -> bool:
    try:
        return bool(await self._r.exists(self._key(jti)))
    except Exception as e:
        logger.error("Blacklist check error: %s", e)
        if token_type in ("refresh", "reset"):
            return True  # fail-closed para tokens de larga vida
        return False     # fail-open solo para access tokens (TTL corto)
```

---

## SPRINT 3 — Refactor estructural

| # | Issue | Archivo | Esfuerzo |
|---|---|---|---|
| S3.1 | `retrieve_documents` 218L → extraer en helpers (`_RetrievalLogger`, `_orchestrate_retrieval`) | `rag/retrieval/retriever.py` | Grande |
| S3.2 | `stream_with_tools` 289L → extraer `_run_react_loop`, `_run_forced_final`, `_persist_turn` | `chat/handlers/agentic.py` | Grande |
| S3.3 | `app.py` 804L → `_register_middleware`, `_register_exception_handlers`, `_register_routers` | `api/app.py` | Medio |
| S3.4 | `chat_stream_log` 203L, 5-6 niveles de nesting → generators a nivel de módulo | `api/routes/chat/chat_routes.py` | Medio |
| S3.5 | Renombrar `filter` → `filter_criteria` (shadowing builtin) en 3 métodos | `rag/vector_store/vector_store.py` | Pequeño |
| S3.6 | ~50 f-strings en logger → `%`-style (lazy interpolation) | `app.py`, `chat_routes.py`, `bot.py`, `manager.py` | Medio |
| S3.7 | Mover constantes privadas `_REACT_STREAM_IDLE_TIMEOUT` etc. a `chat/constants.py` | `chat/handlers/agentic.py`, `chat/manager.py` | Pequeño |
| S3.8 | `_group_documents_by_type()` — 0 call sites en todo el backend | `rag/retrieval/retriever.py` | Eliminar |

---

## SPRINT 4 — Limpieza rápida (~496 líneas removibles)

| # | Acción | Archivos | Líneas | Tiempo |
|---|---|---|---|---|
| S4.1 | Eliminar `utils/rag_type_detector.py` — script suelto, 0 imports producción | 1 | ~150 | 5 min |
| S4.2 | Eliminar de `chain_cache.py`: `CacheMetrics`, `get_metrics()`, `get_llm_response()`, `set_llm_response()` | 1 | ~66 | 20 min |
| S4.3 | Extraer `_get_redis_client()` compartido a `utils/whatsapp/_redis.py` | 3 | ~20 net | 20 min |
| S4.4 | Eliminar dead models: `PasswordChangeRequest`, `LogoutResponse`, `UserLogin`, `PasswordHandler.hash()` alias | 4 | ~47 | 25 min |
| S4.5 | Unificar small-talk detection — `gating.py` como single source of truth, eliminar `_NO_SEARCH_RE` en agentic.py | 2 | ~16 | 30 min |

---

## Hallazgos Positivos

- JWT algorithm confusion bloqueado explícitamente (`jwt_handler.py`)
- Token type enforced en cada `verify_token` — previene cross-type replay
- bcrypt 12 rounds — correcto
- Twilio HMAC validado con SDK oficial (`RequestValidator`)
- MongoDB queries usan `re.escape()` antes de `$regex`
- Path traversal mitigado con `Path(filename).name` en rutas PDF
- Audit log consistente (login, logout, upload, etc.)
- Rate limiting en middleware + por-ruta via `@conditional_limit`
- 0 TODOs/FIXMEs en código de producción
- Sin copy-paste masivo ni God objects

---

## Issues Completos por Agente

### Python Quality

| Severidad | Archivo | Línea | Issue |
|---|---|---|---|
| HIGH | `api/routes/chat/chat_routes.py` | 91 | Pydantic error interno en HTTP 422 response |
| HIGH | `api/routes/chat/chat_routes.py` | 269, 511 | `str(e)` en HTTP 500 response |
| HIGH | `rag/retrieval/retriever.py` | — | 965L — 20% sobre límite; `retrieve_documents` 218L |
| HIGH | `api/app.py` | — | 804L; `create_app` 180L, `lifespan` 108L |
| HIGH | `chat/handlers/agentic.py` | 177 | `stream_with_tools` 289L — función más compleja del proyecto |
| HIGH | `rag/vector_store/vector_store.py` | 396, 484, 556 | Parámetro `filter` shadowing builtin Python |
| HIGH | `rag/vector_store/vector_store.py` | 197 | `embeddings: list = None` — anotación incorrecta, falla mypy |
| HIGH | `rag/retrieval/hierarchical_retriever.py` | 26-45 | 4 parámetros constructor sin type annotations |
| HIGH | `api/routes/chat/chat_routes.py` | 66 | `chat_stream_log` 203L, nesting 5-6 niveles |
| HIGH | `chat/manager.py` | 157 | `generate_streaming_response` 139L, nesting 4 niveles |
| HIGH | `rag/retrieval/retriever.py` | 107-122 | `measure_time` swallows exceptions con `except: pass` |
| HIGH | `api/app.py` | 39, 67 | 2x `except Exception: pass` en `_setup_logging_and_warnings` |
| MEDIUM | múltiples | — | ~50 f-strings en llamadas a logger (debe ser `%`-style) |
| MEDIUM | `api/routes/chat/chat_routes.py` | 184-199, 229-249 | SSE error pattern copy-pasted 3 veces |
| MEDIUM | `rag/retrieval/hierarchical_retriever.py` | 259 | `import numpy` dentro de función hot async |
| MEDIUM | `chat/manager.py` | 36-43 | Constantes privadas importadas de otro módulo (coupling) |
| MEDIUM | `rag/ingestion/hierarchical_chunker.py` | 632-635 | `prefix` param que hace `del prefix` inmediatamente — vestigial |
| LOW | `rag/retrieval/retriever.py` | 14 | `Dict`, `List`, `Tuple` deprecados (usar built-ins desde Python 3.9) |

### FastAPI

| Severidad | Archivo | Línea | Issue |
|---|---|---|---|
| CRITICAL | `api/auth.py` | 103 | bcrypt.checkpw en async route — bloquea event loop |
| CRITICAL | `auth/password_handler.py` | 46-47 | bcrypt.hashpw síncrono, 4 call sites async |
| CRITICAL | `api/routes/rag/rag_routes.py` | 133 | Qdrant sync client en async route |
| CRITICAL | `api/routes/assets/assets_routes.py` | 94 | `Path.write_bytes` síncrono en async route |
| HIGH | `api/app.py` | 645-650 | `sync_runtime_state` middleware: Redis + Mongo en cada request hot path |
| HIGH | `api/routes/chat/chat_routes.py` | 64-91 | `request.json()` manual — bypasea FastAPI DI y OpenAPI |
| HIGH | `api/routes/bot/config_routes.py` | 25-26 | Globals mutables sin lock — race condition bajo concurrencia |
| HIGH | `api/routes/users/users_routes.py` | 92-94 | Bypasea `UserRepository` — MongoDB directo en route handler |
| HIGH | `api/routes/assets/assets_routes.py` | 15-28 | `Path.mkdir()` + `Path.exists()` sync en cada request |
| HIGH | `api/routes/chat/chat_routes.py` | 267 | `str(e)` en HTTP 500 detail |
| MEDIUM | `api/routes/chat/chat_routes.py` | múltiples | Sin `response_model` en endpoints principales |
| MEDIUM | `api/routes/users/users_routes.py` | 133-138 | N+1: hasta 50 queries para username uniqueness check |
| MEDIUM | `api/routes/inbox/inbox_routes.py` | 384-390 | `LeadCaptureRequest.lead_email` regex casero — usar `EmailStr` |
| MEDIUM | `api/routes/whatsapp/webhook_routes.py` | 88, 122 | `WhatsAppClient()` nuevo en cada invocación (httpx.AsyncClient por mensaje) |
| MEDIUM | `api/app.py` | 706-714 | `allow_credentials=True` + fallback `["*"]` en dev — silently broken CORS |

### Security

| Severidad | Archivo | Línea | CWE | Issue |
|---|---|---|---|---|
| CRITICAL | `backend/.env` | 27 | CWE-798 | OpenAI API key live |
| CRITICAL | `backend/.env` | 125-126 | CWE-798 | Twilio SID + Auth Token live |
| CRITICAL | `backend/.env` | 132 | CWE-798 | Resend API key live |
| CRITICAL | `backend/.env` + `config.py` | 21, 192-199 | CWE-798 | JWT_SECRET placeholder pasa validación |
| HIGH | `auth/token_blacklist.py` | 30 | CWE-287 | Fail-open en Redis error — tokens revocados aceptados |
| HIGH | `config_fragments.py` | 207-208 | CWE-312 | `twilio_auth_token` como `str` no `SecretStr` |
| HIGH | `api/routes/rag/rag_routes.py` | 82, 170, 210, 258 | CWE-209 | `str(exc)` en HTTP 500 detail |
| MEDIUM | `api/routes/whatsapp/webhook_routes.py` | 178-183 | CWE-346 | `X-Forwarded-Proto` sin trusted-proxy allowlist |
| MEDIUM | `config_fragments.py` | 33 | CWE-942 | Default `cors_origins=["*"]` en no-producción |
| MEDIUM | `auth/password_handler.py` | 91 | CWE-532 | `logger.debug` del resultado de password verification |
| LOW | `api/auth.py` | 133 | CWE-352 | `samesite="lax"` — considerar `"strict"` |

### Silent Failures

| Severidad | Archivo | Línea | Patrón | Qué se oculta |
|---|---|---|---|---|
| CRITICAL | `rag/retrieval/retriever.py` | 784-790 | `except → return []` | Crash en retrieval = "0 docs" — indistinguible de corpus vacío |
| CRITICAL | `chat/handlers/non_streaming.py` | 139-155 | Todos los errores LLM → string | HTTP 200 OK aunque LLM esté caído |
| HIGH | `rag/retrieval/retriever.py` | 867-869 | `except → return docs` | Reranking falla silenciosamente; caller recibe resultados sin rankear |
| HIGH | `rag/retrieval/retriever.py` | 924-926 | `except → return docs[:k]` | MMR falla silenciosamente; diversificación perdida |
| HIGH | `core/bot.py` | 97-114 | catch + continue | Bot en estado inconsistente post-reload |
| HIGH | `rag/retrieval/hierarchical_retriever.py` | 477-483 | `except → return []` | Lexical search muerta; WARNING insuficiente |
| HIGH | `cache/redis_backend.py` | 79-84 | delete key + return None | Datos corruptos auto-eliminados invisiblemente |
| HIGH | `cache/redis_backend.py` | 106-116, 118-132 | `except: pass` x2 | Fallos de invalidación de cache invisibles |
| MEDIUM | `chat/handlers/non_streaming.py` | 54-55, 94-98 | `except: pass` | Cache get/set failures sin log |
| MEDIUM | `utils/chain_cache.py` | 113-121, 123-131 | `except → None/pass` | LLM cache failures invisibles |
| MEDIUM | `chat/handlers/agentic.py` | 131-134 | `except: pass` | Token count = 0 → budget caps incorrectos |
| MEDIUM | `utils/rate_limiter.py` | 20-32 | `except → "memory://"` | SecretStr resolution falla → rate limiting per-worker sin alerta |

### Dead Code

| Tipo | Símbolo | Archivo | Líneas |
|---|---|---|---|
| Script suelto | `rag_type_detector.py` | `utils/rag_type_detector.py` | ~150 |
| Clase muerta | `CacheMetrics` + métodos | `utils/chain_cache.py` | ~66 |
| Clase muerta | `ChatbotLogger` | `utils/logging_utils.py` | ~30 |
| Modelo muerto | `PasswordChangeRequest`, `LogoutResponse` | `models/auth.py` | ~30 |
| Modelo muerto | `UserLogin` | `models/user.py` | ~12 |
| Alias muerto | `build_enterprise_startup_summary` | `utils/deploy_log.py` | ~5 |
| Alias muerto | `PasswordHandler.hash()` | `auth/password_handler.py` | ~4 |
| Método muerto | `_group_documents_by_type()` | `rag/retrieval/retriever.py` | ~6 |
| Import no usado | `oauth2_scheme` | `auth/dependencies.py` | 1 |
| Import no usado | `AIMessage`, `ToolMessage`, `ToolContext` | `chat/manager.py` | 3 |
| Duplicación | `_get_redis_client()` | `whatsapp/idempotency.py` + `rate_limit.py` | ~20 |
| Duplicación | Small-talk detection | `rag/retrieval/gating.py` + `chat/handlers/agentic.py` | ~16 |
| Nombre engañoso | `hash_text_md5` usa SHA-256 | `utils/hashing.py` | rename |
| Param vestigial | `prefix` en `_build_stable_id` | `rag/ingestion/hierarchical_chunker.py` | 632-635 |

**Total removible: ~496 líneas**
