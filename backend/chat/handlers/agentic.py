from dataclasses import dataclass
from typing import Optional
import asyncio
import re
import time

from fastapi import HTTPException

from utils.logging_utils import get_logger
from config import settings
from common.constants import USER_ROLE
from core.request_context import new_request_context
from core.tools import ToolContext
from core.tools.retrieval_tool import SEARCH_TOOL_NAME
from langchain_core.messages import AIMessage, ToolMessage

from chat.debug import log_stream_timing_summary
from chat.locks import ConversationLockManager
from chat.tool_dispatch import DispatchEvent, consume_stream

logger = get_logger(__name__)

MAX_TOOL_ITERS = 3

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
    except Exception:
        return False

_REACT_STREAM_IDLE_TIMEOUT = float(getattr(settings, "react_stream_idle_timeout_seconds", 30.0))

_MAX_TURN_CHARS = 240_000

_CAP_FALLBACK_MESSAGE = (
    "No pude completar tu consulta con la información disponible. "
    "¿Podrías reformular la pregunta o ser más específico?"
)


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
    """Estimación tiktoken cl100k_base sobre `messages` list. Reusa el helper
    de `chat/debug.py` para consistencia. Bajo costo (~50µs por mensaje cacheado).
    """
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
    except Exception:
        return []
    if not isinstance(hist, list):
        return []
    out: list[str] = []
    for msg in hist[-(limit * 4):]:  # over-fetch — filter below
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


async def stream_with_tools(
    bot,
    db,
    locks: ConversationLockManager,
    input_text: str,
    conversation_id: str,
    source: str | None = None,
    app_state=None,
):
    """Streaming variant that consumes raw model chunks via the tool dispatcher.

    Yields `DispatchEvent`s. The route layer maps them to SSE frames.
    Cache is intentionally bypassed: tool_call decisions are context-dependent
    and a cached text response would shortcut handoff logic.

    Continuation tools (e.g. `search_documents`) trigger a ReAct iteration:
    the tool result is appended as a `ToolMessage`, the bound model is
    re-streamed, and dispatcher events are forwarded. Capped at
    `MAX_TOOL_ITERS` invocations per user turn.
    """
    conversation_lock: Optional[object] = None
    lock_acquired = False
    text_accum = ""
    tool_fired = False
    stream_started_at = time.perf_counter()
    first_token_recorded = False
    req_ctx = None
    tool_calls_count = 0
    tokens_in_accum = 0
    try:
        conversation_lock, lock_acquired = await locks.acquire(conversation_id)
        if not lock_acquired:
            raise HTTPException(status_code=429, detail="Conversation busy, try again")
        req_ctx = new_request_context()

        prior_user_msgs = await _collect_prior_user_msgs(
            getattr(bot, "memory", None), conversation_id
        )
        turn_tool_cache: dict = {}

        ctx = ToolContext(
            conversation_id=conversation_id,
            user_input=input_text,
            app_state=app_state,
            extra={
                "prior_user_msgs": prior_user_msgs,
                "turn_tool_cache": turn_tool_cache,
            },
        )
        bot_input = {"input": input_text, "conversation_id": conversation_id}
        min_chars = int(getattr(settings, "stream_min_chunk_chars", 32))

        messages = await bot.aprepare_messages(bot_input)

        forced_final = False
        forced_final_reason: Optional[str] = None

        initial_chars = _messages_total_chars(messages)
        if initial_chars > _MAX_TURN_CHARS:
            forced_final = True
            forced_final_reason = (
                f"budget_exceeded_pre_loop chars={initial_chars} cap={_MAX_TURN_CHARS}"
            )

        force_search_first = _should_force_search(input_text) and _bot_has_search_tool(bot)
        if force_search_first:
            logger.debug(
                "[Agentic] forcing search_documents tool_choice for first iter conv=%s",
                conversation_id,
            )

        if not forced_final:
            for iteration in range(MAX_TOOL_ITERS):
                try:
                    tokens_in_accum += _messages_total_tokens(messages)
                except Exception as exc:
                    logger.debug("token estimation failed (loop iter): %s", exc)
                # Force tool_choice only on first iter. Subsequent iters have
                # ToolMessage results in `messages`, model must compose freely.
                tool_choice = _search_tool_choice() if (iteration == 0 and force_search_first) else None
                raw_stream = bot.astream_messages(messages, tool_choice=tool_choice)
                continuation: Optional[DispatchEvent] = None
                stream_ended = False

                try:
                    async for event in _stream_with_idle_timeout(
                        consume_stream(raw_stream, ctx, min_chunk_chars=min_chars),
                        _REACT_STREAM_IDLE_TIMEOUT,
                    ):
                        if event.kind == "text" and event.text:
                            if not first_token_recorded:
                                first_token_recorded = True
                                req_ctx.set_stage_timing_ms(
                                    "first_token_ms",
                                    (time.perf_counter() - stream_started_at) * 1000,
                                )
                            text_accum += event.text
                            yield event
                        elif event.kind == "tool_terminal":
                            tool_fired = True
                            yield event
                        elif event.kind == "tool_continuation":
                            continuation = event
                        elif event.kind == "end":
                            if continuation is None:
                                stream_ended = True
                                yield event
                except asyncio.TimeoutError:
                    logger.warning(
                        "[ReAct] iter=%s stream idle timeout (%.1fs) conv=%s — forced final",
                        iteration + 1, _REACT_STREAM_IDLE_TIMEOUT, conversation_id,
                    )
                    forced_final = True
                    forced_final_reason = f"stream_idle_timeout iter={iteration + 1}"
                    break

                if tool_fired or stream_ended:
                    break

                if continuation is None:
                    yield DispatchEvent(kind="end")
                    break

                tool_call = {
                    "name": continuation.tool_name,
                    "args": continuation.tool_args or {},
                    "id": continuation.tool_call_id or f"call_{iteration}",
                }
                messages.append(AIMessage(content="", tool_calls=[tool_call]))
                messages.append(
                    ToolMessage(
                        content=continuation.tool_content or "",
                        tool_call_id=tool_call["id"],
                    )
                )
                tool_calls_count += 1
                logger.info(
                    "[ReAct] iter=%s tool=%s conv=%s docs_chars=%s",
                    iteration + 1,
                    continuation.tool_name,
                    conversation_id,
                    len(continuation.tool_content or ""),
                )

                total_chars = _messages_total_chars(messages)
                if total_chars > _MAX_TURN_CHARS:
                    forced_final = True
                    forced_final_reason = (
                        f"budget_exceeded chars={total_chars} cap={_MAX_TURN_CHARS}"
                    )
                    break
            else:
                forced_final = True
                forced_final_reason = f"cap_reached iters={MAX_TOOL_ITERS}"

        if forced_final:
            logger.warning(
                "[ReAct] forcing text-only final conv=%s reason=%s",
                conversation_id,
                forced_final_reason,
            )
            try:
                tokens_in_accum += _messages_total_tokens(messages)
            except Exception as exc:
                logger.debug("token estimation failed (forced_final): %s", exc)
            final_stream = bot.astream_messages_no_tools(messages)
            fallback_iter_text = ""
            async for event in consume_stream(final_stream, ctx, min_chunk_chars=min_chars):
                if event.kind == "text" and event.text:
                    if not first_token_recorded:
                        first_token_recorded = True
                        req_ctx.set_stage_timing_ms(
                            "first_token_ms",
                            (time.perf_counter() - stream_started_at) * 1000,
                        )
                    fallback_iter_text += event.text
                    text_accum += event.text
                    yield event
                elif event.kind == "end":
                    if not fallback_iter_text and not text_accum:
                        logger.warning(
                            "[ReAct] dual-empty stream conv=%s — emitting fallback text",
                            conversation_id,
                        )
                        text_accum += _CAP_FALLBACK_MESSAGE
                        yield DispatchEvent(kind="text", text=_CAP_FALLBACK_MESSAGE)
                    yield event
                    break

        if tool_fired:
            try:
                await db.add_message(conversation_id, USER_ROLE, input_text, source)
            except Exception as exc:
                logger.error(
                    "Could not persist user message on tool_terminal conv=%s: %s",
                    conversation_id, exc,
                )
        elif text_accum:
            try:
                from common.constants import ASSISTANT_ROLE
                await db.add_message(conversation_id, USER_ROLE, input_text, source)
                await db.add_message(conversation_id, ASSISTANT_ROLE, text_accum, source)
            except Exception as exc:
                logger.error(
                    "No se pudo persistir la conversación en Mongo para conv=%s: %s",
                    conversation_id,
                    exc,
                    exc_info=True,
                )
            await bot.add_to_memory(
                human=input_text, ai=text_accum, conversation_id=conversation_id
            )
        else:
            try:
                await db.add_message(conversation_id, USER_ROLE, input_text, source)
            except Exception as exc:
                logger.error(
                    "Could not persist user message on empty stream conv=%s: %s",
                    conversation_id, exc,
                )
    except Exception as exc:
        logger.error("stream_with_tools failed conv=%s: %s", conversation_id, exc, exc_info=True)
        raise
    finally:
        if req_ctx is not None:
            try:
                stream_total_ms = (time.perf_counter() - stream_started_at) * 1000
                req_ctx.set_stage_timing_ms("stream_total_ms", stream_total_ms)
                rag_ms = (req_ctx.rag_time * 1000) if req_ctx.rag_time else 0.0
                req_ctx.set_stage_timing_ms("llm_ms", max(0.0, stream_total_ms - rag_ms))
                try:
                    from chat.debug import get_token_count as _gtc
                    req_ctx.tokens_in = int(tokens_in_accum or 0)
                    req_ctx.tokens_out = int(_gtc(text_accum) if text_accum else 0)
                except Exception:
                    pass
                log_stream_timing_summary(conversation_id, is_cached=False)

                try:
                    from utils.metrics_collector import ChatSample, get_metrics_collector

                    tokens_out_estimate = int(req_ctx.tokens_out or 0)
                    stages = req_ctx.stage_timings_ms or {}
                    sample = ChatSample(
                        ts=time.time(),
                        success=bool(text_accum or tool_fired),
                        cached=False,
                        used_rag=bool(req_ctx.rag_time and req_ctx.rag_time > 0),
                        total_ms=stream_total_ms,
                        first_token_ms=stages.get("first_token_ms"),
                        rag_ms=rag_ms if rag_ms > 0 else None,
                        llm_ms=stages.get("llm_ms"),
                        embedding_ms=stages.get("embedding_ms"),
                        dense_ms=stages.get("dense_ms"),
                        lexical_ms=stages.get("lexical_ms"),
                        hydrate_ms=stages.get("hydrate_ms"),
                        rerank_ms=stages.get("rerank_ms"),
                        tool_calls=tool_calls_count,
                        tokens_in=tokens_in_accum,
                        tokens_out=tokens_out_estimate,
                        gating_reason=req_ctx.gating_reason,
                    )
                    get_metrics_collector().record_chat(sample)
                except Exception as exc:
                    logger.debug("metrics record failed: %s", exc, exc_info=True)

                # Phantom-gap detection: retrieval ran but the assistant
                # declared data absence. Helper handles dedupe (skip if
                # retrieval already logged its own gap) and forensic chunks.
                if tool_calls_count > 0 and text_accum:
                    try:
                        from chat.grounding import maybe_log_phantom_gap
                        maybe_log_phantom_gap(
                            conversation_id=conversation_id,
                            user_query=input_text,
                            response_text=text_accum,
                            req_ctx=req_ctx,
                        )
                    except Exception as exc:
                        logger.debug("grounding check failed (non-fatal): %s", exc)
            except Exception as exc:
                logger.debug("stream_with_tools finally block failed: %s", exc, exc_info=True)
        await locks.release(
            conversation_id,
            conversation_lock,
            acquired=lock_acquired,
        )


async def generate_agentic_response(
    bot,
    db,
    locks: ConversationLockManager,
    input_text: str,
    conversation_id: str,
    source: str | None = None,
    app_state=None,
) -> AgenticResponseResult:
    """Non-streaming adapter for channels that cannot consume SSE.

    Reuses `stream_with_tools` so Web and WhatsApp share the same agentic
    ReAct loop, persistence, metrics, tool handlers, and safety caps.
    """
    text_parts: list[str] = []
    terminal_tool: Optional[str] = None
    terminal_event: Optional[str] = None
    terminal_payload: Optional[dict] = None

    async for event in stream_with_tools(
        bot=bot,
        db=db,
        locks=locks,
        input_text=input_text,
        conversation_id=conversation_id,
        source=source,
        app_state=app_state,
    ):
        if event.kind == "text" and event.text:
            text_parts.append(event.text)
        elif event.kind == "tool_terminal":
            terminal_tool = event.tool_name
            terminal_event = event.sse_event
            terminal_payload = event.sse_payload or {}
            user_message = terminal_payload.get("user_message")
            if isinstance(user_message, str) and user_message.strip():
                text_parts.append(user_message.strip())

    return AgenticResponseResult(
        text="".join(text_parts).strip(),
        terminal_tool=terminal_tool,
        terminal_event=terminal_event,
        terminal_payload=terminal_payload,
    )
