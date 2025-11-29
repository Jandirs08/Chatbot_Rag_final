from slowapi import Limiter
from slowapi.util import get_remote_address
from config import settings


def _default_limits():
    v = getattr(settings, "global_rate_limit", None)
    return [v] if v else []


limiter = Limiter(
    key_func=get_remote_address,
    default_limits=_default_limits(),
    strategy=getattr(settings, "rate_limit_strategy", None),
    enabled=bool(getattr(settings, "enable_rate_limiting", True)),
    headers_enabled=True,
)


def retry_after_for_path(path: str):
    try:
        v = settings.chat_rate_limit if path.startswith("/api/v1/chat") else settings.global_rate_limit
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

