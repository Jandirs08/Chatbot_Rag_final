"""API routes for bot state management."""
from utils.logging_utils import get_logger
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
from cache.manager import cache

from auth.dependencies import get_current_active_user
from models.user import User

logger = get_logger(__name__)
router = APIRouter(tags=["bot"])

BOT_CONFIG_COLLECTION = "bot_config"
BOT_CONFIG_DOC_ID = "default"
BOT_IS_ACTIVE_CACHE_KEY = "bot:is_active"

# 🔒 NOTA: Todas las rutas de este módulo están protegidas por AuthenticationMiddleware
# Solo usuarios admin autenticados pueden acceder a estos endpoints

class BotStateResponse(BaseModel):
    """Modelo de respuesta para el estado del bot."""
    is_active: bool
    message: str
    last_activity_iso: str | None = None


class BotRuntimeResponse(BaseModel):
    """Modelo de respuesta para inspeccionar configuración runtime del bot."""
    # Evitar warning de pydantic por prefijo "model_" en campos
    model_config = {"protected_namespaces": ()}
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    bot_name: str | None = None
    ui_prompt_extra_len: int = 0
    effective_personality_len: int = 0


def _redis_coordination_available() -> bool:
    try:
        return bool(cache.get_health_status().get("redis_connected"))
    except Exception:
        return False


def _normalize_is_active(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return None


def _read_bot_is_active_from_cache() -> bool | None:
    if not _redis_coordination_available():
        return None

    try:
        return _normalize_is_active(cache.get(BOT_IS_ACTIVE_CACHE_KEY))
    except Exception:
        return None


def _write_bot_is_active_to_cache(value: bool) -> None:
    if not _redis_coordination_available():
        return

    try:
        cache.set(BOT_IS_ACTIVE_CACHE_KEY, bool(value), ttl=0)
    except Exception:
        pass


async def _read_bot_is_active_from_mongo(request: Request) -> bool | None:
    try:
        mongo = getattr(request.app.state, "mongodb_client", None)
        if mongo is None:
            return None

        doc = await mongo.db.get_collection(BOT_CONFIG_COLLECTION).find_one(
            {"_id": BOT_CONFIG_DOC_ID},
            {"is_active": 1},
        )
        if not doc:
            return None

        return _normalize_is_active(doc.get("is_active"))
    except Exception:
        return None


async def _resolve_bot_is_active(request: Request) -> bool | None:
    cached = _read_bot_is_active_from_cache()
    if cached is not None:
        return cached

    return await _read_bot_is_active_from_mongo(request)


async def _save_bot_is_active_to_mongo(request: Request, value: bool) -> None:
    mongo = getattr(request.app.state, "mongodb_client", None)
    if mongo is None:
        raise RuntimeError("MongoDB client is not initialized")

    await mongo.db.get_collection(BOT_CONFIG_COLLECTION).update_one(
        {"_id": BOT_CONFIG_DOC_ID},
        {
            "$set": {
                "is_active": bool(value),
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )

@router.get("/state", response_model=BotStateResponse)
async def get_bot_state(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """Obtener el estado actual del bot."""
    try:
        bot = request.app.state.bot_instance
        is_active = await _resolve_bot_is_active(request)
        if is_active is None:
            is_active = bot.is_active
        else:
            bot.is_active = is_active
            request.app.state.last_synced_bot_is_active = is_active

        last_activity_iso: str | None = None
        try:
            chat_manager = getattr(request.app.state, "chat_manager", None)
            db = getattr(chat_manager, "db", None)
            if db is not None and hasattr(db, "messages"):
                cursor = db.messages.find({}, {"timestamp": 1}).sort("timestamp", -1).limit(1)
                docs = await cursor.to_list(length=1)
                if docs:
                    ts = docs[0].get("timestamp")
                    if isinstance(ts, datetime):
                        if ts.tzinfo is None:
                            ts = ts.replace(tzinfo=timezone.utc)
                        last_activity_iso = ts.isoformat()
                    elif ts:
                        try:
                            last_activity_iso = str(ts)
                        except Exception:
                            last_activity_iso = None
        except Exception:
            last_activity_iso = None

        return BotStateResponse(
            is_active=is_active,
            message="Estado del bot obtenido exitosamente",
            last_activity_iso=last_activity_iso,
        )
    except Exception as e:
        logger.error(f"Error al obtener estado del bot: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor al obtener estado del bot: {str(e)}"
        )

@router.post("/toggle", response_model=BotStateResponse)
async def toggle_bot_state(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """Activar o desactivar el bot."""
    try:
        bot = request.app.state.bot_instance
        new_state = not bot.is_active
        await _save_bot_is_active_to_mongo(request, new_state)
        bot.is_active = new_state
        _write_bot_is_active_to_cache(new_state)
        request.app.state.last_synced_bot_is_active = new_state
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
async def get_bot_runtime(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """Inspeccionar configuración runtime actual del bot (modelo, temperatura, prompt efectivo)."""
    try:
        bot = request.app.state.bot_instance
        cm = bot.chain_manager

        runtime = {}
        # Obtener valores desde settings actuales del ChainManager (fuente de verdad)
        try:
            s = getattr(cm, "settings", None) or getattr(request.app.state, "settings", None)
            if s is not None:
                runtime["model_name"] = getattr(s, "base_model_name", None)
                runtime["temperature"] = getattr(s, "temperature", None)
                runtime["max_tokens"] = getattr(s, "max_tokens", None)
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
