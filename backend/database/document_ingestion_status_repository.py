from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from database.mongodb import MongodbClient


DOCUMENT_INGESTION_STATUSES = ("queued", "processing", "ready", "failed")


class DocumentIngestionStatusRepository:
    def __init__(
        self,
        mongodb_client: MongodbClient,
        collection_name: str = "document_ingestion_status",
    ) -> None:
        self.mongodb_client = mongodb_client
        self.collection_name = collection_name
        self.collection = mongodb_client.db[collection_name]

    async def ensure_indexes(self) -> None:
        await self.collection.create_index("filename", unique=True, name="filename_unique")
        await self.collection.create_index("status", name="status_idx")
        await self.collection.create_index("updated_at", name="updated_at_idx")

    async def mark_queued(self, *, filename: str, file_path: str, size: int | None = None) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        payload = {
            "filename": filename,
            "file_path": file_path,
            "size": size,
            "status": "queued",
            "error": None,
            "doc_id": None,
            "parent_count": 0,
            "child_count": 0,
            "updated_at": now,
        }
        await self.collection.update_one(
            {"filename": filename},
            {
                "$set": payload,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        return payload

    async def mark_processing(self, filename: str) -> None:
        await self._set_status(filename, "processing")

    async def mark_ready(
        self,
        *,
        filename: str,
        doc_id: str | None,
        parent_count: int = 0,
        child_count: int = 0,
    ) -> None:
        await self._set_status(
            filename,
            "ready",
            error=None,
            doc_id=doc_id,
            parent_count=int(parent_count or 0),
            child_count=int(child_count or 0),
        )

    async def mark_failed(self, *, filename: str, error: str) -> None:
        await self._set_status(filename, "failed", error=str(error or "Ingestion failed")[:2000])

    async def delete(self, filename: str) -> None:
        await self.collection.delete_one({"filename": filename})

    async def clear(self) -> None:
        await self.collection.delete_many({})

    async def get(self, filename: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"filename": filename}, {"_id": 0})

    async def get_many(self, filenames: Iterable[str]) -> dict[str, dict[str, Any]]:
        filename_list = [str(name) for name in filenames if str(name)]
        if not filename_list:
            return {}
        docs = await self.collection.find(
            {"filename": {"$in": filename_list}},
            {"_id": 0},
        ).to_list(length=None)
        return {str(doc.get("filename")): doc for doc in docs}

    async def _set_status(self, filename: str, status: str, **fields: Any) -> None:
        if status not in DOCUMENT_INGESTION_STATUSES:
            raise ValueError(f"Invalid document ingestion status: {status}")
        payload = {
            "status": status,
            "updated_at": datetime.now(timezone.utc),
            **fields,
        }
        await self.collection.update_one({"filename": filename}, {"$set": payload}, upsert=True)
