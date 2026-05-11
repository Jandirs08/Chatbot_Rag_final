import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from pymongo import ASCENDING, DESCENDING, ReturnDocument

from .mongodb import get_mongodb_client, MongodbClient

logger = logging.getLogger(__name__)

HANDOFF_REASONS = ("user_request", "low_confidence", "out_of_scope")

# How far back the inbox looks for "recent activity". Conversations older than
# this fall out of the inbox view (still queryable directly by id).
_INBOX_WINDOW_DAYS = 30

_INBOX_PROJECTION = {
    "_id": 0,
    "conversation_id": 1, "channel": 1, "external_id": 1,
    "mode": 1, "stage": 1, "completed_at": 1,
    "category": 1, "urgency": 1, "ai_summary": 1,
    "ai_summary_at": 1, "ai_summary_at_msg_count": 1,
    "assigned_agent_id": 1, "pending_since": 1, "updated_at": 1,
    "last_message_at": 1, "message_count": 1,
    "lead_name": 1, "lead_email": 1, "lead_captured_at": 1,
    "lead_score": 1, "purchase_intent": 1, "product_interests": 1,
    "recommended_action": 1, "confidence": 1, "viewed_at": 1,
}


class ConversationRepository:
    def __init__(self, mongodb_client: Optional[MongodbClient] = None):
        self.mongodb_client = mongodb_client or get_mongodb_client()
        self.collection_name = "conversations"

    async def ensure_indexes(self) -> None:
        """Create the indexes the inbox actually queries.

        Note: this only CREATES — dropping legacy indexes (mode_pending_since,
        handoff_at_desc, mode_updated_at_idx, mode_category_score_updated_idx,
        lead_email_mode_idx, stage_updated_idx) must be done by an operator
        once the new sort key (last_message_at) is in use everywhere.
        """
        try:
            coll = self.mongodb_client.db[self.collection_name]
            # Primary lookup key — every mutation filters by this.
            await coll.create_index(
                "conversation_id",
                unique=True,
                name="conversation_id_unique",
            )
            # Webhook upsert path: (channel, external_id).
            await coll.create_index(
                [("channel", ASCENDING), ("external_id", ASCENDING)],
                unique=True,
                name="channel_external_id_unique",
            )
            # "Mis activas" tab + ownership filter.
            await coll.create_index(
                [("assigned_agent_id", ASCENDING), ("mode", ASCENDING)],
                name="agent_mode",
            )
            # Handoff stats aggregation (handoff_at filter).
            await coll.create_index(
                [("handoff_at", DESCENDING)],
                name="handoff_at_desc",
            )
            # Sort key for inbox listings (real "last activity" timestamp).
            await coll.create_index(
                [("last_message_at", DESCENDING)],
                name="last_message_at_desc",
            )
            # Active inbox hot path: stage + last_message_at sort.
            await coll.create_index(
                [("stage", ASCENDING), ("last_message_at", DESCENDING)],
                name="stage_last_message_idx",
            )
        except Exception as e:
            logger.exception("Error ensuring conversations indexes: %s", e)

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

    async def atomic_release_owned(self, conversation_id: str, agent_id: str) -> Optional[dict]:
        """Release back to bot only if caller owns the human takeover."""
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        return await coll.find_one_and_update(
            {
                "conversation_id": conversation_id,
                "mode": "human",
                "assigned_agent_id": agent_id,
            },
            {"$set": {"mode": "bot", "assigned_agent_id": None, "pending_since": None, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )

    async def atomic_set_stage(
        self, conversation_id: str, target_stage: str
    ) -> Optional[dict]:
        """Atomically flip stage. Returns updated doc, or None if already at target stage / unknown id."""
        if target_stage not in ("active", "completed"):
            return None
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        fields: dict = {"stage": target_stage, "updated_at": now}
        fields["completed_at"] = now if target_stage == "completed" else None
        return await coll.find_one_and_update(
            {"conversation_id": conversation_id, "stage": {"$ne": target_stage}},
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )

    async def atomic_capture_lead(
        self, conversation_id: str, lead_name: str, lead_email: str
    ) -> Optional[dict]:
        """Set lead only if not already captured for this conversation."""
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        return await coll.find_one_and_update(
            {"conversation_id": conversation_id, "lead_email": {"$in": [None, ""]}},
            {"$set": {"lead_name": lead_name, "lead_email": lead_email, "lead_captured_at": now, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )

    async def record_message_inserted(
        self, conversation_id: str, ts: Optional[datetime] = None
    ) -> None:
        """Bump last_message_at (sort key) AND increment message_count.

        Must be called by every site that inserts into the `messages` collection
        so the inbox reflects real chat activity and the denormalized count stays
        in sync. Forgetting to call this is the most common source of inbox drift.

        Uses $max on last_message_at so concurrent inserts can never push the
        sort key backwards (older message arriving late after a newer one).
        Failures are logged at ERROR (not raised) so a transient counter glitch
        does not cascade into losing the message itself, but is visible in logs.
        """
        coll = self.mongodb_client.db[self.collection_name]
        now = ts or datetime.now(timezone.utc)
        try:
            await coll.update_one(
                {"conversation_id": conversation_id},
                {
                    "$max": {"last_message_at": now},
                    "$inc": {"message_count": 1},
                },
            )
        except Exception as exc:
            logger.error(
                "record_message_inserted failed for conv=%s: %s",
                conversation_id, exc, exc_info=True,
            )

    async def mark_viewed(self, conversation_id: str, agent_id: str) -> None:
        """Mark conversation as viewed by an agent.

        Does NOT bump updated_at — viewing should not affect inbox sort
        (sort key is last_message_at, but we keep updated_at honest too).
        """
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        await coll.update_one(
            {"conversation_id": conversation_id},
            {"$set": {"viewed_at": now, "viewed_by": agent_id}},
        )

    async def find_by_lead_email(self, email: str) -> Optional[dict]:
        coll = self.mongodb_client.db[self.collection_name]
        return await coll.find_one({"lead_email": email})

    async def list_inbox_conversations(
        self,
        limit: int = 50,
        skip: int = 0,
        tab: str | None = None,
        agent_id: str | None = None,
        channel: str | None = None,
        has_lead: bool | None = None,
        only_unseen: bool = False,
    ) -> tuple[list, int]:
        coll = self.mongodb_client.db[self.collection_name]
        since = datetime.now(timezone.utc) - timedelta(days=_INBOX_WINDOW_DAYS)
        # Only conversations with at least one real message are shown in the inbox.
        # `last_message_at` is set by record_message_inserted on every message
        # insert; empty conversations (chat widget opened, never typed) are
        # filtered out.
        query: dict = {
            "mode": {"$in": ["bot", "human", "pending"]},
            "last_message_at": {"$gte": since},
        }

        # Tab filter (mutually exclusive with $in above — overrides mode set)
        if tab == "pendientes":
            query["mode"] = "pending"
        elif tab == "mias":
            query["mode"] = "human"
            if agent_id:
                query["assigned_agent_id"] = agent_id
        elif tab == "bot":
            query["mode"] = "bot"

        # Channel filter
        if channel and channel != "todos":
            query["channel"] = channel

        # Lead-captured filter
        if has_lead is True:
            query["lead_email"] = {"$nin": [None, ""]}
        elif has_lead is False:
            query["lead_email"] = {"$in": [None, ""]}

        # Only-unseen: conversation has new user activity since last view.
        # A doc is "unseen" if viewed_at is missing OR strictly older than last_message_at.
        if only_unseen:
            query["$expr"] = {
                "$or": [
                    {"$eq": [{"$ifNull": ["$viewed_at", None]}, None]},
                    {"$lt": [
                        {"$ifNull": ["$viewed_at", datetime(1970, 1, 1, tzinfo=timezone.utc)]},
                        {"$ifNull": ["$last_message_at", "$updated_at"]},
                    ]},
                ]
            }

        total = await coll.count_documents(query)
        # Sort by last_message_at (preferred) falling back to updated_at via $ifNull
        # is expensive in find(); rely on index on last_message_at and accept that
        # rows missing the field sort low (Mongo treats missing as null = lowest).
        docs = (
            await coll
            .find(query, _INBOX_PROJECTION)
            .sort([("last_message_at", -1), ("updated_at", -1)])
            .skip(skip)
            .limit(limit)
            .to_list(length=limit)
        )
        return docs, total

    async def inbox_tab_counts(
        self,
        channel: str | None = None,
        has_lead: bool | None = None,
        agent_id: str | None = None,
    ) -> dict:
        """Return {todos, pendientes, mias, bot} counts for inbox tab chips."""
        coll = self.mongodb_client.db[self.collection_name]
        since = datetime.now(timezone.utc) - timedelta(days=_INBOX_WINDOW_DAYS)
        # Same "had at least one message" filter as list_inbox_conversations.
        base: dict = {"last_message_at": {"$gte": since}}
        if channel:
            base["channel"] = channel
        if has_lead is True:
            base["lead_email"] = {"$nin": [None, ""]}
        elif has_lead is False:
            base["lead_email"] = {"$in": [None, ""]}

        todos_query = {**base, "mode": {"$in": ["bot", "human", "pending"]}}
        pendientes_query = {**base, "mode": "pending"}
        mias_query = {**base, "mode": "human"}
        if agent_id:
            mias_query["assigned_agent_id"] = agent_id
        bot_query = {**base, "mode": "bot"}

        import asyncio as _asyncio
        todos, pendientes, mias, bot = await _asyncio.gather(
            coll.count_documents(todos_query),
            coll.count_documents(pendientes_query),
            coll.count_documents(mias_query),
            coll.count_documents(bot_query),
        )
        return {"todos": todos, "pendientes": pendientes, "mias": mias, "bot": bot}

    async def auto_complete_idle(self, days: int = 7) -> int:
        """Close stage of conversations idle for `days` days.

        Excludes human-taken conversations (an agent owns them) and uses
        last_message_at when present so the sweep reflects real chat idleness.
        """
        coll = self.mongodb_client.db[self.collection_name]
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=max(1, int(days)))
        result = await coll.update_many(
            {
                "stage": "active",
                "mode": {"$nin": ["human", "pending"]},
                "$or": [
                    {"last_message_at": {"$lt": cutoff}},
                    {"last_message_at": {"$exists": False}, "updated_at": {"$lt": cutoff}},
                ],
            },
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
