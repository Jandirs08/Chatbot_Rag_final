"""Chat manager for handling conversations with LLMs."""
from typing import Any, Dict, Optional, List
import os
import asyncio
from functools import partial
import logging
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from config import settings
from database.mongodb import MongodbClient
from common.constants import USER_ROLE, ASSISTANT_ROLE
from common.objects import Message as BotMessage
from rag.retrieval.retriever import RAGRetriever
from core.bot import Bot

logger = logging.getLogger(__name__)

class ChatManager:
    """Manager for chat interactions with LLMs."""
    
    def __init__(self,
                 bot_instance: Bot,
                 rag_retriever_instance: RAGRetriever):
        self.bot = bot_instance
        self.db = MongodbClient()
        self.rag_retriever = rag_retriever_instance

    async def generate_response(self,
                              input_text: str,
                              conversation_id: str):
        try:
            full_input_for_bot = input_text
            processed_by_rag = False

            # Heurística simple: no usar RAG para consultas muy cortas
            if self.rag_retriever and len(input_text.split()) >= 4:
                k_results = settings.max_documents
                
                logger.info(f"Recuperando contexto RAG para la consulta con k={k_results}")
                retrieved_docs = await self.rag_retriever.retrieve_documents(query=input_text, k=k_results)
                
                if retrieved_docs:
                    retrieved_context = self.rag_retriever.format_context_from_documents(retrieved_docs)
                    if retrieved_context == "No se encontró información relevante en los documentos consultados para esta pregunta.":
                        logger.info("Se formateó el contexto, pero indica que no se encontró información relevante.")
                    else:
                        full_input_for_bot = f"Contexto relevante proporcionado por RAG:\n{retrieved_context}\n\nConsulta del usuario: {input_text}"
                        logger.info("Contexto RAG añadido al input del bot.")
                        processed_by_rag = True # Marcar que RAG procesó y añadió contexto
                else:
                    logger.info("No se encontraron documentos RAG relevantes.")
            elif not self.rag_retriever:
                logger.warning("ChatManager no tiene una instancia de RAGRetriever configurada. La respuesta será sin RAG.")
            else:
                logger.info(f"Consulta '{input_text}' demasiado corta, saltando RAG.")
            
            user_message_for_bot = BotMessage(message=full_input_for_bot, role=settings.human_prefix)

            # Preparar el input para el bot
            bot_input = {
                "input": full_input_for_bot,
                "conversation_id": conversation_id
            }
            
            # Llamar al bot con el input correcto
            result = await self.bot(bot_input)
            ai_response_message = BotMessage(message=result["output"], role=settings.ai_prefix)
            
            response_content = ai_response_message.message

            await self.db.add_message(
                conversation_id=conversation_id,
                role=USER_ROLE,
                content=input_text
            )
            await self.db.add_message(
                conversation_id=conversation_id,
                role=ASSISTANT_ROLE,
                content=response_content
            )
            
            logger.info(f"Respuesta generada y guardada para conversación {conversation_id}")
            return response_content
            
        except Exception as e:
            logger.error(f"Error generando respuesta en ChatManager: {str(e)}", exc_info=True)
            return f"Lo siento, hubo un error al procesar tu solicitud: {str(e)}"

    async def clear_history(self, conversation_id: str) -> None:
        await self.db.clear_conversation_history(conversation_id)
        if hasattr(self.bot, 'reset_history'):
            self.bot.reset_history(conversation_id=conversation_id)
            logger.info(f"Memoria del Bot también limpiada para conversación {conversation_id}")
        logger.info(f"Historial de conversación {conversation_id} limpiado en la base de datos.")
    
    async def close(self) -> None:
        await self.db.close()
        logger.info("MongoDB client cerrado en ChatManager.")