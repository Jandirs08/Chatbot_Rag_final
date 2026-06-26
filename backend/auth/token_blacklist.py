"""Redis-backed blacklist for refresh token JTIs."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_ROTATION_GRACE_SECONDS = 5


class TokenBlacklist:
    _KEY_PREFIX = "auth:jti:blocked:"
    _ROTATION_PREFIX = "auth:jti:rotation:"

    def __init__(self, redis_client):
        self._r = redis_client

    def _key(self, jti: str) -> str:
        return f"{self._KEY_PREFIX}{jti}"

    def _rotation_key(self, jti: str) -> str:
        return f"{self._ROTATION_PREFIX}{jti}"

    async def is_blacklisted(self, jti: str) -> bool:
        try:
            return bool(await self._r.exists(self._key(jti)))
        except Exception as e:
            logger.error("Blacklist check error: %s", e)
            return False  # fail open — don't lock users out on Redis blip

    async def blacklist(self, jti: str, exp: int) -> None:
        """Blacklist jti until its natural expiry (exp is Unix timestamp)."""
        try:
            ttl = max(1, exp - int(datetime.now(timezone.utc).timestamp()))
            await self._r.setex(self._key(jti), ttl, b"1")
        except Exception as e:
            logger.error("Blacklist set error: %s", e)

    async def store_rotation_result(self, old_jti: str, result: dict) -> None:
        """Cache the rotation result for old_jti for a short grace window.

        Handles the browser-cancel race: if the browser cancels the response
        before receiving the new cookies, the next request with the same
        (now-blacklisted) RT gets the same new tokens instead of a 401.
        """
        try:
            await self._r.setex(
                self._rotation_key(old_jti),
                _ROTATION_GRACE_SECONDS,
                json.dumps(result).encode(),
            )
        except Exception as e:
            logger.error("Rotation result store error: %s", e)

    async def get_rotation_result(self, jti: str) -> Optional[dict]:
        """Return cached rotation result if within grace window, else None."""
        try:
            raw = await self._r.get(self._rotation_key(jti))
            if raw is None:
                return None
            return json.loads(raw.decode())
        except Exception as e:
            logger.error("Rotation result fetch error: %s", e)
            return None


async def build_token_blacklist(redis_url: str) -> Optional[TokenBlacklist]:
    """Create a TokenBlacklist from a Redis URL. Returns None if Redis unavailable."""
    try:
        from redis import asyncio as aioredis
        client = aioredis.Redis.from_url(redis_url, decode_responses=False)
        await client.ping()
        return TokenBlacklist(client)
    except Exception as e:
        logger.warning("TokenBlacklist unavailable: %s", e)
        return None
