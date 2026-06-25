# RAG Audit — Progress Tracker

**Audit completo:** 2026-06-25  
**Agentes usados:** 11 (fastapi, mle×2, react, security, database, silent-failure-hunter, python, a11y, performance, pr-test-analyzer)  
**Issues totales:** 116 (16 críticos, 39 altos, 43 medios, 18 bajos)  
**RAG Power Score:** 72/100 — Advanced RAG Tier  
**Informe completo:** `../RAG_AUDIT_2026-06-25.md`

---

## Batches

### ✅ B1 — Security + Code Quality (DONE 2026-06-25)

| Issue | Fix | Archivos |
|-------|-----|---------|
| ✅ SF-C1 | `get_memory` fallback usa `uuid.uuid4()` en vez de `"fallback_session"` | `core/bot.py` |
| ✅ PY-C1 | `hash_text_md5` migrado a SHA-256 internamente | `utils/hashing.py`, `tests/test_hashing.py` |
| ✅ API-C1 | `TokenBlacklist` migrado a `redis.asyncio`, 9 call sites con `await` | `auth/token_blacklist.py`, `api/auth.py`, `auth/dependencies.py`, `api/app.py` |
| ⏭️ DB-C2 | Twilio plaintext en MongoDB → necesita FERNET_KEY en .env | Pendiente junto con secrets |
| ⏭️ SEC-C1/C2 | Credenciales .env + JWT_SECRET | Pendiente — tarea manual |

### ✅ B2 — RAG Integrity (DONE 2026-06-25)

| Issue | Fix | Archivos |
|-------|-----|---------|
| ✅ RAG-C1 | `delete_by_source` ahora busca doc_ids pre-delete y bumpa cache | `hierarchical_ingestion_service.py`, `rag_parent_document_repository.py` |
| ✅ RAG-C2 | `asyncio.gather` con `return_exceptions=True` + error check en delete y store | `hierarchical_ingestion_service.py` |
| ✅ RAG-C3 | Gate post-reranking usa `c.rerank_score` en vez de `c.dense_score` | `hierarchical_retriever.py` |

---

### ✅ B3 — Silent Failures sweep (DONE 2026-06-25)

**Archivos tocados:** `retriever.py`, `hierarchical_retriever.py`, `bot.py`, `chat/manager.py`, `cache/manager.py`, `chat/handlers/agentic.py`

| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ SF-H1 | `retrieve_documents` exception → `self._last_gating_reason = "unexpected_error"` | `retriever.py` |
| ✅ SF-H2 | `retrieve_with_trace` → `exc_info=True` + `"error": str(exc)` en dict | `retriever.py` |
| ✅ SF-H3 | `_lexical_search` → try/except + `logger.warning + return []` | `hierarchical_retriever.py` |
| ✅ SF-M1 | `get_context_async` → `req_ctx.gating_reason = "unexpected_error"` + `exc_info=True` | `bot.py` |
| ✅ SF-M2 | `invalidate_rag_cache` → `logger.warning(..., exc_info=True)` | `retriever.py` |
| ✅ SF-M3 | `cache.increment` fallback silencioso → `_logger.warning(...)` | `cache/manager.py` |
| ✅ SF-M4 | Cache get/set silenciosos → `logger.warning(...)` en ambos sites | `chat/manager.py` |
| ✅ SF-M5 | HyDE cache get → `logger.debug("HyDE cache get failed, regenerating: %s", exc)` | `hierarchical_retriever.py` |
| ✅ SF-M6 | `_collect_prior_user_msgs` → `logger.warning(...)` antes de `return []` | `agentic.py` |

**MEDIUM adicionales encontrados por silent-failure-hunter (también aplicados):**
| ✅ | `_embed_query_async` → `logger.warning("[RAG][EMBEDDING] embed_query failed")` | `retriever.py` |
| ✅ | `_deserialize_documents` loop → `logger.warning("skipping malformed entry")` | `retriever.py` |
| ✅ | `_semantic_reranking` → añadido `exc_info=True` a `logger.error` | `retriever.py` |
| ✅ | `Bot.__init__` redis_url secret → `self.logger.warning(...)` | `bot.py` |
| ✅ | `generate_streaming_response` verification → `logger.warning(..., exc_info=True)` | `chat/manager.py` |
| ✅ | `_bot_has_search_tool` → `logger.warning(...)` | `agentic.py` |

---

### ✅ B4 — Backend + Database (DONE 2026-06-25)

**FastAPI:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ API-H1 | `export_conversations`: `limit` param + `to_list(length=limit)` | `chat_routes.py` |
| ⏭️ API-H2 | Pydantic validation ya ocurre via `ChatRequest(**data)` — no gap real | SKIP |
| ✅ API-H3 | `tool_fired` branch: persiste `text_accum` como ASSISTANT_ROLE | `agentic.py` |
| ✅ API-H4 | `get_history`: `source` null para callers sin auth | `chat_routes.py` |
| ✅ API-H5 | `input: str = Field(..., max_length=2000)` — schema-level | `schemas/chat.py` |
| ✅ API-M1 | `conditional_limit` guarda `not value` | `rate_limiter.py` |
| ⏭️ API-M2 | Raw `db.messages` en `get_history` es correcto — messages ≠ ConversationRepo | SKIP |
| ⏭️ API-M4 | `reload_chain` no existe en `bot_routes.py` | SKIP |
| ✅ SEC-FIX | `export_conversations` → `Depends(require_view_debug)` (HIGH fix post-review) | `chat_routes.py` |
| ✅ CLEANUP | Removed redundant manual `max_length` check (dead code tras API-H5) | `chat_routes.py` |

**Database:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ DB-C1 | `_average_doc_length` cacheado en instancia + comentario de aproximación | `rag_child_lexical_repository.py` |
| ⏭️ DB-H1 | BM25 postings cap — decisión arquitectural (Atlas Search) | Pendiente |
| ✅ DB-H2 | `get_by_doc_id_meta` con proyección sin `content` | `rag_parent_document_repository.py` |
| ⏭️ DB-H3 | `updated_at` ya cubierto por `mode_updated_at_idx` y `stage_updated_idx` | SKIP |
| ⏭️ DB-M2 | No existe `role_idx` en el codebase | SKIP |
| ⏭️ DB-M9 | No existe `upsert=True` en state transitions | SKIP |
| ⏭️ DB-M1,M3-M8 | Optimizaciones menores — diferir a refactor DB dedicado | Pendiente |

---

### ✅ B5 — Frontend: A11y + Performance + React (DONE 2026-06-25)

**A11y CRÍTICOS (WCAG Level A):**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ A11Y-C1 | Toggle buttons → `sr-only` spans dinámicos (mostrar/ocultar) | `RegisterForm.tsx` |
| ✅ A11Y-C2 | Chat textarea → `aria-label="Escribe un mensaje"` | `ChatWindow.tsx` |
| ⏭️ A11Y-C3 | Requiere refactor a per-field errors — `role="alert"` ya anuncia | pendiente |

**A11y ALTOS:**
| Issue | Estado |
|-------|--------|
| ✅ Skip link | `layout.tsx` + `id="main-content"` en `RootLayoutClient.tsx` |
| ✅ ConversationDialog focus | `onCloseAutoFocus` explícito en `DialogPrimitive.Content` |
| ✅ MobileColumnTabs roles | `role="tablist"` + `role="tab"` + `aria-selected` + `aria-label` en contenedor |
| ✅ Date inputs labels | `aria-label` con formato en ambos inputs de `ConversationFilters.tsx` |
| ✅ SSE live region | `aria-busy` + sr-only "Escribiendo…" en `ChatMessageBubble.tsx`; `aria-relevant="additions modifications text"` en `ChatWindow.tsx` |
| ✅ A11Y-H4 | Switch/Checkbox en `<label>` → `<div>` + `aria-label` directo al control | `InboxToolbar.tsx`, `observability/page.tsx` |
| ✅ A11Y-H5 | Avatar `alt="bot"` → `alt=""` (decorativo) | `ChatMessageBubble.tsx` |
| ✅ A11Y-H6 | Settings sidebar → `role="tablist"` + `role="tab"` + `aria-selected` | `settings/page.tsx` |
| ✅ A11Y-H7 | Indicador "cambios sin guardar" → `aria-hidden` dot + `sr-only` texto | `settings/page.tsx` |
| ✅ A11Y-H10 | Botón refresh → `aria-label` con hora + `aria-hidden` en contenido visual | `observability/page.tsx` |
| ✅ A11Y-H11 | `<p className="t-heading/t-section-title">` → `<h3>` | `KPISection.tsx`, `GatingSection.tsx` |
| ✅ A11Y-H12 | `isMutating` → `aria-busy` en card button | `InboxConversationCard.tsx` |
| ⏭️ A11Y-C3 | per-field errors en RegisterForm — requiere refactor form state | diferido |
| ⏭️ Medios (5) | aria-haspopup incorrecto, avatar "VT", reduced-motion, live region AnalyzingPlaceholder, aria-current+selected redundantes | diferido |

**Performance:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ PERF-C1 | `asyncio.gather(persist, add_to_memory)` en 2 sites | `chat/manager.py` |
| ⏭️ PERF-H1 | framer-motion lazy → investigar uso real en admin | Pendiente |
| ⏭️ PERF-H2 | dnd-kit lazy → `KanbanColumn` ya "use client", evaluar dynamic | Pendiente |
| ✅ PERF-H3 | `optimizePackageImports` expandido a 25 paquetes Radix | `next.config.js` |

**React:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ⏭️ FE-H1 KanbanCard | Ya no tiene hooks cliente directos | SKIP |
| ✅ FE-H1 KanbanColumn | `"use client"` añadido (usa `useDroppable`) | `KanbanColumn.tsx` |
| ✅ FE-H2 | `AbortController` en history fetch + AbortError guard | `chat/page.tsx` |
| ✅ FE-M1 | `contextValue` → `useMemo` | `AuthContext.tsx` |
| ✅ FE-M2 | `login` + `clearError` → `useCallback` | `AuthContext.tsx` |
| ⏭️ FE-M5 | `ConversationWorkspace.tsx` refactor (1124 líneas) | Diferido |
| ⏭️ FE-M6 | Virtualización KanbanColumn | Diferido |

---

### ✅ B6 — Tests + CI (DONE 2026-06-25)

| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ TEST-C1 | `test_auth.py` — 16 tests: JWT, TokenBlacklist (AsyncMock), dependencies | creado |
| ✅ TEST-C2 | `test_chat_routes.py` — 4 tests: 422, 503, history 200, export 401 | creado |
| ✅ TEST-C3 | CI → `pytest --cov=. --cov-report=term-missing --cov-fail-under=65` | `.github/workflows/backend-tests.yml` |
| ✅ TEST-C4 | `run_rag_e2e_eval.py` → `@pytest.mark.integration` wrapper + `pytest_configure` | `tests/evals/` |
| ⏭️ TEST-C5 | Frontend Playwright/Vitest — diferido (setup grande) | Pendiente |

---

## Decisiones pendientes del usuario

| # | Decisión | Estado |
|---|---------|--------|
| 1 | SEC-C1/C2: Rotar credenciales .env + nuevo JWT_SECRET | ⏳ Manual |
| 2 | DB-C2: Twilio plaintext — Fernet encryption o mover a .env | ⏳ Decidir |
| 3 | PY-C1 nota: hash_content_for_dedup ahora SHA-256 — re-ingestar PDFs o revertir a MD5 para dedup | ✅ Usuario dijo: staging, no importa |

---

## Notas de sesión

- Credential rotation: usuario decidió dejar para después (staging)
- `hash_text_md5` renombrado internamente a SHA-256 pero mantiene nombre por backward compat — candidato a renombrar en cleanup
- `get_doc_ids_by_source` añadido a `rag_parent_document_repository.py` (método nuevo para RAG-C1)
- Reviewer encontró `dependencies.py:59` sin `await` — corregido en la misma sesión
