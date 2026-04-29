import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from pymongo import ASCENDING, DESCENDING, ReturnDocument

from .mongodb import get_mongodb_client, MongodbClient

logger = logging.getLogger(__name__)

_URGENCY_ORDER = {"alta": 0, "media": 1, "baja": 2}

HANDOFF_REASONS = ("user_request", "low_confidence", "out_of_scope")


class ConversationRepository:
    def __init__(self, mongodb_client: Optional[MongodbClient] = None):
        self.mongodb_client = mongodb_client or get_mongodb_client()
        self.collection_name = "conversations"

    async def ensure_indexes(self) -> None:
        try:
            coll = self.mongodb_client.db[self.collection_name]
            await coll.create_index(
                [("mode", ASCENDING), ("pending_since", ASCENDING)],
                name="mode_pending_since",
            )
            await coll.create_index(
                [("channel", ASCENDING), ("external_id", ASCENDING)],
                unique=True,
                name="channel_external_id_unique",
            )
            await coll.create_index(
                [("assigned_agent_id", ASCENDING), ("mode", ASCENDING)],
                name="agent_mode",
            )
            await coll.create_index(
                [("handoff_at", DESCENDING)],
                name="handoff_at_desc",
            )
        except Exception as e:
            logger.error(f"Error ensuring conversations indexes: {e}")

    async def get_or_create(self, channel: str, external_id: str, conversation_id: str) -> dict:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        doc = await coll.find_one_and_update(
            {"channel": channel, "external_id": external_id},
            {
                "$setOnInsert": {
                    "conversation_id": conversation_id,
                    "channel": channel,
                    "external_id": external_id,
                    "mode": "bot",
                    "category": None,
                    "urgency": None,
                    "ai_summary": None,
                    "assigned_agent_id": None,
                    "pending_since": None,
                    "lead_name": None,
                    "lead_email": None,
                    "lead_captured_at": None,
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return doc

    async def get_by_conversation_id(self, conversation_id: str) -> Optional[dict]:
        coll = self.mongodb_client.db[self.collection_name]
        return await coll.find_one({"conversation_id": conversation_id})

    async def set_mode(
        self,
        conversation_id: str,
        mode: str,
        agent_id: Optional[str] = None,
    ) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        update: dict = {"$set": {"mode": mode, "updated_at": now}}
        if mode == "pending":
            update["$set"]["pending_since"] = now
        if mode == "human":
            # Fix 2: clear pending_since when agent takes over so the wait timer stops
            update["$set"]["pending_since"] = None
        if mode == "bot":
            update["$set"]["assigned_agent_id"] = None
            update["$set"]["pending_since"] = None
        if agent_id is not None:
            update["$set"]["assigned_agent_id"] = agent_id
        await coll.update_one({"conversation_id": conversation_id}, update)

    async def set_classification(
        self,
        conversation_id: str,
        category: str,
        urgency: str,
        ai_summary: str,
    ) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {"conversation_id": conversation_id},
            {
                "$set": {
                    "category": category,
                    "urgency": urgency,
                    "ai_summary": ai_summary,
                    "updated_at": now,
                }
            },
        )

    async def list_pending(self) -> list:
        coll = self.mongodb_client.db[self.collection_name]
        docs = await coll.find({"mode": "pending"}).to_list(length=500)
        # Sort: alta first, then by pending_since ascending
        docs.sort(
            key=lambda d: (
                _URGENCY_ORDER.get(d.get("urgency") or "", 99),
                d.get("pending_since") or datetime.max.replace(tzinfo=timezone.utc),
            )
        )
        return docs

    async def list_active_for_agent(self, agent_id: str) -> list:
        coll = self.mongodb_client.db[self.collection_name]
        return await coll.find(
            {"mode": "human", "assigned_agent_id": agent_id}
        ).to_list(length=500)

    async def list_all_active(self) -> list:
        coll = self.mongodb_client.db[self.collection_name]
        return await coll.find({"mode": "human"}).to_list(length=500)

    async def set_lead(self, conversation_id: str, lead_name: str, lead_email: str) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {"conversation_id": conversation_id},
            {"$set": {"lead_name": lead_name, "lead_email": lead_email, "lead_captured_at": now, "updated_at": now}},
        )

    async def list_leads(self) -> list:
        coll = self.mongodb_client.db[self.collection_name]
        docs = await coll.find({"lead_email": {"$ne": None}, "mode": "bot"}).sort("updated_at", -1).to_list(length=200)
        return docs

    async def set_handoff_reason(self, conversation_id: str, reason: str) -> None:
        if reason not in HANDOFF_REASONS:
            logger.warning(
                "set_handoff_reason called with invalid reason=%s for conv=%s",
                reason,
                conversation_id,
            )
            return
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {"conversation_id": conversation_id},
            {
                "$set": {
                    "handoff_reason": reason,
                    "handoff_at": now,
                    "updated_at": now,
                }
            },
        )

    async def get_handoff_reason_counts(self, days: int) -> dict[str, int]:
        coll = self.mongodb_client.db[self.collection_name]
        since = datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))
        pipeline = [
            {
                "$match": {
                    "handoff_at": {"$gte": since},
                    "handoff_reason": {"$in": list(HANDOFF_REASONS)},
                }
            },
            {"$group": {"_id": "$handoff_reason", "count": {"$sum": 1}}},
        ]
        counts = {reason: 0 for reason in HANDOFF_REASONS}
        async for doc in coll.aggregate(pipeline):
            reason = doc.get("_id")
            if reason in counts:
                counts[reason] = int(doc.get("count", 0))
        return counts
