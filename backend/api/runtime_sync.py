"""Sincronización del estado runtime del bot entre workers.

Coordina:
- Configuración dinámica del bot (temperature, prompt, etc.) → Mongo + Redis
- Flag `is_active` del bot → Redis con TTL local para evitar 1 hop por request
- Disponibilidad de RAG (Qdrant) con reconexión perezosa

Cada worker uvicorn tiene su propia copia de estos globals; el TTL local
acota la divergencia entre workers a `BOT_IS_ACTIVE_LOCAL_TTL_SECONDS`.
"""
import asyncio
import time
from typing import Optional

from fastapi import FastAPI

from utils.logging_utils import get_logger
from cache.manager import cache

from .bot_state_repo import (
    BOT_IS_ACTIVE_CACHE_KEY,
    normalize_is_active,
    read_is_active_from_mongo,
    read_runtime_config_from_mongo,
    redis_coordination_available,
)
from .routes.bot.config_routes import (
    apply_runtime_config,
    read_runtime_config_from_cache,
    write_runtime_config_to_cache,
)


RUNTIME_SYNC_PATH_PREFIXES = ("/api/v1/bot", "/api/v1/chat", "/api/v1/whatsapp")
BOT_IS_ACTIVE_LOCAL_TTL_SECONDS = 5.0


_bot_is_active_local_cache: Optional[bool] = None
_bot_is_active_local_expires_at: float = 0.0


def _invalidate_bot_is_active_local_cache() -> None:
    global _bot_is_active_local_cache, _bot_is_active_local_expires_at
    _bot_is_active_local_cache = None
    _bot_is_active_local_expires_at = 0.0


def _read_bot_is_active_from_cache() -> Optional[bool]:
    """Wrapper con TTL local sobre la lectura Redis para evitar 1 hop por request.

    Cambios de otros workers se ven a lo más en BOT_IS_ACTIVE_LOCAL_TTL_SECONDS.
    """
    global _bot_is_active_local_cache, _bot_is_active_local_expires_at

    now = time.monotonic()
    if _bot_is_active_local_cache is not None and now < _bot_is_active_local_expires_at:
        return _bot_is_active_local_cache

    if not redis_coordination_available():
        _invalidate_bot_is_active_local_cache()
        return None

    try:
        value = normalize_is_active(cache.get(BOT_IS_ACTIVE_CACHE_KEY))
    except Exception:
        return None

    if value is not None:
        _bot_is_active_local_cache = value
        _bot_is_active_local_expires_at = now + BOT_IS_ACTIVE_LOCAL_TTL_SECONDS
    return value


def _write_bot_is_active_to_cache(value: bool) -> None:
    if not redis_coordination_available():
        _invalidate_bot_is_active_local_cache()
        return

    try:
        cache.set(BOT_IS_ACTIVE_CACHE_KEY, bool(value), ttl=0)
    except Exception:
        pass

    _invalidate_bot_is_active_local_cache()


async def load_shared_runtime_snapshot(mongo_client) -> tuple[Optional[dict], Optional[bool]]:
    runtime_config = read_runtime_config_from_cache()
    if runtime_config is None:
        runtime_config = await read_runtime_config_from_mongo(mongo_client)
        if runtime_config is not None:
            write_runtime_config_to_cache(runtime_config)

    is_active = _read_bot_is_active_from_cache()
    if is_active is None:
        is_active = await read_is_active_from_mongo(mongo_client)
        if is_active is not None:
            _write_bot_is_active_to_cache(is_active)

    return runtime_config, is_active


def apply_shared_runtime_snapshot(
    app: FastAPI,
    runtime_config: Optional[dict],
    is_active: Optional[bool],
    *,
    reload_chain: bool,
) -> None:
    config_changed = False

    if runtime_config is not None and getattr(app.state, "settings", None) is not None:
        current_config = getattr(app.state, "last_synced_bot_config", None)
        if current_config != runtime_config:
            config_changed = apply_runtime_config(app.state.settings, runtime_config)
            app.state.last_synced_bot_config = runtime_config

    bot = getattr(app.state, "bot_instance", None)
    if bot is not None and is_active is not None and bot.is_active != is_active:
        bot.is_active = is_active

    if is_active is not None:
        app.state.last_synced_bot_is_active = is_active

    if reload_chain and config_changed and bot is not None:
        try:
            bot.reload_chain(app.state.settings)
        except Exception as e:
            get_logger(__name__).error(
                f"Error recargando chain desde estado compartido: {e}", exc_info=True
            )


async def sync_worker_runtime_state(app: FastAPI, *, reload_chain: bool) -> None:
    mongo_client = getattr(app.state, "mongodb_client", None)
    runtime_config, is_active = await load_shared_runtime_snapshot(mongo_client)
    apply_shared_runtime_snapshot(app, runtime_config, is_active, reload_chain=reload_chain)


def should_sync_runtime_state(path: str) -> bool:
    return path.startswith(RUNTIME_SYNC_PATH_PREFIXES)


def refresh_rag_availability_state(app: FastAPI) -> bool:
    vector_store = getattr(app.state, "vector_store", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    rag_ingestor = getattr(app.state, "rag_ingestor", None)
    rag_available = bool(
        vector_store is not None
        and getattr(vector_store, "is_available", False)
        and rag_retriever is not None
        and rag_ingestor is not None
    )
    app.state.rag_available = rag_available
    return rag_available


async def ensure_rag_runtime_available(app: FastAPI) -> bool:
    vector_store = getattr(app.state, "vector_store", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    rag_ingestor = getattr(app.state, "rag_ingestor", None)
    if vector_store is None or rag_retriever is None or rag_ingestor is None:
        app.state.rag_available = False
        return False

    if getattr(vector_store, "is_available", False):
        app.state.rag_available = True
        return True

    try:
        reconnected = await asyncio.to_thread(vector_store.ensure_connected)
    except Exception as exc:
        get_logger(__name__).warning("Intento de reconexión a Qdrant falló: %s", exc, exc_info=True)
        reconnected = False

    app.state.rag_available = bool(reconnected)
    if reconnected:
        get_logger(__name__).warning("Qdrant volvió a estar disponible. RAG reactivado en runtime.")
    return bool(reconnected)
