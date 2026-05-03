from typing import Literal, Optional

from pydantic import BaseModel, Field


class ClassificationResult(BaseModel):
    category: Literal["informacion", "soporte", "comercial", "sin_valor"]
    urgency: Literal["alta", "media", "baja"]
    lead_score: int = Field(ge=0, le=100)       # attention value: how much human attention this needs
    purchase_intent: int = Field(ge=0, le=100, default=0)  # purchase signal, independent of attention
    product_interests: list[str] = Field(default_factory=list)
    recommended_action: str
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str
    msg_count_at_classify: Optional[int] = None


class SummaryResult(BaseModel):
    summary: str
    msg_count_at_summary: int
