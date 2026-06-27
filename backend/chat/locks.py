"""Locks por conversación para evitar respuestas concurrentes a la misma sesión.

Usa Redis advisory lock cuando está disponible (cross-worker safe). Si Redis no
está accesible, cae a `asyncio.Lock` por proceso. Nota: el fallback en memoria
NO es coherente entre workers — solo evita corromper la misma conversación
dentro del mismo proceso.
"""
import asyncio
import time
from typing import Dict, Optional

from cache.manager import cache
from utils.logging_utils import get_logger
from infra.redis_lock import RedisAdvisoryLock

logger = get_logger(__name__)


class ConversationLockManager:
    """Gestiona locks por `conversation_id` con limpieza periódica de entradas inactivas."""

    def __init__(
        self,
        *,
        acquire_timeout_seconds: float = 10.0,
        cleanup_interval_seconds: float = 60.0,
        idle_ttl_seconds: float = 300.0,
    ) -> None:
        self._locks: Dict[str, asyncio.Lock] = {}
        self._refs: Dict[str, int] = {}
        self._last_used: Dict[str, float] = {}
        self._guard = asyncio.Lock()
        self._acquire_timeout = acquire_timeout_seconds
        self._cleanup_interval = cleanup_interval_seconds
        self._idle_ttl = idle_ttl_seconds
        self._last_cleanup_at = time.monotonic()

    @staticmethod
    def _redis_client():
        try:
            if getattr(cache, "backend_type", None) == "RedisCache":
                return cache.backend.client
        except Exception:
            pass
        return None

    async def acquire(self, conversation_id: str) -> tuple[object, bool]:
        client = self._redis_client()
        if client is not None:
            return await self._acquire_redis(conversation_id, client)
        return await self._acquire_local(conversation_id)

    async def _acquire_redis(self, conversation_id: str, client) -> tuple[object, bool]:
        lock = RedisAdvisoryLock(
            client,
            f"conv:lock:{conversation_id}",
            acquire_timeout=self._acquire_timeout,
        )
        acquired = await lock.acquire()
        return lock, acquired

    async def _acquire_local(self, conversation_id: str) -> tuple[Optional[asyncio.Lock], bool]:
        now = time.monotonic()
        async with self._guard:
            lock = self._locks.get(conversation_id)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[conversation_id] = lock
                self._refs[conversation_id] = 0

            self._refs[conversation_id] = self._refs.get(conversation_id, 0) + 1
            self._last_used[conversation_id] = now

        try:
            await asyncio.wait_for(lock.acquire(), timeout=self._acquire_timeout)
            return lock, True
        except asyncio.TimeoutError:
            logger.warning(
                "[CHAT] Timeout adquiriendo lock local de conversación | conv=%s",
                conversation_id,
            )
            await self.release(conversation_id, lock, acquired=False)
            return lock, False

    async def release(self, conversation_id: str, lock: object, *, acquired: bool) -> None:
        if isinstance(lock, RedisAdvisoryLock):
            if acquired:
                await lock.release()
            return

        now = time.monotonic()
        async with self._guard:
            if acquired and lock is not None and isinstance(lock, asyncio.Lock) and lock.locked():
                lock.release()

            current_refs = self._refs.get(conversation_id, 0)
            if current_refs > 1:
                self._refs[conversation_id] = current_refs - 1
                self._last_used[conversation_id] = now
            else:
                self._refs[conversation_id] = 0
                self._last_used[conversation_id] = now

            if (now - self._last_cleanup_at) >= self._cleanup_interval:
                self._cleanup_locked(now)
                self._last_cleanup_at = now

    def _cleanup_locked(self, now: float) -> None:
        stale_ids = []
        for conversation_id, lock in self._locks.items():
            refs = self._refs.get(conversation_id, 0)
            last_used = self._last_used.get(conversation_id, now)
            if refs <= 0 and not lock.locked() and (now - last_used) >= self._idle_ttl:
                stale_ids.append(conversation_id)

        for conversation_id in stale_ids:
            self._locks.pop(conversation_id, None)
            self._refs.pop(conversation_id, None)
            self._last_used.pop(conversation_id, None)
