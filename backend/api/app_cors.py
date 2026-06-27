"""CORS origin resolution for the FastAPI application."""
from urllib.parse import urlparse

from config import settings
from infra.logging_utils import get_logger


def get_cors_origins_list() -> list:
    main_logger = get_logger(__name__)

    all_origins = []

    if settings.cors_origins:
        if isinstance(settings.cors_origins, str):
            all_origins.extend([o.strip() for o in settings.cors_origins.split(',') if o.strip()])
        elif isinstance(settings.cors_origins, list):
            all_origins.extend(settings.cors_origins)

    if getattr(settings, "client_origin_url", None):
        all_origins.append(settings.client_origin_url)

    if settings.cors_origins_widget:
        all_origins.extend(settings.cors_origins_widget)

    if settings.cors_origins_admin:
        all_origins.extend(settings.cors_origins_admin)

    def _normalize_origin(val: str) -> str:
        try:
            p = urlparse(val.strip())
            if p.scheme and p.netloc:
                return f"{p.scheme}://{p.netloc}"
        except Exception:
            pass
        return val.strip().rstrip('/')

    unique_origins: list = []
    for origin in all_origins:
        norm = _normalize_origin(origin)
        if norm and norm not in unique_origins:
            unique_origins.append(norm)

    if not unique_origins:
        unique_origins = ["*"]

    if settings.environment == "development" and unique_origins == ["*"]:
        unique_origins = ["http://localhost:3000"]

    if settings.environment == "production":
        unique_origins = [o for o in unique_origins if o != "*"]
        if getattr(settings, "client_origin_url", None):
            client_norm = _normalize_origin(settings.client_origin_url)
            if client_norm not in unique_origins:
                unique_origins.insert(0, client_norm)

    if settings.environment == "production" and not unique_origins:
        raise RuntimeError(
            "CORS: No hay origenes permitidos configurados para produccion. "
            "Configure CORS_ORIGINS o CLIENT_ORIGIN_URL antes de iniciar."
        )

    main_logger.debug("CORS Origins configurados: %s", unique_origins)
    main_logger.debug("CORS Widget Origins: %s", settings.cors_origins_widget)
    main_logger.debug("CORS Admin Origins: %s", settings.cors_origins_admin)
    main_logger.debug("CORS Max Age: %s", settings.cors_max_age)

    return unique_origins
