"""Eval suite for the agentic handoff tool (`request_human_handoff`).

Two layers:

Layer 1 — Unit tests (no LLM cost). Mocks the model stream and feeds synthetic
`AIMessageChunk`-like objects through `consume_stream` to assert the dispatcher
routes correctly.

Layer 2 — Integration tests (real LLM, opt-in). Skipped unless
`OPENAI_API_KEY_REAL` is set in the environment. Run with:

    OPENAI_API_KEY_REAL=sk-... pytest backend/tests/evals/test_handoff_tool.py -m integration

The integration suite hits `gpt-4o-mini` with ~7 small prompts to keep cost
under $0.005/run. Assertions are tolerant: we check whether the tool fired but
allow flexibility on the chosen `reason` for borderline cases.
"""
from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any, AsyncIterator, Optional

import pytest

from core.tools import ToolContext, bootstrap_tools, registry
from core.tools.handoff_tool import HANDOFF_TOOL, HANDOFF_TOOL_NAME
from chat.tool_dispatch import DispatchEvent, consume_stream


pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# Fixtures + mock helpers
# ---------------------------------------------------------------------------


class MockChunk:
    """Minimal AIMessageChunk-like object the dispatcher knows how to read."""

    def __init__(self, content: str = "", tool_call_chunks: Optional[list[dict]] = None):
        self.content = content
        self.tool_call_chunks = tool_call_chunks or []


async def _aiter(items: list[Any]) -> AsyncIterator[Any]:
    for it in items:
        yield it


@pytest.fixture
def handoff_registry():
    """Reset the global registry and register the handoff tool only."""
    fake_settings = SimpleNamespace(enable_agentic_handoff=True)
    bootstrap_tools(fake_settings)
    yield registry
    registry.clear()


@pytest.fixture
def tool_ctx():
    return ToolContext(conversation_id="conv-test-1", user_input="hola")


async def _collect(chunks: list[Any], ctx: ToolContext, **kwargs) -> list[DispatchEvent]:
    out: list[DispatchEvent] = []
    async for ev in consume_stream(_aiter(chunks), ctx, **kwargs):
        out.append(ev)
    return out


# ---------------------------------------------------------------------------
# Layer 1 — Unit tests
# ---------------------------------------------------------------------------


async def test_plain_text_emits_text_then_end(handoff_registry, tool_ctx):
    chunks = [
        MockChunk(content="Hola, "),
        MockChunk(content="¿en qué puedo ayudarte hoy? "),
        MockChunk(content="Cuéntame."),
    ]
    events = await _collect(chunks, tool_ctx, min_chunk_chars=8)

    kinds = [e.kind for e in events]
    assert kinds[-1] == "end"
    assert "tool_terminal" not in kinds
    full_text = "".join(e.text or "" for e in events if e.kind == "text")
    assert full_text == "Hola, ¿en qué puedo ayudarte hoy? Cuéntame."


async def test_tool_call_split_args_emits_tool_terminal(handoff_registry, tool_ctx):
    # Args JSON is split across multiple deltas — accumulator must reassemble.
    chunks = [
        MockChunk(tool_call_chunks=[{"index": 0, "name": HANDOFF_TOOL_NAME, "args": "", "id": "call_1"}]),
        MockChunk(tool_call_chunks=[{"index": 0, "args": '{"reas'}]),
        MockChunk(tool_call_chunks=[{"index": 0, "args": 'on": "user_'}]),
        MockChunk(tool_call_chunks=[{"index": 0, "args": 'request"}'}]),
    ]
    events = await _collect(chunks, tool_ctx)

    terminals = [e for e in events if e.kind == "tool_terminal"]
    assert len(terminals) == 1
    term = terminals[0]
    assert term.tool_name == HANDOFF_TOOL_NAME
    assert term.sse_event == "lead_form"
    assert term.tool_args == {"reason": "user_request"}
    assert term.sse_payload["reason"] == "user_request"
    assert term.sse_payload["conversation_id"] == "conv-test-1"
    assert events[-1].kind == "end"


async def test_text_then_tool_call_drops_trailing_text(handoff_registry, tool_ctx):
    chunks = [
        MockChunk(content="Déjame revisar... "),
        MockChunk(content="un momento por favor."),
        MockChunk(tool_call_chunks=[{"index": 0, "name": HANDOFF_TOOL_NAME, "args": '{"reason": "low_confidence"}', "id": "c1"}]),
        MockChunk(content=" texto residual que NO debería aparecer"),
    ]
    events = await _collect(chunks, tool_ctx, min_chunk_chars=8)

    text_events = [e for e in events if e.kind == "text"]
    terminals = [e for e in events if e.kind == "tool_terminal"]

    full_text = "".join(e.text or "" for e in text_events)
    assert "residual" not in full_text
    assert "Déjame revisar" in full_text
    assert len(terminals) == 1
    assert terminals[0].tool_args == {"reason": "low_confidence"}
    assert events[-1].kind == "end"


async def test_unknown_tool_name_logs_warning_and_ends(handoff_registry, tool_ctx, caplog):
    import logging
    caplog.set_level(logging.WARNING, logger="chat.tool_dispatch")

    chunks = [
        MockChunk(tool_call_chunks=[{"index": 0, "name": "nonexistent_tool", "args": "{}", "id": "c1"}]),
    ]
    events = await _collect(chunks, tool_ctx)

    assert [e.kind for e in events] == ["end"]
    assert any("unknown tool" in rec.message.lower() for rec in caplog.records)


async def test_malformed_args_falls_back_to_empty_dict(handoff_registry, tool_ctx):
    chunks = [
        MockChunk(tool_call_chunks=[{"index": 0, "name": HANDOFF_TOOL_NAME, "args": "{not json", "id": "c1"}]),
    ]
    events = await _collect(chunks, tool_ctx)

    terminals = [e for e in events if e.kind == "tool_terminal"]
    assert len(terminals) == 1
    # Handler defaults reason to "user_request" when args is empty/missing.
    assert terminals[0].tool_args == {}
    assert terminals[0].sse_event == "lead_form"
    assert terminals[0].sse_payload["reason"] == "user_request"


async def test_tool_call_chunk_without_index_defaults_to_slot_zero(handoff_registry, tool_ctx):
    # Some providers omit `index` for single-call streams.
    chunks = [
        MockChunk(tool_call_chunks=[{"name": HANDOFF_TOOL_NAME, "args": "", "id": "c1"}]),
        MockChunk(tool_call_chunks=[{"args": '{"reason": "out_of_scope"}'}]),
    ]
    events = await _collect(chunks, tool_ctx)

    terminals = [e for e in events if e.kind == "tool_terminal"]
    assert len(terminals) == 1
    assert terminals[0].tool_args == {"reason": "out_of_scope"}
    assert events[-1].kind == "end"


# ---------------------------------------------------------------------------
# Layer 2 — Integration tests (real LLM, opt-in)
# ---------------------------------------------------------------------------


_INTEGRATION_KEY = os.getenv("OPENAI_API_KEY_REAL")
_SKIP_REASON = "needs OPENAI_API_KEY_REAL env var (real OpenAI key) to run"


async def _run_against_real_model(user_input: str) -> tuple[bool, Optional[str]]:
    """Run the real chain + dispatcher for a single prompt, return (fired, reason).

    Uses gpt-4o-mini, empty history, empty RAG context. Keeps token usage
    minimal — typical cost <$0.001 per call.
    """
    # Local imports so unit tests don't pay the import cost / require real keys.
    os.environ["OPENAI_API_KEY"] = _INTEGRATION_KEY  # type: ignore[arg-type]
    from langchain_core.runnables import RunnableLambda

    from core.chain import ChainManager

    settings = SimpleNamespace(
        bot_name="Asistente",
        ui_prompt_extra=None,
        main_prompt_name="MAIN_PROMPT",
        model_type="OPENAI",
        base_model_name="gpt-4o-mini",
        temperature=0.0,
        max_tokens=128,
    )

    cm = ChainManager(settings=settings, tools=[HANDOFF_TOOL])

    inputs = {
        "input": user_input,
        "history": [],
        "context": "No hay información adicional recuperada para esta consulta.",
    }

    async def _stream():
        async for chunk in cm.runnable_chain.astream(inputs):
            yield chunk

    ctx = ToolContext(conversation_id="eval-conv", user_input=user_input)
    fired = False
    reason: Optional[str] = None
    async for ev in consume_stream(_stream(), ctx, min_chunk_chars=32):
        if ev.kind == "tool_terminal":
            fired = True
            reason = (ev.tool_args or {}).get("reason")
    return fired, reason


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_greeting_does_not_fire(handoff_registry):
    fired, _ = await _run_against_real_model("Hola, buenos días")
    assert fired is False


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_unanswerable_product_question_does_not_fire(handoff_registry):
    # Bot should respond "no veo ese dato" rather than firing the tool. The
    # prompt explicitly tells the model not to invoke handoff for questions it
    # can answer (or honestly decline) from context.
    fired, _ = await _run_against_real_model("¿Cuál es el precio del producto X?")
    assert fired is False


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_explicit_human_request_fires_user_request(handoff_registry):
    fired, reason = await _run_against_real_model("Necesito hablar con un asesor")
    assert fired is True
    assert reason == "user_request"


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_english_human_request_fires(handoff_registry):
    fired, reason = await _run_against_real_model("I want to speak with a human agent")
    assert fired is True
    assert reason == "user_request"


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_complaint_fires(handoff_registry):
    fired, _reason = await _run_against_real_model("Tengo una queja sobre el servicio")
    assert fired is True
    # Reason flexible — likely user_request, could be out_of_scope.


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_off_topic_fires_out_of_scope(handoff_registry):
    fired, reason = await _run_against_real_model("¿Cuál es la capital de Francia?")
    assert fired is True
    assert reason == "out_of_scope"


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_formal_complaint_fires(handoff_registry):
    fired, _reason = await _run_against_real_model("Quiero presentar un reclamo formal")
    assert fired is True
    # Reason flexible.
