import logging
from typing import Any, Optional

from config import settings

_logger = logging.getLogger(__name__)


class CacheManager:
    """Gestor unificado de caché con fallback automático.

    - Si REDIS_URL está definido y Redis responde: usa RedisCache
    - Si no: usa InMemoryCache
    - TTL global configurable via settings.cache_ttl
    - max_size configurable via settings.max_cache_size (para caché en memoria)
    - API pública: get, set, delete, invalidate_prefix
    """

    def __init__(self):
        # Configuración global
        try:
            self.ttl: int = int(getattr(settings, "cache_ttl", 300))
        except Exception:
            self.ttl = 300
        try:
            self.max_size: int = int(getattr(settings, "max_cache_size", 1000))
        except Exception:
            self.max_size = 1000

        self.backend = self._init_backend()

    def _init_backend(self):
        # Intentar Redis primero
        try:
            redis_url = getattr(settings, "redis_url", None)
            if redis_url:
                try:
                    import redis  # type: ignore
                    url = (
                        redis_url.get_secret_value()
                        if hasattr(redis_url, "get_secret_value")
                        else str(redis_url)
                    )
                    client = redis.from_url(url, decode_responses=False)
                    # Verificar conectividad rápida
                    client.ping()
                    from .redis_backend import RedisCache
                    _logger.info("CacheManager: Redis disponible, usando RedisCache")
                    return RedisCache(client=client)
                except Exception as e:
                    _logger.warning(f"CacheManager: Redis no disponible ({e}), usando InMemoryCache")
        except Exception:
            # Cualquier error en acceso a settings
            pass

        # Fallback a caché en memoria
        try:
            from .memory_backend import InMemoryCache
            _logger.info("CacheManager: usando InMemoryCache (fallback)")
            return InMemoryCache(max_size=self.max_size)
        except Exception as e:
            # Último recurso: construir una implementación mínima
            _logger.error(f"CacheManager: error iniciando InMemoryCache: {e}")
            class _MinimalCache:
                def get(self, key: str):
                    return None
                def set(self, key: str, value: Any, ttl: int):
                    return None
                def delete(self, key: str):
                    return None
                def invalidate_prefix(self, prefix: str):
                    return None
            return _MinimalCache()

    # API pública unificada
    def get(self, key: str) -> Optional[Any]:
        try:
            return self.backend.get(key)
        except Exception:
            return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        effective_ttl = int(ttl) if ttl is not None else self.ttl
        try:
            self.backend.set(key, value, effective_ttl)
        except Exception:
            pass

    def delete(self, key: str) -> None:
        try:
            self.backend.delete(key)
        except Exception:
            pass

    def invalidate_prefix(self, prefix: str) -> None:
        try:
            self.backend.invalidate_prefix(prefix)
        except Exception:
            pass


# Instancia global accesible
cache = CacheManager()