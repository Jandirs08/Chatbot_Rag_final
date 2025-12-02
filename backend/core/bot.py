from typing import Optional, Dict, Any, AsyncGenerator
import time
from operator import itemgetter

from langchain_core.runnables import RunnableLambda, RunnableMap, Runnable

from memory import (
    AbstractChatbotMemory,
    BaseChatbotMemory
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
        self._last_retrieved_docs = []
        self._last_context = ""
        self._last_rag_time = None
        self._last_gating_reason = None
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

            # 🔥 LOG: ver historia cruda tal cual viene de la memoria
            self.logger.debug(f"[DEBUG-HISTORY] Raw hist_list:\n{hist}")

            formatted = self._format_history(hist)

            # 🔥 LOG: ver cómo se formatea para insertarse en el prompt
            self.logger.debug(f"[DEBUG-HISTORY] Formatted history for prompt:\n{formatted}")

            return formatted


        async def get_context_async(x):
            """Inyecta contexto RAG y evita contexto vacío con un mensaje explícito."""
            # Reiniciar estado de debug para esta nueva ejecución
            self._last_retrieved_docs = []
            self._last_rag_time = None
            self._last_gating_reason = None
            self._last_context = ""
            fallback_ctx = "No hay información adicional recuperada para esta consulta."
            try:
                t_start = time.perf_counter()
                query = x.get("input", "")
                if not isinstance(query, str):
                    query = str(query)

                if not (self.settings.enable_rag_lcel and self.rag_retriever):
                    return fallback_ctx

                if not query.strip():
                    return fallback_ctx

                # Gating
                reason, use = self.rag_retriever.gating(query)
                self._last_gating_reason = reason
                self.logger.debug(f"RAG gating: reason={reason}")
                if not use:
                    return fallback_ctx

                docs = await self.rag_retriever.retrieve_documents(
                    query=query,
                    k=self.settings.retrieval_k
                )
                if not docs:
                    self._last_rag_time = time.perf_counter() - t_start
                    return fallback_ctx

                self._last_retrieved_docs = docs
                ctx = self.rag_retriever.format_context_from_documents(docs)
                # Evitar etiqueta <context> vacía
                self._last_context = ctx if (isinstance(ctx, str) and ctx.strip()) else fallback_ctx
                self._last_rag_time = time.perf_counter() - t_start
                return self._last_context

            except Exception as e:
                self.logger.warning(f"Context RAG failed: {e}")
                try:
                    self._last_rag_time = time.perf_counter() - t_start
                except Exception:
                    self._last_rag_time = None
                return fallback_ctx

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

    async def astream_chunked(self, x: Dict[str, Any], min_chunk_chars: int = 128) -> AsyncGenerator[str, None]:
        conversation_id = x.get("conversation_id", "default_session")
        inp = {
            "input": x["input"],
            "conversation_id": conversation_id,
        }

        buffer = ""

        def _extract_text(p: Any) -> str:
            c = getattr(p, "content", None)
            if isinstance(c, str):
                return c
            if isinstance(c, list):
                try:
                    parts = []
                    for item in c:
                        if isinstance(item, dict):
                            if item.get("type") == "text" and isinstance(item.get("text"), str):
                                parts.append(item.get("text") or "")
                        else:
                            t = getattr(item, "text", None)
                            tp = getattr(item, "type", None)
                            if tp == "text" and isinstance(t, str):
                                parts.append(t)
                    return "".join(parts)
                except Exception:
                    try:
                        return "".join(str(x) for x in c)
                    except Exception:
                        return ""
            t = getattr(p, "text", None)
            if isinstance(t, str):
                return t
            if isinstance(p, str):
                return p
            return ""

        async for part in self.chain_manager.runnable_chain.astream(inp):
            txt = _extract_text(part)
            if not txt:
                continue
            buffer += txt
            if len(buffer) >= min_chunk_chars:
                yield buffer
                buffer = ""
        if buffer:
            yield buffer

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
            role = msg.get("role", "unknown")
            content = msg.get("content", "").strip()
            if role in ("human", "user"):
                out.append(f"User: {content}")
            elif role in ("ai", "assistant"):
                out.append(f"Assistant: {content}")
            elif role == "system":
                out.append(f"System Info: {content}")
        if not out:
            return "No hay mensajes previos."
        return "\n".join(out)
