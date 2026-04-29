"""Streaming tool-call dispatcher.

Consumes raw chunks from a LangChain chat model stream (`AIMessageChunk`-like
objects) and yields `DispatchEvent`s the route layer can turn into SSE frames.

Two execution paths:
- text chunk → emits `DispatchEvent(kind="text", text=...)`
- tool_call detected → invokes the registered handler:
    * terminal handler → emits `DispatchEvent(kind="tool_terminal", ...)` and stops
    * continuation handler → reserved (raises NotImplementedError until tool 2 lands)

Caller is responsible for: (a) feeding the chunks (b) reacting to events.

Why a dispatcher rather than logic inside `chat_routes.py`: keeps SSE concerns
out of the model layer and lets us test tool consumption independent of HTTP.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional

from core.tools import ToolContext, ToolDefinition, ToolResult, registry as default_registry
from core.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


@dataclass
class DispatchEvent:
    """One unit of work the route layer should act on."""
    kind: str  # "text" | "tool_terminal" | "tool_continuation" | "end"
    text: Optional[str] = None
    tool_name: Optional[str] = None
    tool_args: dict = field(default_factory=dict)
    sse_event: Optional[str] = None
    sse_payload: Optional[dict] = None


def _extract_text(chunk: Any) -> str:
    """Pull plain text from an AIMessageChunk-like object (mirrors bot._extract_text)."""
    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            else:
                t = getattr(item, "text", None)
                tp = getattr(item, "type", None)
                if tp == "text" and isinstance(t, str):
                    parts.append(t)
        return "".join(parts)
    if isinstance(chunk, str):
        return chunk
    return ""


def _extract_tool_call_chunks(chunk: Any) -> list[dict]:
    """LangChain AIMessageChunk exposes `tool_call_chunks` (list of partial calls)."""
    tcc = getattr(chunk, "tool_call_chunks", None)
    if isinstance(tcc, list):
        return tcc
    return []


class _ToolCallAccumulator:
    """Aggregates streamed tool_call_chunks into complete tool calls keyed by index."""

    def __init__(self) -> None:
        self._buf: dict[int, dict] = {}

    def update(self, chunks: list[dict]) -> None:
        for ch in chunks:
            idx = ch.get("index", 0)
            slot = self._buf.setdefault(idx, {"name": "", "args": "", "id": ""})
            if ch.get("name"):
                slot["name"] = ch["name"]
            if ch.get("id"):
                slot["id"] = ch["id"]
            args_delta = ch.get("args")
            if args_delta:
                slot["args"] += args_delta

    def finalized_calls(self) -> list[dict]:
        out = []
        for idx in sorted(self._buf.keys()):
            slot = self._buf[idx]
            if not slot["name"]:
                continue
            try:
                args_obj = json.loads(slot["args"]) if slot["args"] else {}
            except json.JSONDecodeError:
                args_obj = {}
            out.append({"name": slot["name"], "args": args_obj, "id": slot["id"]})
        return out


async def consume_stream(
    chunks: AsyncIterator[Any],
    context: ToolContext,
    *,
    min_chunk_chars: int = 32,
    tool_registry: Optional[ToolRegistry] = None,
) -> AsyncIterator[DispatchEvent]:
    """Consume an async iterator of model chunks and yield dispatch events.

    Buffers text up to `min_chunk_chars` to reduce flush overhead.
    Aborts text emission if a tool call is detected mid-stream — the partial
    text is discarded because terminal tools take precedence over assistant text.
    """
    reg = tool_registry or default_registry
    accumulator = _ToolCallAccumulator()
    text_buffer = ""
    tool_call_seen = False

    async for chunk in chunks:
        tcc = _extract_tool_call_chunks(chunk)
        if tcc:
            tool_call_seen = True
            accumulator.update(tcc)
            continue

        if tool_call_seen:
            # Once we're in tool-call territory, ignore any trailing text deltas.
            continue

        text = _extract_text(chunk)
        if not text:
            continue
        text_buffer += text
        if len(text_buffer) >= min_chunk_chars:
            yield DispatchEvent(kind="text", text=text_buffer)
            text_buffer = ""

    if tool_call_seen:
        calls = accumulator.finalized_calls()
        if not calls:
            logger.warning("Tool call detected but accumulator empty; falling back to text.")
            if text_buffer:
                yield DispatchEvent(kind="text", text=text_buffer)
            yield DispatchEvent(kind="end")
            return

        # First tool call wins. Multi-tool support is future work.
        call = calls[0]
        tool: Optional[ToolDefinition] = reg.get(call["name"])
        if tool is None:
            logger.warning("Model called unknown tool: %s", call["name"])
            yield DispatchEvent(kind="end")
            return

        try:
            result: ToolResult = await tool.handler(call["args"], context)
        except Exception as exc:
            logger.error("Tool handler %s failed: %s", tool.name, exc, exc_info=True)
            yield DispatchEvent(kind="end")
            return

        if tool.mode == "terminal":
            yield DispatchEvent(
                kind="tool_terminal",
                tool_name=tool.name,
                tool_args=call["args"],
                sse_event=result.sse_event,
                sse_payload=result.sse_payload,
            )
            yield DispatchEvent(kind="end")
            return

        # Continuation tools require re-invoking the chain with a ToolMessage.
        # Implement when the second tool (e.g. retrieval) lands.
        raise NotImplementedError(
            f"Continuation tool '{tool.name}' not yet supported by dispatcher"
        )

    if text_buffer:
        yield DispatchEvent(kind="text", text=text_buffer)
    yield DispatchEvent(kind="end")
