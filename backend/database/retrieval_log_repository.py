from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from langchain_core.documents import Document

from .mongodb import MongodbClient, get_mongodb_client

logger = logging.getLogger(__name__)

_COLLECTION = "retrieval_logs"
_TTL_SECONDS = 90 * 24 * 3600  # 90 days


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
