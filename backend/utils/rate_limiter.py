import logging

from slowapi import Limiter
from slowapi.util import get_remote_address
from config import settings

_logger = logging.getLogger(__name__)


def _default_limits():
    v = getattr(settings, "global_rate_limit", None)
    return [v] if v else []


def _resolve_storage_uri() -> str:
    """Use Redis as shared storage so limits are coherent across workers.

    Falls back to in-memory only when REDIS_URL is missing (dev/local).
    """
    redis_url = getattr(settings, "redis_url", None)
    if not redis_url:
        return "memory://"
    try:
        url = (
            redis_url.get_secret_value()
            if hasattr(redis_url, "get_secret_value")
            else str(redis_url)
        )
        url = url.strip()
        return url or "memory://"
    except Exception:
        return "memory://"


_storage_uri = _resolve_storage_uri()
if _storage_uri == "memory://":
    _logger.warning(
        "Rate limiter using in-memory storage. Limits are per-worker only — "
        "set REDIS_URL for coherent limits across workers."
    )
else:
    _logger.info("Rate limiter using shared storage: redis")

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=_default_limits(),
    strategy=getattr(settings, "rate_limit_strategy", None),
    enabled=bool(getattr(settings, "enable_rate_limiting", True)),
    headers_enabled=True,
    storage_uri=_storage_uri,
)


def conditional_limit(value: str):
    if not bool(getattr(settings, "enable_rate_limiting", True)):
        def decorator(func):
            return func
        return decorator
    return limiter.limit(value)


def retry_after_for_path(path: str):
    try:
        if path.startswith("/api/v1/chat"):
            v = settings.chat_rate_limit
        elif path.startswith("/api/v1/pdfs/upload"):
            v = settings.pdf_upload_rate_limit
        else:
            v = settings.global_rate_limit
            
        parts = str(v).split("/")
        unit = parts[1].lower() if len(parts) > 1 else "minute"
        if "second" in unit:
            return 1
        if "minute" in unit:
            return 60
        if "hour" in unit:
            return 3600
        if "day" in unit:
            return 86400
        return None
    except Exception:
        return None

