"""Verificador de respuestas (fact-checker) usado en modo debug.

Reutiliza el LLM configurado en el bot pero con `temperature=0` para evitar
veredictos inestables. Se ejecuta solo cuando el cliente pide verificación
explícita en debug, NO en el camino productivo de streaming.
"""
import asyncio
from typing import Any, Dict

from config import settings
from models.model_types import ModelTypes, MODEL_TO_CLASS
from infra.logging_utils import get_logger

from .cache_key import parse_verification_json

logger = get_logger(__name__)


_VERIFIER_PROMPT = (
    "Eres un Auditor de Hechos (Fact-Checker) estricto. Tu única misión es validar si la RESPUESTA del asistente se basa EXCLUSIVAMENTE en el CONTEXTO provisto.\n\n"
    "REGLAS DE AUDITORÍA:\n"
    "1. Datos Duros: Si la respuesta contiene números, precios, fechas, nombres propios o códigos que NO aparecen textualmente en el contexto: ES ALUCINACIÓN (False).\n"
    "2. Invención de Información: Si la respuesta afirma características, políticas o instrucciones que no existen en el contexto: ES ALUCINACIÓN (False).\n"
    "3. Conocimiento Externo: Si la respuesta usa información general (que GPT sabe por entrenamiento) pero que no está en el documento (ej: 'El cielo es azul'): ES ALUCINACIÓN (False). Solo vale lo que está en el PDF.\n"
    "4. Excepción Social: Ignora saludos ('Hola'), despedidas o frases de cortesía ('Estoy para ayudarte'). Eso NO es alucinación.\n\n"
    "Analiza paso a paso y responde SOLO en formato JSON: { 'is_grounded': bool, 'reason': 'Explica brevemente qué dato específico no se encontró en el contexto' }\n\n"
    "CONSULTA:\n{query}\n\n"
    "CONTEXTO:\n{context}\n\n"
    "RESPUESTA:\n{response}\n"
)


class ResponseVerifier:
    """Auditor de respuestas contra el contexto recuperado."""

    def __init__(self, bot) -> None:
        self.bot = bot

    def _build_llm(self):
        current_llm = getattr(self.bot.chain_manager, "_model", None)

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
            return model_cls(**verifier_kwargs)
        except Exception:
            return current_llm

    async def verify(self, query, context, response) -> dict:
        try:
            llm = self._build_llm()
            if llm is None:
                return {"is_grounded": False, "reason": "Modelo no disponible"}

            prompt = _VERIFIER_PROMPT.format(
                query=str(query),
                context=str(context),
                response=str(response),
            )
            timeout = float(getattr(settings, "verifier_llm_timeout_seconds", 10.0))
            try:
                res = await asyncio.wait_for(llm.ainvoke(prompt), timeout=timeout)
            except asyncio.TimeoutError:
                logger.warning(f"Verifier LLM timeout ({timeout}s)")
                return {"is_grounded": False, "reason": f"Timeout verificando respuesta ({timeout}s)"}
            txt = getattr(res, "content", None)
            if not isinstance(txt, str):
                txt = str(res)

            obj = parse_verification_json(txt)
            if obj is not None:
                return {
                    "is_grounded": bool(obj.get("is_grounded", False)),
                    "reason": str(obj.get("reason") or ""),
                }

            low = txt.lower()
            if '"is_grounded"' in low or "'is_grounded'" in low:
                grounded = 'true' in low and 'false' not in low.split('is_grounded')[1][:20]
            else:
                grounded = 'true' in low and 'false' not in low
            return {"is_grounded": grounded, "reason": txt[:400]}
        except Exception as e:
            logger.warning(f"Error en verificación de respuesta: {e}")
            return {"is_grounded": False, "reason": "Error verificando respuesta"}
