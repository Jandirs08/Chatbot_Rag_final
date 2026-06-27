from typing import Optional
import asyncio
import time

from fastapi import HTTPException

from utils.logging_utils import get_logger
from cache.manager import cache
from config import settings
from common.constants import USER_ROLE, ASSISTANT_ROLE
from common.objects import Message as BotMessage
from chat.turn_context import new_request_context
from rag.retrieval.retriever import RetrievalBackendUnavailableError

from chat.cache_key import build_response_cache_key
from chat.debug import DebugInfoBuilder, log_stream_timing_summary
from chat.locks import ConversationLockManager

logger = get_logger(__name__)


async def generate_response(
    bot,
    db,
    locks: ConversationLockManager,
    debug_builder: DebugInfoBuilder,
    input_text: str,
    conversation_id: str,
    source: str | None = None,
    debug_mode: bool = False,
):
    """Genera respuesta vía Bot. LCEL inyecta RAG automáticamente."""
    conversation_lock: Optional[object] = None
    lock_acquired = False
    req_ctx = None
    total_started_at = time.perf_counter()
    response_content: Optional[str] = None
    from_cache = False
    try:
        conversation_lock, lock_acquired = await locks.acquire(conversation_id)
        if not lock_acquired:
            raise HTTPException(status_code=429, detail="Conversation busy, try again")
        req_ctx = new_request_context()
        if getattr(settings, "enable_rag_lcel", False):
            logger.debug("ENABLE_RAG_LCEL activo: contexto RAG será inyectado automáticamente.")
        else:
            logger.debug("ENABLE_RAG_LCEL desactivado: la recuperación contextual no se aplicará.")

        cache_key = build_response_cache_key(bot, conversation_id, input_text)
        cached_response = None
        try:
            if bool(getattr(settings, "enable_cache", True)):
                cached_response = await cache.aget(cache_key)
        except Exception as e:
            logger.warning("Cache GET failed | key=%s | err=%s", cache_key, e)
            cached_response = None

        if cached_response is not None:
            logger.debug("Cache HIT respuesta LLM para conversación")
            response_content = cached_response
            from_cache = True
            t_llm_start = None
            t_llm_end = None
            if debug_mode:
                req_ctx.debug_info = await debug_builder.build(
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
                result = await bot(bot_input)
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
                    await cache.aset(cache_key, response_content, cache.ttl)
            except Exception as e:
                logger.warning("Cache SET failed | key=%s | err=%s", cache_key, e)

        if not debug_mode:
            try:
                await db.add_message(conversation_id, USER_ROLE, input_text, source)
                await db.add_message(conversation_id, ASSISTANT_ROLE, response_content, source)
            except Exception as exc:
                logger.error(
                    "No se pudo persistir la conversación en Mongo para conv=%s: %s",
                    conversation_id,
                    exc,
                    exc_info=True,
                )
            req_ctx.debug_info = None
        else:
            req_ctx.debug_info = await debug_builder.build(
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
            logger.warning("Rate limit upstream en ChatManager: %s", e, exc_info=True)
            return (
                "Estamos recibiendo mucho tráfico en este momento. "
                "Reintenta en unos segundos."
            )
        if "apiconnection" in err_name.lower() or "apitimeout" in err_name.lower():
            logger.warning("Conectividad con proveedor LLM falló: %s", e, exc_info=True)
            return (
                "No pudimos conectarnos al servicio de IA en este momento. "
                "Por favor, inténtalo nuevamente en unos minutos."
            )
        logger.error(f"Error generando respuesta en ChatManager: {e}", exc_info=True)
        return "Hubo un problema procesando tu mensaje. Por favor, inténtalo nuevamente."
    finally:
        if req_ctx is not None:
            try:
                from chat.debug import get_token_count
                from utils.metrics_collector import ChatSample, get_metrics_collector

                total_ms = (time.perf_counter() - total_started_at) * 1000
                rag_ms = (req_ctx.rag_time * 1000) if req_ctx.rag_time else None
                tokens_out_est = get_token_count(response_content) if response_content else 0
                sample = ChatSample(
                    ts=time.time(),
                    success=bool(response_content),
                    cached=from_cache,
                    used_rag=bool(req_ctx.rag_time and req_ctx.rag_time > 0),
                    total_ms=total_ms,
                    first_token_ms=None,
                    rag_ms=rag_ms,
                    llm_ms=max(0.0, total_ms - (rag_ms or 0.0)),
                    embedding_ms=req_ctx.stage_timings_ms.get("embedding_ms") if req_ctx.stage_timings_ms else None,
                    dense_ms=req_ctx.stage_timings_ms.get("dense_ms") if req_ctx.stage_timings_ms else None,
                    lexical_ms=req_ctx.stage_timings_ms.get("lexical_ms") if req_ctx.stage_timings_ms else None,
                    hydrate_ms=req_ctx.stage_timings_ms.get("hydrate_ms") if req_ctx.stage_timings_ms else None,
                    rerank_ms=req_ctx.stage_timings_ms.get("rerank_ms") if req_ctx.stage_timings_ms else None,
                    tool_calls=0,
                    tokens_in=0,
                    tokens_out=tokens_out_est,
                    gating_reason=req_ctx.gating_reason,
                )
                get_metrics_collector().record_chat(sample)
            except Exception as exc:
                logger.debug("metrics record failed (generate_response): %s", exc, exc_info=True)

            # Phantom-gap detection: eager RAG ran but the answer declared
            # data absence despite chunks being injected. Helper dedupes
            # against retrieval-side gating reasons.
            if response_content and req_ctx.rag_time:
                try:
                    from chat.grounding import maybe_log_phantom_gap
                    maybe_log_phantom_gap(
                        conversation_id=conversation_id,
                        user_query=input_text,
                        response_text=response_content,
                        req_ctx=req_ctx,
                    )
                except Exception as exc:
                    logger.debug("grounding check failed (non-fatal): %s", exc)
        await locks.release(
            conversation_id,
            conversation_lock,
            acquired=lock_acquired,
        )
