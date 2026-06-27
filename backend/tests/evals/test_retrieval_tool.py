"""Eval suite for the agentic retrieval tool (`search_documents`).

Two layers (mirrors test_handoff_tool.py):

Layer 1 — Unit tests (no LLM cost). Stubs the model stream and the retriever,
asserts the dispatcher emits `tool_continuation` and the ChatManager ReAct loop
appends `ToolMessage` and re-streams.

Layer 2 — Integration tests (real LLM, opt-in). Skipped unless
`OPENAI_API_KEY_REAL` is set.
"""
from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any, Optional

import pytest

from core.tools import ToolContext, bootstrap_tools, registry
from core.tools.retrieval_tool import SEARCH_TOOL, SEARCH_TOOL_NAME
from chat.tool_dispatch import DispatchEvent, consume_stream
from helpers import MockChunk, _aiter, _collect


pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# Fixtures + mock helpers
# ---------------------------------------------------------------------------


class StubRetriever:
    """Minimal retriever that records calls and returns canned docs."""

    def __init__(self, docs: Optional[list[Any]] = None, formatted: str = "FORMATTED_CTX"):
        self.docs = docs if docs is not None else [object()]
        self.formatted = formatted
        self.calls: list[dict] = []

    async def retrieve_documents(self, query: str, k: int = 4):
        self.calls.append({"query": query, "k": k})
        return list(self.docs)

    def format_context_from_documents(self, docs):
        return self.formatted


@pytest.fixture
def retrieval_registry():
    fake_settings = SimpleNamespace(
        enable_agentic_handoff=False,
        enable_agentic_rag=True,
    )
    bootstrap_tools(fake_settings)
    yield registry
    registry.clear()


@pytest.fixture
def both_registry():
    fake_settings = SimpleNamespace(
        enable_agentic_handoff=True,
        enable_agentic_rag=True,
    )
    bootstrap_tools(fake_settings)
    yield registry
    registry.clear()


def _make_ctx(retriever: Optional[StubRetriever] = None, conv: str = "conv-r-1") -> ToolContext:
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)
    return ToolContext(conversation_id=conv, user_input="hola", app_state=app_state)


# ---------------------------------------------------------------------------
# Layer 1 — Unit tests
# ---------------------------------------------------------------------------


async def test_handler_returns_formatted_content(retrieval_registry):
    retriever = StubRetriever(formatted="DOC_A and DOC_B")
    ctx = _make_ctx(retriever)

    result = await SEARCH_TOOL.handler({"query": "precio del producto X", "k": 5}, ctx)

    assert result.content == "DOC_A and DOC_B"
    assert result.stop_stream is False
    assert result.sse_event is None
    assert retriever.calls == [{"query": "precio del producto X", "k": 5}]


async def test_handler_clamps_k(retrieval_registry):
    retriever = StubRetriever()
    ctx = _make_ctx(retriever)

    await SEARCH_TOOL.handler({"query": "x", "k": 99}, ctx)
    assert retriever.calls[0]["k"] == 8

    await SEARCH_TOOL.handler({"query": "x", "k": -3}, ctx)
    assert retriever.calls[1]["k"] == 1


async def test_handler_defaults_k_when_missing(retrieval_registry):
    retriever = StubRetriever()
    ctx = _make_ctx(retriever)

    await SEARCH_TOOL.handler({"query": "x"}, ctx)
    assert retriever.calls[0]["k"] == 4


async def test_handler_handles_no_retriever(retrieval_registry):
    ctx = _make_ctx(retriever=None)

    result = await SEARCH_TOOL.handler({"query": "x"}, ctx)
    assert "no hay base documental" in result.content.lower()


async def test_handler_handles_no_docs(retrieval_registry):
    retriever = StubRetriever(docs=[])
    ctx = _make_ctx(retriever)

    result = await SEARCH_TOOL.handler({"query": "x", "k": 3}, ctx)
    assert "no se encontró información" in result.content.lower() or \
           "no se encontro informacion" in result.content.lower()


async def test_handler_handles_retriever_exception(retrieval_registry):
    class BoomRetriever(StubRetriever):
        async def retrieve_documents(self, query, k=4):
            raise RuntimeError("backend down")

    ctx = _make_ctx(BoomRetriever())
    result = await SEARCH_TOOL.handler({"query": "x"}, ctx)
    assert "error" in result.content.lower()


async def test_dispatcher_emits_tool_continuation(retrieval_registry):
    retriever = StubRetriever(formatted="CONTEXT_FROM_DOCS")
    ctx = _make_ctx(retriever)

    chunks = [
        MockChunk(tool_call_chunks=[{"index": 0, "name": SEARCH_TOOL_NAME, "args": "", "id": "call_42"}]),
        MockChunk(tool_call_chunks=[{"index": 0, "args": '{"query": "precio"}'}]),
    ]
    events = await _collect(chunks, ctx)

    kinds = [e.kind for e in events]
    assert kinds == ["tool_continuation", "end"]
    cont = events[0]
    assert cont.tool_name == SEARCH_TOOL_NAME
    assert cont.tool_args == {"query": "precio"}
    assert cont.tool_call_id == "call_42"
    assert cont.tool_content == "CONTEXT_FROM_DOCS"


async def test_dispatcher_continuation_then_text(retrieval_registry):
    """First call yields tool_continuation; caller (ChatManager) re-streams."""
    retriever = StubRetriever(formatted="CTX")
    ctx = _make_ctx(retriever)

    chunks = [
        MockChunk(tool_call_chunks=[{"index": 0, "name": SEARCH_TOOL_NAME, "args": '{"query":"q","k":3}', "id": "c1"}]),
    ]
    events = await _collect(chunks, ctx)
    cont = next(e for e in events if e.kind == "tool_continuation")
    assert cont.tool_args == {"query": "q", "k": 3}


async def test_both_tools_register(both_registry):
    names = {t.name for t in both_registry.list_tools()}
    assert names == {"request_human_handoff", SEARCH_TOOL_NAME}


# ---------------------------------------------------------------------------
# ChatManager ReAct loop — fake bot, real loop
# ---------------------------------------------------------------------------


async def test_react_loop_appends_tool_message_and_restreams(retrieval_registry):
    """Drives ChatManager.stream_with_tools manually: tool call → tool message → text."""
    from chat.manager import ChatManager
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

    retriever = StubRetriever(formatted="DOCS_RESULT")
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)

    base_messages: list = [SystemMessage(content="sys"), HumanMessage(content="hola")]
    streams_emitted: list[list] = []

    class FakeBot:
        def __init__(self):
            self.calls = 0
            self.added_to_memory: list = []

        async def aprepare_messages(self, x):
            return list(base_messages)

        async def astream_messages(self, messages, tool_choice=None):
            streams_emitted.append(list(messages))
            self.calls += 1
            if self.calls == 1:
                yield MockChunk(tool_call_chunks=[
                    {"index": 0, "name": SEARCH_TOOL_NAME, "args": '{"query":"test"}', "id": "c1"}
                ])
            else:
                yield MockChunk(content="Respuesta final con docs.")

        async def add_to_memory(self, human, ai, conversation_id):
            self.added_to_memory.append((human, ai, conversation_id))

    fake_db = SimpleNamespace()

    async def _add_message(*a, **kw):
        return None

    fake_db.add_message = _add_message
    fake_db.close = _add_message

    fake_bot = FakeBot()
    manager = ChatManager.__new__(ChatManager)
    manager.bot = fake_bot
    manager.db = fake_db
    from chat.locks import ConversationLockManager
    manager._locks = ConversationLockManager()
    manager._debug_builder = None
    manager._verifier = None

    events: list[DispatchEvent] = []
    async for ev in manager.stream_with_tools(
        input_text="hola",
        conversation_id="conv-x",
        source="test",
        app_state=app_state,
    ):
        events.append(ev)

    kinds = [e.kind for e in events]
    assert "tool_continuation" not in kinds  # suppressed by manager
    assert "text" in kinds
    assert kinds[-1] == "end"

    # Two streams: the second carries the appended AIMessage(tool_calls) + ToolMessage.
    assert fake_bot.calls == 2
    second_msgs = streams_emitted[1]
    ai_with_calls = [m for m in second_msgs if isinstance(m, AIMessage) and m.tool_calls]
    tool_msgs = [m for m in second_msgs if isinstance(m, ToolMessage)]
    assert len(ai_with_calls) == 1
    assert ai_with_calls[0].tool_calls[0]["name"] == SEARCH_TOOL_NAME
    assert len(tool_msgs) == 1
    assert tool_msgs[0].content == "DOCS_RESULT"
    assert tool_msgs[0].tool_call_id == "c1"

    # Memory persists assistant text.
    assert fake_bot.added_to_memory[0][1] == "Respuesta final con docs."


async def test_react_loop_caps_and_forces_final_text(retrieval_registry):
    """Cap reached: must invoke no-tools stream and surface a final answer.

    Regression for BUG-2: previously the cap path emitted only an `end`
    event, dropping the user's turn silently. Now it must re-stream against
    `astream_messages_no_tools` so the model produces text from the
    accumulated tool results.
    """
    from chat.manager import ChatManager, MAX_TOOL_ITERS
    from langchain_core.messages import HumanMessage, SystemMessage

    retriever = StubRetriever(formatted="ALWAYS_DOCS")
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)

    base_messages: list = [SystemMessage(content="s"), HumanMessage(content="x")]

    class FakeBot:
        def __init__(self):
            self.calls = 0
            self.no_tools_calls = 0
            self.added_to_memory: list = []

        async def aprepare_messages(self, x):
            return list(base_messages)

        async def astream_messages(self, messages, tool_choice=None):
            self.calls += 1
            yield MockChunk(tool_call_chunks=[
                {"index": 0, "name": SEARCH_TOOL_NAME, "args": '{"query":"x"}', "id": f"c{self.calls}"}
            ])

        async def astream_messages_no_tools(self, messages):
            self.no_tools_calls += 1
            yield MockChunk(content="Respuesta final con lo recolectado.")

        async def add_to_memory(self, human, ai, conversation_id):
            self.added_to_memory.append((human, ai, conversation_id))

    fake_db = SimpleNamespace()
    persisted: list = []

    async def _add_message(*a, **kw):
        persisted.append((a, kw))
        return None

    fake_db.add_message = _add_message

    fake_bot = FakeBot()
    manager = ChatManager.__new__(ChatManager)
    manager.bot = fake_bot
    manager.db = fake_db
    from chat.locks import ConversationLockManager
    manager._locks = ConversationLockManager()

    async def _persist_messages_safely(conversation_id, input_text, response_content, source):
        persisted.append((conversation_id, input_text, response_content, source))

    manager._persist_messages_safely = _persist_messages_safely

    events: list[DispatchEvent] = []
    async for ev in manager.stream_with_tools(
        input_text="x",
        conversation_id="conv-cap",
        source="test",
        app_state=app_state,
    ):
        events.append(ev)

    assert fake_bot.calls == MAX_TOOL_ITERS
    assert fake_bot.no_tools_calls == 1
    text_events = [e for e in events if e.kind == "text"]
    assert text_events, "cap-reached path must emit at least one text event"
    full_text = "".join(e.text or "" for e in text_events)
    assert "Respuesta final" in full_text
    assert events[-1].kind == "end"
    # Final text persisted via assistant turn — not the empty-stream branch.
    assert fake_bot.added_to_memory and fake_bot.added_to_memory[0][1] == full_text


async def test_react_loop_dual_empty_emits_fallback(retrieval_registry):
    """Cap reached AND no-tools final stream emits zero text.

    Regression for the dual-empty-stream gap: previously the user only saw
    `end` with no content. Now ChatManager emits a defensive fallback text.
    """
    from chat.manager import ChatManager, MAX_TOOL_ITERS, _CAP_FALLBACK_MESSAGE
    from langchain_core.messages import HumanMessage, SystemMessage

    retriever = StubRetriever(formatted="DOCS")
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)

    base_messages: list = [SystemMessage(content="s"), HumanMessage(content="x")]

    class FakeBot:
        def __init__(self):
            self.calls = 0
            self.no_tools_calls = 0
            self.added_to_memory: list = []

        async def aprepare_messages(self, x):
            return list(base_messages)

        async def astream_messages(self, messages, tool_choice=None):
            self.calls += 1
            yield MockChunk(tool_call_chunks=[
                {"index": 0, "name": SEARCH_TOOL_NAME, "args": '{"query":"x"}', "id": f"c{self.calls}"}
            ])

        async def astream_messages_no_tools(self, messages):
            self.no_tools_calls += 1
            # Empty stream: no chunks emitted.
            if False:
                yield None  # pragma: no cover

        async def add_to_memory(self, human, ai, conversation_id):
            self.added_to_memory.append((human, ai, conversation_id))

    fake_db = SimpleNamespace()
    persisted: list = []

    async def _add_message(*a, **kw):
        persisted.append(("add_message", a, kw))
        return None

    fake_db.add_message = _add_message

    fake_bot = FakeBot()
    manager = ChatManager.__new__(ChatManager)
    manager.bot = fake_bot
    manager.db = fake_db
    from chat.locks import ConversationLockManager
    manager._locks = ConversationLockManager()

    async def _persist_messages_safely(conversation_id, input_text, response_content, source):
        persisted.append(("persist", conversation_id, response_content))

    manager._persist_messages_safely = _persist_messages_safely

    events: list[DispatchEvent] = []
    async for ev in manager.stream_with_tools(
        input_text="x",
        conversation_id="conv-dual-empty",
        source="test",
        app_state=app_state,
    ):
        events.append(ev)

    assert fake_bot.calls == MAX_TOOL_ITERS
    assert fake_bot.no_tools_calls == 1
    text_events = [e for e in events if e.kind == "text"]
    assert text_events, "fallback message must be emitted"
    assert text_events[0].text == _CAP_FALLBACK_MESSAGE
    assert events[-1].kind == "end"


async def test_handler_truncates_oversized_content(retrieval_registry):
    """Tool result is hard-capped to protect the prompt context window."""
    from core.tools.retrieval_tool import _MAX_TOOL_CONTENT_CHARS, _TRUNCATION_NOTICE

    huge = "X" * (_MAX_TOOL_CONTENT_CHARS * 2)
    retriever = StubRetriever(formatted=huge)
    ctx = _make_ctx(retriever)

    result = await SEARCH_TOOL.handler({"query": "anything"}, ctx)

    assert len(result.content) <= _MAX_TOOL_CONTENT_CHARS
    assert result.content.endswith(_TRUNCATION_NOTICE)


async def test_handler_expands_short_followup_query(retrieval_registry):
    """Short or referential queries get prepended with the last user message."""
    retriever = StubRetriever()
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)
    ctx = ToolContext(
        conversation_id="conv-x",
        user_input="y cuánto?",
        app_state=app_state,
        extra={"prior_user_msgs": ["¿Qué planes ofrecen?"]},
    )

    await SEARCH_TOOL.handler({"query": "y cuánto?", "k": 3}, ctx)

    sent_query = retriever.calls[0]["query"]
    assert "¿Qué planes ofrecen?" in sent_query
    assert "y cuánto?" in sent_query


async def test_handler_skips_expansion_when_prior_msg_is_short(retrieval_registry):
    """Don't pollute query with terse prior messages (e.g., 'ok', 'sí')."""
    retriever = StubRetriever()
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)
    ctx = ToolContext(
        conversation_id="conv-x",
        user_input="y cuánto?",
        app_state=app_state,
        extra={"prior_user_msgs": ["ok"]},
    )

    await SEARCH_TOOL.handler({"query": "y cuánto?", "k": 3}, ctx)

    sent_query = retriever.calls[0]["query"]
    assert sent_query == "y cuánto?"


async def test_handler_skips_expansion_for_specific_query(retrieval_registry):
    """A long, specific query is not augmented with history (avoids noise)."""
    retriever = StubRetriever()
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)
    ctx = ToolContext(
        conversation_id="conv-x",
        user_input="x",
        app_state=app_state,
        extra={"prior_user_msgs": ["consulta previa irrelevante"]},
    )

    await SEARCH_TOOL.handler(
        {"query": "precio del plan empresarial mensual con soporte", "k": 4},
        ctx,
    )

    sent_query = retriever.calls[0]["query"]
    assert "consulta previa irrelevante" not in sent_query
    assert sent_query == "precio del plan empresarial mensual con soporte"


async def test_handler_uses_turn_cache_for_duplicate_calls(retrieval_registry):
    """Two identical calls within the same turn hit the cache, not the retriever."""
    retriever = StubRetriever(formatted="CACHED_RESULT")
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)
    turn_cache: dict = {}
    ctx = ToolContext(
        conversation_id="conv-x",
        user_input="x",
        app_state=app_state,
        extra={"prior_user_msgs": [], "turn_tool_cache": turn_cache},
    )

    first = await SEARCH_TOOL.handler({"query": "precio plan empresarial", "k": 4}, ctx)
    second = await SEARCH_TOOL.handler({"query": "precio plan empresarial", "k": 4}, ctx)

    assert first.content == second.content == "CACHED_RESULT"
    assert len(retriever.calls) == 1, "second call must come from turn cache"
    assert turn_cache, "cache must be populated after first call"


async def test_handler_turn_cache_misses_on_different_args(retrieval_registry):
    """Different `k` produces a different cache key."""
    retriever = StubRetriever()
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)
    turn_cache: dict = {}
    ctx = ToolContext(
        conversation_id="conv-x",
        user_input="x",
        app_state=app_state,
        extra={"prior_user_msgs": [], "turn_tool_cache": turn_cache},
    )

    await SEARCH_TOOL.handler({"query": "same query", "k": 3}, ctx)
    await SEARCH_TOOL.handler({"query": "same query", "k": 6}, ctx)

    assert len(retriever.calls) == 2


async def test_react_loop_pre_loop_budget_skips_iterations(retrieval_registry):
    """If the prompt is already over budget at entry, the loop is skipped."""
    from chat.manager import ChatManager, _MAX_TURN_CHARS
    from langchain_core.messages import HumanMessage, SystemMessage

    base_messages: list = [
        SystemMessage(content="s"),
        # Already over budget on entry — every char counts.
        HumanMessage(content="X" * (_MAX_TURN_CHARS + 100)),
    ]

    class FakeBot:
        memory = None

        def __init__(self):
            self.calls = 0
            self.no_tools_calls = 0
            self.added_to_memory: list = []

        async def aprepare_messages(self, x):
            return list(base_messages)

        async def astream_messages(self, messages, tool_choice=None):
            self.calls += 1
            yield MockChunk(content="should_not_run")

        async def astream_messages_no_tools(self, messages):
            self.no_tools_calls += 1
            yield MockChunk(content="Final tras pre-loop budget.")

        async def add_to_memory(self, *a, **kw):
            return None

    fake_db = SimpleNamespace()

    async def _add_message(*a, **kw):
        return None

    fake_db.add_message = _add_message

    fake_bot = FakeBot()
    manager = ChatManager.__new__(ChatManager)
    manager.bot = fake_bot
    manager.db = fake_db
    from chat.locks import ConversationLockManager
    manager._locks = ConversationLockManager()

    async def _persist_messages_safely(*a, **kw):
        return None

    manager._persist_messages_safely = _persist_messages_safely

    events: list[DispatchEvent] = []
    async for ev in manager.stream_with_tools(
        input_text="x",
        conversation_id="conv-pre-budget",
        source="test",
        app_state=SimpleNamespace(),
    ):
        events.append(ev)

    # Bound model never called; only the unbound final stream ran.
    assert fake_bot.calls == 0
    assert fake_bot.no_tools_calls == 1
    text_events = [e for e in events if e.kind == "text"]
    assert text_events and "pre-loop budget" in text_events[0].text


async def test_react_loop_budget_guard_triggers_forced_final(retrieval_registry):
    """Exceeding the message budget mid-loop triggers the no-tools final stream."""
    from chat.manager import ChatManager, _MAX_TURN_CHARS
    from langchain_core.messages import HumanMessage, SystemMessage

    # Each tool result is huge — one append should already cross the budget.
    huge_payload = "Z" * (_MAX_TURN_CHARS + 1000)
    retriever = StubRetriever(formatted=huge_payload)  # truncated by handler to 4000
    bot_ns = SimpleNamespace(rag_retriever=retriever)
    app_state = SimpleNamespace(bot_instance=bot_ns)

    base_messages: list = [
        SystemMessage(content="s"),
        # Pad the human message so the budget is exceeded after one append.
        HumanMessage(content="X" * (_MAX_TURN_CHARS - 1000)),
    ]

    class FakeBot:
        memory = None

        def __init__(self):
            self.calls = 0
            self.no_tools_calls = 0
            self.added_to_memory: list = []

        async def aprepare_messages(self, x):
            return list(base_messages)

        async def astream_messages(self, messages, tool_choice=None):
            self.calls += 1
            yield MockChunk(tool_call_chunks=[
                {"index": 0, "name": SEARCH_TOOL_NAME, "args": '{"query":"x"}', "id": f"c{self.calls}"}
            ])

        async def astream_messages_no_tools(self, messages):
            self.no_tools_calls += 1
            yield MockChunk(content="Texto final tras budget guard.")

        async def add_to_memory(self, human, ai, conversation_id):
            self.added_to_memory.append((human, ai, conversation_id))

    fake_db = SimpleNamespace()
    persisted: list = []

    async def _add_message(*a, **kw):
        persisted.append(("add_message", a))
        return None

    fake_db.add_message = _add_message

    fake_bot = FakeBot()
    manager = ChatManager.__new__(ChatManager)
    manager.bot = fake_bot
    manager.db = fake_db
    from chat.locks import ConversationLockManager
    manager._locks = ConversationLockManager()

    async def _persist_messages_safely(*a, **kw):
        persisted.append(("persist", a))

    manager._persist_messages_safely = _persist_messages_safely

    events: list[DispatchEvent] = []
    async for ev in manager.stream_with_tools(
        input_text="x",
        conversation_id="conv-budget",
        source="test",
        app_state=app_state,
    ):
        events.append(ev)

    # Only ONE bound stream happens (budget exceeded after first append),
    # then the forced no-tools final fires.
    assert fake_bot.calls == 1
    assert fake_bot.no_tools_calls == 1
    text_events = [e for e in events if e.kind == "text"]
    assert text_events
    assert "budget guard" in text_events[0].text
    assert events[-1].kind == "end"


async def test_empty_stream_persists_user_message_only(retrieval_registry):
    """Bot's `astream_messages` yields zero chunks.

    The dispatcher still emits exactly one `end` event (consume_stream always
    closes the stream), so manager.py's `stream_ended=True` branch fires and
    breaks out of the iteration loop. The bottom `else:` branch then persists
    only the user message — no assistant text, no memory write.
    """
    from chat.manager import ChatManager
    from langchain_core.messages import HumanMessage, SystemMessage

    base_messages: list = [SystemMessage(content="s"), HumanMessage(content="hi")]

    class SilentBot:
        def __init__(self):
            self.added_to_memory: list = []

        async def aprepare_messages(self, x):
            return list(base_messages)

        async def astream_messages(self, messages, tool_choice=None):
            # Yields nothing.
            if False:
                yield None  # pragma: no cover

        async def add_to_memory(self, human, ai, conversation_id):
            self.added_to_memory.append((human, ai, conversation_id))

    fake_db = SimpleNamespace()
    persisted: list = []

    async def _add_message(*a, **kw):
        persisted.append(a)
        return None

    fake_db.add_message = _add_message

    silent_bot = SilentBot()
    manager = ChatManager.__new__(ChatManager)
    manager.bot = silent_bot
    manager.db = fake_db
    from chat.locks import ConversationLockManager
    manager._locks = ConversationLockManager()

    persist_msgs_called = False

    async def _persist_messages_safely(*a, **kw):
        nonlocal persist_msgs_called
        persist_msgs_called = True

    manager._persist_messages_safely = _persist_messages_safely

    events: list[DispatchEvent] = []
    async for ev in manager.stream_with_tools(
        input_text="hi",
        conversation_id="conv-silent",
        source="test",
        app_state=SimpleNamespace(),
    ):
        events.append(ev)

    assert events and events[-1].kind == "end"
    assert not [e for e in events if e.kind == "text"]
    # Only the user-message persistence runs (else branch), not the assistant pair.
    assert persist_msgs_called is False
    assert silent_bot.added_to_memory == []
    assert any("hi" in str(a) for a in persisted), "user message must be persisted on empty stream"


# ---------------------------------------------------------------------------
# Layer 2 — Integration tests (real LLM, opt-in)
# ---------------------------------------------------------------------------


_INTEGRATION_KEY = os.getenv("OPENAI_API_KEY_REAL")
_SKIP_REASON = "needs OPENAI_API_KEY_REAL env var (real OpenAI key) to run"


async def _run_against_real_model(user_input: str) -> tuple[bool, Optional[dict]]:
    """Run real bound model + dispatcher; return (search_fired, args)."""
    os.environ["OPENAI_API_KEY"] = _INTEGRATION_KEY  # type: ignore[arg-type]

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

    cm = ChainManager(settings=settings, tools=[SEARCH_TOOL])

    inputs = {
        "input": user_input,
        "history": [],
        "context": "No hay información adicional recuperada para esta consulta.",
    }

    async def _stream():
        async for chunk in cm.runnable_chain.astream(inputs):
            yield chunk

    retriever = StubRetriever(formatted="(stub)")
    ctx = _make_ctx(retriever, conv="eval-r")
    fired = False
    args: Optional[dict] = None
    async for ev in consume_stream(_stream(), ctx, min_chunk_chars=32):
        if ev.kind == "tool_continuation":
            fired = True
            args = ev.tool_args
    return fired, args


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_greeting_does_not_fire_search():
    fired, _ = await _run_against_real_model("Hola, buenos días")
    assert fired is False


@pytest.mark.integration
@pytest.mark.skipif(not _INTEGRATION_KEY, reason=_SKIP_REASON)
async def test_integration_factual_question_fires_search():
    fired, args = await _run_against_real_model("¿Cuál es el precio del plan empresarial?")
    assert fired is True
    assert args and "query" in args
