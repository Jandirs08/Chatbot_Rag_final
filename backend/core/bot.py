import asyncio
import logging
from queue import Queue
from typing import Optional, Dict, Union, List, Any
from operator import itemgetter
import time

from langchain.agents import AgentExecutor
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableLambda, RunnableMap, Runnable
from langchain.agents.format_scratchpad import format_log_to_str
from langchain.agents.output_parsers import ReActSingleInputOutputParser
# from langchain_core.tracers.context import wait_for_all_tracers # COMMENTED OUT

from memory import (
    MemoryTypes, 
    MEM_TO_CLASS, 
    AbstractChatbotMemory,
    BaseChatbotMemory,  # Asegurar que esta importación esté presente
    CustomMongoChatbotMemory
)
from models import ModelTypes
from common.objects import Message, MessageTurn
from common.constants import *
from .chain import ChainManager
from . import prompt as prompt_module
from utils import CacheTypes, ChatbotCache
from config import Settings, get_settings


class Bot:
    def __init__(
            self,
            settings: Settings,
            memory_type: Optional[MemoryTypes] = None,
            memory_kwargs: Optional[dict] = None,
            cache: Optional[CacheTypes] = None,
            model_type: Optional[ModelTypes] = None
    ):
        self.settings = settings if settings is not None else get_settings()
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # Initialize cache
        self._cache = ChatbotCache.create(
            settings=self.settings,
            cache_type=cache or CacheTypes.RedisCache
        )
        
        self._memory: AbstractChatbotMemory = self.get_memory(
            memory_type=memory_type,
            parameters=memory_kwargs
        )
        
        self.agent_executor: Optional[AgentExecutor] = None
        
        # Inicializar tools
        self.tools = []
        
        # Inicializar chain_manager
        self.chain_manager = ChainManager(
            settings=self.settings,
            model_type=model_type,
            tools_list=self.tools
        )
        
        self.start_agent()
        self.is_active = True  # Por defecto el bot está activo

    @property
    def memory(self) -> AbstractChatbotMemory:
        return self._memory

    @property
    def cache(self) -> ChatbotCache:
        return self._cache

    def start_agent(self):
        agent_runnable_core: Runnable = self.chain_manager.runnable_chain

        async def get_history_async(x):
            # Asegurarnos de que conversation_id esté disponible
            conversation_id = x.get("conversation_id", "default_session")
            history = await self.memory.get_history(conversation_id)
            return self._format_history_to_string(history)

        def format_scratchpad(x):
            # Formatear el scratchpad para el agente
            if "intermediate_steps" in x:
                return format_log_to_str(x["intermediate_steps"])
            return ""

        history_loader = RunnableMap({
            "input": itemgetter("input"),
            "history": RunnableLambda(get_history_async),
            "conversation_id": itemgetter("conversation_id"),
            "agent_scratchpad": RunnableLambda(format_scratchpad)
        }).with_config(run_name="LoadHistoryAndPrepareAgentInput")

        agent_chain_with_history = history_loader | agent_runnable_core

        runnable_for_agent = agent_chain_with_history

        self.agent_executor = AgentExecutor(
            agent=runnable_for_agent | ReActSingleInputOutputParser(),
            tools=self.tools,
            verbose=True,
            max_iterations=self.settings.agent_max_iterations if hasattr(self.settings, 'agent_max_iterations') else 3,
            return_intermediate_steps=True,
            handle_parsing_errors=True
        )

    # En el método get_memory, asegurar que el fallback use BaseChatbotMemory
    def get_memory(
            self,
            memory_type: Optional[MemoryTypes] = None,
            parameters: Optional[dict] = None
    ) -> AbstractChatbotMemory:
        parameters = parameters or {}
        # memory_type_str se determina a partir de memory_type o self.settings.memory_type
        memory_type_str = memory_type.value if memory_type else self.settings.memory_type
        
        # Validar memory_type_str y obtener la clase de memoria
        if memory_type_str not in MEM_TO_CLASS:
            self.logger.warning(f"Tipo de memoria '{memory_type_str}' no válido. Usando '{MemoryTypes.BASE_MEMORY.value}'.")
            memory_type_str = MemoryTypes.BASE_MEMORY.value # Usar el valor del Enum
            
        memory_class = MEM_TO_CLASS[memory_type_str]
        
        # Solución al AttributeError:
        # La línea original era:
        # memory_config = self.settings.memory_configurations.get(memory_type_str, {})
        # Esto causaba un error porque 'self.settings' no tiene un atributo 'memory_configurations'.
        # Asumimos que las configuraciones específicas de la memoria deben pasarse a través del argumento 'parameters'.
        # Si se necesitaran configuraciones predeterminadas globales desde 'settings' para cada tipo de memoria,
        # el atributo 'memory_configurations' (como un diccionario) debería definirse primero en la clase Settings en config.py.
        memory_config_from_settings = {} 

        # Los 'parameters' (provenientes de memory_kwargs en Bot.__init__) tienen prioridad.
        final_params = {**memory_config_from_settings, **parameters}
        
        # Asegurar que 'settings' esté en los parámetros para la clase de memoria
        if 'settings' not in final_params:
            final_params['settings'] = self.settings
        
        # Configuración específica y valores predeterminados para CustomMongoChatbotMemory
        if memory_class == CustomMongoChatbotMemory:
            if 'conversation_id' not in final_params:
                self.logger.debug(f"CustomMongoChatbotMemory: 'conversation_id' no encontrado en final_params. Usando 'default_bot_session'. Claves actuales: {list(final_params.keys())}")
                final_params['conversation_id'] = 'default_bot_session' 
            
            if 'k_history' not in final_params:
                default_k_history = getattr(self.settings, 'max_memory_entries', 10) 
                self.logger.debug(f"CustomMongoChatbotMemory: 'k_history' no encontrado en final_params. Usando default: {default_k_history}. Claves actuales: {list(final_params.keys())}")
                final_params['k_history'] = default_k_history

        try:
            self.logger.debug(f"Instanciando memoria {memory_class.__name__} con las claves de parámetros: {list(final_params.keys())}")
            return memory_class(**final_params)
        except Exception as e:
            self.logger.error(f"Error al instanciar la memoria {memory_class.__name__} con params {final_params}: {e}", exc_info=True)
            self.logger.warning(f"Fallback a BaseChatbotMemory debido a error de instanciación. Params originales pasados a get_memory: {parameters}")
            
            base_fallback_params = {
                'settings': self.settings,
                'session_id': final_params.get('conversation_id', 'default_fallback_session'),
                'window_size': self.settings.max_memory_entries 
            }
            if parameters: 
                base_fallback_params.update({k: v for k, v in parameters.items() if k not in ['settings', 'session_id', 'window_size']})

            return BaseChatbotMemory(**base_fallback_params)  # Usar BaseChatbotMemory consistentemente

    async def get_response(self, session_id: str, query: str, **kwargs) -> Message:
        base_kwargs = self.chain_manager._base_model.dict()
        
        valid_llm_kwargs = ["model_name", "temperature", "max_tokens", "top_p", "top_k", "model_kwargs", "max_output_tokens"]
        
        filtered_base_kwargs = {k: v for k, v in base_kwargs.items() if k in valid_llm_kwargs}
        if "model_kwargs" in filtered_base_kwargs and isinstance(filtered_base_kwargs["model_kwargs"], dict):
            filtered_base_kwargs.update(filtered_base_kwargs.pop("model_kwargs"))

        llm_provider = getattr(self.chain_manager._base_model, "_llm_type", "").lower()
        if "vertex" in llm_provider and "max_tokens" in filtered_base_kwargs:
            filtered_base_kwargs["max_output_tokens"] = filtered_base_kwargs.pop("max_tokens")
            
        return {
            **filtered_base_kwargs, 
            "streaming": True,
        }

    def reset_history(self, conversation_id: str):
        self.memory.clear(conversation_id=conversation_id)

    def clear_cache(self):
        """Limpia el caché del bot."""
        if hasattr(self, '_cache'):
            self._cache.clear_cache()
            self.logger.info("Caché limpiado exitosamente")
        else:
            self.logger.warning("No se encontró caché para limpiar")

    async def add_message_to_memory(
            self,
            human_message: Union[Message, str],
            ai_message: Union[Message, str],
            conversation_id: str
    ):
        if isinstance(human_message, str):
            human_message = Message(message=human_message, role=self.settings.human_prefix)
        if isinstance(ai_message, str):
            ai_message = Message(message=ai_message, role=self.settings.ai_prefix)

        # Añadir mensaje del usuario
        await self.memory.add_message(
            session_id=conversation_id,
            role="human",
            content=human_message.message
        )
        
        # Añadir respuesta del bot
        await self.memory.add_message(
            session_id=conversation_id,
            role="ai",
            content=ai_message.message
        )

    async def __call__(self, x: Dict[str, Any]) -> Dict[str, Any]:
        """Maneja la llamada al bot con el contexto y el historial."""
        try:
            # Asegurarnos de que conversation_id esté presente
            conversation_id = x.get("conversation_id", "default_session")
            
            # Obtener el historial y formatearlo
            history = await self.memory.get_history(conversation_id)
            history_str = self._format_history_to_string(history)
            
            # Preparar el input para el agente
            agent_input = {
                "input": x["input"],
                "history": history_str,
                "context": history_str,  # Añadir el historial como contexto
                "conversation_id": conversation_id  # Asegurarnos de que conversation_id esté presente
            }
            
            # Ejecutar el agente
            result = await self.agent_executor.ainvoke(agent_input)
            
            # Extraer la respuesta final del resultado
            if isinstance(result, dict):
                if "output" in result:
                    final_response = result["output"]
                elif "answer" in result:
                    final_response = result["answer"]
                else:
                    final_response = str(result)
            else:
                final_response = str(result)
            
            # Añadir mensajes a la memoria
            await self.add_message_to_memory(
                human_message=x["input"],
                ai_message=final_response,
                conversation_id=conversation_id
            )
            
            return {"output": final_response}
            
        except Exception as e:
            self.logger.error(f"Error en __call__: {str(e)}", exc_info=True)
            raise

    async def predict(self, sentence: str, conversation_id: str = None) -> Message:
        """Predice una respuesta para una entrada dada.
        
        Args:
            sentence: Texto de entrada
            conversation_id: ID de la conversación
            
        Returns:
            Mensaje con la respuesta
        """
        start_time = time.time()
        try:
            # Preparar el input para el agente
            agent_input = {
                "input": sentence,
                "conversation_id": conversation_id or "default_session"
            }
            
            # Ejecutar el agente de forma asíncrona
            result = await self.agent_executor.ainvoke(agent_input)
            
            # Calcular tiempo de respuesta
            response_time = time.time() - start_time
            
            # Registrar hit en el caché
            if hasattr(self, '_cache'):
                self._cache.metrics.record_hit(response_time)
            
            # Extraer la respuesta final
            if isinstance(result, dict):
                if "output" in result:
                    return Message(message=result["output"], role=self.settings.ai_prefix)
                elif "response" in result:
                    return Message(message=result["response"], role=self.settings.ai_prefix)
            
            return Message(message=str(result), role=self.settings.ai_prefix)
            
        except Exception as e:
            # Calcular tiempo de respuesta
            response_time = time.time() - start_time
            
            # Registrar miss en el caché
            if hasattr(self, '_cache'):
                self._cache.metrics.record_miss(response_time)
            
            self.logger.error(f"Error en predict: {e}", exc_info=True)
            return Message(
                message="Lo siento, ha ocurrido un error al procesar tu solicitud.",
                role=self.settings.ai_prefix
            )

    def call(self, input_data: dict) -> Message:
        sentence = input_data.get("input") or input_data.get("sentence")
        if not sentence:
            raise ValueError("El diccionario de entrada debe contener la clave 'input' o 'sentence'.")
        conversation_id = input_data.get("conversation_id")
        return self.predict(sentence=sentence, conversation_id=conversation_id)

    def _format_history_to_string(self, history: List[Dict[str, Any]]) -> str:
        """Formatea el historial de mensajes a una cadena de texto."""
        formatted_history = []
        
        for msg in history:
            if msg["role"] == "system":
                # El mensaje del sistema contiene el contexto
                formatted_history.append(msg["content"])
            else:
                # Formatear mensajes normales
                role = "Usuario" if msg["role"] == "human" else "Asistente"
                formatted_history.append(f"{role}: {msg['content']}")
        
        return "\n".join(formatted_history)
