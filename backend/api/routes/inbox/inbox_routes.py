import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from infra.logging_utils import get_logger
from infra.rate_limiter import conditional_limit
from config import settings

from auth.dependencies import require_admin
from database.conversation_repository import ConversationRepository
from database.mongodb import get_mongodb_client
from services.classification import classify_conversation, regenerate_summary

from api.schemas.pagination import Page
from .schemas import AgentMessageRequest, ConversationCard, ConversationCategory, HandoffStatsResponse, InboxCounts, InboxMetrics, InboxResponse

logger = get_logger(__name__)
router = APIRouter(tags=["inbox"])


_LAST_USER_MSG_MAX_CHARS = 200


def _to_card(
    doc: dict,
    message_count: Optional[int] = None,
    last_user_message: Optional[dict] = None,
) -> ConversationCard:
    pending_since: Optional[datetime] = doc.get("pending_since")
    minutes_waiting: Optional[int] = None
    if pending_since is not None:
        if pending_since.tzinfo is None:
            pending_since = pending_since.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - pending_since
        minutes_waiting = int(delta.total_seconds() // 60)

    last_msg_text: Optional[str] = None
    last_msg_at: Optional[datetime] = None
    if last_user_message:
        raw = (last_user_message.get("content") or "").strip()
        if raw:
            last_msg_text = raw[:_LAST_USER_MSG_MAX_CHARS]
            if len(raw) > _LAST_USER_MSG_MAX_CHARS:
                last_msg_text += "…"
        last_msg_at = last_user_message.get("timestamp")

    return ConversationCard(
        conversation_id=doc.get("conversation_id", ""),
        channel=doc.get("channel", ""),
        external_id=doc.get("external_id", ""),
        mode=doc.get("mode", "bot"),
        stage=doc.get("stage", "active"),
        completed_at=doc.get("completed_at"),
        category=doc.get("category"),
        urgency=doc.get("urgency"),
        ai_summary=doc.get("ai_summary"),
        ai_summary_at=doc.get("ai_summary_at"),
        ai_summary_at_msg_count=doc.get("ai_summary_at_msg_count"),
        message_count=message_count,
        assigned_agent_id=doc.get("assigned_agent_id"),
        pending_since=pending_since,
        minutes_waiting=minutes_waiting,
        updated_at=doc.get("updated_at"),
        lead_name=doc.get("lead_name"),
        lead_email=doc.get("lead_email"),
        lead_captured_at=doc.get("lead_captured_at"),
        lead_score=doc.get("lead_score"),
        purchase_intent=doc.get("purchase_intent"),
        product_interests=doc.get("product_interests"),
        recommended_action=doc.get("recommended_action"),
        confidence=doc.get("confidence"),
        viewed_at=doc.get("viewed_at"),
        last_user_message=last_msg_text,
        last_user_message_at=last_msg_at,
    )


async def _count_messages_by_conversation(
    db, conversation_ids: list[str]
) -> dict[str, int]:
    """Single aggregation to get message counts for many conversations at once.

    Avoids N+1 count_documents calls when building the inbox list.
    """
    if not conversation_ids:
        return {}
    pipeline = [
        {"$match": {"conversation_id": {"$in": conversation_ids}}},
        {"$group": {"_id": "$conversation_id", "count": {"$sum": 1}}},
    ]
    counts: dict[str, int] = {}
    async for row in db.messages.aggregate(pipeline):
        counts[row["_id"]] = int(row.get("count", 0))
    return counts


async def _last_user_messages_by_conversation(
    db, conversation_ids: list[str]
) -> dict[str, dict]:
    """Fetch the most recent user message per conversation in one aggregation."""
    if not conversation_ids:
        return {}
    pipeline = [
        {"$match": {"conversation_id": {"$in": conversation_ids}, "role": "user"}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$conversation_id",
            "content": {"$first": "$content"},
            "timestamp": {"$first": "$timestamp"},
        }},
    ]
    out: dict[str, dict] = {}
    async for row in db.messages.aggregate(pipeline):
        out[row["_id"]] = {"content": row.get("content"), "timestamp": row.get("timestamp")}
    return out


def _get_conv_repo(request: Request) -> ConversationRepository:
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    return ConversationRepository(mongodb_client)


@router.get("/conversations/inbox", response_model=InboxResponse)
@conditional_limit("60/minute")
async def get_inbox(
    request: Request,
    _current_user=Depends(require_admin),
    response: Response = None,
    tab: str = Query("todos", pattern="^(todos|pendientes|mias|otras|bot)$"),
    channel: Optional[str] = Query(None, pattern="^(web|whatsapp)$"),
    datos: str = Query("todos", pattern="^(todos|leads|sin_datos)$"),
    only_unseen: bool = Query(False),
    category: Optional[ConversationCategory] = Query(None),
    min_score: Optional[int] = Query(None, ge=0, le=100),
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0, le=1_000_000),
):
    repo = _get_conv_repo(request)
    has_lead: Optional[bool] = None
    if datos == "leads":
        has_lead = True
    elif datos == "sin_datos":
        has_lead = False
    user_id = str(_current_user.id)
    list_agent_id = user_id if tab in ("mias", "otras") else None

    docs, total = await repo.list_inbox_conversations(
        category=category.value if category else None,
        min_score=min_score,
        limit=limit,
        skip=skip,
        tab=tab,
        channel=channel,
        has_lead=has_lead,
        only_unseen=only_unseen,
        agent_id=list_agent_id,
    )
    overview = await repo.inbox_overview(
        days=30,
        tab=tab,
        channel=channel,
        has_lead=has_lead,
        min_score=min_score,
        agent_id=user_id,
    )

    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    conv_ids = [d.get("conversation_id") for d in docs if d.get("conversation_id")]
    msg_counts = await _count_messages_by_conversation(mongodb_client.db, conv_ids)
    last_msgs = await _last_user_messages_by_conversation(mongodb_client.db, conv_ids)
    items = [
        _to_card(
            d,
            message_count=msg_counts.get(d.get("conversation_id")),
            last_user_message=last_msgs.get(d.get("conversation_id")),
        )
        for d in docs
    ]
    base = Page[ConversationCard].build(items=items, total=total, limit=limit, skip=skip)
    return InboxResponse(
        **base.model_dump(),
        counts=InboxCounts(
            tabs=overview["tabs"],
            categories=overview["categories"],
            unseen=overview["unseen"],
        ),
        metrics=InboxMetrics(**overview["metrics"]),
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationCard)
@conditional_limit("60/minute")
async def get_conversation_card(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    doc = await repo.get_by_conversation_id(conversation_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    last_msgs = await _last_user_messages_by_conversation(mongodb_client.db, [conversation_id])
    msg_count = await mongodb_client.db.messages.count_documents({"conversation_id": conversation_id})
    return _to_card(doc, message_count=msg_count, last_user_message=last_msgs.get(conversation_id))


@router.get("/inbox/handoff-stats", response_model=HandoffStatsResponse)
@conditional_limit("60/minute")
async def get_handoff_stats(
    request: Request,
    _current_user=Depends(require_admin),
    response: Response = None,
    days: int = Query(30, ge=1, le=365),
):
    repo = _get_conv_repo(request)
    counts = await repo.get_handoff_reason_counts(days)
    total = sum(counts.values())
    return HandoffStatsResponse(
        user_request=counts.get("user_request", 0),
        low_confidence=counts.get("low_confidence", 0),
        out_of_scope=counts.get("out_of_scope", 0),
        total=total,
        period_days=days,
    )


@router.post("/conversations/{conversation_id}/refresh-summary", response_model=ConversationCard)
@conditional_limit("30/minute")
async def refresh_summary_on_demand(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    result = await regenerate_summary(conversation_id, mongodb_client.db, settings)
    if result is None:
        raise HTTPException(status_code=400, detail="No hay mensajes para resumir")
    repo = _get_conv_repo(request)
    await repo.set_summary_only(
        conversation_id,
        ai_summary=result.summary,
        msg_count_at_summary=result.msg_count_at_summary,
    )
    doc = await repo.get_by_conversation_id(conversation_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msg_count = await mongodb_client.db.messages.count_documents(
        {"conversation_id": conversation_id}
    )
    return _to_card(doc, message_count=msg_count)


@router.post("/conversations/{conversation_id}/complete", response_model=ConversationCard)
@conditional_limit("30/minute")
async def complete_conversation(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await repo.set_stage(conversation_id, "completed")
    doc = await repo.get_by_conversation_id(conversation_id)
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    msg_count = await mongodb_client.db.messages.count_documents(
        {"conversation_id": conversation_id}
    )
    logger.info(f"[Inbox] conv={conversation_id} marked completed")
    return _to_card(doc, message_count=msg_count)


@router.post("/conversations/{conversation_id}/reopen", response_model=ConversationCard)
@conditional_limit("30/minute")
async def reopen_conversation(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await repo.set_stage(conversation_id, "active")
    doc = await repo.get_by_conversation_id(conversation_id)
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    msg_count = await mongodb_client.db.messages.count_documents(
        {"conversation_id": conversation_id}
    )
    logger.info(f"[Inbox] conv={conversation_id} reopened")
    return _to_card(doc, message_count=msg_count)


@router.post("/conversations/{conversation_id}/takeover")
@conditional_limit("30/minute")
async def takeover_conversation(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    agent_id = str(_current_user.id)
    if conv.get("mode") == "human":
        raise HTTPException(status_code=409, detail="Conversation already taken by another agent")
    result = await repo.atomic_takeover(conversation_id, agent_id)
    if result is None:
        raise HTTPException(status_code=409, detail="Conversation already taken by another agent")
    logger.info(f"[Inbox] conv={conversation_id} taken over by agent={agent_id}")
    return {"status": "ok", "mode": "human", "assigned_agent_id": agent_id}


@router.post("/conversations/{conversation_id}/mark-viewed")
@conditional_limit("60/minute")
async def mark_conversation_viewed(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    agent_id = str(_current_user.id)
    await repo.mark_viewed(conversation_id, agent_id)
    logger.info(f"[Inbox] conv={conversation_id} marked viewed by agent={agent_id}")
    return {"status": "ok", "viewed_by": agent_id}


@router.post("/conversations/{conversation_id}/release")
@conditional_limit("30/minute")
async def release_conversation(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await repo.set_mode(conversation_id, "bot")
    logger.info(f"[Inbox] conv={conversation_id} released back to bot")
    return {"status": "ok", "mode": "bot"}


@router.post("/conversations/{conversation_id}/pause")
@conditional_limit("30/minute")
async def pause_conversation(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await repo.set_mode(conversation_id, "paused")
    logger.info(f"[Inbox] conv={conversation_id} paused (mode=paused)")
    return {"status": "ok", "mode": "paused"}


class LeadCaptureRequest(BaseModel):
    lead_name: str
    lead_email: str


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_LEAD_BOT_REPLY = (
    "¡Recibí tus datos! Un asesor te contactará pronto. "
    "Mientras tanto, ¿hay algo más en lo que pueda ayudarte?"
)


@router.post("/conversations/{conversation_id}/capture-lead")
@conditional_limit("10/minute")
async def capture_lead(
    conversation_id: str,
    body: LeadCaptureRequest,
    *,
    request: Request,
    response: Response = None,
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    lead_name = body.lead_name.strip()
    lead_email = body.lead_email.strip().lower()
    if not lead_email or not _EMAIL_RE.match(lead_email):
        logger.warning(f"[LeadCapture] conv={conversation_id} invalid email rejected")
        raise HTTPException(status_code=400, detail="Invalid email format")

    if conv.get("lead_email"):
        logger.info(f"[LeadCapture] conv={conversation_id} already captured, skipping insert")
        return {"status": "ok", "already_captured": True}

    existing = await repo.find_by_lead_email(lead_email)
    if existing and existing.get("conversation_id") != conversation_id:
        logger.info(
            "[LeadCapture] email=%s already captured in conv=%s, dedup",
            lead_email, existing.get("conversation_id"),
        )
        return {"status": "ok", "already_captured": True, "source_conversation": existing.get("conversation_id")}

    await repo.set_lead(conversation_id, lead_name, lead_email)
    logger.info(f"[LeadCapture] conv={conversation_id} lead={lead_email}")

    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    timestamp = datetime.now(timezone.utc)
    msg_doc = {
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": _LEAD_BOT_REPLY,
        "sender_type": "bot",
        "timestamp": timestamp,
        "source": conv.get("channel") or "web",
    }
    insert_result = await mongodb_client.db.messages.insert_one(msg_doc)
    logger.info(
        f"[LeadCapture] conv={conversation_id} bot reply inserted id={insert_result.inserted_id}"
    )
    return {
        "status": "ok",
        "message_id": str(insert_result.inserted_id),
        "content": _LEAD_BOT_REPLY,
        "timestamp": timestamp.isoformat(),
    }


@router.get("/conversations/{conversation_id}/messages")
@conditional_limit("60/minute")
async def get_conversation_messages(
    conversation_id: str,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
    limit: int = Query(100, ge=1, le=500),
    before: Optional[datetime] = Query(None),
):
    """Return up to `limit` most-recent messages, optionally older than `before`.

    Cursor pagination: pass the timestamp of the oldest visible message back
    as `before` to load the previous page. Response order is ascending
    (chronological) for direct display.
    """
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    messages_coll = mongodb_client.db.messages
    query: dict = {"conversation_id": conversation_id}
    if before is not None:
        if before.tzinfo is None:
            before = before.replace(tzinfo=timezone.utc)
        query["timestamp"] = {"$lt": before}

    raw = (
        await messages_coll
        .find(query)
        .sort("timestamp", -1)
        .to_list(length=limit)
    )
    raw.reverse()
    for msg in raw:
        msg.pop("_id", None)
    has_more = len(raw) == limit
    next_before = raw[0]["timestamp"].isoformat() if has_more and raw else None
    return {
        "conversation_id": conversation_id,
        "messages": raw,
        "has_more": has_more,
        "next_before": next_before,
    }


@router.post("/conversations/{conversation_id}/agent-message")
@conditional_limit("60/minute")
async def send_agent_message(
    conversation_id: str,
    body: AgentMessageRequest,
    *,
    request: Request,
    response: Response = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.get("mode") != "human":
        raise HTTPException(status_code=409, detail="Conversation not in human mode")

    agent_id = str(_current_user.id)
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    msg_doc = {
        "conversation_id": conversation_id,
        "role": "agent",
        "content": body.content.strip(),
        "sender_type": "agent",
        "agent_id": agent_id,
        "timestamp": datetime.now(timezone.utc),
        "source": conv.get("channel", "web"),
    }
    await mongodb_client.db.messages.insert_one(msg_doc)

    logger.info(f"[Inbox] Agent={agent_id} sent message to conv={conversation_id}")
    return {"status": "ok"}
