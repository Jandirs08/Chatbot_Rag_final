"""MongoDB client for chat history."""
from typing import Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import logging
from functools import lru_cache

from config import settings as app_settings

logger = logging.getLogger(__name__)

@lru_cache(maxsize=1)
def get_mongodb_client() -> "MongodbClient":
    """
    Returns a cached instance of the MongodbClient.
    If the instance doesn't exist, it creates one.
    """
    logger.info("Attempting to get MongoDB client instance.")
    
    # La información de la caché se puede consultar así:
    cache_info = get_mongodb_client.cache_info()
    logger.debug(f"Cache info for get_mongodb_client: {cache_info}")

    if cache_info.hits > 0:
        logger.info("Returning cached MongoDB client instance.")
    else:
        logger.info("No cached instance found, creating a new one.")

    try:
        client = MongodbClient(
            mongo_uri=app_settings.mongo_uri.get_secret_value(),
            database_name=app_settings.mongo_database_name
        )
        logger.debug("New MongodbClient instance created successfully.")
        return client
    except Exception as e:
        logger.error(f"Failed to create MongodbClient instance: {e}", exc_info=True)
        raise

class MongodbClient:
    """MongoDB client for chat history."""
    
    def __init__(self, mongo_uri: str, database_name: str):
        """Initialize MongoDB client."""
        self.mongo_uri = mongo_uri
        self.database_name = database_name
        try:
            self.client = AsyncIOMotorClient(
                mongo_uri,
                maxPoolSize=getattr(app_settings, "mongo_max_pool_size", 100),
                serverSelectionTimeoutMS=getattr(app_settings, "mongo_timeout_ms", 5000),
                uuidRepresentation="standard",
            )
            self.db = self.client[database_name]
            self.messages = self.db.messages
            logger.info(f"MongoDB connection to db '{database_name}' established successfully.")
        except Exception as e:
            logger.error(f"Error connecting to MongoDB: {str(e)}", exc_info=True)
            raise


    async def add_message(self, conversation_id: str, role: str, content: str, source: Optional[str] = None) -> None:
        """Add a message to the conversation history."""
        try:
            await self.messages.insert_one({
                "conversation_id": conversation_id,
                "role": role,
                "content": content,
                "source": source or "embed-default",
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

    async def ensure_user_indexes(self) -> None:
        """Ensure indexes for users collection (unique and commonly queried fields)."""
        try:
            users_collection = self.db["users"]
            # Índices únicos
            await users_collection.create_index("username", unique=True)
            await users_collection.create_index("email", unique=True)
            # Índice para consultas por estado
            await users_collection.create_index("is_active")
            logger.info("✅ Índices de usuarios aplicados correctamente")
        except Exception as e:
            logger.error(f"❌ Error aplicando índices de usuarios: {str(e)}")
            # No relanzamos para no bloquear el arranque; se puede reintentar luego

    
    async def list_recent_conversations(self, limit: int = 50, skip: int = 0) -> list:
        try:
            pipeline = [
                {"$sort": {"conversation_id": 1, "timestamp": -1}},
                {
                    "$group": {
                        "_id": "$conversation_id",
                        "last_message": {"$first": "$content"},
                        "updated_at": {"$first": "$timestamp"},
                        "total_messages": {"$sum": 1},
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "conversation_id": "$_id",
                        "last_message": {"$ifNull": ["$last_message", ""]},
                        "updated_at": 1,
                        "total_messages": 1,
                    }
                },
                {"$sort": {"updated_at": -1}},
                {"$skip": int(max(0, skip))},
                {"$limit": int(max(1, limit))},
            ]
            cursor = self.messages.aggregate(pipeline)
            results = await cursor.to_list(length=int(max(1, limit)))
            return results
        except Exception as e:
            logger.error(f"Error listando conversaciones recientes: {str(e)}", exc_info=True)
            return []

    async def clear_all_messages(self) -> int:
        """Elimina todos los documentos de la colección 'messages'.

        Returns:
            int: Número de documentos eliminados.
        """
        try:
            result = await self.messages.delete_many({})
            deleted = int(getattr(result, "deleted_count", 0))
            logger.warning(f"LIMPIEZA TOTAL DE HISTORIAL: eliminados {deleted} documentos de 'messages'.")
            return deleted
        except Exception as e:
            logger.error(f"Error al limpiar la colección 'messages': {str(e)}", exc_info=True)
            raise

    async def close(self) -> None:
        """Close the MongoDB connection."""
        try:
            if self.client:
                self.client.close()
                logger.info("MongoDB connection closed successfully.")
        except Exception as e:
            logger.error(f"Error closing MongoDB connection: {str(e)}", exc_info=True)
