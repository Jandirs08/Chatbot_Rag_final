import json
from typing import List, Optional, Dict, Any
from pymongo import MongoClient, errors
import logging
import datetime
from datetime import timezone

from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, messages_from_dict as lc_messages_from_dict, messages_to_dict as lc_messages_to_dict
from langchain.memory.chat_memory import BaseChatMemory

from common.objects import MessageTurn # Se usará para la estructura en BD, pero no directamente para ChatMessageHistory
from config import Settings
from .base_memory import AbstractChatbotMemory, BaseChatbotMemory
from motor.motor_asyncio import AsyncIOMotorClient


class _CustomMongoPersistence:
    """Clase interna para manejar la lógica de persistencia directa con MongoDB."""
    def __init__(
            self,
            settings: Settings,
            # session_id aquí se refiere al ID de la conversación específica.
            conversation_id: str, 
            k: int
    ):
        self.settings = settings
        self.logger = logging.getLogger(self.__class__.__name__)
        self.connection_string = self.settings.mongo_uri.get_secret_value()
        self.conversation_id = conversation_id # ID de la conversación para esta instancia de persistencia
        self.k = k # Límite de mensajes a cargar

        try:
            temp_sync_client = MongoClient(self.connection_string)
            parsed_db_name = temp_sync_client.get_default_database().name
            self.database_name = parsed_db_name if parsed_db_name else getattr(self.settings, 'mongo_database_name', "chatbot_db")
            if not parsed_db_name:
                 self.logger.warning(f"MongoDB URI no especifica una BD. Usando: {self.database_name}")
            temp_sync_client.close()
        except Exception as e:
            self.logger.error(f"Error al parsear nombre de BD de URI MongoDB '{self.connection_string}': {e}. Usando default.")
            self.database_name = getattr(self.settings, 'mongo_database_name', "chatbot_db")
            
        self.collection_name = self.settings.mongo_collection_name

        try:
            self.client: AsyncIOMotorClient = AsyncIOMotorClient(self.connection_string)
        except Exception as error:
            self.logger.error(f"Fallo al configurar cliente AsyncIOMotorClient: {error}")
            raise

        self.database = self.client[self.database_name]
        self.collection = self.database[self.collection_name]

    async def create_indexes(self):
        """Crear índices para optimizar consultas."""
        try:
            await self.collection.create_index([("conversation_id", 1), ("timestamp", 1)])
            self.logger.info("Índices creados exitosamente")
        except Exception as e:
            self.logger.error(f"Error al crear índices: {e}")

    async def load_messages(self) -> List[Dict[str, Any]]:
        """Cargar mensajes desde MongoDB y convertirlos al formato de LangChain."""
        try:
            cursor = self.collection.find(
                {"conversation_id": self.conversation_id}
            ).sort("timestamp", 1).limit(self.k)
            
            documents = await cursor.to_list(length=None)
            
            # Convertir de MessageTurn a formato LangChain
            lc_messages = []
            for doc in documents:
                # Cada documento tiene la estructura de MessageTurn
                if 'user_message' in doc and doc['user_message']:
                    lc_messages.append({
                        'type': 'human',
                        'data': {'content': doc['user_message']}
                    })
                if 'bot_response' in doc and doc['bot_response']:
                    lc_messages.append({
                        'type': 'ai', 
                        'data': {'content': doc['bot_response']}
                    })
            
            return lc_messages
            
        except Exception as e:
            self.logger.error(f"Error al cargar mensajes: {e}")
            return []

    async def save_messages(self, messages: List[Dict[str, Any]]):
        """Guardar mensajes en MongoDB."""
        try:
            # Convertir mensajes de LangChain a formato MessageTurn
            if len(messages) >= 2:
                # Asumir que los mensajes vienen en pares (human, ai)
                for i in range(0, len(messages) - 1, 2):
                    if i + 1 < len(messages):
                        human_msg = messages[i]
                        ai_msg = messages[i + 1]
                        
                        message_turn = {
                            "conversation_id": self.conversation_id,
                            "user_message": human_msg['data']['content'],
                            "bot_response": ai_msg['data']['content'],
                            "timestamp": datetime.datetime.now(timezone.utc)
                        }
                        
                        await self.collection.insert_one(message_turn)
                        
        except Exception as e:
            self.logger.error(f"Error al guardar mensajes: {e}")

    async def clear_messages(self):
        """Limpiar todos los mensajes de la conversación."""
        try:
            await self.collection.delete_many({"conversation_id": self.conversation_id})
            self.logger.info(f"Mensajes limpiados para conversación: {self.conversation_id}")
        except Exception as e:
            self.logger.error(f"Error al limpiar mensajes: {e}")


class CustomMongoChatbotMemory(BaseChatMemory): # Hereda solo de BaseChatMemory
    settings: Settings
    conversation_id: str  # ID de la conversación actual
    k_history: int        # Número de mensajes a recordar
    memory_key: str       # Clave para el historial en el prompt. Default se puede poner aquí o en __init__
    input_key: Optional[str]
    output_key: Optional[str]
    return_messages: bool
    logger: Optional[Any] = None  # Añadir este campo
    
    def __init__(self, 
                 settings: Settings, 
                 conversation_id: str = "default_conversation",
                 k_history: int = 10, # MODIFICADO: k a k_history
                 memory_key: str = "history", 
                 input_key: Optional[str] = None,
                 output_key: Optional[str] = None,
                 return_messages: bool = False, 
                 **kwargs): # kwargs para campos de BaseChatMemory no listados explícitamente
        
        # Recopilar todos los argumentos para pasarlos a super().__init__()
        # Esto permite que Pydantic (BaseModel en BaseChatMemory) inicialice todos los campos.
        all_args = {
            "settings": settings,
            "conversation_id": conversation_id,
            "k_history": k_history,
            "memory_key": memory_key,
            "input_key": input_key,
            "output_key": output_key,
            "return_messages": return_messages,
            **kwargs  # Incluir cualquier otro argumento destinado a BaseChatMemory
        }
        super().__init__(**all_args) 
        
        # Inicialización de atributos que no son campos Pydantic o lógica post-inicialización
        self.logger = logging.getLogger(self.__class__.__name__)

        self._persistence = _CustomMongoPersistence(
            settings=self.settings, # self.settings ahora está poblado por Pydantic
            conversation_id=self.conversation_id, # self.conversation_id ahora está poblado
            k=self.k_history # self.k_history ahora está poblado
        )
        # self.chat_memory ya está inicializado por BaseChatMemory como ChatMessageHistory()

    @property
    def memory_variables(self) -> List[str]:
        return [self.memory_key]

    async def aload_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Carga los mensajes desde MongoDB, los pone en self.chat_memory y devuelve el historial formateado."""
        message_dicts = await self._persistence.load_messages()
        self.chat_memory.messages = lc_messages_from_dict(message_dicts) # Poblar ChatMessageHistory
        
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages}
        else:
            # Formatear como string
            return {self.memory_key: self.get_buffer_string()}

    def get_buffer_string(self) -> str:
        """Convierte los mensajes en self.chat_memory a string."""
        return "\n".join([f"{msg.type}: {msg.content}" for msg in self.chat_memory.messages])

    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Guarda el contexto (input del usuario y output del bot) en MongoDB."""
        # Extraer input y output
        input_str = inputs.get(self.input_key or list(inputs.keys())[0], "")
        output_str = outputs.get(self.output_key or list(outputs.keys())[0], "")
        
        # Añadir a self.chat_memory para mantener consistencia
        self.chat_memory.add_user_message(input_str)
        self.chat_memory.add_ai_message(output_str)
        
        # Guardar en MongoDB
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia la memoria tanto en self.chat_memory como en MongoDB."""
        self.chat_memory.clear()
        await self._persistence.clear_messages()

    async def add_message_custom(self, content: str, role: str = "human"):
        """Método personalizado para añadir un mensaje específico."""
        # Añadir a self.chat_memory
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            # Fallback: crear BaseMessage genérico
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

    # Métodos síncronos que lanzan NotImplementedError (como se esperaba en el análisis)
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError("Use aload_memory_variables para operaciones asíncronas")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Use asave_context para operaciones asíncronas")

    def clear(self) -> None:
        raise NotImplementedError("Use aclear para operaciones asíncronas")

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.
