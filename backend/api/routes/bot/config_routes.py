"""API routes for bot configuration management (admin protected)."""
import logging
from fastapi import APIRouter, HTTPException, Request, status

from api.schemas.config import BotConfigDTO, UpdateBotConfigRequest
from database.config_repository import ConfigRepository

logger = logging.getLogger(__name__)
router = APIRouter(tags=["bot"])


def _get_config_repo(request: Request) -> ConfigRepository:
    """Helper to build ConfigRepository using app's Mongo client when available."""
    try:
        if hasattr(request.app.state, "mongodb_client") and request.app.state.mongodb_client:
            return ConfigRepository(mongo=request.app.state.mongodb_client)
    except Exception:
        # Fallback to default initialization
        pass
    return ConfigRepository()


@router.get("/config", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def get_bot_config(request: Request) -> BotConfigDTO:
    """Return current bot configuration."""
    try:
        repo = _get_config_repo(request)
        config = await repo.get_config()
        return BotConfigDTO(**config.model_dump())
    except Exception as e:
        logger.error(f"Error getting bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener la configuración")


@router.put("/config", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def update_bot_config(request: Request, payload: UpdateBotConfigRequest) -> BotConfigDTO:
    """Update bot configuration fields (admin only)."""
    try:
        repo = _get_config_repo(request)
        updated = await repo.update_config(
            system_prompt=payload.system_prompt,
            temperature=payload.temperature,
            bot_name=payload.bot_name,
            ui_prompt_extra=payload.ui_prompt_extra,
            twilio_account_sid=payload.twilio_account_sid,
            twilio_auth_token=payload.twilio_auth_token,
            twilio_whatsapp_from=payload.twilio_whatsapp_from,
            theme_color=payload.theme_color,
            starters=payload.starters,
            input_placeholder=payload.input_placeholder,
        )
        # Aplicar en runtime: actualizar settings y recargar chain del bot
        if hasattr(request.app.state, "settings") and request.app.state.settings:
            if updated.system_prompt is not None:
                request.app.state.settings.system_prompt = updated.system_prompt
            if updated.temperature is not None:
                request.app.state.settings.temperature = updated.temperature
            # Propagar nombre y extra en settings para que ChainManager los use (ignorar errores menores)
            try:
                request.app.state.settings.bot_name = updated.bot_name
                request.app.state.settings.ui_prompt_extra = updated.ui_prompt_extra
            except Exception:
                pass
            try:
                request.app.state.settings.twilio_account_sid = updated.twilio_account_sid
                request.app.state.settings.twilio_auth_token = updated.twilio_auth_token
                request.app.state.settings.twilio_whatsapp_from = updated.twilio_whatsapp_from
            except Exception:
                pass
            try:
                request.app.state.settings.theme_color = updated.theme_color
                request.app.state.settings.starters = updated.starters
                request.app.state.settings.welcome_message = updated.welcome_message
                request.app.state.settings.input_placeholder = updated.input_placeholder
            except Exception:
                pass

        if hasattr(request.app.state, "bot_instance") and request.app.state.bot_instance:
            try:
                request.app.state.bot_instance.reload_chain(request.app.state.settings)
            except Exception as reload_error:
                logger.error(
                    f"Error recargando chain del bot, se mantiene la chain anterior: {reload_error}",
                    exc_info=True,
                )
                # No lanzar 500: la configuración queda persistida y la chain anterior sigue activa
                # El cliente recibirá la config actualizada; la recarga puede intentarse nuevamente más tarde

        return BotConfigDTO(**updated.model_dump())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al actualizar la configuración")


@router.post("/config/reset", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def reset_bot_config(request: Request) -> BotConfigDTO:
    """Clear UI-driven fields and reload runtime (admin only)."""
    try:
        repo = _get_config_repo(request)
        updated = await repo.reset_ui()

        # Propagar a settings y recargar chain
        if hasattr(request.app.state, "settings") and request.app.state.settings:
            try:
                request.app.state.settings.bot_name = None
                request.app.state.settings.ui_prompt_extra = None
            except Exception:
                pass

        if hasattr(request.app.state, "bot_instance") and request.app.state.bot_instance:
            try:
                request.app.state.bot_instance.reload_chain(request.app.state.settings)
            except Exception as reload_error:
                logger.error(
                    f"Error recargando chain tras reset, se mantiene la chain anterior: {reload_error}",
                    exc_info=True,
                )
        return BotConfigDTO(**updated.model_dump())
    except Exception as e:
        logger.error(f"Error resetting bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al restablecer la configuración")


@router.get("/config/public", status_code=status.HTTP_200_OK)
async def get_bot_public_config(request: Request):
    """Public endpoint exposing only safe UI config fields for the chat widget/page."""
    try:
        repo = _get_config_repo(request)
        config = await repo.get_config()
        payload = {
            "bot_name": config.bot_name,
            "theme_color": config.theme_color,
            "starters": config.starters,
            "input_placeholder": config.input_placeholder,
        }
        return payload
    except Exception as e:
        logger.error(f"Error getting public bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener configuración pública")
