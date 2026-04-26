"""Redis-backed blacklist for refresh token JTIs."""
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


class TokenBlacklist:
    _KEY_PREFIX = "auth:jti:blocked:"

    def __init__(self, redis_client):
        self._r = redis_client

    def _key(self, jti: str) -> str:
        return f"{self._KEY_PREFIX}{jti}"

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
