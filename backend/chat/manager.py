"""Chat manager for handling conversations with LLMs."""
from typing import Any, Dict, List
import logging
from utils.logging_utils import get_logger
import time
from cache.manager import cache
import hashlib
import asyncio

from config import settings
from database.mongodb import get_mongodb_client
from common.constants import USER_ROLE, ASSISTANT_ROLE
from common.objects import Message as BotMessage
from api.schemas import DebugInfo, RetrievedDocument
from core.bot import Bot

logger = get_logger(__name__)

class ChatManager:
    """Manager principal para la interacción con el Bot y almacenamiento en base de datos."""

    def __init__(self, bot_instance: Bot):
        self.bot = bot_instance
        self.db = get_mongodb_client()

        logger.warning(f"[MONGO] Cliente B (ChatManager): {id(self.db)}")

    async def generate_response(self, input_text: str, conversation_id: str, source: str | None = None, debug_mode: bool = False):
        """Genera la respuesta usando el Bot (LCEL maneja el RAG automáticamente)."""
        try:
            if getattr(settings, "enable_rag_lcel", False):
                logger.info("ENABLE_RAG_LCEL activo: contexto RAG será inyectado automáticamente.")
            else:
                logger.warning("ENABLE_RAG_LCEL desactivado: la recuperación contextual no se aplicará.")

            # Intentar obtener respuesta cacheada por (conversation_id + input_text)
            cache_key = f"resp:{conversation_id}:{hashlib.sha256((input_text or '').strip().encode('utf-8')).hexdigest()}"
            cached_response = None
            try:
                cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                logger.debug("Cache HIT respuesta LLM para conversación")
                response_content = cached_response
            else:
                logger.debug("Cache MISS respuesta LLM — generando con Bot")
                bot_input = {"input": input_text, "conversation_id": conversation_id}

                try:
                    t_llm_start = time.perf_counter()
                    result = await asyncio.wait_for(
                        self.bot(bot_input),
                        timeout=getattr(settings, "llm_timeout", 25)
                    )
                    t_llm_end = time.perf_counter()
                except asyncio.TimeoutError:
                    logger.error("Timeout al generar respuesta con el modelo LLM.")
                    return (
                        "Lo siento, la respuesta está tardando más de lo esperado. "
                        "Por favor, inténtalo nuevamente en unos segundos."
                    )

                ai_response_message = BotMessage(
                    message=result["output"],
                    role=settings.ai_prefix
                )
                response_content = ai_response_message.message

                # Guardar en cache
                try:
                    cache.set(cache_key, response_content, cache.ttl)
                except Exception:
                    pass

            if not debug_mode:
                await self.db.add_message(conversation_id, USER_ROLE, input_text, source)
                await self.db.add_message(conversation_id, ASSISTANT_ROLE, response_content, source)

            if debug_mode:
                try:
                    docs = getattr(self.bot, "_last_retrieved_docs", []) or []
                    items: List[RetrievedDocument] = []
                    for d in docs:
                        meta = getattr(d, "metadata", {}) or {}
                        items.append(
                            RetrievedDocument(
                                text=getattr(d, "page_content", "") or "",
                                source=meta.get("source"),
                                score=(meta.get("score") if isinstance(meta.get("score"), (int, float)) else None),
                                file_path=meta.get("file_path"),
                                page_number=(int(meta.get("page_number")) if isinstance(meta.get("page_number"), (int, float)) else None),
                            )
                        )
                    prompt_str = getattr(self.bot.chain_manager, "prompt_template_str", "") or ""
                    model_params = getattr(self.bot.chain_manager, "model_kwargs", {}) or {}
                    hist = await self.bot.memory.get_history(conversation_id)
                    formatted_hist = self.bot._format_history(hist)
                    ctx = getattr(self.bot, "_last_context", "") or ""
                    try:
                        pv = getattr(self.bot.chain_manager, "prompt_vars", {}) or {}
                        nombre = pv.get("nombre")
                        personality = pv.get("bot_personality")
                        hydrated = str(prompt_str).format(
                            nombre=str(nombre or ""),
                            bot_personality=str(personality or ""),
                            context=str(ctx or ""),
                            history=str(formatted_hist or ""),
                            input=str(input_text or ""),
                        )
                    except Exception as _e:
                        hydrated = str(prompt_str)
                    def _estimate_tokens(text: str) -> int:
                        try:
                            import tiktoken
                            enc = tiktoken.get_encoding("cl100k_base")
                            return int(len(enc.encode(text or "")))
                        except Exception:
                            return int(max(0, (len(text or "") // 4)))
                    input_tokens = (
                        _estimate_tokens(str(prompt_str))
                        + _estimate_tokens(str(formatted_hist))
                        + _estimate_tokens(str(ctx))
                        + _estimate_tokens(str(input_text))
                    )
                    output_tokens = _estimate_tokens(str(response_content))
                    rag_time = getattr(self.bot, "_last_rag_time", None)
                    llm_time = None
                    try:
                        llm_time = float(t_llm_end - t_llm_start)
                    except Exception:
                        llm_time = None
                    self._last_debug_info = DebugInfo(
                        retrieved_documents=items,
                        system_prompt_used=str(hydrated),
                        model_params=dict(model_params),
                        rag_time=rag_time,
                        llm_time=llm_time,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )
                except Exception:
                    self._last_debug_info = DebugInfo(
                        retrieved_documents=[],
                        system_prompt_used="",
                        model_params={},
                    )
            logger.info(f"Respuesta generada{' y guardada' if not debug_mode else ''} para conversación {conversation_id}")
            return response_content

        except Exception as e:
            logger.error(f"Error generando respuesta en ChatManager: {e}", exc_info=True)
            return f"Lo siento, hubo un error al procesar tu solicitud: {str(e)}"

    async def close(self) -> None:
        """Cierra la conexión de MongoDB."""
        await self.db.close()
        logger.info("MongoDB client cerrado en ChatManager.")

    async def _verify_response(self, query, context, response) -> dict:
        try:
            llm = getattr(self.bot.chain_manager, "_model", None)
            if llm is None:
                return {"is_grounded": False, "reason": "Modelo no disponible"}
            prompt = (
                "Evalúa si la RESPUESTA se basa ÚNICAMENTE en el CONTEXTO. "
                "Responde JSON: { 'is_grounded': bool, 'reason': str }\n\n"
                f"CONSULTA:\n{str(query)}\n\n"
                f"CONTEXTO:\n{str(context)}\n\n"
                f"RESPUESTA:\n{str(response)}\n"
            )
            res = await llm.ainvoke(prompt)
            txt = getattr(res, "content", None)
            if not isinstance(txt, str):
                txt = str(res)
            import json
            try:
                obj = json.loads(txt)
                isg = bool(obj.get("is_grounded"))
                rsn = str(obj.get("reason") or "")
                return {"is_grounded": isg, "reason": rsn}
            except Exception:
                cleaned = txt.strip().strip("`")
                low = cleaned.lower()
                grounded = ("true" in low) and ("false" not in low)
                return {"is_grounded": grounded, "reason": cleaned[:400]}
        except Exception:
            return {"is_grounded": False, "reason": "Error verificando respuesta"}

    async def generate_streaming_response(self, input_text: str, conversation_id: str, source: str | None = None, debug_mode: bool = False, enable_verification: bool = False):
        try:
            logger.info(f"[ChatManager] Streaming start conv={conversation_id}")
            if not debug_mode:
                await self.db.add_message(conversation_id, USER_ROLE, input_text, source)

            cache_key = f"resp:{conversation_id}:{hashlib.sha256((input_text or '').strip().encode('utf-8')).hexdigest()}"
            cached_response = None
            try:
                cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                final_text = cached_response
                yield final_text
                if not debug_mode:
                    await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                    await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                return

            bot_input = {"input": input_text, "conversation_id": conversation_id}
            stream = self.bot.astream_chunked(bot_input)

            final_text = ""
            try:
                t_llm_start = time.perf_counter()
                first = await asyncio.wait_for(stream.__anext__(), timeout=getattr(settings, "llm_timeout", 25))
                final_text += first
                try:
                    logger.debug(f"[ChatManager] First chunk len={len(first)}")
                except Exception:
                    pass
                yield first
            except asyncio.TimeoutError:
                raise
            except StopAsyncIteration:
                if not debug_mode:
                    await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                    await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                try:
                    cache.set(cache_key, final_text, cache.ttl)
                except Exception:
                    pass
                return

            async for chunk in stream:
                final_text += chunk
                try:
                    logger.debug(f"[ChatManager] Chunk len={len(chunk)}")
                except Exception:
                    pass
                yield chunk

            if not debug_mode:
                await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)

            try:
                cache.set(cache_key, final_text, cache.ttl)
            except Exception:
                pass
            try:
                if debug_mode:
                    docs = getattr(self.bot, "_last_retrieved_docs", []) or []
                    items: List[RetrievedDocument] = []
                    for d in docs:
                        meta = getattr(d, "metadata", {}) or {}
                        items.append(
                            RetrievedDocument(
                                text=getattr(d, "page_content", "") or "",
                                source=meta.get("source"),
                                score=(meta.get("score") if isinstance(meta.get("score"), (int, float)) else None),
                                file_path=meta.get("file_path"),
                                page_number=(int(meta.get("page_number")) if isinstance(meta.get("page_number"), (int, float)) else None),
                            )
                        )
                    prompt_str = getattr(self.bot.chain_manager, "prompt_template_str", "") or ""
                    model_params = getattr(self.bot.chain_manager, "model_kwargs", {}) or {}
                    hist = await self.bot.memory.get_history(conversation_id)
                    formatted_hist = self.bot._format_history(hist)
                    ctx = getattr(self.bot, "_last_context", "") or ""
                    try:
                        pv = getattr(self.bot.chain_manager, "prompt_vars", {}) or {}
                        nombre = pv.get("nombre")
                        personality = pv.get("bot_personality")
                        hydrated = str(prompt_str).format(
                            nombre=str(nombre or ""),
                            bot_personality=str(personality or ""),
                            context=str(ctx or ""),
                            history=str(formatted_hist or ""),
                            input=str(input_text or ""),
                        )
                    except Exception as _e:
                        hydrated = str(prompt_str)
                    def _estimate_tokens(text: str) -> int:
                        try:
                            import tiktoken
                            enc = tiktoken.get_encoding("cl100k_base")
                            return int(len(enc.encode(text or "")))
                        except Exception:
                            return int(max(0, (len(text or "") // 4)))
                    input_tokens = (
                        _estimate_tokens(str(prompt_str))
                        + _estimate_tokens(str(formatted_hist))
                        + _estimate_tokens(str(ctx))
                        + _estimate_tokens(str(input_text))
                    )
                    output_tokens = _estimate_tokens(str(final_text))
                    rag_time = getattr(self.bot, "_last_rag_time", None)
                    t_llm_end = time.perf_counter()
                    llm_time = float(t_llm_end - t_llm_start)
                    verification = None
                    try:
                        if enable_verification:
                            verification = await self._verify_response(input_text, ctx, final_text)
                    except Exception:
                        verification = None
                    self._last_debug_info = DebugInfo(
                        retrieved_documents=items,
                        system_prompt_used=str(hydrated),
                        model_params=dict(model_params),
                        rag_time=rag_time,
                        llm_time=llm_time,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        verification=verification,
                    )
                else:
                    self._last_debug_info = None
            except Exception:
                self._last_debug_info = DebugInfo(
                    retrieved_documents=[],
                    system_prompt_used="",
                    model_params={},
                )
            logger.info(f"[ChatManager] Streaming end conv={conversation_id} total_len={len(final_text)}")
        except Exception as e:
            logger.error(f"Error generando respuesta streaming en ChatManager: {e}", exc_info=True)
            raise
