"""Chat manager for handling conversations with LLMs."""
from typing import Any, Dict
import logging
from utils.logging_utils import get_logger
from cache.manager import cache
import hashlib

from config import settings
from database.mongodb import get_mongodb_client
from common.constants import USER_ROLE, ASSISTANT_ROLE
from common.objects import Message as BotMessage
from core.bot import Bot

logger = get_logger(__name__)

class ChatManager:
    """Manager principal para la interacción con el Bot y almacenamiento en base de datos."""

    def __init__(self, bot_instance: Bot):
        self.bot = bot_instance
        self.db = get_mongodb_client()

        logger.warning(f"[MONGO] Cliente B (ChatManager): {id(self.db)}")

    async def generate_response(self, input_text: str, conversation_id: str, source: str | None = None):
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
                result = await self.bot(bot_input)
                ai_response_message = BotMessage(message=result["output"], role=settings.ai_prefix)
                response_content = ai_response_message.message
                # Guardar en cache
                try:
                    cache.set(cache_key, response_content, cache.ttl)
                except Exception:
                    pass

            # Guardar ambos mensajes en MongoDB
            await self.db.add_message(conversation_id, USER_ROLE, input_text, source)
            await self.db.add_message(conversation_id, ASSISTANT_ROLE, response_content, source)

            logger.info(f"Respuesta generada y guardada para conversación {conversation_id}")
            return response_content

        except Exception as e:
            logger.error(f"Error generando respuesta en ChatManager: {e}", exc_info=True)
            return f"Lo siento, hubo un error al procesar tu solicitud: {str(e)}"

    async def close(self) -> None:
        """Cierra la conexión de MongoDB."""
        await self.db.close()
        logger.info("MongoDB client cerrado en ChatManager.")
