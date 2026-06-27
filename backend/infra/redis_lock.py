"""Redis advisory lock for cross-worker conversation coordination."""
import asyncio
import logging
import time
import uuid

logger = logging.getLogger(__name__)

# Lua script: delete key only if the value matches our token (atomic ownership check)
_RELEASE_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


class RedisAdvisoryLock:
    """Best-effort distributed lock via Redis SET NX.

    Not a full Redlock — suitable for single-Redis advisory coordination between
    multiple Uvicorn workers on the same instance. Auto-expires via TTL so a
    crashed worker never holds the lock forever.
    """

    TTL_SECONDS = 15
    POLL_INTERVAL = 0.05  # 50 ms between acquire retries

    def __init__(self, redis_client, key: str, acquire_timeout: float = 10.0) -> None:
        self._client = redis_client
        self._key = key
        self._token = str(uuid.uuid4())
        self._acquire_timeout = acquire_timeout
        self._acquired = False

    async def acquire(self) -> bool:
        deadline = time.monotonic() + self._acquire_timeout
        while time.monotonic() < deadline:
            ok = await asyncio.to_thread(
                self._client.set,
                self._key,
                self._token,
                nx=True,
                ex=self.TTL_SECONDS,
            )
            if ok:
                self._acquired = True
                return True
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            await asyncio.sleep(min(self.POLL_INTERVAL, remaining))
        logger.warning("RedisAdvisoryLock acquire timeout | key=%s", self._key)
        return False

    async def release(self) -> None:
        if not self._acquired:
            return
        try:
            await asyncio.to_thread(
                self._client.eval, _RELEASE_SCRIPT, 1, self._key, self._token
            )
        except Exception as exc:
            logger.warning("RedisAdvisoryLock release failed | key=%s: %s", self._key, exc)
        finally:
            self._acquired = False
