from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


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
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def _strip_and_non_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("content must not be blank")
        return stripped


class InboxResponse(BaseModel):
    items: list[ConversationCard]
    total: int
    page: int = 1
    limit: int = 50
    total_pages: int = 1
    has_next: bool = False


class HandoffStatsResponse(BaseModel):
    user_request: int
    low_confidence: int
    out_of_scope: int
    total: int
    period_days: int


class InboxTabCountsResponse(BaseModel):
    todos: int
    pendientes: int
    mias: int
    bot: int
