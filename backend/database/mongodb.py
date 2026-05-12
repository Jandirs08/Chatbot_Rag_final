"""MongoDB client for chat history."""
import asyncio
import uuid
from typing import Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import logging
import threading

from config import settings as app_settings

logger = logging.getLogger(__name__)

# ============================================================
#   SINGLETON THREAD-SAFE PARA MULTI-WORKER
# ============================================================
# Nota: @lru_cache no es thread-safe para creación de singletons
# con estado en entornos multi-worker (uvicorn -w 4).
# Usamos un Lock explícito para garantizar una sola instancia.

_mongodb_client_instance: Optional["MongodbClient"] = None
_mongodb_client_lock = threading.Lock()


def get_mongodb_client() -> "MongodbClient":
    """
    Returns a thread-safe singleton instance of MongodbClient.
    Safe for use with multiple Uvicorn workers.
    """
    global _mongodb_client_instance
    
    # Fast path: si ya existe, retornar sin lock (double-checked locking)
    if _mongodb_client_instance is not None:
        return _mongodb_client_instance
    
    # Slow path: adquirir lock para crear instancia
    with _mongodb_client_lock:
        # Re-check después de adquirir el lock (otro thread pudo crearla)
        if _mongodb_client_instance is not None:
            return _mongodb_client_instance
        
        logger.debug("Creating new MongoDB client instance (singleton)...")
        try:
            _mongodb_client_instance = MongodbClient(
                mongo_uri=app_settings.mongo_uri.get_secret_value(),
                database_name=app_settings.mongo_database_name
            )
            logger.debug("MongoDB client singleton created successfully.")
            return _mongodb_client_instance
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
                waitQueueTimeoutMS=getattr(app_settings, "mongo_wait_queue_timeout_ms", 5000),
                uuidRepresentation="standard",
                tz_aware=True,
                tzinfo=timezone.utc,
            )
            self.db = self.client[database_name]
            self.messages = self.db.messages
            logger.debug(f"MongoDB connection to db '{database_name}' established successfully.")
        except Exception as e:
            logger.error(f"Error connecting to MongoDB: {str(e)}", exc_info=True)
            raise


    async def add_message(self, conversation_id: str, role: str, content: str, source: Optional[str] = None) -> str:
        """Add a message to the conversation history. Returns message_id."""
        message_id = str(uuid.uuid4())
        doc = {
            "message_id": message_id,
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "source": source or "embed-default",
            "timestamp": datetime.now(timezone.utc),
        }
        for attempt in range(1, 3):
            try:
                await self.messages.insert_one(doc)
                logger.debug(f"Mensaje agregado a la conversación {conversation_id}")
                return message_id
            except Exception as e:
                if attempt == 2:
                    logger.error(f"Error al agregar mensaje (attempt {attempt}): {str(e)}")
                    raise
                logger.warning(
                    "add_message attempt %d/2 failed for conv=%s: %s — retrying",
                    attempt, conversation_id, e,
                )
                await asyncio.sleep(0.5)
        return message_id

    async def ensure_indexes(self) -> None:
        """Ensure MongoDB indexes are created for optimal performance."""
        try:
            await self.messages.create_index(
                [("conversation_id", 1), ("timestamp", 1)],
                name="conversation_timeline",
            )
            await self.messages.create_index([("timestamp", 1)], name="timestamp_idx")
            await self.messages.create_index([("role", 1)], name="role_idx")
            await self.messages.create_index(
                "message_id", unique=True, sparse=True, name="message_id_unique"
            )
            
            logger.debug("Índices MongoDB aplicados correctamente")
            
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
            logger.debug("Índices de usuarios aplicados correctamente")
        except Exception as e:
            logger.error(f"❌ Error aplicando índices de usuarios: {str(e)}")
            # No relanzamos para no bloquear el arranque; se puede reintentar luego

    
    async def list_recent_conversations(
        self,
        limit: int = 50,
        skip: int = 0,
        search: str | None = None,
        start_date=None,
        end_date=None,
        hide_trivial: bool = False,
    ) -> dict:
        try:
            from re import escape as _re_escape

            # Pre-group: filter `messages` by timestamp so $sort+$group only see
            # docs in range. Cuts work AND lets index `timestamp_idx` participate.
            pre_match: dict = {}
            if start_date is not None or end_date is not None:
                date_range: dict = {}
                if start_date is not None:
                    date_range["$gte"] = start_date
                if end_date is not None:
                    date_range["$lte"] = end_date
                pre_match["timestamp"] = date_range

            # Post-group: filters that depend on aggregated fields.
            post_match: dict = {}
            if hide_trivial:
                post_match["total_messages"] = {"$gt": 2}
            if search:
                stripped = search.strip()
                # Length floor avoids 1-char regex full-collection scans.
                if len(stripped) >= 2:
                    pattern = _re_escape(stripped)
                    post_match["$or"] = [
                        {"_id": {"$regex": pattern, "$options": "i"}},
                        {"last_message": {"$regex": pattern, "$options": "i"}},
                    ]

            pipeline: list = []
            if pre_match:
                pipeline.append({"$match": pre_match})
            pipeline.extend([
                {"$sort": {"timestamp": -1, "_id": -1}},
                {
                    "$group": {
                        "_id": "$conversation_id",
                        "last_message": {"$first": "$content"},
                        "updated_at": {"$first": "$timestamp"},
                        "total_messages": {"$sum": 1},
                    }
                },
            ])
            if post_match:
                pipeline.append({"$match": post_match})
            pipeline.append(
                {
                    "$facet": {
                        "metadata": [{"$count": "total"}],
                        "data": [
                            {
                                "$project": {
                                    "_id": 0,
                                    "conversation_id": "$_id",
                                    "last_message": {"$ifNull": ["$last_message", ""]},
                                    "updated_at": 1,
                                    "total_messages": 1,
                                }
                            },
                            {"$sort": {"updated_at": -1, "conversation_id": -1}},
                            {"$skip": int(max(0, skip))},
                            {"$limit": int(max(1, limit))},
                        ],
                    }
                }
            )
            cursor = self.messages.aggregate(pipeline)
            result_list = await cursor.to_list(length=1)

            if not result_list:
                return {"items": [], "total": 0}

            result = result_list[0]
            items = result.get("data", [])
            metadata = result.get("metadata", [])
            total = metadata[0]["total"] if metadata else 0

            return {"items": items, "total": total}
        except Exception as e:
            logger.error(f"Error listando conversaciones recientes: {str(e)}", exc_info=True)
            return {"items": [], "total": 0}

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
