import json
import pickle
from typing import Any, Optional

try:
    import redis  # type: ignore
    _REDIS_AVAILABLE = True
except Exception:
    redis = None  # type: ignore
    _REDIS_AVAILABLE = False

from config import settings


class RedisCache:
    """Capa de caché basada en Redis.

    - Usa redis.from_url(settings.redis_url)
    - Métodos: get, set, delete, invalidate_prefix
    - No usa flushdb/flushall; invalidación selectiva por prefijo con scan_iter
    - Serializa valores con JSON y fallback a pickle, con prefijos 'JSON:' / 'PKL:'
    """

    def __init__(self, client: Optional["redis.Redis"] = None):
        if client is not None:
            self.client = client
            return

        if not _REDIS_AVAILABLE:
            raise RuntimeError("Redis no está disponible en el entorno")

        redis_url = (
            settings.redis_url.get_secret_value()
            if hasattr(settings.redis_url, "get_secret_value")
            else str(settings.redis_url)
        )
        # decode_responses=False para trabajar con bytes
        self.client = redis.from_url(redis_url, decode_responses=False)

    def get(self, key: str) -> Optional[Any]:
        if key is None:
            return None
        raw = self.client.get(key)
        if raw is None:
            return None
        try:
            if isinstance(raw, bytes) and raw.startswith(b"JSON:"):
                return json.loads(raw[len(b"JSON:"):].decode("utf-8"))
            if isinstance(raw, bytes) and raw.startswith(b"PKL:"):
                return pickle.loads(raw[len(b"PKL:"):])
            # fallback: intentar json
            try:
                return json.loads(raw.decode("utf-8"))
            except Exception:
                return raw
        except Exception:
            return None

    def set(self, key: str, value: Any, ttl: int) -> None:
        if key is None:
            return
        # Serialización con prefijo
        payload: bytes
        try:
            payload = b"JSON:" + json.dumps(value).encode("utf-8")
        except Exception:
            payload = b"PKL:" + pickle.dumps(value)
        ttl_seconds = int(ttl) if ttl is not None else 0
        if ttl_seconds > 0:
            self.client.set(name=key, value=payload, ex=ttl_seconds)
        else:
            # ttl=0: almacenar sin caducidad; se podrá invalidar por prefijo
            self.client.set(name=key, value=payload)

    def delete(self, key: str) -> None:
        if key is None:
            return
        try:
            # Preferir unlink si está disponible para eliminación asíncrona
            if hasattr(self.client, "unlink"):
                self.client.unlink(key)
            else:
                self.client.delete(key)
        except Exception:
            pass

    def invalidate_prefix(self, prefix: str) -> None:
        if not prefix:
            return
        try:
            pattern = f"{prefix}*"
            for key in self.client.scan_iter(match=pattern):
                try:
                    if hasattr(self.client, "unlink"):
                        self.client.unlink(key)
                    else:
                        self.client.delete(key)
                except Exception:
                    pass
        except Exception:
            pass