"""Retrieval tool: lets the LLM fetch corpus context on demand.

Continuation mode — handler returns formatted documents as `ToolResult.content`.
The dispatcher surfaces the content to the caller, which feeds it back to the
model as a `ToolMessage` and re-streams.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any, Optional

from cache.manager import cache as _cache
from core.request_context import get_request_context
from database.retrieval_log_repository import GAP_REASONS, schedule_log_retrieval
from rag.corpus_state import get_corpus_cache_version
from .base import ToolContext, ToolDefinition, ToolResult

logger = logging.getLogger(__name__)

SEARCH_TOOL_NAME = "search_documents"

_DEFAULT_K = 4
_MIN_K = 1
_MAX_K = 8

# Hard cap on the formatted context returned to the model. Without this a
# single tool call with k=8 can dump 5-10k characters into the prompt — three
# successive calls would blow gpt-4o-mini's effective working context. 4000
# chars ≈ 1000 tokens, comfortable headroom for 3 iterations.
_MAX_TOOL_CONTENT_CHARS = 4000
_TRUNCATION_NOTICE = "\n\n[...contenido truncado para preservar el context window...]"

# Heuristics for the history-aware query expansion. The model is instructed in
# the system prompt to reformulate queries, but it occasionally emits short or
# pronoun-laden queries on follow-up turns ("y cuánto?", "el segundo cuánto
# cuesta"). When that happens we cheaply expand the query by prepending the
# last user message before sending it to the retriever — no extra LLM call.
_REFERENCE_TOKENS = frozenset({
    "ese", "esa", "eso", "este", "esta", "esto", "esos", "esas",
    "ahí", "ahi", "allí", "alli", "aquí", "aqui",
})
_FOLLOWUP_PREFIXES = (
    "y ", "y, ", "ahora ", "tambien ", "también ", "entonces ",
)
_MIN_QUERY_WORDS = 4

SEARCH_SCHEMA = {
    "type": "function",
    "function": {
        "name": SEARCH_TOOL_NAME,
        "description": (
            "Consulta el corpus documental para recuperar información factual "
            "(precios, procesos, productos, contactos, fechas, políticas). "
            "Llámala SOLO cuando necesites datos concretos del corpus que no "
            "estén ya en el bloque <context>. NO la llames para saludos, small "
            "talk, ni preguntas conversacionales."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "Reformulación clara y específica de la pregunta del "
                        "usuario para maximizar el recall (no copia literal)."
                    ),
                },
                "k": {
                    "type": "integer",
                    "minimum": _MIN_K,
                    "maximum": _MAX_K,
                    "default": _DEFAULT_K,
                    "description": "Número de fragmentos a recuperar (3-6 típico).",
                },
            },
            "required": ["query"],
        },
    },
}


def _resolve_retriever(ctx: ToolContext):
    """Pull the live retriever off ctx.app_state. Returns None if unavailable."""
    bot_instance = getattr(ctx.app_state, "bot_instance", None) if ctx.app_state else None
    if bot_instance is None:
        return None
    return getattr(bot_instance, "rag_retriever", None)


def _truncate_content(text: str) -> str:
    if len(text) <= _MAX_TOOL_CONTENT_CHARS:
        return text
    head_limit = _MAX_TOOL_CONTENT_CHARS - len(_TRUNCATION_NOTICE)
    head = text[:head_limit]
    # Prefer cutting at a paragraph boundary near the limit so we don't strand
    # a half-sentence or dangling source header. Only snap back if a boundary
    # exists within the last 400 chars of the head — otherwise keep the hard cut.
    cut = head.rfind("\n\n")
    if cut >= head_limit - 400:
        head = head[:cut]
    return head + _TRUNCATION_NOTICE


_MIN_PRIOR_MSG_CHARS = 10


def _maybe_expand_query(query: str, prior_user_msgs: list[str]) -> str:
    """Prepend the last user message when the query looks like a follow-up.

    Keeps the model's reformulation as the primary signal; only augments it
    when heuristics suggest a referential or under-specified query AND the
    prior message has enough substance to add useful signal (avoids polluting
    the query with terse confirmations like "ok" or "sí").
    """
    if not prior_user_msgs:
        return query
    last_prior = prior_user_msgs[-1].strip()
    if len(last_prior) < _MIN_PRIOR_MSG_CHARS:
        return query
    q = (query or "").strip()
    if not q:
        return query
    q_lower = q.lower()
    word_tokens = q_lower.split()
    short = len(word_tokens) < _MIN_QUERY_WORDS
    has_reference = any(tok in _REFERENCE_TOKENS for tok in word_tokens)
    is_followup = q_lower.startswith(_FOLLOWUP_PREFIXES)
    if not (short or has_reference or is_followup):
        return query
    return f"{last_prior} | {query}"


def _build_cache_key(query: str, k: int) -> str:
    payload = {"q": query, "k": k}
    return f"{SEARCH_TOOL_NAME}:" + json.dumps(payload, sort_keys=True, ensure_ascii=False)


_CROSS_TURN_PREFIX = "retrieval_tool:v2:"


def _safe_attr(obj: Any, name: str) -> Any:
    try:
        return getattr(obj, name, None)
    except Exception:
        return None


def _resolve_collection_name(obj: Any) -> Any:
    if obj is None:
        return None
    for attr in ("collection_name", "_collection_name", "documents_collection_name"):
        value = _safe_attr(obj, attr)
        if value:
            return value
    client = _safe_attr(obj, "client")
    if client is not None:
        for attr in ("collection_name", "_collection_name"):
            value = _safe_attr(client, attr)
            if value:
                return value
    return None


def _build_retriever_scope(retriever: Any, ctx: ToolContext) -> str:
    """Stable-ish scope so cached tool context cannot leak across corpora.

    Production retrievers expose collection/repository names. Unit-test stubs do
    not, so the object id fallback intentionally prevents cross-test pollution
    without affecting live retrievers that have a real storage scope.
    """
    extra = ctx.extra or {}
    explicit = extra.get("retrieval_cache_scope") or extra.get("tenant_id") or extra.get("bot_id")
    if explicit:
        return str(explicit)

    vector_store = _safe_attr(retriever, "child_vector_store") or _safe_attr(retriever, "vector_store")
    parent_repo = _safe_attr(retriever, "parent_repository")
    lexical_repo = _safe_attr(retriever, "lexical_repository")
    parts = {
        "retriever": type(retriever).__name__,
        "vector_collection": _resolve_collection_name(vector_store),
        "parent_collection": _resolve_collection_name(parent_repo),
        "lexical_collection": _resolve_collection_name(lexical_repo),
    }
    if any(value for key, value in parts.items() if key != "retriever"):
        raw = json.dumps(parts, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{type(retriever).__name__}:{id(retriever)}"


def _build_cross_turn_key(query: str, k: int, retriever: Any, ctx: ToolContext) -> str:
    payload = {
        "corpus_version": get_corpus_cache_version(),
        "scope": _build_retriever_scope(retriever, ctx),
        "q": query.lower().strip(),
        "k": int(k),
    }
    raw_payload = json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    digest = hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()
    return f"{_CROSS_TURN_PREFIX}{digest}"


async def _handler(args: dict, ctx: ToolContext) -> ToolResult:
    query = (args.get("query") or ctx.user_input or "").strip()
    try:
        k = int(args.get("k") or _DEFAULT_K)
    except (TypeError, ValueError):
        k = _DEFAULT_K
    k = max(_MIN_K, min(_MAX_K, k))

    retriever = _resolve_retriever(ctx)
    if retriever is None:
        logger.warning(
            "[RetrievalTool] no rag_retriever available conv=%s",
            ctx.conversation_id,
        )
        return ToolResult(
            content="No hay base documental disponible para esta consulta.",
        )

    if not query:
        return ToolResult(
            content="Consulta vacía — no se recuperó información.",
        )

    extra = ctx.extra or {}
    prior_user_msgs = extra.get("prior_user_msgs") or []
    turn_cache: Optional[dict] = extra.get("turn_tool_cache")

    # Cross-turn cache: keyed on original query (pre-expansion) so the same
    # user question hits regardless of conversation history changing the expansion.
    cross_key = _build_cross_turn_key(query, k, retriever, ctx)
    cross_cached = await _cache.aget(cross_key)
    if cross_cached is not None:
        logger.info(
            "[RetrievalTool] cross-turn cache HIT conv=%s q='%s'",
            ctx.conversation_id,
            query[:80],
        )
        if isinstance(turn_cache, dict):
            turn_cache[_build_cache_key(query, k)] = cross_cached
        return ToolResult(content=cross_cached)

    expanded_query = _maybe_expand_query(query, prior_user_msgs)
    if expanded_query != query:
        logger.debug(
            "[RetrievalTool] query expanded conv=%s orig='%s' expanded='%s'",
            ctx.conversation_id,
            query[:80],
            expanded_query[:120],
        )

    cache_key: Optional[str] = None
    if isinstance(turn_cache, dict):
        cache_key = _build_cache_key(expanded_query, k)
        cached = turn_cache.get(cache_key)
        if cached is not None:
            logger.info(
                "[RetrievalTool] turn-cache HIT conv=%s key='%s'",
                ctx.conversation_id,
                cache_key[:120],
            )
            return ToolResult(content=cached)

    # Wall-clock del retrieval step. Acumulativo: ReAct puede invocar la tool N veces
    # en un mismo turn — sumamos para que req_ctx.rag_time refleje el tiempo total
    # gastado en RAG, igual que el path eager non-agentic en bot.get_context_async.
    rag_start = time.perf_counter()
    try:
        docs = await retriever.retrieve_documents(query=expanded_query, k=k)
    except Exception as exc:
        logger.error(
            "[RetrievalTool] retrieve_documents failed conv=%s q='%s': %s",
            ctx.conversation_id,
            expanded_query,
            exc,
            exc_info=True,
        )
        return ToolResult(
            content="Error al consultar la base documental.",
        )
    finally:
        try:
            req_ctx = get_request_context()
            elapsed = time.perf_counter() - rag_start
            req_ctx.rag_time = (req_ctx.rag_time or 0.0) + elapsed
        except Exception:
            elapsed = time.perf_counter() - rag_start

    # Persist retrieval log so the dashboard can show knowledge gaps.
    # In the agentic path the LLM decides when to call this tool; without
    # logging here, those queries are invisible to admins.
    try:
        tool_gating_reason = getattr(retriever, "_last_gating_reason", None)
        # Stash on req_ctx so the post-response grounding check (in the agentic
        # handler's finally block) can include the actual candidate chunks in
        # its phantom-gap log entry — without them, admins can't see which
        # chunks "looked relevant" but failed to answer the user.
        try:
            req_ctx2 = get_request_context()
            req_ctx2.gating_reason = tool_gating_reason
            if docs:
                # Multi-tool-call turns: accumulate so we capture every retrieval
                # attempt the LLM made for the same user question.
                existing = list(getattr(req_ctx2, "retrieved_docs", None) or [])
                req_ctx2.retrieved_docs = existing + list(docs)
        except Exception:
            pass
        if docs or tool_gating_reason in GAP_REASONS:
            schedule_log_retrieval(
                conversation_id=ctx.conversation_id,
                query=expanded_query,
                docs=docs or [],
                latency_ms=elapsed * 1000,
                gating_reason=tool_gating_reason,
            )
    except Exception as exc:
        logger.debug("[RetrievalTool] retrieval log skipped: %s", exc)

    formatted = retriever.format_context_from_documents(docs) if docs else (
        "No se encontró información relevante para esa consulta en el corpus."
    )
    formatted = _truncate_content(formatted)
    logger.info(
        "[RetrievalTool] conv=%s q='%s' k=%s docs=%s chars=%s",
        ctx.conversation_id,
        expanded_query[:120],
        k,
        len(docs) if docs else 0,
        len(formatted),
    )

    if isinstance(turn_cache, dict) and cache_key is not None:
        turn_cache[cache_key] = formatted

    # Store in cross-turn Redis cache under original query key
    try:
        await _cache.aset(cross_key, formatted, ttl=_cache.ttl)
    except Exception:
        pass

    return ToolResult(content=formatted)


SEARCH_TOOL = ToolDefinition(
    name=SEARCH_TOOL_NAME,
    schema=SEARCH_SCHEMA,
    mode="continuation",
    handler=_handler,
    description="Search the document corpus",
)
