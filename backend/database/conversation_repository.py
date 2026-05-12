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
            # Covers inbox filtered by channel (web|whatsapp) within a mode bucket
            await coll.create_index(
                [("mode", ASCENDING), ("channel", ASCENDING), ("updated_at", DESCENDING)],
                name="mode_channel_updated_idx",
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
        docs = (
            await coll.find({"lead_email": {"$ne": None}, "mode": "bot"})
            .sort([("updated_at", DESCENDING), ("_id", DESCENDING)])
            .to_list(length=200)
        )
        return docs

    # No-match sentinel: $expr always-false, so no docs leak when caller forgets agent_id.
    _NO_MATCH = {"$expr": {"$eq": [1, 0]}}

    def _tab_mode_filter(self, tab: str, agent_id: Optional[str]) -> dict:
        """Mode/assignment delta for a tab. Empty dict for 'todos' (use base mode set)."""
        if tab == "pendientes":
            return {"mode": "pending"}
        if tab == "mias":
            # Without an agent context, "mías" is meaningless — return no-match so
            # we never accidentally show every human/paused conv to an unidentified caller.
            if not agent_id:
                return dict(self._NO_MATCH)
            return {"mode": {"$in": ["human", "paused"]}, "assigned_agent_id": agent_id}
        if tab == "otras":
            m = {"mode": {"$in": ["human", "paused"]}}
            if agent_id:
                m["$or"] = [
                    {"assigned_agent_id": None},
                    {"assigned_agent_id": {"$exists": False}},
                    {"assigned_agent_id": {"$ne": agent_id}},
                ]
            else:
                m["$or"] = [
                    {"assigned_agent_id": None},
                    {"assigned_agent_id": {"$exists": False}},
                ]
            return m
        if tab == "bot":
            return {"mode": "bot"}
        return {}

    def _build_inbox_query(
        self,
        days: int,
        tab: str,
        channel: Optional[str],
        has_lead: Optional[bool],
        only_unseen: bool,
        category: Optional[str],
        min_score: Optional[int],
        agent_id: Optional[str],
    ) -> dict:
        since = datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))
        query: dict = {"updated_at": {"$gte": since}}
        and_clauses: list[dict] = []

        tab_filter = self._tab_mode_filter(tab, agent_id)
        if tab_filter:
            query.update(tab_filter)
        else:
            query["mode"] = {"$in": ["bot", "human", "pending", "paused"]}

        if channel:
            query["channel"] = channel
        if has_lead is True:
            query["lead_email"] = {"$ne": None}
        elif has_lead is False:
            and_clauses.append(
                {"$or": [{"lead_email": None}, {"lead_email": {"$exists": False}}]}
            )
        if only_unseen:
            and_clauses.append(
                {"$or": [{"viewed_at": None}, {"viewed_at": {"$exists": False}}]}
            )
        if category is not None:
            query["category"] = category
        if min_score is not None:
            query["lead_score"] = {"$gte": min_score}
        if and_clauses:
            query["$and"] = and_clauses
        return query

    async def list_inbox_conversations(
        self,
        days: int = 30,
        limit: int = 50,
        skip: int = 0,
        category: str | None = None,
        min_score: int | None = None,
        tab: str = "todos",
        channel: Optional[str] = None,
        has_lead: Optional[bool] = None,
        only_unseen: bool = False,
        agent_id: Optional[str] = None,
    ) -> tuple[list, int]:
        coll = self.mongodb_client.db[self.collection_name]
        query = self._build_inbox_query(
            days, tab, channel, has_lead, only_unseen, category, min_score, agent_id
        )
        total = await coll.count_documents(query)
        docs = (
            await coll.find(query, _INBOX_PROJECTION)
            .sort([("updated_at", DESCENDING), ("_id", DESCENDING)])
            .skip(skip)
            .limit(limit)
            .to_list(length=limit)
        )
        return docs, total

    async def inbox_overview(
        self,
        days: int,
        tab: str,
        channel: Optional[str],
        has_lead: Optional[bool],
        min_score: Optional[int],
        agent_id: Optional[str],
    ) -> dict:
        """Single $facet aggregation: tabs counts + categories + unseen + metrics.

        Filters applied to base: channel + has_lead + min_score (mode = all).
        `only_unseen` is intentionally ignored here so chips/tiles show absolute
        distribution regardless of the "Solo no vistos" toggle. The toggle still
        scopes the actual list (`list_inbox_conversations`).

        - tabs.{todos,pendientes,mias,otras,bot}: per-mode counts
        - categories: kanban grouping for the active tab
        - unseen: count of unseen across the base set (badge value)
        - metrics: avg/with_lead/pending wait/mine stale/bot stats over base
        """
        coll = self.mongodb_client.db[self.collection_name]

        base = self._build_inbox_query(
            days, "todos", channel, has_lead, False, None, min_score, None
        )
        cat_tab_match = self._tab_mode_filter(tab, agent_id)
        mine_match = self._tab_mode_filter("mias", agent_id)
        otras_match = self._tab_mode_filter("otras", agent_id)

        now = datetime.now(timezone.utc)
        stale_cutoff = now - timedelta(minutes=5)

        categories_pipeline = []
        if cat_tab_match:
            categories_pipeline.append({"$match": cat_tab_match})
        categories_pipeline.append({
            "$group": {
                "_id": {
                    "$cond": [
                        {"$eq": ["$stage", "completed"]},
                        "__completed__",
                        {"$ifNull": ["$category", "__null__"]},
                    ]
                },
                "count": {"$sum": 1},
            }
        })

        facet: dict = {
            "tabs_todos": [{"$count": "n"}],
            "tabs_pendientes": [{"$match": {"mode": "pending"}}, {"$count": "n"}],
            "tabs_mias": [{"$match": mine_match}, {"$count": "n"}],
            "tabs_otras": [{"$match": otras_match}, {"$count": "n"}],
            "tabs_bot": [{"$match": {"mode": "bot"}}, {"$count": "n"}],
            "categories": categories_pipeline,
            "unseen": [
                {"$match": {"$or": [{"viewed_at": None}, {"viewed_at": {"$exists": False}}]}},
                {"$count": "n"},
            ],
            "lead_score_stats": [
                {"$match": {"lead_score": {"$ne": None}}},
                {"$group": {"_id": None, "avg": {"$avg": "$lead_score"}, "count": {"$sum": 1}}},
            ],
            "with_lead": [
                {"$match": {"lead_email": {"$ne": None}}},
                {"$count": "n"},
            ],
            "pending_wait": [
                {"$match": {"mode": "pending", "pending_since": {"$ne": None}}},
                {"$project": {
                    "wait_min": {"$divide": [
                        {"$subtract": [now, "$pending_since"]},
                        60000,
                    ]}
                }},
                {"$group": {"_id": None, "avg": {"$avg": "$wait_min"}, "max": {"$max": "$wait_min"}}},
            ],
            "mine_stale": [
                {"$match": {**mine_match, "updated_at": {"$lt": stale_cutoff}}},
                {"$group": {"_id": None, "count": {"$sum": 1}, "oldest": {"$min": "$updated_at"}}},
            ],
            "bot_unclassified": [
                {"$match": {"mode": "bot", "category": None}},
                {"$count": "n"},
            ],
            "bot_top_product": [
                # $type:"array" prevents $unwind from crashing on null values.
                {"$match": {"mode": "bot", "product_interests": {"$type": "array", "$ne": []}}},
                {"$unwind": "$product_interests"},
                {"$group": {"_id": "$product_interests", "count": {"$sum": 1}}},
                {"$sort": {"count": -1, "_id": 1}},
                {"$limit": 1},
            ],
        }

        pipeline = [{"$match": base}, {"$facet": facet}]
        result = await coll.aggregate(pipeline).to_list(length=1)
        first = result[0] if result else {}

        def _facet_n(key: str) -> int:
            arr = first.get(key) or []
            return int(arr[0].get("n", 0)) if arr else 0

        def _first_doc(key: str) -> dict:
            arr = first.get(key) or []
            return arr[0] if arr else {}

        def _round_int(v) -> Optional[int]:
            return int(round(v)) if v is not None else None

        tabs = {
            "todos": _facet_n("tabs_todos"),
            "pendientes": _facet_n("tabs_pendientes"),
            "mias": _facet_n("tabs_mias"),
            "otras": _facet_n("tabs_otras"),
            "bot": _facet_n("tabs_bot"),
        }

        categories: dict[str, int] = {}
        for row in first.get("categories", []) or []:
            categories[row["_id"]] = int(row.get("count", 0))

        score = _first_doc("lead_score_stats")
        pending = _first_doc("pending_wait")
        stale = _first_doc("mine_stale")
        top_product = _first_doc("bot_top_product")

        oldest_min: Optional[int] = None
        oldest_at = stale.get("oldest")
        if oldest_at is not None:
            if oldest_at.tzinfo is None:
                oldest_at = oldest_at.replace(tzinfo=timezone.utc)
            oldest_min = int((now - oldest_at).total_seconds() // 60)

        metrics = {
            "avg_lead_score": _round_int(score.get("avg")),
            "scored_count": int(score.get("count") or 0),
            "with_lead": _facet_n("with_lead"),
            "pending_avg_min": _round_int(pending.get("avg")),
            "pending_max_min": _round_int(pending.get("max")),
            "mine_stale_count": int(stale.get("count") or 0),
            "mine_oldest_stale_min": oldest_min,
            "bot_unclassified": _facet_n("bot_unclassified"),
            "bot_top_product": top_product.get("_id"),
            "bot_top_product_count": int(top_product.get("count") or 0),
        }

        return {
            "tabs": tabs,
            "categories": categories,
            "unseen": _facet_n("unseen"),
            "metrics": metrics,
        }

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
