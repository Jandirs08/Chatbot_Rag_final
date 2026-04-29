from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ConversationCard(BaseModel):
    conversation_id: str
    channel: str
    external_id: str
    mode: str
    category: Optional[str]
    urgency: Optional[str]
    ai_summary: Optional[str]
    assigned_agent_id: Optional[str]
    pending_since: Optional[datetime]
    minutes_waiting: Optional[int]
    updated_at: Optional[datetime]
    lead_name: Optional[str] = None
    lead_email: Optional[str] = None
    lead_captured_at: Optional[datetime] = None


class AgentMessageRequest(BaseModel):
    content: str


class InboxResponse(BaseModel):
    items: list[ConversationCard]
    total: int
