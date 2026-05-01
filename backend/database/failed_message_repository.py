import logging
from datetime import datetime, timezone
from typing import Optional

from .mongodb import get_mongodb_client, MongodbClient

logger = logging.getLogger(__name__)


class FailedMessageRepository:
    """Dead-letter queue for WhatsApp background task failures."""

    def __init__(self, mongodb_client: Optional[MongodbClient] = None):
        self.mongodb_client = mongodb_client or get_mongodb_client()
        self.collection_name = "failed_whatsapp_messages"

    async def ensure_indexes(self) -> None:
        try:
            coll = self.mongodb_client.db[self.collection_name]
            await coll.create_index("failed_at")
            await coll.create_index("wa_id")
        except Exception as e:
            logger.error(f"Error ensuring failed_whatsapp_messages indexes: {e}")

    async def record(
        self,
        wa_id: str,
        text: str,
        conversation_id: str,
        message_sid: str,
        error: str,
    ) -> None:
        try:
            coll = self.mongodb_client.db[self.collection_name]
            await coll.insert_one({
                "wa_id": wa_id,
                "text": text[:500],
                "conversation_id": conversation_id,
                "message_sid": message_sid,
                "error": str(error)[:500],
                "failed_at": datetime.now(timezone.utc),
            })
        except Exception as e:
            logger.error(f"FailedMessageRepository.record failed: {e}")
