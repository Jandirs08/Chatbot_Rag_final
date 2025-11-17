from typing import Optional, Dict, Any
from operator import itemgetter

from langchain_core.runnables import RunnableLambda, RunnableMap, Runnable

from memory import (
    AbstractChatbotMemory,
    CustomMongoChatbotMemory
)
from memory.memory_types import MEM_TO_CLASS, MemoryTypes
from memory.base_memory import BaseChatbotMemory
from models import ModelTypes
from common.objects import Message
from utils import CacheTypes, ChatbotCache
from utils.logging_utils import get_logger
from config import Settings, settings as app_settings
from .chain import ChainManager
from rag.retrieval.retriever import RAGRetriever


class Bot:
    """
    Pipeline LCEL limpio:
    input → memory → history → context (RAG) → prompt → modelo.
    """

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
        self.is_active = True


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

        default_cache_type = cache or (
            CacheTypes.RedisCache if has_redis_url else CacheTypes.InMemoryCache
        )
        self._cache = ChatbotCache.create(
            settings=self.settings, cache_type=default_cache_type
        )

        # Memoria
        self._memory: AbstractChatbotMemory = self.get_memory(
            memory_type, memory_kwargs
        )

        # RAG
        self.rag_retriever: Optional[RAGRetriever] = rag_retriever

        # Chain (prompt + modelo)
        self.chain_manager = ChainManager(
            settings=self.settings,
            model_type=model_type
        )

        # Compone pipeline LCEL completo
        self._build_pipeline()

    def reload_chain(self, new_settings: Optional[Settings] = None):
        """Recarga la chain del bot aplicando nuevos settings.

        Reinstancia el ChainManager con la configuración actualizada y
        reconstruye el pipeline LCEL completo (history/context → prompt → modelo).
        """
        try:
            # Actualizar settings si se proveen
            if new_settings is not None:
                self.settings = new_settings

            # Reinstanciar ChainManager con los nuevos settings
            self.chain_manager = ChainManager(
                settings=self.settings,
                model_type=None,
            )

            # Reconstruir el pipeline completo
            self._build_pipeline()
            self.logger.info("Chain del bot recargada correctamente con nuevos settings.")
        except Exception as e:
            # No levantar excepción para no romper la petición; logueamos el error.
            self.logger.error(f"Error recargando chain del bot: {e}")

    @property
    def memory(self):
        return self._memory

    @property
    def cache(self):
        return self._cache

    def _build_pipeline(self):
        """
        Construye el pipeline LCEL completo:
        {input, history, context} → prompt → modelo.
        """
        prompt_model_chain: Runnable = self.chain_manager.runnable_chain

        async def get_history_async(x):
            conversation_id = x.get("conversation_id")
            hist = await self.memory.get_history(conversation_id)
            return self._format_history(hist)

        async def get_context_async(x):
            """Inyecta contexto RAG SOLO si está habilitado."""
            try:
                query = x.get("input", "")
                if not isinstance(query, str):
                    query = str(query)

                if not (self.settings.enable_rag_lcel and self.rag_retriever):
                    return ""

                # Gating
                if hasattr(self.rag_retriever, "should_use_rag"):
                    if not self.rag_retriever.should_use_rag(query):
                        self.logger.debug("RAG gating: similitud baja → no usar RAG")
                        return ""

                docs = await self.rag_retriever.retrieve_documents(
                    query=query,
                    k=self.settings.retrieval_k
                )
                if not docs:
                    return ""

                ctx = self.rag_retriever.format_context_from_documents(docs)
                return ctx or ""

            except Exception as e:
                self.logger.warning(f"Context RAG failed: {e}")
                return ""

        # LCEL pipeline
        loader = RunnableMap({
            "input": itemgetter("input"),
            "history": RunnableLambda(get_history_async),
            "context": RunnableLambda(get_context_async)
        })

        pipeline = loader | prompt_model_chain

        # Reemplaza la chain interna con el pipeline final
        self.chain_manager.override_chain(pipeline)

    def get_memory(self, memory_type, params):
        params = params or {}
        mem_type = memory_type.value if memory_type else self.settings.memory_type

        if mem_type not in MEM_TO_CLASS:
            mem_type = MemoryTypes.BASE_MEMORY.value

        mem_cls = MEM_TO_CLASS[mem_type]
        final_params = {**params, "settings": self.settings}

        if mem_cls == CustomMongoChatbotMemory:
            final_params.setdefault("conversation_id", "default_session")
            final_params.setdefault(
                "k_history", getattr(self.settings, "max_memory_entries", 10)
            )

        try:
            return mem_cls(**final_params)
        except Exception:
            return BaseChatbotMemory(
                settings=self.settings,
                session_id="fallback_session",
                window_size=self.settings.max_memory_entries
            )

    async def __call__(self, x: Dict[str, Any]):
        """
        Ejecuta pipeline LCEL limpio.
        """
        conversation_id = x.get("conversation_id", "default_session")

        inp = {
            "input": x["input"],
            "conversation_id": conversation_id,
        }

        result = await self.chain_manager.runnable_chain.ainvoke(inp)

        # Unifica output
        if hasattr(result, "content"):
            final_text = result.content
        elif isinstance(result, str):
            final_text = result
        else:
            final_text = str(result)

        await self.add_to_memory(
            human=x["input"],
            ai=final_text,
            conversation_id=conversation_id
        )

        return {"output": final_text}

    async def add_to_memory(self, human, ai, conversation_id):
        if isinstance(human, str):
            human = Message(message=human, role=self.settings.human_prefix)
        if isinstance(ai, str):
            ai = Message(message=ai, role=self.settings.ai_prefix)

        await self.memory.add_message(
            session_id=conversation_id, role="human", content=human.message
        )
        await self.memory.add_message(
            session_id=conversation_id, role="ai", content=ai.message
        )

    def _format_history(self, hist_list):
        out = []
        for msg in hist_list:
            if msg["role"] == "human":
                out.append(f"Usuario: {msg['content']}")
            elif msg["role"] == "ai":
                out.append(f"Asistente: {msg['content']}")
        return "\n".join(out)
