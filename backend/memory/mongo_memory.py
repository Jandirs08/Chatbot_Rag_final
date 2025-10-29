import logging
from typing import Optional
from langchain_community.chat_message_histories.mongodb import MongoDBChatMessageHistory

from .base_memory import BaseChatbotMemory
from config import Settings, settings as app_settings

logger = logging.getLogger(__name__)


class MongoChatbotMemory(BaseChatbotMemory):
    def __init__(self, settings: Optional[Settings] = None, session_id: str = None, **kwargs):
        k_window = kwargs.pop('k', None)
        if k_window is None and hasattr(settings, 'memory_window_size'):
            k_window = settings.memory_window_size
        elif k_window is None:
            k_window = 5

        if not session_id:
            logger.warning("MongoChatbotMemory initialized without a specific session_id. "
                           "BaseChatbotMemory might use conversation_id as session_id for MongoDBChatMessageHistory instances.")

        super().__init__(
            settings=settings,
            chat_history_class=MongoDBChatMessageHistory,
            chat_history_kwargs={
                "connection_string": settings.mongo_uri if settings else app_settings.mongo_uri,
                "database_name": (settings.mongo_database_name 
                                  if hasattr(settings, 'mongo_database_name') and settings.mongo_database_name 
                                  else self._extract_db_name_from_uri(settings.mongo_uri if settings else app_settings.mongo_uri)),
                "collection_name": settings.collection_name if settings else app_settings.collection_name
            },
            session_id=session_id,
            k=k_window,
            **kwargs
        )

    def _extract_db_name_from_uri(self, mongo_uri: str) -> str:
        try:
            from pymongo import MongoClient
            client = MongoClient(mongo_uri)
            db_name = client.get_default_database().name
            client.close()
            if db_name:
                return db_name
            logger.warning(f"MongoDB URI '{mongo_uri}' does not specify a default database.")
            return "chat_history"
        except Exception as e:
            logger.error(f"Could not parse database name from MongoDB URI '{mongo_uri}'. Error: {e}. Using default 'chat_history'.")
            return "chat_history"
