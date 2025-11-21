import logging
from datetime import datetime, timezone
from typing import Optional
import uuid

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
        if doc and doc.get("conversation_id"):
            return str(doc.get("conversation_id"))
        conv_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {"wa_id": wa_id},
            {
                "$set": {
                    "wa_id": wa_id,
                    "conversation_id": conv_id,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        return conv_id

    async def touch(self, wa_id: str) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        await coll.update_one(
            {"wa_id": wa_id},
            {"$set": {"updated_at": datetime.now(timezone.utc)}},
            upsert=False,
        )