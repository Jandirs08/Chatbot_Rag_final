"""Unit tests for _should_force_search and _stream_with_idle_timeout in chat.handlers.agentic."""
from __future__ import annotations

import asyncio
from typing import Optional

import pytest

from chat.handlers.agentic import _should_force_search, _stream_with_idle_timeout

pytestmark = pytest.mark.anyio


# ─── _should_force_search ──────────────────────────────────────────────────────


class TestShouldForceSearch:
    """Tests for the heuristic that decides whether to force a RAG search."""

    @pytest.mark.parametrize("text, expected", [
        # None / empty → no search
        (None, False),
        ("", False),
        # Below minimum character threshold (< 3 chars)
        ("ok", False),
        ("ya", False),
        ("ab", False),
        # Greetings — matched by regex
        ("hola", False),
        ("Hola!", False),
        ("Buenos días", False),
        ("buenas tardes", False),
        ("Gracias", False),
        ("muchas gracias", False),
        ("entendido", False),
        ("bye", False),
        # Meta / identity questions — matched by regex
        ("¿quién eres?", False),
        ("¿qué puedes hacer?", False),
        ("cómo funcionas", False),
    ])
    def test_no_search_forced(self, text: Optional[str], expected: bool) -> None:
        """Greetings, meta-questions, and short inputs must NOT force a search."""
        assert _should_force_search(text) is expected

    @pytest.mark.parametrize("text, expected", [
        # Domain questions → search must be forced
        ("¿Cuánto cuesta el plan?", True),
        ("Necesito información sobre precios", True),
        ("¿Qué servicios ofrecen?", True),
        ("precio del plan empresarial", True),
        # Greeting prefix + substantive content → search IS forced
        ("hola necesito información", True),
    ])
    def test_search_forced(self, text: str, expected: bool) -> None:
        """Domain queries must trigger a forced search."""
        assert _should_force_search(text) is expected

    def test_none_returns_false(self) -> None:
        """Explicit None guard — mirrors the early-return in the implementation."""
        assert _should_force_search(None) is False

    def test_whitespace_only_returns_false(self) -> None:
        """Whitespace-only strings strip to empty and fall below min-char threshold."""
        assert _should_force_search("   ") is False

    def test_exactly_min_chars_that_is_not_a_keyword(self) -> None:
        """A 3-char non-keyword string should force search."""
        assert _should_force_search("xyz") is True

    def test_greeting_with_trailing_punctuation(self) -> None:
        """Regex must absorb common punctuation suffixes without leaking."""
        assert _should_force_search("Hola!!") is False

    def test_case_insensitive_matching(self) -> None:
        """Regex is compiled with re.IGNORECASE — verify upper-case variants."""
        assert _should_force_search("GRACIAS") is False
        assert _should_force_search("BYE") is False


# ─── _stream_with_idle_timeout ─────────────────────────────────────────────────


class TestStreamWithIdleTimeout:
    """Tests for the idle-timeout wrapper around async generators."""

    async def test_normal_stream_yields_all_items(self) -> None:
        """All events from a fast generator must be forwarded unchanged."""
        async def _fast_gen():
            for item in [1, 2, 3]:
                yield item

        collected = []
        async for event in _stream_with_idle_timeout(_fast_gen(), idle_timeout=5.0):
            collected.append(event)

        assert collected == [1, 2, 3]

    async def test_timeout_raises_when_generator_stalls(self) -> None:
        """A generator that never yields must cause asyncio.TimeoutError."""
        async def _stalling_gen():
            await asyncio.sleep(999)
            yield "never"  # pragma: no cover

        with pytest.raises(asyncio.TimeoutError):
            async for _ in _stream_with_idle_timeout(_stalling_gen(), idle_timeout=0.01):
                pass  # pragma: no cover

    async def test_aclose_called_on_timeout(self) -> None:
        """When a timeout fires the wrapper must call aclose() on the generator."""
        closed = False

        async def _stalling_gen():
            nonlocal closed
            try:
                await asyncio.sleep(999)
                yield "never"  # pragma: no cover
            except GeneratorExit:
                closed = True

        with pytest.raises(asyncio.TimeoutError):
            async for _ in _stream_with_idle_timeout(_stalling_gen(), idle_timeout=0.01):
                pass  # pragma: no cover

        # Give the event loop a tick to let aclose() propagate.
        await asyncio.sleep(0)
        assert closed is True

    async def test_empty_generator_returns_immediately(self) -> None:
        """An immediately-exhausted generator must produce no items and not timeout."""
        async def _empty_gen():
            return
            yield  # makes this an async generator  # noqa: unreachable

        collected = []
        async for event in _stream_with_idle_timeout(_empty_gen(), idle_timeout=5.0):
            collected.append(event)

        assert collected == []

    async def test_timeout_applies_per_item_not_total(self) -> None:
        """Each inter-item gap is independently checked; slow-but-steady must pass."""
        async def _slow_but_steady():
            for item in ["a", "b", "c"]:
                await asyncio.sleep(0.02)
                yield item

        collected = []
        # idle_timeout > per-item sleep, so it must not fire.
        async for event in _stream_with_idle_timeout(_slow_but_steady(), idle_timeout=1.0):
            collected.append(event)

        assert collected == ["a", "b", "c"]
