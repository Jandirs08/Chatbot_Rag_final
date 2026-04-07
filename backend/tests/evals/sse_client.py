from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

import httpx


@dataclass
class ChatStreamResult:
    text: str
    debug: dict[str, Any] | None = None
    error: str | None = None


def _iter_sse_events(response: httpx.Response):
    event_name = "message"
    data_lines: list[str] = []
    for raw_line in response.iter_lines():
        line = raw_line.strip()
        if not line:
            if data_lines:
                yield event_name, "\n".join(data_lines)
            event_name = "message"
            data_lines = []
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip() or "message"
            continue
        if line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())
    if data_lines:
        yield event_name, "\n".join(data_lines)


def collect_chat_stream(
    client: httpx.Client,
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
) -> ChatStreamResult:
    text_parts: list[str] = []
    debug_payload: dict[str, Any] | None = None
    error_message: str | None = None

    with client.stream("POST", url, json=payload, headers=headers) as response:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            try:
                body = response.text.strip()
            except Exception:
                body = "<sin cuerpo>"
            raise RuntimeError(f"Fallo el endpoint de chat: {response.status_code} {body}") from exc
        for event_name, data in _iter_sse_events(response):
            if event_name == "end":
                break
            if not data:
                continue
            parsed = json.loads(data)
            if event_name == "debug":
                debug_payload = parsed
                continue
            if event_name == "error":
                error_message = parsed.get("message") or str(parsed)
                continue
            if "stream" in parsed:
                text_parts.append(str(parsed["stream"]))

    return ChatStreamResult(
        text="".join(text_parts).strip(),
        debug=debug_payload,
        error=error_message,
    )
