from typing import Literal

from pydantic import BaseModel


class ClassificationResult(BaseModel):
    category: Literal["oportunidad", "interes", "requiere_atencion"]
    urgency: Literal["alta", "media", "baja"]
    summary: str
