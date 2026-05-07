import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from pymongo import ASCENDING, DESCENDING, ReturnDocument

from .mongodb import get_mongodb_client, MongodbClient

logger = logging.getLogger(__name__)

HANDOFF_REASONS = ("user_request", "low_confidence", "out_of_scope")

_INBOX_PROJECTION = {
    "_id": 0,
    "conversation_id": 1, "channel": 1, "external_id": 1,
    "mode": 1, "stage": 1, "completed_at": 1,
    "category": 1, "urgency": 1, "ai_summary": 1,
    "ai_summary_at": 1, "ai_summary_at_msg_count": 1,
    "assigned_agent_id": 1, "pending_since": 1, "updated_at": 1,
    "lead_name": 1, "lead_email": 1, "lead_captured_at": 1,
    "lead_score": 1, "purchase_intent": 1, "product_interests": 1,
    "recommended_action": 1, "confidence": 1, "viewed_at": 1,
}


class ConversationRepository:
    def __init__(self, mongodb_client: Optional[MongodbClient] = None):
        self.mongodb_client = mongodb_client or get_mongodb_client()
        self.collection_name = "conversations"

    async def ensure_indexes(self) -> None:
        try:
            coll = self.mongodb_client.db[self.collection_name]
            # Primary lookup key — every mutation filters by this
            await coll.create_index(
                "conversation_id",
                unique=True,
                name="conversation_id_unique",
            )
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
            # Covers auto_complete_idle: {stage, updated_at < cutoff}
            await coll.create_index(
                [("stage", ASCENDING), ("updated_at", ASCENDING)],
                name="stage_updated_idx",
            )
            # Covers list_inbox_conversations: {mode: $in, updated_at: $gte}
            await coll.create_index(
                [("mode", ASCENDING), ("updated_at", DESCENDING)],
                name="mode_updated_at_idx",
            )
            # Covers list_leads: {lead_email: $ne, mode: bot}
            await coll.create_index(
                [("lead_email", ASCENDING), ("mode", ASCENDING)],
                sparse=True,
                name="lead_email_mode_idx",
            )
            # Covers complex inbox filters: {mode, category, lead_score, updated_at}
            await coll.create_index(
                [("mode", ASCENDING), ("category", ASCENDING), ("lead_score", ASCENDING), ("updated_at", DESCENDING)],
                name="mode_category_score_updated_idx",
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
                    "stage": "active",
                    "completed_at": None,
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
        lead_score: Optional[int] = None,
        purchase_intent: Optional[int] = None,
        product_interests: Optional[list] = None,
        recommended_action: Optional[str] = None,
        confidence: Optional[float] = None,
        msg_count_at_classify: Optional[int] = None,
    ) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        fields: dict = {
            "category": category,
            "urgency": urgency,
            "ai_summary": ai_summary,
            "updated_at": now,
        }
        if lead_score is not None:
            fields["lead_score"] = lead_score
        if purchase_intent is not None:
            fields["purchase_intent"] = purchase_intent
        if product_interests is not None:
            fields["product_interests"] = product_interests
        if recommended_action is not None:
            fields["recommended_action"] = recommended_action
        if confidence is not None:
            fields["confidence"] = confidence
        if msg_count_at_classify is not None:
            fields["last_classified_msg_count"] = msg_count_at_classify
            fields["ai_summary_at_msg_count"] = msg_count_at_classify
            fields["ai_summary_at"] = now
        await coll.update_one(
            {"conversation_id": conversation_id},
            {"$set": fields},
        )

    async def set_summary_only(
        self,
        conversation_id: str,
        ai_summary: str,
        msg_count_at_summary: int,
    ) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {"conversation_id": conversation_id},
            {
                "$set": {
                    "ai_summary": ai_summary,
                    "ai_summary_at_msg_count": msg_count_at_summary,
                    "ai_summary_at": now,
                    "updated_at": now,
                }
            },
        )


    async def atomic_takeover(self, conversation_id: str, agent_id: str) -> Optional[dict]:
        """Atomically claim a conversation from bot/pending. Returns updated doc or None if already in human mode."""
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        return await coll.find_one_and_update(
            {"conversation_id": conversation_id, "mode": {"$ne": "human"}},
            {"$set": {"mode": "human", "assigned_agent_id": agent_id, "pending_since": None, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )

    async def mark_viewed(self, conversation_id: str, agent_id: str) -> None:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {"conversation_id": conversation_id},
            {"$set": {"viewed_at": now, "viewed_by": agent_id, "updated_at": now}},
        )

    async def find_by_lead_email(self, email: str) -> Optional[dict]:
        coll = self.mongodb_client.db[self.collection_name]
        return await coll.find_one({"lead_email": email})

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

    async def list_inbox_conversations(
        self,
        days: int = 30,
        limit: int = 50,
        skip: int = 0,
        category: str | None = None,
        min_score: int | None = None,
    ) -> tuple[list, int]:
        coll = self.mongodb_client.db[self.collection_name]
        since = datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))
        query: dict = {
            "mode": {"$in": ["bot", "human", "pending", "paused"]},
            "updated_at": {"$gte": since},
        }
        if category is not None:
            query["category"] = category
        if min_score is not None:
            query["lead_score"] = {"$gte": min_score}
        total = await coll.count_documents(query)
        docs = await coll.find(query, _INBOX_PROJECTION).sort("updated_at", -1).skip(skip).limit(limit).to_list(length=limit)
        return docs, total

    async def set_stage(self, conversation_id: str, stage: str) -> None:
        if stage not in ("active", "completed"):
            return
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        fields: dict = {"stage": stage, "updated_at": now}
        if stage == "completed":
            fields["completed_at"] = now
        else:
            fields["completed_at"] = None
        await coll.update_one(
            {"conversation_id": conversation_id},
            {"$set": fields},
        )

    async def auto_complete_idle(self, days: int = 7) -> int:
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=max(1, int(days)))
        result = await coll.update_many(
            {"stage": "active", "updated_at": {"$lt": cutoff}},
            {"$set": {"stage": "completed", "completed_at": now}},
        )
        return int(result.modified_count or 0)

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
