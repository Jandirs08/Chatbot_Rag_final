import logging
from datetime import datetime, timezone
from typing import Optional
import uuid
from pymongo.errors import DuplicateKeyError

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
            await coll.create_index("updated_at")
        except Exception as e:
            logger.error(f"Error ensuring whatsapp_sessions indexes: {e}")

    async def get_or_create(self, wa_id: str) -> str:
        coll = self.mongodb_client.db[self.collection_name]
        doc = await coll.find_one({"wa_id": wa_id})
        if doc:
            cid = doc.get("conversation_id")
            if cid:
                return str(cid)
            conv_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            await coll.update_one(
                {"wa_id": wa_id},
                {"$set": {"conversation_id": conv_id, "updated_at": now}},
                upsert=False,
            )
            return conv_id
        conv_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        try:
            await coll.insert_one(
                {
                    "wa_id": wa_id,
                    "conversation_id": conv_id,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        except DuplicateKeyError:
            doc = await coll.find_one({"wa_id": wa_id})
            cid = doc.get("conversation_id") if doc else None
            if cid:
                return str(cid)
            await coll.update_one(
                {"wa_id": wa_id},
                {"$set": {"conversation_id": conv_id, "updated_at": now}},
                upsert=False,
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
            delta = (now - last).total_seconds()
            if delta < 60:
                return
        await coll.update_one(
            {"wa_id": wa_id},
            {"$set": {"updated_at": now}},
            upsert=False,
        )
