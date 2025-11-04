"""API routes for bot state management."""
import logging
from utils.logging_utils import get_logger
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = get_logger(__name__)
router = APIRouter(tags=["bot"])

# 🔒 NOTA: Todas las rutas de este módulo están protegidas por AuthenticationMiddleware
# Solo usuarios admin autenticados pueden acceder a estos endpoints

class BotStateResponse(BaseModel):
    """Modelo de respuesta para el estado del bot."""
    is_active: bool
    message: str


class BotRuntimeResponse(BaseModel):
    """Modelo de respuesta para inspeccionar configuración runtime del bot."""
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    bot_name: str | None = None
    ui_prompt_extra_len: int = 0
    effective_personality_len: int = 0

@router.get("/state", response_model=BotStateResponse)
async def get_bot_state(request: Request):
    """Obtener el estado actual del bot."""
    try:
        is_active = request.app.state.bot_instance.is_active
        return BotStateResponse(
            is_active=is_active,
            message="Estado del bot obtenido exitosamente"
        )
    except Exception as e:
        logger.error(f"Error al obtener estado del bot: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor al obtener estado del bot: {str(e)}"
        )

@router.post("/toggle", response_model=BotStateResponse)
async def toggle_bot_state(request: Request):
    """Activar o desactivar el bot."""
    try:
        bot = request.app.state.bot_instance
        bot.is_active = not bot.is_active
        return BotStateResponse(
            is_active=bot.is_active,
            message="Bot activado" if bot.is_active else "Bot desactivado"
        )
    except Exception as e:
        logger.error(f"Error al cambiar estado del bot: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor al cambiar estado del bot: {str(e)}"
        )


@router.get("/runtime", response_model=BotRuntimeResponse)
async def get_bot_runtime(request: Request):
    """Inspeccionar configuración runtime actual del bot (modelo, temperatura, prompt efectivo)."""
    try:
        bot = request.app.state.bot_instance
        cm = bot.chain_manager

        runtime = {}
        try:
            base_kwargs = cm._base_model.dict()
            # Normalizar campos según proveedor
            runtime["model_name"] = base_kwargs.get("model_name")
            runtime["temperature"] = base_kwargs.get("temperature")
            runtime["max_tokens"] = base_kwargs.get("max_tokens") or base_kwargs.get("max_output_tokens")
        except Exception:
            pass

        # Obtener nombre efectivo y longitudes desde la chain
        try:
            nombre = cm._prompt.partial_variables.get("nombre") if hasattr(cm._prompt, "partial_variables") else None
            runtime["bot_name"] = nombre
            personality = cm._prompt.partial_variables.get("bot_personality") if hasattr(cm._prompt, "partial_variables") else None
            runtime["effective_personality_len"] = len(personality) if personality else 0
            # Intentar estimar longitud de extras si están presentes en settings
            s = request.app.state.settings
            ui_extra = getattr(s, "ui_prompt_extra", None) or ""
            runtime["ui_prompt_extra_len"] = len(ui_extra)
        except Exception:
            pass

        return BotRuntimeResponse(**runtime)
    except Exception as e:
        logger.error(f"Error al obtener runtime del bot: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener runtime del bot")