"""Chat-related schemas."""

from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field

from .base import BaseResponse

class ChatRequest(BaseModel):
    """Chat request model."""
    input: str = Field(..., description="User message")
    conversation_id: Optional[str] = Field(default=None, description="Conversation ID, a new one will be generated if not provided")
    source: Optional[str] = Field(default=None, description="Optional source/origin identifier for the conversation, e.g., 'embed-default'")
    debug_mode: bool = Field(default=False, description="Enable debug mode to include internal metadata")

class ChatResponse(BaseModel):
    """Chat response model (no streaming)."""
    output: str = Field(..., description="AI response")
    conversation_id: str = Field(..., description="Conversation ID")
    debug_info: Optional["DebugInfo"] = None

class StreamEventOp(BaseModel):
    """Model for streaming event operations."""
    op: str
    path: str
    value: Any

class StreamEventData(BaseModel):
    """Model for streaming event data."""
    streamed_output: str
    ops: Optional[List[StreamEventOp]] = None

class RetrievedDocument(BaseModel):
    text: str
    source: Optional[str] = None
    score: Optional[float] = None

class DebugInfo(BaseModel):
    retrieved_documents: List[RetrievedDocument]
    system_prompt_used: str
    model_params: Dict[str, Any]

# Nota: ClearHistoryResponse eliminado por no tener dependencias activas
