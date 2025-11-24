"""Chat manager for handling conversations with LLMs."""
from typing import Any, Dict, List
import logging
from utils.logging_utils import get_logger
from cache.manager import cache
import hashlib
import asyncio

from config import settings
from database.mongodb import get_mongodb_client
from common.constants import USER_ROLE, ASSISTANT_ROLE
from common.objects import Message as BotMessage
from api.schemas import DebugInfo, RetrievedDocument
from core.bot import Bot

logger = get_logger(__name__)

class ChatManager:
    """Manager principal para la interacción con el Bot y almacenamiento en base de datos."""

    def __init__(self, bot_instance: Bot):
        self.bot = bot_instance
        self.db = get_mongodb_client()

        logger.warning(f"[MONGO] Cliente B (ChatManager): {id(self.db)}")

    async def generate_response(self, input_text: str, conversation_id: str, source: str | None = None, debug_mode: bool = False):
        """Genera la respuesta usando el Bot (LCEL maneja el RAG automáticamente)."""
        try:
            if getattr(settings, "enable_rag_lcel", False):
                logger.info("ENABLE_RAG_LCEL activo: contexto RAG será inyectado automáticamente.")
            else:
                logger.warning("ENABLE_RAG_LCEL desactivado: la recuperación contextual no se aplicará.")

            # Intentar obtener respuesta cacheada por (conversation_id + input_text)
            cache_key = f"resp:{conversation_id}:{hashlib.sha256((input_text or '').strip().encode('utf-8')).hexdigest()}"
            cached_response = None
            try:
                cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                logger.debug("Cache HIT respuesta LLM para conversación")
                response_content = cached_response
            else:
                logger.debug("Cache MISS respuesta LLM — generando con Bot")
                bot_input = {"input": input_text, "conversation_id": conversation_id}

                try:
                    result = await asyncio.wait_for(
                        self.bot(bot_input),
                        timeout=getattr(settings, "llm_timeout", 25)
                    )
                except asyncio.TimeoutError:
                    logger.error("Timeout al generar respuesta con el modelo LLM.")
                    return (
                        "Lo siento, la respuesta está tardando más de lo esperado. "
                        "Por favor, inténtalo nuevamente en unos segundos."
                    )

                ai_response_message = BotMessage(
                    message=result["output"],
                    role=settings.ai_prefix
                )
                response_content = ai_response_message.message

                # Guardar en cache
                try:
                    cache.set(cache_key, response_content, cache.ttl)
                except Exception:
                    pass

            if not debug_mode:
                await self.db.add_message(conversation_id, USER_ROLE, input_text, source)
                await self.db.add_message(conversation_id, ASSISTANT_ROLE, response_content, source)

            if debug_mode:
                try:
                    docs = getattr(self.bot, "_last_retrieved_docs", []) or []
                    items: List[RetrievedDocument] = []
                    for d in docs:
                        meta = getattr(d, "metadata", {}) or {}
                        items.append(
                            RetrievedDocument(
                                text=getattr(d, "page_content", "") or "",
                                source=meta.get("source"),
                                score=(meta.get("score") if isinstance(meta.get("score"), (int, float)) else None),
                            )
                        )
                    prompt_str = getattr(self.bot.chain_manager, "prompt_template_str", "") or ""
                    model_params = getattr(self.bot.chain_manager, "model_kwargs", {}) or {}
                    self._last_debug_info = DebugInfo(
                        retrieved_documents=items,
                        system_prompt_used=str(prompt_str),
                        model_params=dict(model_params),
                    )
                except Exception:
                    self._last_debug_info = DebugInfo(
                        retrieved_documents=[],
                        system_prompt_used="",
                        model_params={},
                    )
            logger.info(f"Respuesta generada{' y guardada' if not debug_mode else ''} para conversación {conversation_id}")
            return response_content

        except Exception as e:
            logger.error(f"Error generando respuesta en ChatManager: {e}", exc_info=True)
            return f"Lo siento, hubo un error al procesar tu solicitud: {str(e)}"

    async def close(self) -> None:
        """Cierra la conexión de MongoDB."""
        await self.db.close()
        logger.info("MongoDB client cerrado en ChatManager.")

    async def generate_streaming_response(self, input_text: str, conversation_id: str, source: str | None = None, debug_mode: bool = False):
        try:
            logger.info(f"[ChatManager] Streaming start conv={conversation_id}")
            if not debug_mode:
                await self.db.add_message(conversation_id, USER_ROLE, input_text, source)

            cache_key = f"resp:{conversation_id}:{hashlib.sha256((input_text or '').strip().encode('utf-8')).hexdigest()}"
            cached_response = None
            try:
                cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                final_text = cached_response
                yield final_text
                if not debug_mode:
                    await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                    await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                return

            bot_input = {"input": input_text, "conversation_id": conversation_id}
            stream = self.bot.astream_chunked(bot_input)

            final_text = ""
            try:
                first = await asyncio.wait_for(stream.__anext__(), timeout=getattr(settings, "llm_timeout", 25))
                final_text += first
                try:
                    logger.debug(f"[ChatManager] First chunk len={len(first)}")
                except Exception:
                    pass
                yield first
            except asyncio.TimeoutError:
                raise
            except StopAsyncIteration:
                if not debug_mode:
                    await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                    await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                try:
                    cache.set(cache_key, final_text, cache.ttl)
                except Exception:
                    pass
                return

            async for chunk in stream:
                final_text += chunk
                try:
                    logger.debug(f"[ChatManager] Chunk len={len(chunk)}")
                except Exception:
                    pass
                yield chunk

            if not debug_mode:
                await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)

            try:
                cache.set(cache_key, final_text, cache.ttl)
            except Exception:
                pass
            try:
                if debug_mode:
                    docs = getattr(self.bot, "_last_retrieved_docs", []) or []
                    items: List[RetrievedDocument] = []
                    for d in docs:
                        meta = getattr(d, "metadata", {}) or {}
                        items.append(
                            RetrievedDocument(
                                text=getattr(d, "page_content", "") or "",
                                source=meta.get("source"),
                                score=(meta.get("score") if isinstance(meta.get("score"), (int, float)) else None),
                            )
                        )
                    prompt_str = getattr(self.bot.chain_manager, "prompt_template_str", "") or ""
                    model_params = getattr(self.bot.chain_manager, "model_kwargs", {}) or {}
                    self._last_debug_info = DebugInfo(
                        retrieved_documents=items,
                        system_prompt_used=str(prompt_str),
                        model_params=dict(model_params),
                    )
                else:
                    self._last_debug_info = None
            except Exception:
                self._last_debug_info = DebugInfo(
                    retrieved_documents=[],
                    system_prompt_used="",
                    model_params={},
                )
            logger.info(f"[ChatManager] Streaming end conv={conversation_id} total_len={len(final_text)}")
        except Exception as e:
            logger.error(f"Error generando respuesta streaming en ChatManager: {e}", exc_info=True)
            raise
