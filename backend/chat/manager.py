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

            ctx = ToolContext(
                conversation_id=conversation_id,
                user_input=input_text,
                app_state=app_state,
            )
            bot_input = {"input": input_text, "conversation_id": conversation_id}
            raw_stream = self.bot.astream_raw(bot_input)
            min_chars = int(getattr(settings, "stream_min_chunk_chars", 32))
            async for event in consume_stream(raw_stream, ctx, min_chunk_chars=min_chars):
                if event.kind == "text" and event.text:
                    text_accum += event.text
                elif event.kind == "tool_terminal":
                    tool_fired = True
                yield event

            if tool_fired:
                # Tool replaces assistant turn; persist user message only.
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
