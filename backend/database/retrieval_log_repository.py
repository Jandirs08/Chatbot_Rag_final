from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

from langchain_core.documents import Document

from .mongodb import MongodbClient, get_mongodb_client

logger = logging.getLogger(__name__)

# Strong references for fire-and-forget background tasks. Without this, Python
# 3.11+ may garbage-collect a pending Task before its coroutine finishes,
# silently losing the Mongo write. Pattern from CPython asyncio docs.
_BG_TASKS: set[asyncio.Task] = set()


def schedule_log_retrieval(
    *,
    conversation_id: str,
    query: str,
    docs: List[Document],
    latency_ms: float,
    gating_reason: Optional[str] = None,
) -> Optional[asyncio.Task]:
    """Fire-and-forget log_retrieval that holds a strong task reference.

    Use this from any caller that does not await the result (chat handlers,
    retrieval tool). Returns the Task or None if no running event loop.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop — nothing to schedule against. Caller should treat
        # this as a no-op (the metric will be missing, not crash the request).
        logger.debug("schedule_log_retrieval: no running event loop, skipping")
        return None

    coro = RetrievalLogRepository().log_retrieval(
        conversation_id=conversation_id,
        query=query,
        docs=docs,
        latency_ms=latency_ms,
        gating_reason=gating_reason,
    )
    task = loop.create_task(coro)
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)
    return task

_COLLECTION = "retrieval_logs"
_TTL_SECONDS = 90 * 24 * 3600  # 90 days

# Gating reasons that represent a knowledge gap: user asked, bot couldn't find
# relevant docs. Distinct from "small_talk"/"empty_query" (input noise) and from
# "agentic_rag_enabled"/"cheap_gate_pass" (success paths).
# Single source of truth for gap reasons + their display metadata.
# Keyed by the reason string (matches what gets persisted in retrieval_logs).
# Frontend fetches this via /dashboard/gap-reasons to render chips and
# severity colors — keeps backend and frontend in sync without redeploys.
#
# severity values: "crit" (red — corpus actually failed), "warn" (yellow —
# corpus might cover but doesn't), "info" (gray — noise / out of scope).
REASON_META: dict[str, dict[str, str]] = {
    # Retrieval-side failures: nothing useful came back from the corpus.
    "no_candidates":                 {"label": "Sin candidatos",          "severity": "crit"},
    "no_parent_candidates":          {"label": "Sin docs padre",          "severity": "crit"},
    "reranker_empty":                {"label": "Reranker vacío",          "severity": "warn"},
    "low_relevance_score":           {"label": "Relevancia baja",         "severity": "warn"},
    "embedding_failed":              {"label": "Falló vectorización",     "severity": "crit"},
    "retrieval_backend_unavailable": {"label": "Backend caído",           "severity": "crit"},
    # Post-response failure: retrieval returned docs but the assistant could
    # not ground an answer in them. Detected by chat.grounding pattern match
    # on the final response. Useful for catching corpus content that "looks
    # relevant by score" but doesn't actually answer the user's question.
    "answer_not_grounded":           {"label": "Bot no encontró respuesta", "severity": "warn"},
    # Pre-retrieval semantic gate: query embedding too far from corpus
    # centroid. Distinguishes "real gap in dominio" from "off-topic basura"
    # (e.g. iPhone, recetas) — important for actionable dashboard insights.
    "out_of_scope":                  {"label": "Fuera de alcance",        "severity": "info"},
}

GAP_REASONS: frozenset[str] = frozenset(REASON_META.keys())


class RetrievalLogRepository:
    def __init__(self, mongodb_client: Optional[MongodbClient] = None) -> None:
        self.mongodb_client = mongodb_client or get_mongodb_client()
        self.collection = self.mongodb_client.db[_COLLECTION]

    async def ensure_indexes(self) -> None:
        try:
            await self.collection.create_index(
                "logged_at",
                expireAfterSeconds=_TTL_SECONDS,
                name="logged_at_ttl",
            )
            await self.collection.create_index("conversation_id", name="conversation_id_idx")
            # Knowledge gaps dashboard query: filter by gating_reason + sort by logged_at.
            await self.collection.create_index(
                [("gating_reason", 1), ("logged_at", -1)],
                name="gating_reason_logged_at",
                sparse=True,
            )
        except Exception as exc:
            logger.error("Error ensuring retrieval_logs indexes: %s", exc)
            raise

    async def log_retrieval(
        self,
        *,
        conversation_id: str,
        query: str,
        docs: List[Document],
        latency_ms: float,
        gating_reason: Optional[str] = None,
    ) -> None:
        try:
            chunks = [
                {
                    "child_id": doc.metadata.get("child_id"),
                    "parent_id": doc.metadata.get("parent_id"),
                    "source": doc.metadata.get("source"),
                    "score": doc.metadata.get("score"),
                }
                for doc in docs
            ]
            await self.collection.insert_one(
                {
                    "conversation_id": conversation_id,
                    "query": query[:500],
                    "chunk_count": len(docs),
                    "chunks": chunks,
                    "latency_ms": round(latency_ms, 2),
                    "gating_reason": gating_reason,
                    "logged_at": datetime.now(timezone.utc),
                }
            )
        except Exception as exc:
            logger.warning("retrieval_log insert failed (non-fatal): %s", exc)
