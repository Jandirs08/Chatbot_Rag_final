"""Post-response grounding detection for chat handlers.

Detects when the assistant produced an "I don't know" answer despite retrieval
returning documents. These are "phantom gaps": the user perceived the bot as
unable to answer, even though the system formally marked the turn as successful
(scores passed gating thresholds, chunks were injected into context).

Used by the agentic handler to log a follow-up retrieval_log row with
gating_reason="answer_not_grounded", which then surfaces in the dashboard's
Knowledge Gaps tab — closing the loop between what retrieval thinks happened
and what the user actually experienced.

Design notes:
  - Pattern-based detection (regex) rather than LLM-as-judge: fast, deterministic,
    zero extra cost. Trade-off: may miss subtle phrasings. Acceptable for v1
    because the prompt explicitly trains the model to use a small vocabulary of
    "no se" / "no encontré" phrasings (see core/prompt.py).
  - Anchored to the start of the response (first ~200 chars). The model's
    convention is to declare absence up-front; later "however, you could try X"
    suggestions don't change the verdict.
  - Word-boundary regex prevents false positives in compound words.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Final, Optional

logger = logging.getLogger(__name__)

# Maximum chars to scan from start of the response. The model's prompt trains
# it to declare data absence in the opening sentence; suggestions like "however,
# consider X" come later and shouldn't flip the verdict.
_HEAD_SCAN_CHARS: Final[int] = 240

# Patterns that strongly indicate the assistant could not answer from the
# retrieved context. Kept conservative: only phrases the system prompt
# (core/prompt.py) explicitly teaches the model to use for absence.
#
# Each pattern requires word boundaries to avoid matching e.g. "no" inside
# longer words. Accented and unaccented Spanish forms accepted.
_NOT_FOUND_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    # Direct "I don't have / I don't know" statements
    re.compile(r"\bno\s+(?:tengo|cuento\s+con|dispongo\s+de)\s+(?:la\s+|esa\s+|esta\s+|suficiente\s+|informaci[óo]n|datos?)\b", re.IGNORECASE),
    re.compile(r"\bno\s+(?:encuentro|encontr[ée]|hall[ée]|hallo|veo|tengo)\s+(?:la\s+|esa\s+|esta\s+|informaci[óo]n|datos?|ese\s+dato|este\s+dato|referencia)\b", re.IGNORECASE),
    re.compile(r"\bno\s+encontr[ée]\s+informaci[óo]n\b", re.IGNORECASE),
    # Document-relative absence
    re.compile(r"\b(?:el\s+)?documento\s+no\s+(?:proporciona|menciona|incluye|indica|especifica|contiene|detalla|provee|cubre|aporta|tiene)\b", re.IGNORECASE),
    re.compile(r"\b(?:la\s+)?(?:informaci[óo]n|documentaci[óo]n)\s+(?:proporcionada|disponible|adjunta|consultada)\s+no\s+(?:incluye|menciona|contiene|detalla|cubre)\b", re.IGNORECASE),
    re.compile(r"\bno\s+aparece\s+en\s+(?:el\s+documento|los\s+documentos|el\s+corpus|la\s+documentaci[óo]n)\b", re.IGNORECASE),
    # "Veo en el archivo / no veo ese dato"
    re.compile(r"\bno\s+veo\s+(?:ese|este|el|esa|esta)\s+(?:dato|informaci[óo]n)\b", re.IGNORECASE),
    # Generic "no information about X"
    re.compile(r"\bno\s+(?:hay|existe)\s+(?:datos|informaci[óo]n)\s+(?:sobre|acerca\s+de|disponible)\b", re.IGNORECASE),
    # Note: polite-redirect patterns ("te recomendaría consultar", "sugiero que
    # revises") were considered but dropped — they false-positive on grounded
    # recommendations like "te recomendaría revisar la sección de Algarium".
    # The "no info / no encontré / documento no proporciona" patterns above
    # already cover the unambiguous absence signal.
)


def is_ungrounded_answer(text: str | None) -> bool:
    """Return True when the assistant's response declares data absence.

    Scans only the head of the response (first 240 chars). The model is
    trained by the system prompt to put absence declarations up-front, so
    trailing "however..." suggestions don't change the verdict.

    Empty / very short responses return False — they're handled by other
    failure paths (cap_fallback, empty_stream) which already log their own
    gating reasons.
    """
    if not text:
        return False
    # NFC-normalize so patterns matching "ó" / "í" (single codepoints) still
    # fire if the model emits decomposed forms ("o" + U+0301 combining acute).
    # LLM output is typically NFC already, so this is a cheap safety net.
    head = unicodedata.normalize("NFC", text[:_HEAD_SCAN_CHARS])
    return any(p.search(head) for p in _NOT_FOUND_PATTERNS)


def maybe_log_phantom_gap(
    *,
    conversation_id: str,
    user_query: str,
    response_text: Optional[str],
    req_ctx,
) -> None:
    """Fire-and-forget phantom-gap log if the response is ungrounded.

    Phantom gap = the system thinks retrieval succeeded (gating_reason was
    not in GAP_REASONS) but the LLM still produced a "no info" answer using
    the retrieved chunks. Surfaces these to the dashboard so admins can see
    queries whose chunks looked relevant by score but didn't actually answer.

    Dedupe rule: skip if `req_ctx.gating_reason` is already in GAP_REASONS —
    retrieval-side failure (e.g. low_relevance_score) is already logged with
    its own reason; firing another row would double-count the same turn.

    Args:
        conversation_id: turn's conversation id
        user_query: the user's input text (what we log as the gap query)
        response_text: the assistant's accumulated response text
        req_ctx: the per-request RequestContext (carries gating_reason and
            retrieved_docs stashed by the retrieval tool / eager RAG path)
    """
    if not response_text or not user_query:
        return
    # Lazy import: keeps this module testable without DB deps in isolation.
    try:
        from database.retrieval_log_repository import GAP_REASONS, schedule_log_retrieval
    except ImportError as exc:
        logger.warning("grounding: import of retrieval_log_repository failed: %s", exc)
        return

    # Dedupe: retrieval already logged its own gap → skip.
    gating_reason = getattr(req_ctx, "gating_reason", None) if req_ctx else None
    if gating_reason in GAP_REASONS:
        return

    if not is_ungrounded_answer(response_text):
        return

    # Forensic value: include the chunks the LLM was given so admins see
    # which candidates "looked" relevant but didn't actually answer.
    candidate_docs = list(getattr(req_ctx, "retrieved_docs", None) or []) if req_ctx else []

    task = schedule_log_retrieval(
        conversation_id=conversation_id,
        query=user_query,
        docs=candidate_docs,
        latency_ms=0.0,
        gating_reason="answer_not_grounded",
    )
    if task is not None:
        logger.debug(
            "[grounding] phantom gap logged conv=%s docs=%d",
            conversation_id, len(candidate_docs),
        )
