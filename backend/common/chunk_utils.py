"""Shared utility for extracting plain text from LangChain chunk objects."""
from typing import Any


def extract_text_from_chunk(chunk: Any) -> str:
    """Pull plain text from an AIMessageChunk-like object."""
    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        try:
            parts = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text" and isinstance(item.get("text"), str):
                        parts.append(item.get("text") or "")
                else:
                    t = getattr(item, "text", None)
                    tp = getattr(item, "type", None)
                    if tp == "text" and isinstance(t, str):
                        parts.append(t)
            return "".join(parts)
        except Exception:
            try:
                return "".join(str(x) for x in content)
            except Exception:
                return ""
    t = getattr(chunk, "text", None)
    if isinstance(t, str):
        return t
    if isinstance(chunk, str):
        return chunk
    return ""
