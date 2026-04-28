"""Idempotency para webhook Twilio.

Twilio reintenta el webhook si no recibe 200 dentro de ~11s. Como el
procesamiento del LLM se hace en background, los reintentos pueden generar
respuestas duplicadas al usuario. Marcamos cada `MessageSid` visto en Redis
(con fallback en memoria) durante un TTL prudente para descartar duplicados.
"""
import time

from utils.logging_utils import get_logger

logger = get_logger(__name__)

_memory_store: dict = {}
_DEFAULT_TTL_SECONDS = 300


def _get_redis_client():
    try:
        from cache.manager import cache
        backend = getattr(cache, "backend", None)
        return getattr(backend, "client", None)
    except Exception:
        return None


def _claim_memory(key: str, ttl_seconds: int) -> bool:
    now = time.time()
    entry = _memory_store.get(key)
    if entry is not None and entry >= now:
        return False
    _memory_store[key] = now + ttl_seconds
    if len(_memory_store) > 10000:
        # Evita crecimiento ilimitado en fallback memoria
        for k in [k for k, exp in _memory_store.items() if exp < now]:
            _memory_store.pop(k, None)
    return True


def claim_message(message_sid: str, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> bool:
    """Devuelve True si es la primera vez que se ve `message_sid`.

    False indica un reintento de Twilio que ya fue aceptado previamente.
    """
    if not message_sid:
        return True

    key = f"wa_msg_seen:{message_sid}"
    client = _get_redis_client()
    if client is not None:
        try:
            ok = client.set(name=key, value=b"1", ex=int(ttl_seconds), nx=True)
            return bool(ok)
        except Exception as e:
            logger.warning("Idempotency Redis falló (%s); fallback memoria", e)

    return _claim_memory(key, ttl_seconds)
