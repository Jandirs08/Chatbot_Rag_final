from enum import Enum
from typing import Optional, Any, Dict
from langchain_community.cache import InMemoryCache
try:
    from langchain_community.cache import RedisCache  # type: ignore
    _HAS_REDISCACHE = True
except Exception:
    RedisCache = None  # type: ignore
    _HAS_REDISCACHE = False
from langchain.globals import set_llm_cache
try:
    import redis  # type: ignore
    _REDIS_AVAILABLE = True
except Exception:
    redis = None  # type: ignore
    _REDIS_AVAILABLE = False
import logging
import time
from config import Settings, settings as app_settings

class CacheTypes(str, Enum):
    """Tipos de caché disponibles."""
    InMemoryCache = "inmemorycache"
    RedisCache = "rediscache"

class CacheMetrics:
    """Métricas del sistema de caché."""
    def __init__(self):
        self.hits = 0
        self.misses = 0
        self.total_requests = 0
        self.total_time = 0
        self.last_reset = time.time()
    
    def record_hit(self, response_time: float):
        """Registra un hit en el caché."""
        self.hits += 1
        self.total_requests += 1
        self.total_time += response_time
    
    def record_miss(self, response_time: float):
        """Registra un miss en el caché."""
        self.misses += 1
        self.total_requests += 1
        self.total_time += response_time
    
    def get_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas actuales del caché."""
        total_time = time.time() - self.last_reset
        return {
            "hits": self.hits,
            "misses": self.misses,
            "total_requests": self.total_requests,
            "hit_ratio": (self.hits / self.total_requests * 100) if self.total_requests > 0 else 0,
            "avg_response_time": (self.total_time / self.total_requests) if self.total_requests > 0 else 0,
            "uptime_seconds": total_time
        }
    
    def reset(self):
        """Reinicia las métricas."""
        self.hits = 0
        self.misses = 0
        self.total_requests = 0
        self.total_time = 0
        self.last_reset = time.time()

class ChatbotCache:
    """Gestor de caché para el chatbot."""
    
    def __init__(self, settings: Settings, cache_type: Optional[CacheTypes] = None, **kwargs):
        """Inicializa el gestor de caché.
        
        Args:
            settings: Configuraciones de la aplicación
            cache_type: Tipo de caché a utilizar
            **kwargs: Argumentos adicionales para la configuración del caché
        """
        self.settings = settings
        self.logger = logging.getLogger(self.__class__.__name__)
        # Por defecto usa InMemoryCache para evitar dependencias si no se desea Redis
        self.cache_type = cache_type or CacheTypes.InMemoryCache
        self.cache_kwargs = kwargs
        self.metrics = CacheMetrics()
        self._init_cache()

    def _init_cache(self):
        """Inicializa el caché según el tipo seleccionado."""
        if not self.settings.enable_cache:
            self.logger.info("Caché deshabilitado en la configuración.")
            set_llm_cache(None)
            return

        self.logger.info(f"Inicializando caché de tipo: {self.cache_type.value}")
        try:
            if self.cache_type == CacheTypes.RedisCache:
                if not _HAS_REDISCACHE or not _REDIS_AVAILABLE:
                    self.logger.warning("RedisCache seleccionado pero la librería no está disponible. Usando InMemoryCache.")
                    cache_obj = InMemoryCache()
                    self.cache_type = CacheTypes.InMemoryCache
                else:
                    if not self.settings.redis_url:
                        self.logger.warning("RedisCache seleccionado pero REDIS_URL no está configurado. Usando InMemoryCache.")
                        cache_obj = InMemoryCache()
                        self.cache_type = CacheTypes.InMemoryCache
                    else:
                        try:
                            # Obtener la URL de Redis, manejando tanto SecretStr como str
                            redis_url = (
                                self.settings.redis_url.get_secret_value()
                                if hasattr(self.settings.redis_url, 'get_secret_value')
                                else str(self.settings.redis_url)
                            )

                            redis_client = redis.from_url(
                                redis_url,
                                socket_timeout=2,
                                socket_connect_timeout=2,
                                retry_on_timeout=True,
                                health_check_interval=30
                            )
                            redis_client.ping()
                            cache_obj = RedisCache(
                                redis_client,
                                ttl=self.settings.cache_ttl,
                                **self.cache_kwargs
                            )
                            self.logger.info(f"RedisCache inicializado con TTL: {self.settings.cache_ttl}")
                        except Exception as e:
                            self.logger.warning(f"Error al conectar con Redis: {e}. Usando InMemoryCache.")
                            cache_obj = InMemoryCache()
                            self.cache_type = CacheTypes.InMemoryCache
            else:
                cache_obj = InMemoryCache()
                self.logger.info("InMemoryCache inicializado")
            
            set_llm_cache(cache_obj)
            self.logger.info(f"Caché configurado exitosamente: {self.cache_type.value}")

        except Exception as e:
            self.logger.error(f"Error al inicializar caché: {e}. Deshabilitando caché.")
            set_llm_cache(None)

    @staticmethod
    def create(cache_type: Optional[CacheTypes] = None, settings: Optional[Settings] = None, **kwargs) -> 'ChatbotCache':
        """Crea una instancia de ChatbotCache.
        
        Args:
            cache_type: Tipo de caché a utilizar
            settings: Configuraciones de la aplicación
            **kwargs: Argumentos adicionales para la configuración del caché
            
        Returns:
            Instancia de ChatbotCache
        """
        effective_settings = settings if settings is not None else app_settings
        return ChatbotCache(settings=effective_settings, cache_type=cache_type, **kwargs)


    def get_metrics(self) -> Dict[str, Any]:
        """Obtiene las métricas actuales del caché.
        
        Returns:
            Diccionario con las métricas del caché
        """
        metrics = self.metrics.get_stats()
        metrics.update({
            "cache_type": self.cache_type.value,
            "enabled": self.settings.enable_cache,
            "ttl": self.settings.cache_ttl
        })
        return metrics
