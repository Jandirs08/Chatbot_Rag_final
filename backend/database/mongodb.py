"""MongoDB client for chat history."""
from typing import List, Dict, Any, Optional, cast
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import logging

from config import Settings, settings as app_settings

logger = logging.getLogger(__name__)

class MongodbClient:
    """MongoDB client for chat history."""
    
    def __init__(self, settings: Settings = app_settings):
        """Initialize MongoDB client."""
        self.settings = settings
        try:
            self.client = AsyncIOMotorClient(settings.mongo_uri.get_secret_value())
            self.db = self.client[settings.mongo_database_name]
            self.messages = self.db.messages
            logger.info("Conexión a MongoDB establecida exitosamente.")
        except Exception as e:
            logger.error(f"Error conectando a MongoDB: {str(e)}")
            raise

    async def get_conversation_history(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get conversation history."""
        try:
            # Usar find().to_list() para obtener todos los documentos de una vez
            cursor = self.messages.find(
                {"conversation_id": conversation_id}
            ).sort("timestamp", 1)
            
            # Convertir el cursor a lista de manera asíncrona
            docs = await cursor.to_list(length=None)
            
            # Formatear los mensajes
            messages = []
            for doc in docs:
                messages.append({
                    "role": doc["role"],
                    "content": doc["content"]
                })
            return messages
        except Exception as e:
            logger.error(f"Error al obtener historial: {str(e)}")
            return []

    async def add_message(self, conversation_id: str, role: str, content: str) -> None:
        """Add a message to the conversation history."""
        try:
            await self.messages.insert_one({
                "conversation_id": conversation_id,
                "role": role,
                "content": content,
                "timestamp": datetime.now(timezone.utc)
            })
            logger.info(f"Mensaje agregado a la conversación {conversation_id}")
        except Exception as e:
            logger.error(f"Error al agregar mensaje: {str(e)}")

    async def ensure_indexes(self) -> None:
        """Ensure MongoDB indexes are created for optimal performance."""
        try:
            # Índice compuesto para conversation_id + timestamp (consultas de historial)
            await self.messages.create_index([
                ("conversation_id", 1),
                ("timestamp", 1)
            ], name="conversation_timeline")
            
            # Índice individual para timestamp (consultas por fecha)
            await self.messages.create_index([
                ("timestamp", 1)
            ], name="timestamp_idx")
            
            # Índice individual para role (análisis y filtros)
            await self.messages.create_index([
                ("role", 1)
            ], name="role_idx")
            
            logger.info("✅ Índices MongoDB aplicados correctamente")
            
        except Exception as e:
            logger.error(f"❌ Error aplicando índices MongoDB: {str(e)}")
            raise

    # Método de limpiar historial eliminado: no requerido por la aplicación
    
    async def format_history(self, conversation_id: str) -> str:
        """Format the chat history for use in prompts.
        
        Args:
            conversation_id: ID of the conversation.
            
        Returns:
            Formatted history string.
        """
        messages = await self.get_conversation_history(conversation_id)
        
        if not messages:
            return ""
        
        formatted_history = ""
        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            formatted_history += f"{role}: {content}\n\n"
        
        return formatted_history.strip()
    
    async def close(self) -> None:
        """Close the MongoDB connection."""
        try:
            self.client.close()
            logger.info("Conexión a MongoDB cerrada")
        except Exception as e:
            logger.error(f"Error cerrando conexión a MongoDB: {str(e)}")