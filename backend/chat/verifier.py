"""Verificador de respuestas (fact-checker) usado en modo debug.

Reutiliza el LLM configurado en el bot pero con `temperature=0` para evitar
veredictos inestables. Se ejecuta solo cuando el cliente pide verificaciÃ³n
explÃ­cita en debug, NO en el camino productivo de streaming.
"""
import asyncio
from typing import Any, Dict

from config import settings
from domain.model_types import ModelTypes, MODEL_TO_CLASS
from infra.logging_utils import get_logger

from .cache_key import parse_verification_json

logger = get_logger(__name__)


_VERIFIER_PROMPT = (
    "Eres un Auditor de Hechos (Fact-Checker) estricto. Tu Ãºnica misiÃ³n es validar si la RESPUESTA del asistente se basa EXCLUSIVAMENTE en el CONTEXTO provisto.\n\n"
    "REGLAS DE AUDITORÃA:\n"
    "1. Datos Duros: Si la respuesta contiene nÃºmeros, precios, fechas, nombres propios o cÃ³digos que NO aparecen textualmente en el contexto: ES ALUCINACIÃ“N (False).\n"
    "2. InvenciÃ³n de InformaciÃ³n: Si la respuesta afirma caracterÃ­sticas, polÃ­ticas o instrucciones que no existen en el contexto: ES ALUCINACIÃ“N (False).\n"
    "3. Conocimiento Externo: Si la respuesta usa informaciÃ³n general (que GPT sabe por entrenamiento) pero que no estÃ¡ en el documento (ej: 'El cielo es azul'): ES ALUCINACIÃ“N (False). Solo vale lo que estÃ¡ en el PDF.\n"
    "4. ExcepciÃ³n Social: Ignora saludos ('Hola'), despedidas o frases de cortesÃ­a ('Estoy para ayudarte'). Eso NO es alucinaciÃ³n.\n\n"
    "Analiza paso a paso y responde SOLO en formato JSON: { 'is_grounded': bool, 'reason': 'Explica brevemente quÃ© dato especÃ­fico no se encontrÃ³ en el contexto' }\n\n"
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
            logger.warning(f"Error en verificaciÃ³n de respuesta: {e}")
            return {"is_grounded": False, "reason": "Error verificando respuesta"}
