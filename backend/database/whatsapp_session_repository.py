import logging
from datetime import datetime, timezone
from typing import Optional
import uuid
from pymongo import ReturnDocument

from .mongodb import get_mongodb_client, MongodbClient

logger = logging.getLogger(__name__)


class WhatsAppSessionRepository:
    def __init__(self, mongodb_client: Optional[MongodbClient] = None):
        self.mongodb_client = mongodb_client or get_mongodb_client()
        self.collection_name = "whatsapp_sessions"

    async def ensure_indexes(self) -> None:
        try:
            coll = self.mongodb_client.db[self.collection_name]
            await coll.create_index("wa_id", unique=True)
            # Drop legacy plain index before creating TTL variant (same field, different type).
            # Safe to call even if the old index doesn't exist.
            try:
                await coll.drop_index("updated_at_1")
            except Exception:
                pass
            # TTL: sessions inactive for 90 days are purged automatically
            await coll.create_index(
                "updated_at",
                expireAfterSeconds=90 * 24 * 3600,
                name="updated_at_ttl",
            )
        except Exception as e:
            logger.error(f"Error ensuring whatsapp_sessions indexes: {e}")

    async def get_or_create(self, wa_id: str) -> str:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        conv_id = str(uuid.uuid4())
        doc = await coll.find_one_and_update(
            {"wa_id": wa_id},
            {"$setOnInsert": {
                "wa_id": wa_id,
                "conversation_id": conv_id,
                "created_at": now,
                "updated_at": now,
            }},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        cid = doc.get("conversation_id")
        if cid:
            return str(cid)
        # Legacy doc without conversation_id — assign one now
        await coll.update_one(
            {"wa_id": wa_id, "conversation_id": {"$exists": False}},
            {"$set": {"conversation_id": conv_id, "updated_at": now}},
        )
        return conv_id

    async def touch(self, wa_id: str) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        doc = await coll.find_one({"wa_id": wa_id}, {"updated_at": 1})
        if not doc:
            return
        last = doc.get("updated_at")
        now = datetime.now(timezone.utc)
        if isinstance(last, datetime):
            try:
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
            except Exception:
                pass
            delta = (now - last).total_seconds()
            if delta < 60:
                return
        await coll.update_one(
            {"wa_id": wa_id},
            {"$set": {"updated_at": now}},
            upsert=False,
        )
