"""Bot configuration cache service.

Pure business logic -- no HTTP/FastAPI concerns.
Imported by api/app.py, api/app_startup.py, and api/routes/bot/config_routes.py.
"""
import logging
import time

from cache.manager import cache
from database.bot_state_repo import (
    build_runtime_config_payload,
    normalize_runtime_config_payload,
    redis_coordination_available,
)

logger = logging.getLogger(__name__)

BOT_CONFIG_CACHE_KEY = "bot:config"
BOT_PUBLIC_CONFIG_CACHE_KEY = "bot:config:public"
BOT_PUBLIC_CONFIG_CACHE_TTL_SECONDS = 3600
RUNTIME_CONFIG_LOCAL_TTL_SECONDS = 5.0

BOT_PUBLIC_CONFIG_FIELDS = (
    "bot_name",
    "theme_color",
    "starters",
    "input_placeholder",
)
SAFE_PUBLIC_BOT_CONFIG: dict = {
    "is_active": True,
    "bot_name": "Asistente IA",
    "theme_color": "#F97316",
    "starters": [],
    "input_placeholder": "Escribe aqui...",
}

_runtime_config_local_cache: dict | None = None
_runtime_config_local_expires_at: float = 0.0


def _invalidate_runtime_config_local_cache() -> None:
    global _runtime_config_local_cache, _runtime_config_local_expires_at
    _runtime_config_local_cache = None
    _runtime_config_local_expires_at = 0.0


def read_runtime_config_from_cache() -> dict | None:
    """Read runtime config with a short-TTL local cache to avoid hitting Redis
    on every request to /chat, /bot, /whatsapp.

    Trade-off: a config change on another worker is visible after at most
    RUNTIME_CONFIG_LOCAL_TTL_SECONDS. Acceptable for runtime tuning knobs.
    """
    global _runtime_config_local_cache, _runtime_config_local_expires_at

    now = time.monotonic()
    if _runtime_config_local_cache is not None and now < _runtime_config_local_expires_at:
        return _runtime_config_local_cache

    if not redis_coordination_available():
        _invalidate_runtime_config_local_cache()
        return None

    try:
        normalized = normalize_runtime_config_payload(cache.get(BOT_CONFIG_CACHE_KEY))
    except Exception:
        return None

    _runtime_config_local_cache = normalized
    _runtime_config_local_expires_at = now + RUNTIME_CONFIG_LOCAL_TTL_SECONDS
    return normalized


def write_runtime_config_to_cache(config_obj: object) -> None:
    if not redis_coordination_available():
        _invalidate_runtime_config_local_cache()
        return

    payload = config_obj if isinstance(config_obj, dict) else build_runtime_config_payload(config_obj)
    normalized = normalize_runtime_config_payload(payload)
    if normalized is None:
        return

    try:
        cache.set(BOT_CONFIG_CACHE_KEY, normalized, ttl=0)
    except Exception as exc:
        logger.warning("No se pudo escribir la configuracion de runtime en Redis: %s", exc, exc_info=True)

    _invalidate_runtime_config_local_cache()


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


def read_public_config_from_cache() -> dict | None:
    if not redis_coordination_available():
        return None

    try:
        return normalize_public_config_payload(cache.get(BOT_PUBLIC_CONFIG_CACHE_KEY))
    except Exception as exc:
        logger.warning("No se pudo leer la configuracion publica del bot desde Redis: %s", exc, exc_info=True)
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
        logger.warning("No se pudo guardar la configuracion publica del bot en Redis: %s", exc, exc_info=True)


def apply_runtime_config(settings_obj: object, payload: object) -> bool:
    """Apply a runtime config payload to a settings object in-place. Returns True if any field changed.

    Intentional mutation: settings_obj is a process-wide singleton shared across all requests.
    """
    normalized = normalize_runtime_config_payload(payload)
    if settings_obj is None or normalized is None:
        return False

    changed = False
    for field, value in normalized.items():
        if getattr(settings_obj, field, None) != value:
            setattr(settings_obj, field, value)
            changed = True

    return changed
