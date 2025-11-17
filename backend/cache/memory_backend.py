import time
from typing import Any, Dict, Optional


class InMemoryCache:
    """Caché en memoria con TTL y control de tamaño máximo.

    - Usa un dict interno: {key: {value, expires_at, created_at}}
    - TTL por entrada: ahora + ttl
    - Evicción FIFO simple cuando excede max_size
    - Métodos: get, set, delete, invalidate_prefix
    """

    def __init__(self, max_size: int = 1000):
        self._store: Dict[str, Dict[str, Any]] = {}
        self.max_size = int(max_size) if max_size is not None else 1000

    def _cleanup_expired(self) -> None:
        now = time.time()
        try:
            expired_keys = [k for k, v in self._store.items() if v.get("expires_at", 0) <= now]
            for k in expired_keys:
                try:
                    del self._store[k]
                except Exception:
                    pass
        except Exception:
            # No bloquear por errores en limpieza
            pass

    def _evict_if_needed(self) -> None:
        try:
            if len(self._store) > self.max_size:
                # Eliminar la entrada más antigua según created_at
                oldest_key = min(self._store.keys(), key=lambda kk: self._store[kk].get("created_at", 0))
                try:
                    del self._store[oldest_key]
                except Exception:
                    pass
        except Exception:
            pass

    def get(self, key: str) -> Optional[Any]:
        if key is None:
            return None
        self._cleanup_expired()
        entry = self._store.get(str(key))
        if not entry:
            return None
        # Verificar expiración en tiempo de lectura
        if entry.get("expires_at", 0) <= time.time():
            try:
                del self._store[str(key)]
            except Exception:
                pass
            return None
        return entry.get("value")

    def set(self, key: str, value: Any, ttl: int) -> None:
        if key is None:
            return
        now = time.time()
        ttl_seconds = int(ttl) if ttl is not None else 0
        expires_at = now + ttl_seconds if ttl_seconds > 0 else float("inf")
        self._cleanup_expired()
        self._store[str(key)] = {
            "value": value,
            "expires_at": expires_at,
            "created_at": now,
        }
        self._evict_if_needed()

    def delete(self, key: str) -> None:
        if key is None:
            return
        try:
            if str(key) in self._store:
                del self._store[str(key)]
        except Exception:
            pass

    def invalidate_prefix(self, prefix: str) -> None:
        if not prefix:
            return
        try:
            keys = list(self._store.keys())
            for k in keys:
                if str(k).startswith(prefix):
                    try:
                        del self._store[k]
                    except Exception:
                        pass
        except Exception:
            pass