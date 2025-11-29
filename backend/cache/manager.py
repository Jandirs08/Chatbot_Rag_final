import logging
from typing import Any, Optional

from config import settings
from utils.logging_utils import get_logger

_logger = get_logger(__name__)


class CacheManager:
    """Gestor unificado de caché basado exclusivamente en Redis."""

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
        try:
            redis_url = getattr(settings, "redis_url", None)
            if not redis_url:
                raise RuntimeError("REDIS_URL no configurado")
            
            import redis  # type: ignore
            
            url = (
                redis_url.get_secret_value()
                if hasattr(redis_url, "get_secret_value")
                else str(redis_url)
            )
            
            client = redis.from_url(url, decode_responses=False)
            
            # Verificar conexión
            client.ping()
            _logger.info("CacheManager: Redis PING OK")  # <--- LOG RECUPERADO
            
            from .redis_backend import RedisCache
            _logger.info("CacheManager: Redis conectado correctamente (usando RedisCache).") # <--- LOG RECUPERADO
            
            return RedisCache(client=client)
            
        except Exception as e:
            # Loguear el error crítico antes de morir
            _logger.critical(f"FALLO CRÍTICO DE REDIS: {e}")
            raise RuntimeError("Conexión a Redis fallida - Backend detenido") from e

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