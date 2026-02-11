"""Chat manager for handling conversations with LLMs."""
import json
import re
from typing import Any, Dict, List, Optional
from utils.logging_utils import get_logger
import time
from cache.manager import cache
from utils.hashing import hash_for_cache_key
import asyncio

from config import settings
from database.mongodb import get_mongodb_client
from common.constants import USER_ROLE, ASSISTANT_ROLE
from common.objects import Message as BotMessage
from api.schemas import DebugInfo, RetrievedDocument
from core.bot import Bot
from core.request_context import new_request_context, get_request_context
from models.model_types import ModelTypes, MODEL_TO_CLASS

logger = get_logger(__name__)

# Lazy loading para tiktoken: evitar costos cuando no se usa debug
_TIKTOKEN_ENCODING = None

def _get_token_count(text: str) -> int:
    """Cuenta tokens usando tiktoken con lazy loading; fallback a len(text)//4."""
    global _TIKTOKEN_ENCODING
    try:
        if _TIKTOKEN_ENCODING is None:
            import tiktoken  # lazy import solo cuando se necesite
            _TIKTOKEN_ENCODING = tiktoken.get_encoding("cl100k_base")
        return int(len(_TIKTOKEN_ENCODING.encode(text or "")))
    except Exception:
        return int(max(0, (len(text or "") // 4)))


def _parse_verification_json(text: str) -> Optional[Dict[str, Any]]:
    """
    Parsea JSON de verificación de forma robusta.
    Maneja: JSON puro, JSON en markdown, comillas simples, booleanos Python.
    """
    if not text:
        return None
    
    # 1. Intentar extraer JSON de bloques markdown ```json ... ```
    md_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text, re.IGNORECASE)
    if md_match:
        text = md_match.group(1).strip()
    
    # 2. Intentar extraer JSON suelto { ... }
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        candidate = json_match.group(0)
    else:
        candidate = text.strip().strip('`')
    
    # 3. Normalizar para JSON válido
    # Reemplazar comillas simples por dobles (común en outputs Python-style)
    normalized = candidate.replace("'", '"')
    # Normalizar booleanos Python -> JSON
    normalized = re.sub(r'\bTrue\b', 'true', normalized)
    normalized = re.sub(r'\bFalse\b', 'false', normalized)
    normalized = re.sub(r'\bNone\b', 'null', normalized)
    
    try:
        return json.loads(normalized)
    except json.JSONDecodeError:
        return None

class ChatManager:
    """Manager principal para la interacción con el Bot y almacenamiento en base de datos."""

    def __init__(self, bot_instance: Bot):
        self.bot = bot_instance
        self.db = get_mongodb_client()

        logger.debug(f"[DB] ChatManager inicializado | client_id={id(self.db)}")

    async def generate_response(self, input_text: str, conversation_id: str, source: str | None = None, debug_mode: bool = False):
        """Genera la respuesta usando el Bot (LCEL maneja el RAG automáticamente)."""
        try:
            req_ctx = new_request_context()
            if getattr(settings, "enable_rag_lcel", False):
                logger.info("ENABLE_RAG_LCEL activo: contexto RAG será inyectado automáticamente.")
            else:
                logger.warning("ENABLE_RAG_LCEL desactivado: la recuperación contextual no se aplicará.")

            # Intentar obtener respuesta cacheada por (conversation_id + input_text)
            cache_key = f"resp:{conversation_id}:{hash_for_cache_key(input_text)}"
            cached_response = None
            try:
                if bool(getattr(settings, "enable_cache", True)):
                    cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                logger.debug("Cache HIT respuesta LLM para conversación")
                response_content = cached_response
                t_llm_start = None
                t_llm_end = None
                if debug_mode:
                    req_ctx.debug_info = await self._build_debug_info(
                        conversation_id=conversation_id,
                        input_text=input_text,
                        final_text=response_content,
                        t_start=t_llm_start,
                        t_end=t_llm_end,
                        verification=None,
                        is_cached=True,
                    )
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
                    if bool(getattr(settings, "enable_cache", True)):
                        cache.set(cache_key, response_content, cache.ttl)
                except Exception:
                    pass

            if not debug_mode:
                await self.db.add_message(conversation_id, USER_ROLE, input_text, source)
                await self.db.add_message(conversation_id, ASSISTANT_ROLE, response_content, source)
                self._last_debug_info = None
                req_ctx.debug_info = None
            else:
                req_ctx.debug_info = await self._build_debug_info(
                    conversation_id=conversation_id,
                    input_text=input_text,
                    final_text=response_content,
                    t_start=t_llm_start,
                    t_end=t_llm_end,
                    verification=None,
                    is_cached=False,
                )
                self._last_debug_info = req_ctx.debug_info
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
            current_llm = getattr(self.bot.chain_manager, "_model", None)
            if current_llm is None:
                return {"is_grounded": False, "reason": "Modelo no disponible"}

            try:
                mt = ModelTypes[getattr(settings, "model_type", "OPENAI").upper()]
            except Exception:
                mt = ModelTypes.OPENAI

            verifier_kwargs: Dict[str, Any] = {"temperature": 0.0}
            if mt == ModelTypes.OPENAI:
                verifier_kwargs.update({
                    "model_name": getattr(settings, "base_model_name", "gpt-3.5-turbo"),
                    "max_tokens": getattr(settings, "max_tokens", 2000),
                })
            elif mt == ModelTypes.VERTEX:
                verifier_kwargs.update({
                    "model_name": getattr(settings, "base_model_name", "gpt-3.5-turbo"),
                    "max_output_tokens": getattr(settings, "max_tokens", 2000),
                    "top_p": 0.8,
                    "top_k": 40,
                })
            else:
                verifier_kwargs.update({
                    "max_tokens": getattr(settings, "max_tokens", 2000),
                })

            try:
                model_cls = MODEL_TO_CLASS[mt.value]
                llm = model_cls(**verifier_kwargs)
            except Exception:
                llm = current_llm

            prompt = (
                "Eres un Auditor de Hechos (Fact-Checker) estricto. Tu única misión es validar si la RESPUESTA del asistente se basa EXCLUSIVAMENTE en el CONTEXTO provisto.\n\n"
                "REGLAS DE AUDITORÍA:\n"
                "1. Datos Duros: Si la respuesta contiene números, precios, fechas, nombres propios o códigos que NO aparecen textualmente en el contexto: ES ALUCINACIÓN (False).\n"
                "2. Invención de Información: Si la respuesta afirma características, políticas o instrucciones que no existen en el contexto: ES ALUCINACIÓN (False).\n"
                "3. Conocimiento Externo: Si la respuesta usa información general (que GPT sabe por entrenamiento) pero que no está en el documento (ej: 'El cielo es azul'): ES ALUCINACIÓN (False). Solo vale lo que está en el PDF.\n"
                "4. Excepción Social: Ignora saludos ('Hola'), despedidas o frases de cortesía ('Estoy para ayudarte'). Eso NO es alucinación.\n\n"
                "Analiza paso a paso y responde SOLO en formato JSON: { 'is_grounded': bool, 'reason': 'Explica brevemente qué dato específico no se encontró en el contexto' }\n\n"
                f"CONSULTA:\n{str(query)}\n\n"
                f"CONTEXTO:\n{str(context)}\n\n"
                f"RESPUESTA:\n{str(response)}\n"
            )

            res = await llm.ainvoke(prompt)
            txt = getattr(res, "content", None)
            if not isinstance(txt, str):
                txt = str(res)
            
            # Usar helper robusto para parsear JSON
            obj = _parse_verification_json(txt)
            if obj is not None:
                isg = bool(obj.get("is_grounded", False))
                rsn = str(obj.get("reason") or "")
                return {"is_grounded": isg, "reason": rsn}
            
            # Fallback: heurística simple si no se pudo parsear
            low = txt.lower()
            # Buscar patrón "is_grounded": true/false
            if '"is_grounded"' in low or "'is_grounded'" in low:
                grounded = 'true' in low and 'false' not in low.split('is_grounded')[1][:20]
            else:
                grounded = 'true' in low and 'false' not in low
            return {"is_grounded": grounded, "reason": txt[:400]}
        except Exception as e:
            logger.warning(f"Error en verificación de respuesta: {e}")
            return {"is_grounded": False, "reason": "Error verificando respuesta"}

    async def _build_debug_info(self, conversation_id, input_text, final_text, t_start, t_end, verification=None, is_cached: bool = False) -> DebugInfo:
        """Construye DebugInfo consolidando recuperación de docs, prompt, tokens y latencias.
        Maneja errores internamente y retorna un DebugInfo mínimo si algo falla.
        """
        try:
            req_ctx = get_request_context()
            docs = req_ctx.retrieved_docs or []
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
            ctx = req_ctx.context or ""

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
            except Exception:
                hydrated = str(prompt_str)

            input_tokens = (
                _get_token_count(str(prompt_str))
                + _get_token_count(str(formatted_hist))
                + _get_token_count(str(ctx))
                + _get_token_count(str(input_text))
            )
            output_tokens = _get_token_count(str(final_text))
            rag_time = req_ctx.rag_time

            llm_time = None
            try:
                if (t_start is not None) and (t_end is not None):
                    llm_time = float(t_end - t_start)
            except Exception:
                llm_time = None

            gating_reason = req_ctx.gating_reason
            return DebugInfo(
                retrieved_documents=items,
                system_prompt_used=str(hydrated),
                model_params=dict(model_params),
                rag_time=rag_time,
                llm_time=llm_time,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                verification=verification,
                gating_reason=gating_reason,
                is_cached=bool(is_cached),
            )
        except Exception:
            gating_reason = req_ctx.gating_reason
            return DebugInfo(
                retrieved_documents=[],
                system_prompt_used="",
                model_params={},
                gating_reason=gating_reason,
                is_cached=bool(is_cached),
            )

    async def generate_streaming_response(self, input_text: str, conversation_id: str, source: str | None = None, debug_mode: bool = False, enable_verification: bool = False):
        try:
            logger.debug(f"[CHAT] Streaming start | conv={conversation_id}")
            req_ctx = new_request_context()
            if not debug_mode:
                await self.db.add_message(conversation_id, USER_ROLE, input_text, source)

            cache_key = f"resp:{conversation_id}:{hash_for_cache_key(input_text)}"
            cached_response = None
            try:
                if bool(getattr(settings, "enable_cache", True)):
                    cached_response = cache.get(cache_key)
            except Exception:
                cached_response = None

            if cached_response is not None:
                final_text = cached_response
                yield final_text
                if not debug_mode:
                    await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                    await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                    self._last_debug_info = None
                    req_ctx.debug_info = None
                else:
                    # Construye debug info incluso en cache hit para mantener métricas en UI
                    req_ctx.debug_info = await self._build_debug_info(
                        conversation_id=conversation_id,
                        input_text=input_text,
                        final_text=final_text,
                        t_start=None,
                        t_end=None,
                        verification=None,
                        is_cached=True,
                    )
                    self._last_debug_info = req_ctx.debug_info
                return

            bot_input = {"input": input_text, "conversation_id": conversation_id}
            stream = self.bot.astream_chunked(bot_input)

            final_text = ""
            try:
                t_llm_start = time.perf_counter()
                first = await asyncio.wait_for(stream.__anext__(), timeout=getattr(settings, "llm_timeout", 25))
                final_text += first
                yield first
            except asyncio.TimeoutError:
                raise
            except StopAsyncIteration:
                if not debug_mode:
                    await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                    await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)
                try:
                    if bool(getattr(settings, "enable_cache", True)):
                        cache.set(cache_key, final_text, cache.ttl)
                except Exception:
                    pass
                return

            async for chunk in stream:
                final_text += chunk
                yield chunk

            if not debug_mode:
                await self.db.add_message(conversation_id, ASSISTANT_ROLE, final_text, source)
                await self.bot.add_to_memory(human=input_text, ai=final_text, conversation_id=conversation_id)

            try:
                if bool(getattr(settings, "enable_cache", True)):
                    cache.set(cache_key, final_text, cache.ttl)
            except Exception:
                pass
            if debug_mode:
                t_llm_end = time.perf_counter()
                verification = None
                try:
                    if enable_verification:
                        ctx = req_ctx.context or ""
                        verification = await self._verify_response(input_text, ctx, final_text)
                except Exception:
                    verification = None
                req_ctx.debug_info = await self._build_debug_info(
                    conversation_id=conversation_id,
                    input_text=input_text,
                    final_text=final_text,
                    t_start=t_llm_start,
                    t_end=t_llm_end,
                    verification=verification,
                    is_cached=False,
                )
                self._last_debug_info = req_ctx.debug_info
            else:
                self._last_debug_info = None
                req_ctx.debug_info = None
            logger.debug(f"[CHAT] Streaming end | conv={conversation_id} len={len(final_text)}")
        except Exception as e:
            logger.error(f"Error generando respuesta streaming en ChatManager: {e}", exc_info=True)
            raise
