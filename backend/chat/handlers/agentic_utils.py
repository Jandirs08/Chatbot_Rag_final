"""Stateless utilities for the agentic streaming handler."""
from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Optional

from infra.logging_utils import get_logger
from core.tools.retrieval_tool import SEARCH_TOOL_NAME

logger = get_logger(__name__)

# Peruvian Spanish greeting / ack / meta-question patterns. Full-match anchored,
# case-insensitive. If matched → tool_choice="auto" (let model decide).
# Otherwise → force search_documents so agent can't skip retrieval for legit
# domain questions just because they're phrased informally.
_NO_SEARCH_RE = re.compile(
    r"^\s*(?:"
    r"hola+|holi+|holap|buen[oa]s?(?:\s+(?:d[ií]as?|tardes?|noches?))?|"
    r"qu[eé]\s+tal|qu[eé]\s+hubo|qu[eé]\s+onda|c[oó]mo\s+est[aá]s?|c[oó]mo\s+va|"
    r"todo\s+bien|hi|hello|hey|"
    r"adi[oó]s|chao|chau|bye|nos\s+vemos|hasta\s+luego|hasta\s+pronto|me\s+voy|"
    r"gracias|muchas?\s+gracias|mil\s+gracias|thanks|thank\s+you|"
    r"ok|okay|okey|ya|listo|perfecto|entendido|entiendo|comprendo|"
    r"genial|excelente|bacán|chevere|chévere|de\s+una|s[ií]|sip|no|nop|nope|"
    r"dale|va|claro|claro\s+que\s+s[ií]|por\s+supuesto|"
    r"no\s+entend[ií]|no\s+entiendo|no\s+capto|repite|rep[ií]telo|"
    r"resume|res[uú]melo|m[aá]s\s+corto|m[aá]s\s+simple|expl[ií]ca(?:lo)?\s+m[aá]s\s+simple|"
    r"qui[eé]n\s+eres|qu[eé]\s+eres|qu[eé]\s+haces|qu[eé]\s+puedes\s+hacer|"
    r"c[oó]mo\s+funcionas|para\s+qu[eé]\s+sirves"
    r")\s*[.!?¿¡…]*\s*$",
    re.IGNORECASE,
)

_MIN_FORCE_CHARS = 3


def _should_force_search(text: Optional[str]) -> bool:
    """True when user input should bypass tool_choice='auto'."""
    if not text:
        return False
    stripped = text.strip()
    if len(stripped) < _MIN_FORCE_CHARS:
        return False
    return _NO_SEARCH_RE.match(stripped) is None


def _search_tool_choice() -> dict:
    """Fresh dict per call — defends against any downstream in-place mutation."""
    return {"type": "function", "function": {"name": SEARCH_TOOL_NAME}}


def _bot_has_search_tool(bot) -> bool:
    """True when search_documents is actually bound to the model.

    If bind_tools failed at startup (chain.py logs a warning but continues),
    forcing tool_choice would trigger an OpenAI 400. Guard against that.
    """
    try:
        tools = getattr(bot.chain_manager, "tools", None) or []
        return any(getattr(t, "name", None) == SEARCH_TOOL_NAME for t in tools)
    except Exception as exc:
        logger.warning("_bot_has_search_tool check failed, defaulting to False: %s", exc)
        return False


@dataclass
class AgenticResponseResult:
    text: str
    terminal_tool: Optional[str] = None
    terminal_event: Optional[str] = None
    terminal_payload: Optional[dict] = None


def _messages_total_chars(messages) -> int:
    """Sum content length across a message list (proxy for token count)."""
    total = 0
    for m in messages:
        c = getattr(m, "content", None)
        if isinstance(c, str):
            total += len(c)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, str):
                    total += len(part)
                else:
                    total += len(str(part))
        elif c is not None:
            total += len(str(c))
    return total


def _messages_total_tokens(messages) -> int:
    """Estimación tiktoken cl100k_base sobre `messages` list."""
    from chat.debug import get_token_count
    total = 0
    for m in messages:
        c = getattr(m, "content", None)
        if isinstance(c, str):
            total += get_token_count(c)
        elif isinstance(c, list):
            for part in c:
                total += get_token_count(part if isinstance(part, str) else str(part))
        elif c is not None:
            total += get_token_count(str(c))
        tool_calls = getattr(m, "tool_calls", None) or []
        for tc in tool_calls:
            try:
                total += get_token_count(str(tc))
            except Exception:
                pass
    return total


async def _collect_prior_user_msgs(memory, conversation_id: str, limit: int = 2) -> list[str]:
    """Best-effort fetch of the last N user messages for query expansion."""
    if memory is None:
        return []
    try:
        hist = await memory.get_history(conversation_id)
    except Exception as exc:
        logger.warning("_collect_prior_user_msgs failed for conv=%s: %s", conversation_id, exc)
        return []
    if not isinstance(hist, list):
        return []
    out: list[str] = []
    for msg in hist[-(limit * 4):]:
        if not isinstance(msg, dict):
            continue
        if msg.get("role") not in ("human", "user"):
            continue
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            out.append(content.strip())
    return out[-limit:]


async def _stream_with_idle_timeout(agen, idle_timeout: float):
    """Yield events from agen, raise TimeoutError if no event within idle_timeout seconds."""
    while True:
        try:
            event = await asyncio.wait_for(agen.__anext__(), timeout=idle_timeout)
        except StopAsyncIteration:
            return
        except asyncio.TimeoutError:
            try:
                await agen.aclose()
            except Exception:
                pass
            raise
        yield event
