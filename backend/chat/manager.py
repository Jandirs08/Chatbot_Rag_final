"""ChatManager: orquesta Bot, persistencia, locks, caché y debug.

Lógica especializada vive en módulos vecinos:
- locks.py     → ConversationLockManager
- cache_key.py → build_response_cache_key
- verifier.py  → ResponseVerifier (fact-checker en debug)
- debug.py     → DebugInfoBuilder + log_stream_timing_summary
- handlers/non_streaming.py → generate_response logic
- handlers/agentic.py       → stream_with_tools + generate_agentic_response
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

from chat.handlers.agentic import (
    AgenticResponseResult,
    MAX_TOOL_ITERS,
    _REACT_STREAM_IDLE_TIMEOUT,
    _MAX_TURN_CHARS,
    _CAP_FALLBACK_MESSAGE,
    stream_with_tools as _stream_with_tools,
    generate_agentic_response as _generate_agentic_response,
)
from chat.handlers.non_streaming import generate_response as _generate_response

logger = get_logger(__name__)


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
        return await _generate_response(
            bot=self.bot,
            db=self.db,
            locks=self._locks,
            debug_builder=self._debug_builder,
            input_text=input_text,
            conversation_id=conversation_id,
            source=source,
            debug_mode=debug_mode,
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
        async for event in _stream_with_tools(
            bot=self.bot,
            db=self.db,
            locks=self._locks,
            input_text=input_text,
            conversation_id=conversation_id,
            source=source,
            app_state=app_state,
        ):
            yield event

    async def generate_agentic_response(
        self,
        input_text: str,
        conversation_id: str,
        source: str | None = None,
        app_state=None,
    ) -> AgenticResponseResult:
        """Non-streaming adapter for channels that cannot consume SSE.

        Reuses `stream_with_tools` so Web and WhatsApp share the same agentic
        ReAct loop, persistence, metrics, tool handlers, and safety caps.
        """
        return await _generate_agentic_response(
            bot=self.bot,
            db=self.db,
            locks=self._locks,
            input_text=input_text,
            conversation_id=conversation_id,
            source=source,
            app_state=app_state,
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
                    cached_response = await cache.aget(cache_key)
            except Exception as exc:
                logger.warning("Cache get failed for conv=%s: %s", conversation_id, exc)
                cached_response = None

            if cached_response is not None:
                final_text = cached_response
                req_ctx.set_stage_timing_ms(
                    "first_token_ms",
                    (time.perf_counter() - stream_started_at) * 1000,
                )
                yield final_text
                if not debug_mode:
                    await asyncio.gather(
                        self._persist_messages_safely(conversation_id, input_text, final_text, source),
                        self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id),
                    )
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
                await asyncio.gather(
                    self._persist_messages_safely(conversation_id, input_text, final_text, source),
                    self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id),
                )

            try:
                if bool(getattr(settings, "enable_cache", True)):
                    await cache.aset(cache_key, final_text, cache.ttl)
            except Exception as exc:
                logger.warning("Cache set failed for conv=%s: %s", conversation_id, exc)
            if debug_mode:
                t_llm_end = time.perf_counter()
                req_ctx.set_stage_timing_ms("llm_ms", (t_llm_end - t_llm_start) * 1000)
                verification = None
                try:
                    if enable_verification:
                        ctx = req_ctx.context or ""
                        verification = await self._verifier.verify(input_text, ctx, final_text)
                except Exception as exc:
                    logger.warning("Verification failed for conv=%s: %s", conversation_id, exc, exc_info=True)
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
