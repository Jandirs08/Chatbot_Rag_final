"""ChatManager: orquesta Bot, persistencia, locks, caché y debug.

Lógica especializada vive en módulos vecinos:
- locks.py     → ConversationLockManager
- cache_key.py → build_response_cache_key
- verifier.py  → ResponseVerifier (fact-checker en debug)
- debug.py     → DebugInfoBuilder + log_stream_timing_summary
"""
from typing import Optional
import asyncio
import time

from fastapi import HTTPException

from utils.logging_utils import get_logger
from cache.manager import cache
from config import settings
from database.mongodb import get_mongodb_client
from common.constants import USER_ROLE, ASSISTANT_ROLE
from common.objects import Message as BotMessage
from core.bot import Bot
from core.request_context import new_request_context
from rag.retrieval.retriever import RetrievalBackendUnavailableError

from chat.cache_key import build_response_cache_key
from chat.debug import DebugInfoBuilder, log_stream_timing_summary
from chat.locks import ConversationLockManager
from chat.tool_dispatch import DispatchEvent, consume_stream
from chat.verifier import ResponseVerifier
from core.tools import ToolContext
from langchain_core.messages import AIMessage, ToolMessage

logger = get_logger(__name__)

# Cap on ReAct iterations per user turn. Each iteration is one model invocation.
# Continuation tools (e.g. search_documents) consume one slot each. After the
# cap we stop calling tools and force the model to answer with what it has.
MAX_TOOL_ITERS = 3

# Soft budget on the total characters across the message list before each
# additional tool round-trip. Approximates a token cap (≈4 chars/token →
# 240k chars ≈ 60k tokens) leaving comfortable headroom inside gpt-4o-mini's
# 128k context window for the model's response. Crossing it triggers the same
# forced-final path as MAX_TOOL_ITERS.
_MAX_TURN_CHARS = 240_000

# Defensive message surfaced when the cap-reached fallback stream also returns
# zero text (rate limit, empty completion). Without it the user would only see
# an `end` event and assume the bot froze.
_CAP_FALLBACK_MESSAGE = (
    "No pude completar tu consulta con la información disponible. "
    "¿Podrías reformular la pregunta o ser más específico?"
)


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


class ChatManager:
    """Manager principal para la interacción con el Bot y persistencia en Mongo."""

    def __init__(self, bot_instance: Bot):
        self.bot = bot_instance
        self.db = get_mongodb_client()
        self._locks = ConversationLockManager()
        self._debug_builder = DebugInfoBuilder(bot_instance)
        self._verifier = ResponseVerifier(bot_instance)

        logger.debug(f"[DB] ChatManager inicializado | client_id={id(self.db)}")

    def _build_response_cache_key(self, conversation_id: str, input_text: str) -> str:
        return build_response_cache_key(self.bot, conversation_id, input_text)

    async def _persist_messages_safely(
        self,
        conversation_id: str,
        input_text: str,
        response_content: str,
        source: str | None,
    ) -> None:
        try:
            await self.db.add_message(conversation_id, USER_ROLE, input_text, source)
            await self.db.add_message(conversation_id, ASSISTANT_ROLE, response_content, source)
        except Exception as exc:
            logger.error(
                "No se pudo persistir la conversación en Mongo para conv=%s: %s",
                conversation_id,
                exc,
                exc_info=True,
            )

    async def generate_response(
        self,
        input_text: str,
        conversation_id: str,
        source: str | None = None,
        debug_mode: bool = False,
    ):
        """Genera respuesta vía Bot. LCEL inyecta RAG automáticamente."""
        conversation_lock: Optional[object] = None
        lock_acquired = False
        try:
            conversation_lock, lock_acquired = await self._locks.acquire(conversation_id)
            if not lock_acquired:
                raise HTTPException(status_code=429, detail="Conversation busy, try again")
            req_ctx = new_request_context()
            if getattr(settings, "enable_rag_lcel", False):
                logger.info("ENABLE_RAG_LCEL activo: contexto RAG será inyectado automáticamente.")
            else:
                logger.warning("ENABLE_RAG_LCEL desactivado: la recuperación contextual no se aplicará.")

            cache_key = self._build_response_cache_key(conversation_id, input_text)
            cached_response = None
            try:
                if bool(getattr(settings, "enable_cache", True)):
                    cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                logger.debug("Cache HIT respuesta LLM para conversación")
                response_content = cached_response
                t_llm_start = None
                t_llm_end = None
                if debug_mode:
                    req_ctx.debug_info = await self._debug_builder.build(
                        conversation_id=conversation_id,
                        input_text=input_text,
                        final_text=response_content,
                        t_start=t_llm_start,
                        t_end=t_llm_end,
                        verification=None,
                        is_cached=True,
                    )
            else:
                logger.debug("Cache MISS respuesta LLM — generando con Bot")
                bot_input = {"input": input_text, "conversation_id": conversation_id}

                try:
                    t_llm_start = time.perf_counter()
                    result = await self.bot(bot_input)
                    t_llm_end = time.perf_counter()
                except asyncio.TimeoutError:
                    logger.error("Timeout al generar respuesta con el modelo LLM.")
                    return (
                        "Lo siento, la respuesta está tardando más de lo esperado. "
                        "Por favor, inténtalo nuevamente en unos segundos."
                    )

                ai_response_message = BotMessage(
                    message=result["output"],
                    role=settings.ai_prefix,
                )
                response_content = ai_response_message.message

                try:
                    if bool(getattr(settings, "enable_cache", True)):
                        cache.set(cache_key, response_content, cache.ttl)
                except Exception:
                    pass

            if not debug_mode:
                await self._persist_messages_safely(conversation_id, input_text, response_content, source)
                req_ctx.debug_info = None
            else:
                req_ctx.debug_info = await self._debug_builder.build(
                    conversation_id=conversation_id,
                    input_text=input_text,
                    final_text=response_content,
                    t_start=t_llm_start,
                    t_end=t_llm_end,
                    verification=None,
                    is_cached=False,
                )
            logger.info(
                f"Respuesta generada{' y guardada' if not debug_mode else ''} para conversación {conversation_id}"
            )
            return response_content

        except RetrievalBackendUnavailableError as e:
            logger.warning(f"Error de retrieval en ChatManager: {e}")
            return (
                "El servicio de búsqueda no está disponible en este momento. "
                "Por favor, inténtalo nuevamente en unos minutos."
            )
        except asyncio.TimeoutError:
            logger.warning("Timeout generando respuesta en ChatManager.")
            return (
                "La respuesta está tardando más de lo esperado. "
                "Por favor, inténtalo nuevamente en unos segundos."
            )
        except Exception as e:
            err_name = type(e).__name__
            err_str = str(e).lower()
            if "ratelimit" in err_name.lower() or "rate_limit" in err_str or "429" in err_str:
                logger.warning(f"Rate limit upstream en ChatManager: {e}")
                return (
                    "Estamos recibiendo mucho tráfico en este momento. "
                    "Reintenta en unos segundos."
                )
            if "apiconnection" in err_name.lower() or "apitimeout" in err_name.lower():
                logger.warning(f"Conectividad con proveedor LLM falló: {e}")
                return (
                    "No pudimos conectarnos al servicio de IA en este momento. "
                    "Por favor, inténtalo nuevamente en unos minutos."
                )
            logger.error(f"Error generando respuesta en ChatManager: {e}", exc_info=True)
            return "Hubo un problema procesando tu mensaje. Por favor, inténtalo nuevamente."
        finally:
            await self._locks.release(
                conversation_id,
                conversation_lock,
                acquired=lock_acquired,
            )

    async def stream_with_tools(
        self,
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
        try:
            conversation_lock, lock_acquired = await self._locks.acquire(conversation_id)
            if not lock_acquired:
                raise HTTPException(status_code=429, detail="Conversation busy, try again")
            new_request_context()

            prior_user_msgs = await _collect_prior_user_msgs(
                getattr(self.bot, "memory", None), conversation_id
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

            messages = await self.bot.aprepare_messages(bot_input)

            forced_final = False
            forced_final_reason: Optional[str] = None

            # Pre-loop budget check: if the rendered prompt + history is already
            # over budget on entry, skip the ReAct loop entirely and go straight
            # to the unbound final stream so we don't burn a tool round-trip we
            # already cannot afford.
            initial_chars = _messages_total_chars(messages)
            if initial_chars > _MAX_TURN_CHARS:
                forced_final = True
                forced_final_reason = (
                    f"budget_exceeded_pre_loop chars={initial_chars} cap={_MAX_TURN_CHARS}"
                )

            if not forced_final:
                for iteration in range(MAX_TOOL_ITERS):
                    raw_stream = self.bot.astream_messages(messages)
                    continuation: Optional[DispatchEvent] = None
                    stream_ended = False

                    async for event in consume_stream(raw_stream, ctx, min_chunk_chars=min_chars):
                        if event.kind == "text" and event.text:
                            text_accum += event.text
                            yield event
                        elif event.kind == "tool_terminal":
                            tool_fired = True
                            yield event
                        elif event.kind == "tool_continuation":
                            continuation = event
                            # Suppress "end" emission until we either iterate again
                            # or hit the cap. Caller doesn't need to see intermediate
                            # tool round-trips.
                        elif event.kind == "end":
                            if continuation is None:
                                stream_ended = True
                                yield event

                    if tool_fired or stream_ended:
                        break

                    if continuation is None:
                        # No tool call, no end event — stream closed unexpectedly.
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
                # Either the iteration cap was hit or the message budget was
                # exceeded mid-loop. Run one final stream against the unbound
                # model to force a text answer using the accumulated tool
                # results. Same fallback structure for both exit reasons.
                logger.warning(
                    "[ReAct] forcing text-only final conv=%s reason=%s",
                    conversation_id,
                    forced_final_reason,
                )
                final_stream = self.bot.astream_messages_no_tools(messages)
                fallback_iter_text = ""
                async for event in consume_stream(final_stream, ctx, min_chunk_chars=min_chars):
                    if event.kind == "text" and event.text:
                        fallback_iter_text += event.text
                        text_accum += event.text
                        yield event
                    elif event.kind == "end":
                        # Gate on `not text_accum` (not just `not fallback_iter_text`)
                        # so a hypothetical earlier-iteration text leak doesn't get
                        # double-counted with the defensive fallback.
                        if not fallback_iter_text and not text_accum:
                            # Both the bound loop and the unbound fallback
                            # produced zero text. Emit a defensive message so
                            # the user gets a real response.
                            logger.warning(
                                "[ReAct] dual-empty stream conv=%s — emitting fallback text",
                                conversation_id,
                            )
                            text_accum += _CAP_FALLBACK_MESSAGE
                            yield DispatchEvent(kind="text", text=_CAP_FALLBACK_MESSAGE)
                        yield event
                        # Defensive: a misbehaving stream that emits multiple
                        # `end` events must not re-trigger the fallback.
                        break

            if tool_fired:
                # Terminal tool replaces assistant turn; persist user message only.
                try:
                    await self.db.add_message(conversation_id, USER_ROLE, input_text, source)
                except Exception as exc:
                    logger.error(
                        "Could not persist user message on tool_terminal conv=%s: %s",
                        conversation_id, exc,
                    )
            elif text_accum:
                await self._persist_messages_safely(conversation_id, input_text, text_accum, source)
                await self.bot.add_to_memory(
                    human=input_text, ai=text_accum, conversation_id=conversation_id
                )
            else:
                # Cap reached or stream closed with no tool/text — persist the
                # user message so the turn is not silently dropped from Mongo.
                try:
                    await self.db.add_message(conversation_id, USER_ROLE, input_text, source)
                except Exception as exc:
                    logger.error(
                        "Could not persist user message on empty stream conv=%s: %s",
                        conversation_id, exc,
                    )
        except Exception as exc:
            logger.error("stream_with_tools failed conv=%s: %s", conversation_id, exc, exc_info=True)
            raise
        finally:
            await self._locks.release(
                conversation_id,
                conversation_lock,
                acquired=lock_acquired,
            )

    async def close(self) -> None:
        """Cierra la conexión de MongoDB."""
        await self.db.close()
        logger.info("MongoDB client cerrado en ChatManager.")

    async def generate_streaming_response(
        self,
        input_text: str,
        conversation_id: str,
        source: str | None = None,
        debug_mode: bool = False,
        enable_verification: bool = False,
    ):
        conversation_lock: Optional[object] = None
        lock_acquired = False
        try:
            conversation_lock, lock_acquired = await self._locks.acquire(conversation_id)
            if not lock_acquired:
                raise HTTPException(status_code=429, detail="Conversation busy, try again")
            logger.debug(f"[CHAT] Streaming start | conv={conversation_id}")
            req_ctx = new_request_context()
            stream_started_at = time.perf_counter()
            cache_key = self._build_response_cache_key(conversation_id, input_text)
            cached_response = None
            try:
                if bool(getattr(settings, "enable_cache", True)):
                    cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                final_text = cached_response
                req_ctx.set_stage_timing_ms(
                    "first_token_ms",
                    (time.perf_counter() - stream_started_at) * 1000,
                )
                yield final_text
                if not debug_mode:
                    await self._persist_messages_safely(conversation_id, input_text, final_text, source)
                    await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                    req_ctx.debug_info = None
                else:
                    req_ctx.debug_info = await self._debug_builder.build(
                        conversation_id=conversation_id,
                        input_text=input_text,
                        final_text=final_text,
                        t_start=None,
                        t_end=None,
                        verification=None,
                        is_cached=True,
                    )
                req_ctx.set_stage_timing_ms("llm_ms", 0.0)
                req_ctx.set_stage_timing_ms(
                    "stream_total_ms",
                    (time.perf_counter() - stream_started_at) * 1000,
                )
                log_stream_timing_summary(conversation_id, is_cached=True)
                return

            bot_input = {"input": input_text, "conversation_id": conversation_id}
            stream = self.bot.astream_chunked(bot_input)

            final_text = ""
            t_llm_start = time.perf_counter()
            first_chunk_sent = False
            try:
                async for chunk in stream:
                    if not first_chunk_sent:
                        first_chunk_sent = True
                        req_ctx.set_stage_timing_ms(
                            "first_token_ms",
                            (time.perf_counter() - stream_started_at) * 1000,
                        )
                    final_text += chunk
                    yield chunk
            except (asyncio.CancelledError, GeneratorExit):
                logger.info(
                    "[CHAT] Stream cancelado por cliente | conv=%s tokens_parciales=%d",
                    conversation_id, len(final_text),
                )
                if final_text and not debug_mode:
                    try:
                        await self._persist_messages_safely(conversation_id, input_text, final_text, source)
                        await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                    except Exception as persist_err:
                        logger.warning(
                            "No se pudo persistir respuesta parcial tras cancelación: %s", persist_err
                        )
                raise

            if not debug_mode:
                await self._persist_messages_safely(conversation_id, input_text, final_text, source)
                await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)

            try:
                if bool(getattr(settings, "enable_cache", True)):
                    cache.set(cache_key, final_text, cache.ttl)
            except Exception:
                pass
            if debug_mode:
                t_llm_end = time.perf_counter()
                req_ctx.set_stage_timing_ms("llm_ms", (t_llm_end - t_llm_start) * 1000)
                verification = None
                try:
                    if enable_verification:
                        ctx = req_ctx.context or ""
                        verification = await self._verifier.verify(input_text, ctx, final_text)
                except Exception:
                    verification = None
                req_ctx.debug_info = await self._debug_builder.build(
                    conversation_id=conversation_id,
                    input_text=input_text,
                    final_text=final_text,
                    t_start=t_llm_start,
                    t_end=t_llm_end,
                    verification=verification,
                    is_cached=False,
                )
            else:
                req_ctx.set_stage_timing_ms(
                    "llm_ms",
                    (time.perf_counter() - t_llm_start) * 1000,
                )
                req_ctx.debug_info = None
            req_ctx.set_stage_timing_ms(
                "stream_total_ms",
                (time.perf_counter() - stream_started_at) * 1000,
            )
            log_stream_timing_summary(conversation_id, is_cached=False)
            logger.debug(f"[CHAT] Streaming end | conv={conversation_id} len={len(final_text)}")
        except Exception as e:
            logger.error(f"Error generando respuesta streaming en ChatManager: {e}", exc_info=True)
            raise
        finally:
            await self._locks.release(
                conversation_id,
                conversation_lock,
                acquired=lock_acquired,
            )
