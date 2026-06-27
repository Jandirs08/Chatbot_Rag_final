"""Rate limiting por número de WhatsApp (wa_id).

Usa Redis si está disponible (a través del cache backend); cae a un store en
memoria por proceso si no. El store en memoria no es coherente entre workers,
solo sirve como degradación graceful en dev/local.
"""
import time
from typing import Tuple

from utils.logging_utils import get_logger

logger = get_logger(__name__)

_memory_store: dict = {}


def _get_redis_client():
    try:
        from cache.manager import cache
        backend = getattr(cache, "backend", None)
        client = getattr(backend, "client", None)
        return client
    except Exception:
        return None


def _incr_redis(client, key: str, window_seconds: int) -> int:
    try:
        pipe = client.pipeline()
        pipe.incr(key, 1)
        pipe.expire(key, int(window_seconds), nx=True)
        result = pipe.execute()
        return int(result[0])
    except Exception as e:
        logger.warning("Rate limit Redis falló (%s); fallback a memoria", e)
        return -1


def _incr_memory(key: str, window_seconds: int) -> int:
    now = time.time()
    entry = _memory_store.get(key)
    if entry is None or entry[1] < now:
        _memory_store[key] = (1, now + window_seconds)
        return 1
    new_count = entry[0] + 1
    _memory_store[key] = (new_count, entry[1])
    return new_count


def check_and_increment(wa_id: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
    """Incrementa contador y devuelve (is_rate_limited, count)."""
    if not wa_id or limit <= 0 or window_seconds <= 0:
        return (False, 0)

    key = f"wa_rl:{wa_id}"
    client = _get_redis_client()
    count = -1
    if client is not None:
        count = _incr_redis(client, key, window_seconds)
    if count < 0:
        count = _incr_memory(key, window_seconds)
    return (count > limit, count)


def should_notify_once(wa_id: str, window_seconds: int) -> bool:
    """Devuelve True solo la primera vez en el window. Evita spam de avisos."""
    if not wa_id or window_seconds <= 0:
        return True

    key = f"wa_rl_notified:{wa_id}"
    client = _get_redis_client()
    if client is not None:
        try:
            existed = client.set(name=key, value=b"1", ex=int(window_seconds), nx=True)
            return bool(existed)
        except Exception as e:
            logger.warning("notify-once Redis falló (%s); fallback memoria", e)

    now = time.time()
    entry = _memory_store.get(key)
    if entry is not None and entry[1] >= now:
        return False
    _memory_store[key] = (1, now + window_seconds)
    return True
