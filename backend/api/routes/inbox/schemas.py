from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel

from api.schemas.pagination import Page


class ConversationCategory(str, Enum):
    informacion = "informacion"
    comercial = "comercial"
    soporte = "soporte"
    sin_valor = "sin_valor"


class ConversationCard(BaseModel):
    conversation_id: str
    channel: str
    external_id: str
    mode: str
    stage: str = "active"
    completed_at: Optional[datetime] = None
    category: Optional[str]
    urgency: Optional[str]
    ai_summary: Optional[str]
    ai_summary_at: Optional[datetime] = None
    ai_summary_at_msg_count: Optional[int] = None
    message_count: Optional[int] = None
    assigned_agent_id: Optional[str]
    pending_since: Optional[datetime]
    minutes_waiting: Optional[int]
    updated_at: Optional[datetime]
    lead_name: Optional[str] = None
    lead_email: Optional[str] = None
    lead_captured_at: Optional[datetime] = None
    lead_score: Optional[int] = None
    purchase_intent: Optional[int] = None
    product_interests: Optional[list[str]] = None
    recommended_action: Optional[str] = None
    confidence: Optional[float] = None
    viewed_at: Optional[datetime] = None
    last_user_message: Optional[str] = None
    last_user_message_at: Optional[datetime] = None


class AgentMessageRequest(BaseModel):
    content: str


class InboxCounts(BaseModel):
    tabs: dict[str, int]
    categories: dict[str, int]
    unseen: int


class InboxMetrics(BaseModel):
    avg_lead_score: Optional[int] = None
    scored_count: int = 0
    with_lead: int = 0
    pending_avg_min: Optional[int] = None
    pending_max_min: Optional[int] = None
    mine_stale_count: int = 0
    mine_oldest_stale_min: Optional[int] = None
    bot_unclassified: int = 0
    bot_top_product: Optional[str] = None
    bot_top_product_count: int = 0


class InboxResponse(Page[ConversationCard]):
    counts: InboxCounts
    metrics: InboxMetrics


class HandoffStatsResponse(BaseModel):
    user_request: int
    low_confidence: int
    out_of_scope: int
    total: int
    period_days: int
