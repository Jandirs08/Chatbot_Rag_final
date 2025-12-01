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
    enable_verification: bool = Field(default=False, description="Enable hallucination verification in debug mode")

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
    file_path: Optional[str] = None
    page_number: Optional[int] = None

class VerificationResult(BaseModel):
    is_grounded: bool
    reason: str

class DebugInfo(BaseModel):
    retrieved_documents: List[RetrievedDocument]
    system_prompt_used: str
    model_params: Dict[str, Any]
    rag_time: float | None = None
    llm_time: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    verification: Optional[VerificationResult] = None
    gating_reason: Optional[str] = None
    is_cached: bool = False

# Nota: ClearHistoryResponse eliminado por no tener dependencias activas
