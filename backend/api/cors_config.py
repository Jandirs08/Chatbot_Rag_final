"""Resolución de orígenes CORS a partir de settings."""
from urllib.parse import urlparse

from utils.logging_utils import get_logger
from config import settings


def _normalize_origin(val: str) -> str:
    try:
        p = urlparse(val.strip())
        if p.scheme and p.netloc:
            return f"{p.scheme}://{p.netloc}"
    except Exception:
        pass
    return val.strip().rstrip('/')


def get_cors_origins_list() -> list:
    """Lista de orígenes CORS permitidos según settings, normalizados y deduplicados."""
    main_logger = get_logger(__name__)

    all_origins: list[str] = []

    if settings.cors_origins:
        if isinstance(settings.cors_origins, str):
            all_origins.extend([origin.strip() for origin in settings.cors_origins.split(',') if origin.strip()])
        elif isinstance(settings.cors_origins, list):
            all_origins.extend(settings.cors_origins)

    if getattr(settings, "client_origin_url", None):
        all_origins.append(settings.client_origin_url)

    if settings.cors_origins_widget:
        all_origins.extend(settings.cors_origins_widget)

    if settings.cors_origins_admin:
        all_origins.extend(settings.cors_origins_admin)

    unique_origins: list[str] = []
    for origin in all_origins:
        norm = _normalize_origin(origin)
        if norm and norm not in unique_origins:
            unique_origins.append(norm)

    if not unique_origins:
        unique_origins = ["*"]

    if settings.environment == "development" and unique_origins == ["*"]:
        unique_origins = ["http://localhost:3000"]

    if settings.environment == "production" and getattr(settings, "client_origin_url", None):
        unique_origins = [_normalize_origin(settings.client_origin_url)]

    main_logger.info(f"CORS Origins configurados: {unique_origins}")
    main_logger.debug(f"CORS Widget Origins: {settings.cors_origins_widget}")
    main_logger.debug(f"CORS Admin Origins: {settings.cors_origins_admin}")
    main_logger.debug(f"CORS Max Age: {settings.cors_max_age}")

    return unique_origins
