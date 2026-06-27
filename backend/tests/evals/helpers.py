"""Shared test helpers for the evals package.

Import from here instead of redefining in each eval test file:
    from tests.evals.helpers import MockChunk, _aiter, _collect
"""
from __future__ import annotations

from typing import Any, AsyncIterator, Optional

from chat.tool_dispatch import DispatchEvent, consume_stream
from core.tools import ToolContext


class MockChunk:
    """Minimal AIMessageChunk-like object the dispatcher knows how to read."""

    def __init__(self, content: str = "", tool_call_chunks: Optional[list[dict]] = None):
        self.content = content
        self.tool_call_chunks = tool_call_chunks or []


async def _aiter(items: list[Any]) -> AsyncIterator[Any]:
    for it in items:
        yield it


async def _collect(chunks: list[Any], ctx: ToolContext, **kwargs) -> list[DispatchEvent]:
    out: list[DispatchEvent] = []
    async for ev in consume_stream(_aiter(chunks), ctx, **kwargs):
        out.append(ev)
    return out
