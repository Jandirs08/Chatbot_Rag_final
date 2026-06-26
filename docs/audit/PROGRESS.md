# RAG Audit — Progress Tracker

**Audit completo:** 2026-06-25  
**Agentes usados:** 11 (fastapi, mle×2, react, security, database, silent-failure-hunter, python, a11y, performance, pr-test-analyzer)  
**Issues totales:** 116 (16 críticos, 39 altos, 43 medios, 18 bajos)  
**Issues resueltos:** 74/116 (64%) — actualizado 2026-06-26 sesión final  
**RAG Power Score:** ~75/100 (era 72 — +3 eval/slice, CI gate implementado)  
**Estado:** ✅ AUDIT CERRADO — pendientes son deferidos intencionales o manuales  
**Informe completo:** `../RAG_AUDIT_2026-06-25.md`

---

## Puntuación actual por área

| Área | Score original | Score actual | Cambio |
|------|--------------|-------------|--------|
| Seguridad | 4/10 | 6.5/10 | +2.5 (H2 PDF, H4 CORS, M3 métodos, SEC-H1 rate limits) |
| RAG Pipeline | 6/10 | 8.5/10 | +2.5 (C1-C3, H1-H7, HyDE español, orden reranker) |
| FastAPI Backend | 6/10 | 8.5/10 | +2.5 (async Redis, limits, tool persist, API-M3 logging) |
| MongoDB / Database | 5/10 | 6/10 | +1 (full scan cache, proyección) |
| Python Code Quality | 6.5/10 | 7/10 | +0.5 (SHA-256, no .pop()) |
| Frontend React | 7/10 | 9/10 | +2 (boundaries, perf, AbortController, FE-H3 urgency, FE-M4 keys) |
| Accessibility | 4/10 | 8.5/10 | +4.5 (Sprint A11Y completo + P3) |
| Performance | 6.5/10 | 8/10 | +1.5 (asyncio.gather, radix imports, framer+dnd chunks) |
| Tests/Coverage | 4/10 | 6.5/10 | +2.5 (auth tests, CI, frontend Vitest) |
| **RAG como sistema** | **72/100** | **~75/100** | +3 (slice eval, CI gate) |
| **Global del proyecto** | **5.6/10** | **~7.8/10** | ✅ Listo para staging |

## Issues por severidad — estado final

| Severidad | Total | Resueltos | Pendientes (deferidos/manuales) |
|-----------|-------|-----------|--------------------------------|
| CRÍTICO | 16 | 14 | 2 (SEC-C1/C2 — rotar credenciales, manual) |
| ALTO | 39 | 31 | 8 (PY-H2/H3 sin tests, DB-H1 Atlas, PERF-H1/H2 diferidos, FE-H3 ✅, otros) |
| MEDIO | 43 | 25 | 18 (DB medios, API-M2, FE-M3/M6, RAG medios) |
| BAJO | 18 | 4 | 14 (docs OpenAPI público, widget postMessage, etc.) |
| **Total** | **116** | **74** | **42** |

## Para llegar a ~85-90 RAG (si se decide en el futuro)

| Mejora | Puntos | Decisión |
|--------|--------|---------|
| Faithfulness guard | +5 | DEFERIDO — no aplica claro al caso de uso actual |
| Multi-query expansion | +5 | DEFERIDO por usuario |
| PY-H2/H3 refactor | — | DEFERIDO — requiere tests de integración previos |
| DB-H1 BM25 cap | — | DEFERIDO — decisión arquitectural (Atlas Search) |

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
| ✅ A11Y-C3 | per-field `aria-invalid` + `aria-describedby` + `fieldErrors` state | `RegisterForm.tsx` (commit 9db41c4) |
| ✅ Medio VT | Avatar "VT" texto envuelto en `aria-hidden="true"` span | `ChatDetail.tsx` |
| ⏭️ Medios (4) | aria-haspopup, reduced-motion (4 componentes), live region AnalyzingPlaceholder, aria-current+selected redundantes | pendiente |

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
| ✅ FE-M5 | `ConversationWorkspace.tsx` → 414L + 5 módulos extraídos (commit b629f9a) | done |
| ⏭️ FE-M6 | Virtualización KanbanColumn | Diferido |

---

### ✅ B6 — Tests + CI (DONE 2026-06-25)

| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ TEST-C1 | `test_auth.py` — 16 tests: JWT, TokenBlacklist (AsyncMock), dependencies | creado |
| ✅ TEST-C2 | `test_chat_routes.py` — 4 tests: 422, 503, history 200, export 401 | creado |
| ✅ TEST-C3 | CI → `pytest --cov=. --cov-report=term-missing --cov-fail-under=65` | `.github/workflows/backend-tests.yml` |
| ✅ TEST-C4 | `run_rag_e2e_eval.py` → `@pytest.mark.integration` wrapper + `pytest_configure` | `tests/evals/` |
| ✅ TEST-C5 | Vitest + Playwright setup, 30 unit tests inbox-utils, register-validation, e2e auth | `frontend/__tests__/`, `frontend/e2e/` (commit 0cd0a1d) |

---

### ✅ B7 — RAG Pipeline + Security + Code Quality + Frontend (DONE 2026-06-26)

**RAG Pipeline:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ RAG-H1 | HyDE prompt cambiado a español: `"Escribe un párrafo breve..."` | `hierarchical_retriever.py:206` |
| ✅ RAG-H5 | Log falso `"RAGRetriever initialized"` en setter → `"gating_reason set to %r"` | `retriever.py:209` |
| ✅ RAG-H6 | OpenAI reranker `timeout=None` fallback → `30.0` segundos default | `reranker.py:56` |
| ✅ RAG-H7 | `format_context_from_documents` preserva orden de ranking (ya no agrupa por tipo) | `retriever.py:931-974` |

**Security:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ SEC-H2 | PDF upload: magic bytes `%PDF` check antes de save | `pdf_routes.py` |
| ✅ SEC-H4 | CORS `allow_methods/allow_headers` de `["*"]` → listas explícitas | `app.py:710-711` |

**Python Quality:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ PY-H1 | `_get_model` usa `.get()` + dict copy en vez de `.pop()` (no muta caller) | `chain.py:170` |

**Frontend:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ FE-H5 | `botService.getState()` flotante → `cancelled` flag + cleanup | `settings/page.tsx:150` |
| ✅ FE-M7 | Polling SWR: `if (document.hidden) return` — skip cuando tab oculto | `useChatStream.ts:109` |

**Infraestructura:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ INFRA | Stale `.claude/worktrees/*` eliminados (rompían `git status` tras mover proyecto) | `.claude/worktrees/` |
| ✅ INFRA | `hooksPath` en `.git/config` actualizado al path correcto | `.git/config` |
| ✅ INFRA | B1+B2 commiteados correctamente (estaban en working tree sin commit) | commit `6963bd0` |

---

### ✅ P3 — A11Y Medios + Eval/CI (DONE 2026-06-26)

**A11Y Medios:**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ A11Y-M-live | `AnalyzingPlaceholder`: `role="status"` + `aria-label="Analizando conversación"` | `SummaryCard.tsx:19` |
| ✅ A11Y-M-motion | `globals.css`: bloque `prefers-reduced-motion` expandido a 12 clases (skeleton-shimmer, bubble-in, fade, slide, status-pulse, halo-ring, orb-float, pulse-glow, typing-indicator) | `globals.css:488-508` |
| ⏭️ A11Y-M-haspopup | `aria-haspopup` valor incorrecto | cosmético — diferir |
| ⏭️ A11Y-M-current | `aria-current` + `aria-selected` redundantes | cosmético — diferir |

**Eval/CI (P4):**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ EVAL-gate | `--min-pass-rate` + `--min-faithfulness` CLI args — exit 2 si bajo threshold | `run_rag_e2e_eval.py:71-73` |
| ✅ EVAL-slice | `by_category` breakdown en summary JSON + print por categoría | `run_rag_e2e_eval.py:423-434` |

**FE-M7 (B7 uncommitted — commiteado ahora):**
| Issue | Fix | Estado |
|-------|-----|--------|
| ✅ FE-M7 | `document.hidden` guard en SWR polling — `useChatStream.ts:109` | `useChatStream.ts` |

---

## Issues diferidos — DECISIÓN FINAL

| Issue | Razón diferir indefinidamente |
|-------|------------------------------|
| **PY-H2** `_build_pipeline` 119L nesting=5 | Corazón del pipeline RAG. Sin tests para agentic/tool calls/WhatsApp = refactor ciego. Tocar solo DESPUÉS de escribir tests de integración para esas ramas. |
| **PY-H3** `generate_streaming_response` 134L nesting=6 | Igual que PY-H2. Misma condición. |
| **DB-H1** BM25 50K postings | Decisión arquitectural (Atlas Search vs custom). No urgente en <10K docs. |
| **PERF-H1/H2** framer-motion + dnd-kit lazy | Evaluar uso real primero. Bundle penalty existe pero no bloquea. |
| **aria-haspopup, aria-current** | Cosméticos. Solo impactan screen readers en edge cases de navegación. |

---

## Decisiones pendientes del usuario

| # | Decisión | Estado |
|---|---------|--------|
| 1 | SEC-C1/C2: Rotar credenciales .env + nuevo JWT_SECRET | ⏳ Manual — BLOQUEANTE para producción |
| 2 | DB-C2: Twilio plaintext — Fernet encryption o mover a .env | ⏳ Decidir |
| 3 | PY-C1: hash_content_for_dedup ahora SHA-256 — re-ingestar PDFs o dejar | ✅ Staging, no importa |
| 4 | Multi-query expansion | ⏳ Deferido por usuario ("aun en dudas") |

---

## Notas de sesión

- Credential rotation: usuario decidió dejar para después (staging)
- `hash_text_md5` mantiene nombre pero usa SHA-256 internamente — candidato a renombrar en cleanup
- `get_doc_ids_by_source` añadido a `rag_parent_document_repository.py` (RAG-C1)
- PY-H2/H3: NO tocar hasta tener tests de integración para agentic handler, tool calls, WhatsApp adapter
