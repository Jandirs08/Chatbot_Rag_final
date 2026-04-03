"""API routes for bot configuration management.

Protección: todos los endpoints (excepto /config/public) requieren usuario autenticado.
Para restringir a admins: cambiar Depends(get_current_active_user) → Depends(require_admin).
/config/public es público (exento en el middleware).
"""
import logging
from fastapi import APIRouter, HTTPException, Request, status, Depends

from api.schemas.config import BotConfigDTO, UpdateBotConfigRequest
from database.config_repository import ConfigRepository
from auth.dependencies import get_current_active_user
from models.user import User
from cache.manager import cache

logger = logging.getLogger(__name__)
router = APIRouter(tags=["bot"])

BOT_CONFIG_CACHE_KEY = "bot:config"
BOT_PUBLIC_CONFIG_CACHE_KEY = "bot:config:public"
BOT_PUBLIC_CONFIG_CACHE_TTL_SECONDS = 3600
BOT_CONFIG_CACHE_FIELDS = (
    "temperature",
    "bot_name",
    "ui_prompt_extra",
    "theme_color",
    "starters",
    "input_placeholder",
    "twilio_account_sid",
    "twilio_auth_token",
    "twilio_whatsapp_from",
)
BOT_PUBLIC_CONFIG_FIELDS = (
    "bot_name",
    "theme_color",
    "starters",
    "input_placeholder",
)
SAFE_PUBLIC_BOT_CONFIG = {
    "is_active": True,
    "bot_name": "Asistente IA",
    "theme_color": "#F97316",
    "starters": [],
    "input_placeholder": "Escribe aquí...",
}


def redis_coordination_available() -> bool:
    try:
        return bool(cache.get_health_status().get("redis_connected"))
    except Exception:
        return False


def normalize_runtime_config_payload(payload: object) -> dict | None:
    if not isinstance(payload, dict):
        return None

    normalized = {field: payload.get(field) for field in BOT_CONFIG_CACHE_FIELDS}

    try:
        if normalized["temperature"] is not None:
            normalized["temperature"] = float(normalized["temperature"])
    except Exception:
        normalized["temperature"] = None

    starters = normalized.get("starters")
    if starters is None:
        normalized["starters"] = []
    elif isinstance(starters, list):
        normalized["starters"] = [str(item).strip() for item in starters if str(item).strip()]
    else:
        starter = str(starters).strip()
        normalized["starters"] = [starter] if starter else []

    for field in (
        "bot_name",
        "ui_prompt_extra",
        "theme_color",
        "input_placeholder",
        "twilio_account_sid",
        "twilio_auth_token",
        "twilio_whatsapp_from",
    ):
        value = normalized.get(field)
        if value is None:
            continue
        normalized[field] = str(value)

    return normalized


def build_runtime_config_payload(config_obj: object) -> dict:
    payload = {field: getattr(config_obj, field, None) for field in BOT_CONFIG_CACHE_FIELDS}
    return normalize_runtime_config_payload(payload) or {}


def normalize_public_config_payload(payload: object) -> dict | None:
    normalized = normalize_runtime_config_payload(payload)
    if normalized is None:
        return None

    return {
        "bot_name": normalized.get("bot_name") or SAFE_PUBLIC_BOT_CONFIG["bot_name"],
        "theme_color": normalized.get("theme_color") or SAFE_PUBLIC_BOT_CONFIG["theme_color"],
        "starters": normalized.get("starters") or [],
        "input_placeholder": normalized.get("input_placeholder") or SAFE_PUBLIC_BOT_CONFIG["input_placeholder"],
    }


def build_public_config_payload(config_obj: object) -> dict:
    payload = {field: getattr(config_obj, field, None) for field in BOT_PUBLIC_CONFIG_FIELDS}
    return normalize_public_config_payload(payload) or {
        key: SAFE_PUBLIC_BOT_CONFIG[key] for key in BOT_PUBLIC_CONFIG_FIELDS
    }


def read_runtime_config_from_cache() -> dict | None:
    if not redis_coordination_available():
        return None

    try:
        return normalize_runtime_config_payload(cache.get(BOT_CONFIG_CACHE_KEY))
    except Exception:
        return None


def write_runtime_config_to_cache(config_obj: object) -> None:
    if not redis_coordination_available():
        return

    payload = config_obj if isinstance(config_obj, dict) else build_runtime_config_payload(config_obj)
    normalized = normalize_runtime_config_payload(payload)
    if normalized is None:
        return

    try:
        cache.set(BOT_CONFIG_CACHE_KEY, normalized, ttl=0)
    except Exception:
        pass


def read_public_config_from_cache() -> dict | None:
    if not redis_coordination_available():
        return None

    try:
        return normalize_public_config_payload(cache.get(BOT_PUBLIC_CONFIG_CACHE_KEY))
    except Exception as exc:
        logger.warning("No se pudo leer la configuración pública del bot desde Redis: %s", exc, exc_info=True)
        return None


def write_public_config_to_cache(config_obj: object) -> None:
    if not redis_coordination_available():
        return

    payload = config_obj if isinstance(config_obj, dict) else build_public_config_payload(config_obj)
    normalized = normalize_public_config_payload(payload)
    if normalized is None:
        return

    try:
        cache.set(BOT_PUBLIC_CONFIG_CACHE_KEY, normalized, ttl=BOT_PUBLIC_CONFIG_CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.warning("No se pudo guardar la configuración pública del bot en Redis: %s", exc, exc_info=True)


def apply_runtime_config(settings_obj: object, payload: object) -> bool:
    normalized = normalize_runtime_config_payload(payload)
    if settings_obj is None or normalized is None:
        return False

    changed = False
    for field, value in normalized.items():
        if getattr(settings_obj, field, None) != value:
            setattr(settings_obj, field, value)
            changed = True

    return changed


def _get_config_repo(request: Request) -> ConfigRepository:
    """Helper to build ConfigRepository using app's Mongo client when available."""
    try:
        if hasattr(request.app.state, "mongodb_client") and request.app.state.mongodb_client:
            return ConfigRepository(mongo=request.app.state.mongodb_client)
    except Exception:
        pass
    return ConfigRepository()


def _build_bot_config_dto(config_obj: object) -> BotConfigDTO:
    payload = dict(config_obj.model_dump()) if hasattr(config_obj, "model_dump") else dict(config_obj)
    payload.pop("twilio_auth_token", None)
    payload["twilio_configured"] = bool(getattr(config_obj, "twilio_auth_token", None))
    return BotConfigDTO(**payload)


@router.get("/config", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def get_bot_config(
    request: Request,
    _: User = Depends(get_current_active_user),
) -> BotConfigDTO:
    """Return current bot configuration. Requires: authenticated user."""
    try:
        repo = _get_config_repo(request)
        config = await repo.get_config()
        return _build_bot_config_dto(config)
    except Exception as e:
        logger.error(f"Error getting bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al obtener la configuración")


@router.put("/config", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def update_bot_config(
    request: Request,
    payload: UpdateBotConfigRequest,
    _: User = Depends(get_current_active_user),
) -> BotConfigDTO:
    """Update bot configuration fields. Requires: authenticated user."""
    try:
        repo = _get_config_repo(request)
        updated = await repo.update_config(
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
        runtime_payload = build_runtime_config_payload(updated)
        # Aplicar en runtime
        if hasattr(request.app.state, "settings") and request.app.state.settings:
            apply_runtime_config(request.app.state.settings, runtime_payload)

        if hasattr(request.app.state, "bot_instance") and request.app.state.bot_instance:
            try:
                request.app.state.bot_instance.reload_chain(request.app.state.settings)
            except Exception as reload_error:
                logger.error(
                    f"Error recargando chain del bot, se mantiene la chain anterior: {reload_error}",
                    exc_info=True,
                )
        write_runtime_config_to_cache(runtime_payload)
        request.app.state.last_synced_bot_config = runtime_payload

        return _build_bot_config_dto(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al actualizar la configuración")


@router.post("/config/reset", response_model=BotConfigDTO, status_code=status.HTTP_200_OK)
async def reset_bot_config(
    request: Request,
    _: User = Depends(get_current_active_user),
) -> BotConfigDTO:
    """Clear UI-driven fields and reload runtime. Requires: authenticated user."""
    try:
        repo = _get_config_repo(request)
        updated = await repo.reset_ui()
        runtime_payload = build_runtime_config_payload(updated)

        if hasattr(request.app.state, "settings") and request.app.state.settings:
            apply_runtime_config(request.app.state.settings, runtime_payload)

        if hasattr(request.app.state, "bot_instance") and request.app.state.bot_instance:
            try:
                request.app.state.bot_instance.reload_chain(request.app.state.settings)
            except Exception as reload_error:
                logger.error(
                    f"Error recargando chain tras reset, se mantiene la chain anterior: {reload_error}",
                    exc_info=True,
                )
        write_runtime_config_to_cache(runtime_payload)
        request.app.state.last_synced_bot_config = runtime_payload
        return _build_bot_config_dto(updated)
    except Exception as e:
        logger.error(f"Error resetting bot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al restablecer la configuración")


@router.get("/config/public", status_code=status.HTTP_200_OK)
async def get_bot_public_config(request: Request):
    """Public endpoint: exposes only safe UI config fields for the chat widget."""
    try:
        repo = _get_config_repo(request)
        config = await repo.get_config()
        public_config = build_public_config_payload(config)
        write_public_config_to_cache(public_config)
        return public_config
    except Exception as mongo_error:
        logger.error("Error getting public bot config from MongoDB: %s", mongo_error, exc_info=True)

    cached_config = read_public_config_from_cache()
    if cached_config is not None:
        return cached_config

    logger.warning("Returning hardcoded safe default public bot config after MongoDB and Redis failures.")
    return {key: SAFE_PUBLIC_BOT_CONFIG[key] for key in BOT_PUBLIC_CONFIG_FIELDS}
