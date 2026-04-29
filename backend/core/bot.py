from typing import Optional, Dict, Any, AsyncGenerator, Sequence
import time
import asyncio
from operator import itemgetter

from langchain_core.runnables import RunnableLambda, RunnableMap, Runnable
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from memory import (
    AbstractChatbotMemory,
    BaseChatbotMemory
)
from memory.memory_types import MEM_TO_CLASS, MemoryTypes
from models import ModelTypes
from common.objects import Message
from utils import CacheTypes, ChatbotCache
from utils.logging_utils import get_logger
from config import Settings, settings as app_settings
from .chain import ChainManager
from .tools import ToolDefinition
from .request_context import get_request_context
from rag.retrieval import RAGRetriever, RetrievalBackendUnavailableError


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
        rag_retriever: Optional[RAGRetriever] = None,
        tools: Optional[Sequence[ToolDefinition]] = None,
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

        # Tools (agentic). Stored so reload_chain can re-bind them.
        self._tools: list[ToolDefinition] = list(tools) if tools else []

        # Chain (prompt + modelo, opcionalmente con tools vinculadas)
        self.chain_manager = ChainManager(
            settings=self.settings,
            model_type=model_type,
            tools=self._tools,
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
                tools=self._tools,
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

        Además expone `_message_pipeline` (todo lo previo al modelo) para que
        `aprepare_messages` pueda renderizar la lista de `BaseMessage` sin
        invocar al LLM — base del bucle ReAct cuando hay tools de continuation.
        """
        prompt_model_chain: Runnable = self.chain_manager.runnable_chain
        message_chain: Runnable = self.chain_manager.message_chain

        async def get_history_async(x):
            conversation_id = x.get("conversation_id")
            try:
                hist = await self.memory.get_history(conversation_id)
            except Exception as exc:
                self.logger.error(
                    "[HISTORY] Error cargando historial para conv=%s. Continuando sin historial: %s",
                    conversation_id,
                    exc,
                    exc_info=True,
                )
                hist = []

            formatted = self._format_history(hist)

            # Log conciso del historial cargado
            self.logger.debug(f"[HISTORY] Cargado | msgs={len(hist)} conv={x.get('conversation_id', 'unknown')}")

            return formatted


        async def get_context_async(x):
            """Inyecta contexto RAG y evita contexto vacío con un mensaje explícito."""
            req_ctx = get_request_context()
            fallback_ctx = "No hay información adicional recuperada para esta consulta."
            # Agentic RAG: el modelo decide cuándo invocar `search_documents`.
            # Saltamos la inyección eager para que la herramienta dirija el retrieval.
            if getattr(self.settings, "enable_agentic_rag", False):
                req_ctx.gating_reason = "agentic_rag_enabled"
                return fallback_ctx
            try:
                t_start = time.perf_counter()
                query = x.get("input", "")
                if not isinstance(query, str):
                    query = str(query)

                if not (self.settings.enable_rag_lcel and self.rag_retriever):
                    return fallback_ctx

                if not query.strip():
                    return fallback_ctx

                docs = await self.rag_retriever.retrieve_documents(
                    query=query,
                    k=self.settings.retrieval_k
                )
                
                req_ctx.gating_reason = getattr(self.rag_retriever, "_last_gating_reason", None)
                self.logger.debug(f"RAG gating (from retriever): reason={req_ctx.gating_reason}")
                
                if not docs:
                    req_ctx.rag_time = time.perf_counter() - t_start
                    return fallback_ctx

                req_ctx.retrieved_docs = docs
                ctx = self.rag_retriever.format_context_from_documents(docs)
                req_ctx.context = ctx if (isinstance(ctx, str) and ctx.strip()) else fallback_ctx
                req_ctx.rag_time = time.perf_counter() - t_start
                return req_ctx.context

            except RetrievalBackendUnavailableError:
                self.logger.warning("RAG backend unavailable; continuando sin contexto recuperado.")
                req_ctx.gating_reason = "retrieval_backend_unavailable"
                try:
                    req_ctx.rag_time = time.perf_counter() - t_start
                except Exception:
                    req_ctx.rag_time = None
                req_ctx.context = fallback_ctx
                return fallback_ctx
            except Exception as e:
                self.logger.warning(f"Context RAG failed: {e}")
                try:
                    req_ctx.rag_time = time.perf_counter() - t_start
                except Exception:
                    req_ctx.rag_time = None
                return fallback_ctx

        # LCEL pipeline
        loader = RunnableMap({
            "input": itemgetter("input"),
            "history": RunnableLambda(get_history_async),
            "context": RunnableLambda(get_context_async)
        })

        # Pre-modelo: produce ChatPromptValue (mensajes renderizados).
        self._message_pipeline = loader | message_chain
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
                window_size=self.settings.memory_window_size
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

    async def astream_raw(self, x: Dict[str, Any]) -> AsyncGenerator[Any, None]:
        """Yield raw model chunks (AIMessageChunk-like). Used by tool dispatcher."""
        if getattr(self.settings, "mock_mode", False):
            return
        conversation_id = x.get("conversation_id", "default_session")
        inp = {
            "input": x["input"],
            "conversation_id": conversation_id,
        }
        async for part in self.chain_manager.runnable_chain.astream(inp):
            yield part

    async def aprepare_messages(self, x: Dict[str, Any]) -> list:
        """Render the prompt to a `list[BaseMessage]` without invoking the model.

        Base for the ReAct loop: callers append `AIMessage(tool_calls=...)` +
        `ToolMessage(...)` and re-stream via `astream_messages`.
        """
        conversation_id = x.get("conversation_id", "default_session")
        inp = {
            "input": x["input"],
            "conversation_id": conversation_id,
        }
        prompt_value = await self._message_pipeline.ainvoke(inp)
        return prompt_value.to_messages()

    async def astream_messages(self, messages: list) -> AsyncGenerator[Any, None]:
        """Stream raw model chunks for an explicit message list (bypasses prompt)."""
        if getattr(self.settings, "mock_mode", False):
            return
        async for part in self.chain_manager.bound_model.astream(messages):
            yield part

    async def astream_messages_no_tools(self, messages: list) -> AsyncGenerator[Any, None]:
        """Stream against the unbound model so it cannot emit tool calls.

        Used by the ChatManager cap-reached path to force a final text answer
        with the accumulated tool results in `messages`.
        """
        if getattr(self.settings, "mock_mode", False):
            return
        async for part in self.chain_manager.raw_model.astream(messages):
            yield part

    async def astream_chunked(self, x: Dict[str, Any], min_chunk_chars: int = 128) -> AsyncGenerator[str, None]:
        if getattr(self.settings, "mock_mode", False):
            await asyncio.sleep(1.5)
            yield " [MOCK] Respuesta simulada para prueba de carga. Sistema operativo bajo estrés. "
            return

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

        try:
            await self.memory.add_message(
                session_id=conversation_id, role="human", content=human.message
            )
            await self.memory.add_message(
                session_id=conversation_id, role="ai", content=ai.message
            )
        except Exception as exc:
            self.logger.error(
                "No se pudo persistir la memoria conversacional para conv=%s: %s",
                conversation_id,
                exc,
                exc_info=True,
            )

    def _format_history_str(self, hist_list) -> str:
        """String version used by debug/classification — NOT for LangChain prompt."""
        lines = []
        for msg in hist_list:
            role = msg.get("role", "unknown")
            content = msg.get("content", "").strip()
            if not content:
                continue
            if role in ("human", "user"):
                lines.append(f"User: {content}")
            elif role in ("ai", "assistant"):
                lines.append(f"Assistant: {content}")
            elif role == "agent":
                lines.append(f"Assistant: [Agente]: {content}")
            elif role == "system":
                lines.append(f"System: {content}")
        return "\n".join(lines) if lines else ""

    def _format_history(self, hist_list) -> list:
        out = []
        for msg in hist_list:
            role = msg.get("role", "unknown")
            content = msg.get("content", "").strip()
            if not content:
                continue
            if role in ("human", "user"):
                out.append(HumanMessage(content=content))
            elif role in ("ai", "assistant"):
                out.append(AIMessage(content=content))
            elif role == "agent":
                out.append(AIMessage(content=f"[Agente]: {content}"))
            elif role == "system":
                out.append(SystemMessage(content=content))
        return out
