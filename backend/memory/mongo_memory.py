import logging
from typing import Optional
from langchain_community.chat_message_histories.mongodb import MongoDBChatMessageHistory

from .base_memory import BaseChatbotMemory
from config import settings as app_settings
from database.mongodb import get_mongodb_client

logger = logging.getLogger(__name__)


class MongoChatbotMemory(BaseChatbotMemory):
    def __init__(self, session_id: str = None, **kwargs):
        k_window = kwargs.pop('k', app_settings.memory_window_size)

        if not session_id:
            logger.warning("MongoChatbotMemory initialized without a specific session_id. "
                           "BaseChatbotMemory might use conversation_id as session_id for MongoDBChatMessageHistory instances.")

        super().__init__(
            settings=app_settings,
            chat_history_class=MongoDBChatMessageHistory,
            chat_history_kwargs={
                "connection_string": app_settings.mongo_uri,
                "database_name": app_settings.mongo_database_name,
                "collection_name": app_settings.collection_name
            },
            session_id=session_id,
            k=k_window,
            **kwargs
        )
