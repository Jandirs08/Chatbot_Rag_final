from __future__ import annotations

import logging
from typing import Sequence

from pymongo import ReplaceOne

from config import settings
from database.mongodb import MongodbClient
from rag.ingestion.models import ParentDocument

logger = logging.getLogger(__name__)


class RAGParentDocumentRepository:
    def __init__(
        self,
        mongodb_client: MongodbClient,
        collection_name: str | None = None,
    ) -> None:
        self.mongodb_client = mongodb_client
        self.collection_name = collection_name or settings.rag_parent_collection_name
        self.collection = mongodb_client.db[self.collection_name]

    async def ensure_indexes(self) -> None:
        try:
            await self.collection.create_index("parent_id", unique=True, name="parent_id_unique")
            await self.collection.create_index("doc_id", name="doc_id_idx")
            await self.collection.create_index("source", name="source_idx")
            await self.collection.create_index("page_span.start_page", name="page_start_idx")
            await self.collection.create_index("page_span.end_page", name="page_end_idx")
        except Exception as exc:
            logger.error("Error ensuring rag parent document indexes: %s", exc, exc_info=True)
            raise

    async def upsert_documents(self, parents: Sequence[ParentDocument]) -> int:
        if not parents:
            return 0

        operations = [
            ReplaceOne(
                {"parent_id": parent.parent_id},
                parent.model_dump(),
                upsert=True,
            )
            for parent in parents
        ]
        result = await self.collection.bulk_write(operations, ordered=False)
        return int(
            (getattr(result, "upserted_count", 0) or 0)
            + (getattr(result, "modified_count", 0) or 0)
        )

    async def delete_by_doc_id(self, doc_id: str) -> int:
        result = await self.collection.delete_many({"doc_id": doc_id})
        return int(getattr(result, "deleted_count", 0) or 0)

    async def delete_by_source(self, source: str) -> int:
        result = await self.collection.delete_many({"source": source})
        return int(getattr(result, "deleted_count", 0) or 0)

    async def count_by_doc_id(self, doc_id: str) -> int:
        return int(await self.collection.count_documents({"doc_id": doc_id}))

    async def clear(self) -> int:
        result = await self.collection.delete_many({})
        return int(getattr(result, "deleted_count", 0) or 0)

    async def get_by_doc_id(self, doc_id: str) -> list[ParentDocument]:
        cursor = self.collection.find({"doc_id": doc_id}).sort("parent_index", 1)
        docs = await cursor.to_list(length=None)
        return [ParentDocument(**doc) for doc in docs]

    async def get_by_parent_ids(self, parent_ids: Sequence[str]) -> list[ParentDocument]:
        if not parent_ids:
            return []

        cursor = self.collection.find({"parent_id": {"$in": list(parent_ids)}})
        docs = await cursor.to_list(length=None)
        mapped = {doc["parent_id"]: ParentDocument(**doc) for doc in docs}
        return [mapped[parent_id] for parent_id in parent_ids if parent_id in mapped]
