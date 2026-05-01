from typing import Literal, Optional

from pydantic import BaseModel, Field


class ClassificationResult(BaseModel):
    category: Literal["oportunidad", "interes", "requiere_atencion", "sin_interes"]
    urgency: Literal["alta", "media", "baja"]
    lead_score: int = Field(ge=0, le=100)
    product_interests: list[str] = Field(default_factory=list)
    recommended_action: str
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str
    msg_count_at_classify: Optional[int] = None


class SummaryResult(BaseModel):
    summary: str
    msg_count_at_summary: int
