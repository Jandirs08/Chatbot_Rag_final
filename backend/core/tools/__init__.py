from .base import ToolContext, ToolDefinition, ToolHandler, ToolMode, ToolResult
from .registry import ToolRegistry, registry


def bootstrap_tools(settings) -> None:
    """Register tools enabled by current settings. Idempotent — clears first."""
    registry.clear()
    if getattr(settings, "enable_agentic_handoff", False):
        from .handoff_tool import HANDOFF_TOOL
        registry.register(HANDOFF_TOOL)
    if getattr(settings, "enable_agentic_rag", False):
        from .retrieval_tool import SEARCH_TOOL
        registry.register(SEARCH_TOOL)


__all__ = [
    "ToolContext",
    "ToolDefinition",
    "ToolHandler",
    "ToolMode",
    "ToolResult",
    "ToolRegistry",
    "registry",
    "bootstrap_tools",
]
