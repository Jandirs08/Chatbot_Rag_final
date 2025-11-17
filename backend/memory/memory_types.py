from enum import Enum
from .mongo_memory import MongoChatbotMemory
from .base_memory import BaseChatbotMemory
from .custom_memory import CustomMongoChatbotMemory


class MemoryTypes(str, Enum):
    """Enumerator with the Memory types."""
    BASE_MEMORY = "base-memory"
    MONGO_MEMORY = "mongodb-memory"
    CUSTOM_MEMORY = "custom-memory"


MEM_TO_CLASS = {
    "mongodb-memory": MongoChatbotMemory,
    "base-memory": BaseChatbotMemory,  # Corregido: Ahora usa BaseChatbotMemory para el tipo base
    "custom-memory": CustomMongoChatbotMemory
}
