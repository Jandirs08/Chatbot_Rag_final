import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from utils.logging_utils import get_logger

from auth.dependencies import require_admin
from database.conversation_repository import ConversationRepository
from database.mongodb import get_mongodb_client

from .schemas import AgentMessageRequest, ConversationCard, HandoffStatsResponse, InboxResponse

logger = get_logger(__name__)
router = APIRouter(tags=["inbox"])


def _to_card(doc: dict) -> ConversationCard:
    pending_since: Optional[datetime] = doc.get("pending_since")
    minutes_waiting: Optional[int] = None
    if pending_since is not None:
        if pending_since.tzinfo is None:
            pending_since = pending_since.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - pending_since
        minutes_waiting = int(delta.total_seconds() // 60)

    return ConversationCard(
        conversation_id=doc.get("conversation_id", ""),
        channel=doc.get("channel", ""),
        external_id=doc.get("external_id", ""),
        mode=doc.get("mode", "bot"),
        category=doc.get("category"),
        urgency=doc.get("urgency"),
        ai_summary=doc.get("ai_summary"),
        assigned_agent_id=doc.get("assigned_agent_id"),
        pending_since=pending_since,
        minutes_waiting=minutes_waiting,
        updated_at=doc.get("updated_at"),
        lead_name=doc.get("lead_name"),
        lead_email=doc.get("lead_email"),
        lead_captured_at=doc.get("lead_captured_at"),
    )


def _get_conv_repo(request: Request) -> ConversationRepository:
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    return ConversationRepository(mongodb_client)


@router.get("/conversations/inbox", response_model=InboxResponse)
async def get_inbox(
    request: Request = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    lead_docs = await repo.list_leads()
    active_docs = await repo.list_all_active()
    items = [_to_card(d) for d in lead_docs] + [_to_card(d) for d in active_docs]
    return InboxResponse(items=items, total=len(items))


@router.get("/inbox/handoff-stats", response_model=HandoffStatsResponse)
async def get_handoff_stats(
    days: int = Query(30, ge=1, le=365),
    request: Request = None,
    _current_user=Depends(require_admin),
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


@router.post("/conversations/{conversation_id}/takeover")
async def takeover_conversation(
    conversation_id: str,
    request: Request = None,
    _current_user=Depends(require_admin),
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    agent_id = str(_current_user.id)
    await repo.set_mode(conversation_id, "human", agent_id=agent_id)
    logger.info(f"[Inbox] conv={conversation_id} taken over by agent={agent_id}")
    return {"status": "ok", "mode": "human", "assigned_agent_id": agent_id}


@router.post("/conversations/{conversation_id}/release")
async def release_conversation(
    conversation_id: str,
    request: Request = None,
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
async def pause_conversation(
    conversation_id: str,
    request: Request = None,
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
async def capture_lead(
    conversation_id: str,
    body: LeadCaptureRequest,
    request: Request = None,
):
    repo = _get_conv_repo(request)
    conv = await repo.get_by_conversation_id(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    lead_name = body.lead_name.strip()
    lead_email = body.lead_email.strip()
    if not lead_email or not _EMAIL_RE.match(lead_email):
        logger.warning(f"[LeadCapture] conv={conversation_id} invalid email rejected")
        raise HTTPException(status_code=400, detail="Invalid email format")

    if conv.get("lead_email"):
        logger.info(f"[LeadCapture] conv={conversation_id} already captured, skipping insert")
        return {"status": "ok", "already_captured": True}

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
async def get_conversation_messages(
    conversation_id: str,
    request: Request = None,
    _current_user=Depends(require_admin),
):
    mongodb_client = getattr(request.app.state, "mongodb_client", None) or get_mongodb_client()
    messages_coll = mongodb_client.db.messages
    raw = (
        await messages_coll
        .find({"conversation_id": conversation_id})
        .sort("timestamp", 1)
        .to_list(length=200)
    )
    for msg in raw:
        msg.pop("_id", None)
    return {"conversation_id": conversation_id, "messages": raw}


@router.post("/conversations/{conversation_id}/agent-message")
async def send_agent_message(
    conversation_id: str,
    body: AgentMessageRequest,
    request: Request = None,
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
