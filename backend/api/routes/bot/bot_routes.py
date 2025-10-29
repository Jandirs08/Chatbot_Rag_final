"""API routes for bot state management."""
import logging
from utils.logging_utils import get_logger
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = get_logger(__name__)
router = APIRouter(tags=["bot"])

class BotStateResponse(BaseModel):
    """Modelo de respuesta para el estado del bot."""
    is_active: bool
    message: str

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