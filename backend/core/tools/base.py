"""Tool primitives for agentic LLM pipelines.

Two execution modes:
- terminal: handler runs side-effect, stream stops, optional SSE event surfaces
  to the caller. Model is NOT re-invoked.
- continuation: handler returns content fed back as ToolMessage; model loops.
  Reserved for future tools (e.g. retrieval). Dispatcher must re-invoke chain.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal, Optional

ToolMode = Literal["terminal", "continuation"]


@dataclass
class ToolResult:
    """Outcome of a tool handler invocation."""
    sse_event: Optional[str] = None
    sse_payload: Optional[dict] = None
    stop_stream: bool = False
    content: Optional[str] = None  # only used by continuation tools


@dataclass
class ToolContext:
    """Runtime context handed to tool handlers."""
    conversation_id: str
    user_input: str
    app_state: Any = None
    extra: dict = field(default_factory=dict)


ToolHandler = Callable[[dict, ToolContext], Awaitable[ToolResult]]


@dataclass
class ToolDefinition:
    name: str
    schema: dict  # OpenAI/LangChain function-calling schema
    mode: ToolMode
    handler: ToolHandler
    description: str = ""
