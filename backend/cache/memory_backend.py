import time
import collections
from typing import Any, Optional


class InMemoryCache:
    """Caché en memoria con TTL y control de tamaño máximo."""

    def __init__(self, max_size: int = 1000):
        self._store = collections.OrderedDict()
        self.max_size = int(max_size) if max_size is not None else 1000

    def _evict_if_needed(self) -> None:
        try:
            if len(self._store) > self.max_size:
                self._store.popitem(last=False)
        except Exception:
            pass

    def get(self, key: str) -> Optional[Any]:
        if key is None:
            return None
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
        k = str(key)
        existing = self._store.get(k)
        if existing is not None:
            existing["value"] = value
            existing["expires_at"] = expires_at
            self._store.move_to_end(k)
        else:
            self._store[k] = {
                "value": value,
                "expires_at": expires_at,
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
