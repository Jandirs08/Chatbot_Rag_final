"""Acceso a estado del bot (is_active + runtime_config) en Redis y Mongo.

Centraliza el contrato de almacenamiento para que tanto las rutas admin
(`bot_routes.py`) como la sincronización entre workers (`runtime_sync.py`)
compartan el mismo formato y constantes.

Las lecturas Redis aquí NO aplican TTL local — quien quiera amortizar el
hop a Redis lo envuelve en su capa (ver `runtime_sync._read_bot_is_active_from_cache`).
"""
from datetime import datetime, timezone
from typing import Optional

from cache.manager import cache
from database.config_repository import ConfigRepository

from .routes.bot.config_routes import build_runtime_config_payload


BOT_CONFIG_COLLECTION = "bot_config"
BOT_CONFIG_DOC_ID = "default"
BOT_IS_ACTIVE_CACHE_KEY = "bot:is_active"


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
    """Escribe en Redis. Devuelve True si Redis estaba disponible (independiente del éxito)."""
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
