"""Bot active-state and runtime-config storage (Redis + MongoDB).

Centralizes the storage contract shared by admin routes and app startup.
Redis reads here carry no local TTL — callers that need amortisation
wrap results in their own short-lived cache.
"""
from datetime import datetime, timezone
from typing import Optional

from cache.manager import cache
from database.config_repository import ConfigRepository


BOT_CONFIG_COLLECTION = "bot_config"
BOT_CONFIG_DOC_ID = "default"
BOT_IS_ACTIVE_CACHE_KEY = "bot:is_active"

BOT_CONFIG_CACHE_FIELDS = (
    "temperature",
    "bot_name",
    "ui_prompt_extra",
    "theme_color",
    "starters",
    "input_placeholder",
    "twilio_account_sid",
    "twilio_whatsapp_from",
)


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


def redis_coordination_available() -> bool:
    try:
        return bool(cache.get_health_status().get("redis_connected"))
    except Exception:
        return False


def normalize_is_active(value: object) -> Optional[bool]:
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


def read_is_active_from_redis() -> Optional[bool]:
    """Lectura directa Redis sin caché local. None si Redis no disponible o ausente."""
    if not redis_coordination_available():
        return None
    try:
        return normalize_is_active(cache.get(BOT_IS_ACTIVE_CACHE_KEY))
    except Exception:
        return None


def write_is_active_to_redis(value: bool) -> bool:
    """Escribe en Redis. Devuelve True si Redis estaba disponible."""
    if not redis_coordination_available():
        return False
    try:
        cache.set(BOT_IS_ACTIVE_CACHE_KEY, bool(value), ttl=0)
    except Exception:
        pass
    return True


async def read_is_active_from_mongo(mongo_client) -> Optional[bool]:
    try:
        if mongo_client is None:
            return None
        doc = await mongo_client.db.get_collection(BOT_CONFIG_COLLECTION).find_one(
            {"_id": BOT_CONFIG_DOC_ID},
            {"is_active": 1},
        )
        if not doc:
            return None
        return normalize_is_active(doc.get("is_active"))
    except Exception:
        return None


async def save_is_active_to_mongo(mongo_client, value: bool) -> None:
    if mongo_client is None:
        raise RuntimeError("MongoDB client is not initialized")

    await mongo_client.db.get_collection(BOT_CONFIG_COLLECTION).update_one(
        {"_id": BOT_CONFIG_DOC_ID},
        {
            "$set": {
                "is_active": bool(value),
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )


async def read_runtime_config_from_mongo(mongo_client) -> Optional[dict]:
    try:
        if mongo_client is None:
            return None
        repo = ConfigRepository(mongo=mongo_client)
        config = await repo.get_config()
        return build_runtime_config_payload(config)
    except Exception:
        return None
