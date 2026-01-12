from typing import Any, Optional

from config import settings
from utils.logging_utils import get_logger

_logger = get_logger(__name__)


class CacheManager:
    """Gestor unificado de caché con degradación elegante a InMemoryCache."""

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

        # Estado de degradación
        self.is_degraded: bool = False
        self.backend_type: str = "Unknown"
        
        self.backend = self._init_backend()

    def _init_backend(self):
        """Inicializa el backend de caché con retry logic y graceful degradation."""
        import time
        
        # Obtener configuración de reintentos
        retry_attempts = getattr(settings, "cache_retry_attempts", 3)
        retry_delay_base = getattr(settings, "cache_retry_delay_base", 0.5)
        
        # Intentar conectar a Redis con reintentos
        redis_url = getattr(settings, "redis_url", None)
        
        if redis_url:
            for attempt in range(1, retry_attempts + 1):
                try:
                    import redis  # type: ignore
                    
                    url = (
                        redis_url.get_secret_value()
                        if hasattr(redis_url, "get_secret_value")
                        else str(redis_url)
                    )
                    
                    client = redis.from_url(url, decode_responses=False)
                    
                    # Verificar conexión
                    client.ping()
                    _logger.info("CacheManager: Redis PING OK")
                    
                    from .redis_backend import RedisCache
                    _logger.info("CacheManager: Redis conectado correctamente (usando RedisCache).")
                    
                    self.is_degraded = False
                    self.backend_type = "RedisCache"
                    return RedisCache(client=client)
                    
                except Exception as e:
                    if attempt < retry_attempts:
                        delay = retry_delay_base * (2 ** (attempt - 1))  # Exponential backoff
                        _logger.warning(
                            f"CacheManager: Intento {attempt}/{retry_attempts} de conexión a Redis falló: {e}. "
                            f"Reintentando en {delay}s..."
                        )
                        time.sleep(delay)
                    else:
                        _logger.warning(
                            f"CacheManager: Todos los intentos de conexión a Redis fallaron ({retry_attempts} intentos). "
                            f"Último error: {e}"
                        )
        else:
            _logger.warning("CacheManager: REDIS_URL no configurado.")
        
        # Fallback a InMemoryCache
        _logger.warning(
            "⚠️ CacheManager: Usando InMemoryCache como fallback (modo degradado). "
            "El caché será local al proceso y no persistente."
        )
        
        from .memory_backend import InMemoryCache
        self.is_degraded = True
        self.backend_type = "InMemoryCache"
        return InMemoryCache(max_size=self.max_size)
    
    def get_health_status(self) -> dict:
        """Retorna el estado de salud del caché para monitoreo."""
        is_redis = self.backend_type == "RedisCache"
        return {
            "backend_type": self.backend_type,
            "is_degraded": self.is_degraded,
            "redis_connected": is_redis,
            "message": (
                "Cache operating normally with Redis" if is_redis
                else "Cache running in degraded mode (InMemoryCache)"
            )
        }

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
