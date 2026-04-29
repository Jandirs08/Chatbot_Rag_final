"""Tool registry singleton."""
from __future__ import annotations

from typing import Optional

from .base import ToolDefinition


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    def get(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def list_tools(self) -> list[ToolDefinition]:
        return list(self._tools.values())

    def list_schemas(self) -> list[dict]:
        return [t.schema for t in self._tools.values()]

    def has_tools(self) -> bool:
        return bool(self._tools)

    def clear(self) -> None:
        self._tools.clear()


registry = ToolRegistry()
