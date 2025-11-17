from enum import Enum
from typing import Optional, Any, Dict
import logging
import time
from config import Settings, settings as app_settings
from cache.manager import cache

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
        self.cache_type = cache_type or CacheTypes.InMemoryCache
        self.cache_kwargs = kwargs
        self.metrics = CacheMetrics()
        self._init_cache()

    def _init_cache(self):
        """Inicializa el caché a nivel de gestor (usa CacheManager global)."""
        if not self.settings.enable_cache:
            self.logger.info("Caché deshabilitado en la configuración.")
            return
        # No configuramos caches de LangChain; usamos CacheManager unificado
        self.logger.info(f"CacheManager activo; tipo preferido: {self.cache_type.value}")

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

    # ============================================================
    #   API de caché LLM unificada (usa CacheManager global)
    # ============================================================
    def get_llm_response(self, prompt_hash: str) -> Optional[Any]:
        """Obtiene la respuesta cacheada del LLM usando la clave unificada."""
        try:
            if not self.settings.enable_cache:
                return None
            key = f"llm:{prompt_hash}"
            return cache.get(key)
        except Exception:
            return None

    def set_llm_response(self, prompt_hash: str, result: Any) -> None:
        """Establece la respuesta del LLM en el caché usando la clave unificada."""
        try:
            if not self.settings.enable_cache:
                return
            key = f"llm:{prompt_hash}"
            cache.set(key, result)
        except Exception:
            pass
