from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Dict, List, Optional

from langchain_core.documents import Document

RETRIEVAL_CACHE_PREFIX = "rag:retrieval:"
RETRIEVAL_UNAVAILABLE_MESSAGE = (
    "La base documental no esta disponible en este momento. "
    "Por favor, intentalo nuevamente mas tarde."
)
NO_CONTEXT_MESSAGE = "No se encontro informacion relevante para esta pregunta."
_CONTENT_TYPE_SCORES: Dict[str, float] = {
    "header": 1.0,
    "title": 0.95,
    "subtitle": 0.9,
    "paragraph": 0.8,
    "text": 0.75,
    "list": 0.7,
    "bullet": 0.7,
    "numbered_list": 0.7,
    "table": 0.6,
    "code": 0.5,
}
_CONTENT_TYPE_SCORE_DEFAULT = 0.6


class RetrievalBackendUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class CachedRetrievalResult:
    documents: List[Document]
    reason: str
    kind: str


# Per-coroutine gating reason. The retriever is a singleton; without
# ContextVar isolation, concurrent requests would overwrite each other's
# value via the (legacy) instance attribute, leaking cross-request state
# into the dashboard's knowledge-gaps log. ContextVar makes the value
# automatically scoped to the asyncio Task that owns the retrieve call.
_gating_reason_var: ContextVar[Optional[str]] = ContextVar(
    "retriever_gating_reason", default=None,
)
