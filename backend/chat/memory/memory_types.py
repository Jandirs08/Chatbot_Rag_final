from enum import Enum
from .base_memory import BaseChatbotMemory


class MemoryTypes(str, Enum):
    BASE_MEMORY = "base-memory"


MEM_TO_CLASS = {
    "base-memory": BaseChatbotMemory
}
