"""Unit tests for chat.grounding — the post-response phantom-gap detector."""
from __future__ import annotations

import unicodedata
from unittest.mock import MagicMock, patch

import pytest

from chat.grounding import is_ungrounded_answer, maybe_log_phantom_gap


# ─── is_ungrounded_answer ───────────────────────────────────────────────────

@pytest.mark.parametrize("text", [
    "No encontré información específica sobre el horario de Equilibra.",
    "El documento no proporciona información sobre la fecha de fundación.",
    "El documento no menciona ese dato.",
    "El documento no incluye horarios de atención.",
    "No tengo información sobre el precio del iPhone 15.",
    "No tengo esa información disponible.",
    "No cuento con la información solicitada.",
    "No dispongo de datos sobre eso.",
    "No veo ese dato en el archivo.",
    "No veo esa información en el documento.",
    "La información disponible no incluye horarios de atención.",
    "La documentación proporcionada no menciona ese dato.",
    "No aparece en el documento esa información.",
    "No aparece en los documentos consultados.",
    "No hay datos sobre eso disponibles.",
    "No existe información acerca de ese tema.",
])
def test_is_ungrounded_answer_positive(text):
    """Phrases the system prompt teaches the model to use for absence."""
    assert is_ungrounded_answer(text) is True


@pytest.mark.parametrize("text", [
    "Algarium Semilla SC tiene Zinc 30% p/v y extracto de Ascophyllum nodosum.",
    "Equilibra fue fundada en 2017 como Joint Venture.",
    "La fórmula de MultiFert Balance es 15-9-20 + Mg + S.",
    "El email de contacto es fertilizantes@equilibra.pe",
    "El horario de atención es de 08:00 a 18:00.",
    # Dropped polite-redirect patterns: must NOT false-positive on grounded recs.
    "Te recomendaría revisar la sección de Algarium en nuestra documentación.",
    "Sugiero que consultes la composición exacta en la ficha técnica.",
    # Hedging without absence claim.
    "Para tu caso podría funcionar Soluvit Calcio.",
])
def test_is_ungrounded_answer_negative(text):
    """Grounded responses must not trigger the detector."""
    assert is_ungrounded_answer(text) is False


@pytest.mark.parametrize("text", ["", None, "   ", "OK", "Hola"])
def test_is_ungrounded_answer_empty_or_trivial(text):
    """Empty / very-short responses do not fire (handled by other gating)."""
    assert is_ungrounded_answer(text) is False


def test_is_ungrounded_answer_head_only_scan():
    """Absence patterns past the 240-char head should NOT fire.

    Long answers that started grounded and added boilerplate later are
    treated as grounded.
    """
    grounded_head = "Algarium Semilla SC contiene Zinc 30% p/v y se aplica a razón de 5 ml por kg de semilla. " * 4
    trailing_absence = " Sin embargo, no tengo información sobre el envase."
    text = grounded_head + trailing_absence
    assert is_ungrounded_answer(text) is False


def test_is_ungrounded_answer_nfd_unicode():
    """NFC normalization makes decomposed accents match the same patterns."""
    nfc = "No encontré información específica."
    nfd = unicodedata.normalize("NFD", nfc)
    assert nfc != nfd  # sanity: bytes really differ
    assert is_ungrounded_answer(nfc) is True
    assert is_ungrounded_answer(nfd) is True


# ─── maybe_log_phantom_gap (dedupe + side-effects) ──────────────────────────

class _Ctx:
    """Minimal stand-in for RequestContext (dataclass-shaped)."""
    def __init__(self, gating_reason=None, retrieved_docs=None):
        self.gating_reason = gating_reason
        self.retrieved_docs = retrieved_docs or []


def test_maybe_log_phantom_gap_skips_when_already_a_gap_reason():
    """Dedupe: if retrieval already logged a gap, don't double-log."""
    ctx = _Ctx(gating_reason="low_relevance_score")
    with patch("database.retrieval_log_repository.schedule_log_retrieval") as mock_sched:
        maybe_log_phantom_gap(
            conversation_id="c1",
            user_query="precio iPhone 15",
            response_text="No encontré información sobre eso.",
            req_ctx=ctx,
        )
        mock_sched.assert_not_called()


def test_maybe_log_phantom_gap_skips_when_response_is_grounded():
    """Grounded answer: no log, regardless of gating_reason."""
    ctx = _Ctx(gating_reason="cheap_gate_pass")
    with patch("database.retrieval_log_repository.schedule_log_retrieval") as mock_sched:
        maybe_log_phantom_gap(
            conversation_id="c1",
            user_query="composición Algarium",
            response_text="Algarium contiene Zinc 30% p/v.",
            req_ctx=ctx,
        )
        mock_sched.assert_not_called()


def test_maybe_log_phantom_gap_fires_for_phantom_gap():
    """Happy path: cheap_gate_pass + ungrounded answer = phantom gap logged."""
    docs = [MagicMock()]
    ctx = _Ctx(gating_reason="cheap_gate_pass", retrieved_docs=docs)
    with patch("database.retrieval_log_repository.schedule_log_retrieval") as mock_sched:
        maybe_log_phantom_gap(
            conversation_id="conv-123",
            user_query="código postal sede",
            response_text="No encontré información sobre el código postal.",
            req_ctx=ctx,
        )
        mock_sched.assert_called_once()
        kwargs = mock_sched.call_args.kwargs
        assert kwargs["conversation_id"] == "conv-123"
        assert kwargs["query"] == "código postal sede"
        assert kwargs["gating_reason"] == "answer_not_grounded"
        assert kwargs["docs"] == docs


def test_maybe_log_phantom_gap_handles_none_context():
    """No req_ctx → still works, logs with empty docs."""
    with patch("database.retrieval_log_repository.schedule_log_retrieval") as mock_sched:
        maybe_log_phantom_gap(
            conversation_id="c1",
            user_query="precio iPhone",
            response_text="No encontré ese dato.",
            req_ctx=None,
        )
        mock_sched.assert_called_once()
        assert mock_sched.call_args.kwargs["docs"] == []


def test_maybe_log_phantom_gap_no_op_on_empty_query_or_response():
    """Guards: empty inputs must not trigger any log call."""
    with patch("database.retrieval_log_repository.schedule_log_retrieval") as mock_sched:
        maybe_log_phantom_gap(
            conversation_id="c1", user_query="",
            response_text="No encontré.", req_ctx=None,
        )
        maybe_log_phantom_gap(
            conversation_id="c1", user_query="hola",
            response_text="", req_ctx=None,
        )
        mock_sched.assert_not_called()
