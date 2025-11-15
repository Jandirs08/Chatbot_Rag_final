import asyncio
import logging
from typing import Optional, Dict, Union, List, Any
from operator import itemgetter
import time

from langchain.agents import AgentExecutor
from langchain_core.runnables import RunnableLambda, RunnableMap, Runnable
from langchain.agents.format_scratchpad import format_log_to_str
from langchain.agents.output_parsers import ReActSingleInputOutputParser
from langchain_core.agents import AgentFinish
from langchain_core.exceptions import OutputParserException

from memory import (
    MemoryTypes, 
    MEM_TO_CLASS, 
    AbstractChatbotMemory,
    BaseChatbotMemory,
    CustomMongoChatbotMemory
)
from models import ModelTypes
from common.objects import Message
from utils import CacheTypes, ChatbotCache
from utils.logging_utils import get_logger
from config import Settings, settings as app_settings
from .chain import ChainManager
from rag.retrieval.retriever import RAGRetriever


class FlexibleReActParser(ReActSingleInputOutputParser):
    """Parser más tolerante a errores de formato ReAct."""
    
    def parse(self, text: str):
        try:
            return super().parse(text)
        except OutputParserException:
            if "Final Answer:" in text:
                final_answer_start = text.find("Final Answer:")
                final_answer = text[final_answer_start + len("Final Answer:"):].strip()
                return AgentFinish(return_values={"output": final_answer}, log=text)
            return AgentFinish(return_values={"output": text.strip()}, log=text)


class Bot:
    """Agente principal con integración LCEL, memoria y recuperación contextual (RAG)."""

    def __init__(
        self,
        settings: Settings,
        memory_type: Optional[MemoryTypes] = None,
        memory_kwargs: Optional[dict] = None,
        cache: Optional[CacheTypes] = None,
        model_type: Optional[ModelTypes] = None,
        rag_retriever: Optional[RAGRetriever] = None
    ):
        self.settings = settings if settings is not None else app_settings
        self.logger = get_logger(self.__class__.__name__)

        # Cache
        has_redis_url = False
        if getattr(self.settings, "redis_url", None):
            try:
                raw_url = (
                    self.settings.redis_url.get_secret_value()
                    if hasattr(self.settings.redis_url, 'get_secret_value')
                    else str(self.settings.redis_url)
                )
                has_redis_url = bool(raw_url.strip())
            except Exception:
                has_redis_url = False

        default_cache_type = cache or (CacheTypes.RedisCache if has_redis_url else CacheTypes.InMemoryCache)
        self._cache = ChatbotCache.create(settings=self.settings, cache_type=default_cache_type)

        # Memoria
        self._memory: AbstractChatbotMemory = self.get_memory(memory_type, memory_kwargs)
        self.agent_executor: Optional[AgentExecutor] = None
        self.rag_retriever: Optional[RAGRetriever] = rag_retriever

        # Chain y tools
        self.tools = []
        self.chain_manager = ChainManager(settings=self.settings, model_type=model_type, tools_list=self.tools)

        self.start_agent()
        self.is_active = True

    @property
    def memory(self) -> AbstractChatbotMemory:
        return self._memory

    @property
    def cache(self) -> ChatbotCache:
        return self._cache

    def start_agent(self):
        """Inicializa el agente LCEL completo con memoria e inyección de contexto."""
        agent_runnable_core: Runnable = self.chain_manager.runnable_chain

        async def get_history_async(x):
            conversation_id = x.get("conversation_id", "default_session")
            history = await self.memory.get_history(conversation_id)
            return self._format_history_to_string(history)

        async def get_context_async(x):
            """Inyecta contexto RAG si está habilitado (LCEL activo)."""
            try:
                query = x.get("input", "")
                if not isinstance(query, str):
                    query = str(query)

                # Usar RAG siempre que el flag esté activo y exista retriever
                use_rag = (
                    bool(self.settings.enable_rag_lcel)
                    and self.rag_retriever is not None
                )
                if not use_rag:
                    return ""

                # Gating premium basado en similitud con centroide
                try:
                    if hasattr(self.rag_retriever, "should_use_rag"):
                        if not self.rag_retriever.should_use_rag(query):
                            self.logger.debug("RAG gating: similitud insuficiente, omitiendo recuperación")
                            return ""
                except Exception as g_err:
                    # Fallo seguro: continuar sin romper el flujo
                    self.logger.warning(f"RAG gating error: {g_err}")

                k = getattr(self.settings, "retrieval_k", 4)
                docs = await self.rag_retriever.retrieve_documents(query=query, k=k)
                if not docs:
                    return ""

                ctx = self.rag_retriever.format_context_from_documents(docs)
                try:
                    # Log detallado del contexto inyectado (truncado para evitar ruido)
                    preview = (ctx[:200] + "…") if isinstance(ctx, str) and len(ctx) > 200 else ctx
                    self.logger.debug(f"RAG LCEL contexto inyectado (len={len(ctx) if isinstance(ctx, str) else 'N/A'}): {preview}")
                except Exception:
                    pass
                return ctx or ""
            except Exception as e:
                self.logger.warning(f"RAG LCEL get_context_async falló: {e}")
                return ""

        def format_scratchpad(x):
            if "intermediate_steps" in x:
                return format_log_to_str(x["intermediate_steps"])
            return ""

        history_loader = RunnableMap({
            "input": itemgetter("input"),
            "history": RunnableLambda(get_history_async),
            "conversation_id": itemgetter("conversation_id"),
            "agent_scratchpad": RunnableLambda(format_scratchpad),
            "context": RunnableLambda(get_context_async),
        }).with_config(run_name="LoadHistoryAndPrepareAgentInput")

        runnable_for_agent = history_loader | agent_runnable_core

        self.agent_executor = AgentExecutor(
            agent=runnable_for_agent | FlexibleReActParser(),
            tools=self.tools,
            verbose=True,
            max_iterations=getattr(self.settings, 'agent_max_iterations', 3),
            return_intermediate_steps=True,
            handle_parsing_errors=True,
        )
        # Alinear herramientas visibles en el prompt con las registradas en el agente
        try:
            self.chain_manager.update_tools(self.tools)
        except Exception:
            pass

    def get_memory(
        self,
        memory_type: Optional[MemoryTypes] = None,
        parameters: Optional[dict] = None
    ) -> AbstractChatbotMemory:
        """Instancia la memoria configurada con fallback seguro."""
        parameters = parameters or {}
        memory_type_str = memory_type.value if memory_type else self.settings.memory_type

        if memory_type_str not in MEM_TO_CLASS:
            self.logger.warning(f"Tipo de memoria '{memory_type_str}' no válido. Usando base.")
            memory_type_str = MemoryTypes.BASE_MEMORY.value

        memory_class = MEM_TO_CLASS[memory_type_str]
        final_params = {**parameters, 'settings': self.settings}

        if memory_class == CustomMongoChatbotMemory:
            final_params.setdefault('conversation_id', 'default_bot_session')
            final_params.setdefault('k_history', getattr(self.settings, 'max_memory_entries', 10))

        try:
            return memory_class(**final_params)
        except Exception as e:
            self.logger.error(f"Error instanciando memoria {memory_class.__name__}: {e}", exc_info=True)
            return BaseChatbotMemory(
                settings=self.settings,
                session_id=final_params.get('conversation_id', 'default_fallback_session'),
                window_size=self.settings.max_memory_entries
            )

    async def __call__(self, x: Dict[str, Any]) -> Dict[str, Any]:
        """Llama al agente LCEL completo."""
        try:
            conversation_id = x.get("conversation_id", "default_session")
            agent_input = {
                "input": x["input"],
                "conversation_id": conversation_id,
            }

            result = await self.agent_executor.ainvoke(agent_input)

            if isinstance(result, dict):
                final_response = result.get("output") or result.get("answer") or str(result)
            else:
                final_response = str(result)

            await self.add_message_to_memory(x["input"], final_response, conversation_id)
            return {"output": final_response}

        except Exception as e:
            self.logger.error(f"Error en __call__: {e}", exc_info=True)
            raise

    async def add_message_to_memory(self, human_message: Union[Message, str], ai_message: Union[Message, str], conversation_id: str):
        """Agrega los mensajes al historial de memoria."""
        if isinstance(human_message, str):
            human_message = Message(message=human_message, role=self.settings.human_prefix)
        if isinstance(ai_message, str):
            ai_message = Message(message=ai_message, role=self.settings.ai_prefix)

        await self.memory.add_message(session_id=conversation_id, role="human", content=human_message.message)
        await self.memory.add_message(session_id=conversation_id, role="ai", content=ai_message.message)

    def _format_history_to_string(self, history: List[Dict[str, Any]]) -> str:
        """Formatea el historial para el prompt."""
        lines = []
        for msg in history:
            if msg["role"] == "system":
                lines.append(msg["content"])
            else:
                role = "Usuario" if msg["role"] == "human" else "Asistente"
                lines.append(f"{role}: {msg['content']}")
        return "\n".join(lines)
