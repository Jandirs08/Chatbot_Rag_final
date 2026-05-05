"""Redis-backed blacklist for refresh token JTIs."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_ROTATION_GRACE_SECONDS = 30


class TokenBlacklist:
    _KEY_PREFIX = "auth:jti:blocked:"
    _ROTATION_PREFIX = "auth:jti:rotation:"

    def __init__(self, redis_client):
        self._r = redis_client

    def _key(self, jti: str) -> str:
        return f"{self._KEY_PREFIX}{jti}"

    def _rotation_key(self, jti: str) -> str:
        return f"{self._ROTATION_PREFIX}{jti}"

    def is_blacklisted(self, jti: str) -> bool:
        try:
            return bool(self._r.exists(self._key(jti)))
        except Exception as e:
            logger.error("Blacklist check error: %s", e)
            return False  # fail open — don't lock users out on Redis blip

    def blacklist(self, jti: str, exp: int) -> None:
        """Blacklist jti until its natural expiry (exp is Unix timestamp)."""
        try:
            ttl = max(1, exp - int(datetime.now(timezone.utc).timestamp()))
            self._r.setex(self._key(jti), ttl, b"1")
        except Exception as e:
            logger.error("Blacklist set error: %s", e)

    def store_rotation_result(self, old_jti: str, result: dict) -> None:
        """Cache the rotation result for old_jti for a short grace window.

        Handles the browser-cancel race: if the browser cancels the response
        before receiving the new cookies, the next request with the same
        (now-blacklisted) RT gets the same new tokens instead of a 401.
        """
        try:
            self._r.setex(
                self._rotation_key(old_jti),
                _ROTATION_GRACE_SECONDS,
                json.dumps(result).encode(),
            )
        except Exception as e:
            logger.error("Rotation result store error: %s", e)

    def get_rotation_result(self, jti: str) -> Optional[dict]:
        """Return cached rotation result if within grace window, else None."""
        try:
            raw = self._r.get(self._rotation_key(jti))
            if raw is None:
                return None
            return json.loads(raw.decode())
        except Exception as e:
            logger.error("Rotation result fetch error: %s", e)
            return None


def build_token_blacklist(redis_url: str) -> Optional[TokenBlacklist]:
    """Create a TokenBlacklist from a Redis URL. Returns None if Redis unavailable."""
    try:
        import redis
        client = redis.Redis.from_url(redis_url, decode_responses=False)
        client.ping()
        return TokenBlacklist(client)
    except Exception as e:
        logger.warning("TokenBlacklist unavailable: %s", e)
        return None
