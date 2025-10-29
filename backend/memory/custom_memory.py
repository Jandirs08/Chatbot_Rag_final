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

        self.db = self.client[self.database_name]
        self.collection = self.db[self.collection_name]
        # El campo SessionId en el documento de MongoDB podría ser el mismo que ConversationId
        # o un identificador de sesión de usuario más amplio.
        # Para esta implementación, asumiremos que el 'conversation_id' es el identificador principal.

    async def create_indexes(self):
        try:
            self.logger.info(f"Asegurando índices para la colección {self.collection_name}...")
            # Índice para buscar por ConversationId y ordenar por timestamp
            await self.collection.create_index([("ConversationId", 1), ("timestamp", -1)])
            self.logger.info("Índices asegurados.")
        except Exception as e:
            self.logger.error(f"Fallo al crear índice en (ConversationId, timestamp): {e}")

    async def load_messages(self) -> List[Dict[str, Any]]:
        """Carga los últimos k mensajes para la conversation_id actual y los devuelve como una lista de dicts."""
        if not self.conversation_id:
            self.logger.error("No se puede cargar: conversation_id no está configurado.")
            return []
        
        try:
            # Cargar los 'k' mensajes más recientes para la conversación
            cursor = self.collection.find(
                {"ConversationId": self.conversation_id} # Filtrar por el ID de la conversación
            ).sort("timestamp", -1).limit(self.k) # Ordenar por más reciente y aplicar límite
            
            # Los documentos almacenan un MessageTurn completo en 'History'. Necesitamos extraer los mensajes individuales.
            # O, mejor, almacenar mensajes individuales en MongoDB.
            # Por ahora, asumimos que 'History' contiene un dict que puede ser convertido a BaseMessage
            # Esto necesita una revisión de cómo se guardan los mensajes.
            # Idealmente, cada documento en MongoDB es un mensaje individual, no un MessageTurn.
            
            # Asumiendo que cada documento en la colección ES un mensaje individual con campos 'type' y 'content'
            # y un campo 'timestamp'.
            # Si 'History' en el documento es una lista de mensajes, la lógica cambiaría.
            # Si 'History' es un MessageTurn serializado, también.

            # Simplificación: Asumimos que cada documento es un mensaje serializado por lc_messages_to_dict
            raw_messages = await cursor.to_list(length=self.k)
            # Los mensajes se cargan en orden descendente de tiempo, así que los invertimos para orden cronológico
            return [doc["message_data"] for doc in reversed(raw_messages) if "message_data" in doc]

        except Exception as e:
            self.logger.error(f"Error cargando mensajes para conversation_id <{self.conversation_id}>: {e}")
            return []

    async def save_messages(self, messages: List[Dict[str, Any]]):
        """Guarda una lista de mensajes para la conversation_id actual.
           Reemplaza todos los mensajes existentes para esta conversación con la nueva lista."""
        if not self.conversation_id:
            self.logger.error("No se puede guardar: conversation_id no está configurado.")
            return

        try:
            # Eliminar mensajes antiguos para esta conversación
            self.logger.info(f"Eliminando mensajes antiguos para conversation_id <{self.conversation_id}> antes de guardar los nuevos.")
            await self.collection.delete_many({"ConversationId": self.conversation_id})

            if not messages:
                self.logger.info(f"No hay mensajes para guardar para conversation_id <{self.conversation_id}>.")
                return

            documents_to_insert = []
            for msg_dict in messages:
                documents_to_insert.append({
                    "ConversationId": self.conversation_id,
                    "message_data": msg_dict, # Guardar el dict del mensaje directamente
                    "timestamp": datetime.datetime.now(timezone.utc) # Podría tomarse del mensaje si existe
                })
            
            self.logger.info(f"Guardando {len(documents_to_insert)} mensajes para conversation_id <{self.conversation_id}>.")
            await self.collection.insert_many(documents_to_insert)
        except Exception as e:
            self.logger.error(f"Error guardando mensajes para conversation_id <{self.conversation_id}>: {e}")

    async def clear_messages(self):
        """Limpia todos los mensajes para la conversation_id actual."""
        if not self.conversation_id:
            self.logger.error("No se puede limpiar: conversation_id no está configurado.")
            return
        try:
            self.logger.info(f"Eliminando todos los mensajes para conversation_id <{self.conversation_id}>.")
            await self.collection.delete_many({"ConversationId": self.conversation_id})
        except Exception as e:
            self.logger.error(f"Error limpiando mensajes para conversation_id <{self.conversation_id}>: {e}")


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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.

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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.

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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.

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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.

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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.

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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.

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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
# Por ahora, _CustomMongoPersistence está integrada.

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
        
        # Ahora usamos la lógica de BaseChatMemory para obtener el buffer/string
        # o la lista de mensajes según self.return_messages
        if self.return_messages:
            return {self.memory_key: self.chat_memory.messages[-self.k_history:]} # Devolver últimos k mensajes
        else:
            # Obtener el buffer de string usando la lógica de la clase base (si es una subclase como ConversationBufferMemory)
            # o formatearlo manualmente si es necesario.
            # Para BaseChatMemory simple, podríamos necesitar formatear los mensajes a string aquí.
            # Por ahora, asumimos que el agente puede manejar una lista de BaseMessage si return_messages=True
            # o que el prompt espera una cadena formateada que debemos construir.
            # Si usamos ConversationChain, por ejemplo, espera una cadena.
            # Vamos a usar un método simple para convertir a string por ahora si return_messages es False.
            buffer_string = "\n".join(
                [f"{msg.type.capitalize()}: {msg.content}" for msg in self.chat_memory.messages[-self.k_history:]]
            )
            return {self.memory_key: buffer_string}


    async def asave_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Añade el input y output a self.chat_memory y luego persiste todos los mensajes a MongoDB."""
        # Usar la lógica de BaseChatMemory para añadir los mensajes a self.chat_memory
        # Esto requiere que input_key y output_key estén definidos si se usan.
        # O podemos añadir manualmente:
        # self.chat_memory.add_user_message(inputs[self.input_key or "input"])
        # self.chat_memory.add_ai_message(outputs[self.output_key or "output"])
        await super().asave_context(inputs, outputs) # Esto poblará self.chat_memory

        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def aclear(self) -> None:
        """Limpia self.chat_memory y los mensajes en MongoDB."""
        await super().aclear() # Limpia self.chat_memory
        await self._persistence.clear_messages()

    # --- Métodos síncronos (opcional, pero BaseChatMemory los tiene) ---
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # No recomendado para uso asíncrono, pero para completar la interfaz
        self.logger.warning("Llamada síncrona a load_memory_variables. Esta memoria es principalmente asíncrona.")
        # Debería implementar una carga síncrona si es necesario, o lanzar error.
        # Por ahora, lanzamos error para forzar el uso asíncrono.
        raise NotImplementedError("Usa aload_memory_variables en un contexto asíncrono.")

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        raise NotImplementedError("Usa asave_context en un contexto asíncrono.")

    def clear(self) -> None:
        raise NotImplementedError("Usa aclear en un contexto asíncrono.")

    # --- Métodos adicionales que tenías (adaptados o eliminados si son redundantes) ---
    async def add_message_custom(self, role: str, content: str) -> None:
        """Método personalizado para añadir un mensaje (si es necesario fuera del flujo de save_context)."""
        if role == "human":
            self.chat_memory.add_user_message(content)
        elif role == "ai":
            self.chat_memory.add_ai_message(content)
        else:
            self.chat_memory.add_message(BaseMessage(content=content, type=role)) # O un tipo más específico
        
        message_dicts_to_save = lc_messages_to_dict(self.chat_memory.messages)
        await self._persistence.save_messages(message_dicts_to_save)

    async def get_history_custom(self) -> List[BaseMessage]: # Devuelve lista de BaseMessage
        """Método personalizado para obtener el historial (si es necesario fuera de aload_memory_variables)."""
        # Recargar desde la persistencia para asegurar frescura, o usar self.chat_memory si se confía que está actualizada.
        message_dicts = await self._persistence.load_messages()
        return lc_messages_from_dict(message_dicts)

# La clase MongoMessageStore que tenías antes podría ser una alternativa o inspiración
# para _CustomMongoPersistence si se quiere una separación más formal.
#
