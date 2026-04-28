"""FastAPI application factory.

Orquesta la composición de la app: logging, Sentry, lifespan, middlewares,
exception handlers y routers. La lógica concreta vive en módulos vecinos:
- _logging_setup.py    → logging y banner
- cors_config.py       → resolución de orígenes CORS
- runtime_sync.py      → sincronización entre workers (Mongo+Redis)
- lifespan.py          → arranque y cierre ordenado de recursos
"""
import time

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from utils.logging_utils import get_logger
from config import settings
from utils.rate_limiter import limiter, retry_after_for_path
from auth.middleware import AuthenticationMiddleware

from ._logging_setup import setup_logging_and_warnings, enterprise_banner
from .cors_config import get_cors_origins_list
from .lifespan import lifespan
from .runtime_sync import (
    ensure_rag_runtime_available,
    refresh_rag_availability_state,
    should_sync_runtime_state,
    sync_worker_runtime_state,
)

# Routers
from .routes.health.health_routes import router as health_router
from .routes.pdf.pdf_routes import router as pdf_router
from .routes.rag.rag_routes import router as rag_router
from .routes.chat.chat_routes import router as chat_router
from .routes.whatsapp.webhook_routes import router as whatsapp_router
from .routes.bot.bot_routes import router as bot_router
from .routes.bot.config_routes import router as bot_config_router
from .routes.assets.assets_routes import router as assets_router
from .routes.users.users_routes import router as users_router
from .routes.debug.debug_routes import router as debug_router
from .auth import router as auth_router


def _init_sentry(main_logger) -> None:
    if not getattr(settings, "sentry_dsn", None):
        return
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=getattr(settings, "sentry_traces_sample_rate", 0.1),
        environment=settings.environment,
        release=settings.app_version,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        send_default_pii=False,
    )
    main_logger.info("Sentry initialized (environment=%s)", settings.environment)


def _register_middlewares(app: FastAPI, main_logger) -> None:
    @app.middleware("http")
    async def sync_runtime_state(request: Request, call_next):
        if not refresh_rag_availability_state(request.app):
            await ensure_rag_runtime_available(request.app)
        if should_sync_runtime_state(request.url.path):
            await sync_worker_runtime_state(request.app, reload_chain=True)
        return await call_next(request)

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        from utils.request_context import set_request_id, clear_request_id

        incoming_id = request.headers.get("X-Request-ID")
        request_id = set_request_id(incoming_id)

        start_time = time.time()
        try:
            response = await call_next(request)
        finally:
            clear_request_id()

        process_time = time.time() - start_time
        response.headers["X-Request-ID"] = request_id

        body = None
        try:
            if settings.debug:
                body_bytes = await request.body()
                if body_bytes:
                    try:
                        import json as _json
                        _REDACTED_KEYS = {
                            "password", "token", "api_key", "secret",
                            "new_password", "refresh_token", "access_token",
                        }
                        parsed = _json.loads(body_bytes)
                        if isinstance(parsed, dict):
                            for key in _REDACTED_KEYS:
                                if key in parsed:
                                    parsed[key] = "***"
                        body = _json.dumps(parsed)
                    except Exception:
                        body = body_bytes.decode(errors="ignore")
        except Exception:
            body = None

        main_logger.info(
            f"Request: {request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Time: {process_time:.2f}s - "
            f"Body: {body if body else 'No body'}"
        )

        return response

    allow_origins_list = get_cors_origins_list()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "Content-Disposition",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "Retry-After",
        ],
        max_age=settings.cors_max_age,
    )
    main_logger.debug(f"CORS configurado para orígenes: {allow_origins_list}")

    if settings.enable_rate_limiting:
        app.add_middleware(SlowAPIMiddleware)

    app.add_middleware(AuthenticationMiddleware)
    main_logger.info("Middleware de autenticación configurado.")


def _register_exception_handlers(app: FastAPI, main_logger) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        main_logger.error(f"Error de validación: {exc}")
        return JSONResponse(
            status_code=422,
            content={"detail": "Solicitud inválida", "errors": exc.errors()},
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        main_logger.error(f"HTTPException: {exc.detail}")
        detail = exc.detail
        if settings.environment == "production" and exc.status_code >= 500:
            detail = "Error interno del servidor"
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})

    if settings.enable_rate_limiting:
        @app.exception_handler(RateLimitExceeded)
        async def ratelimit_exception_handler(request: Request, exc: RateLimitExceeded):
            try:
                main_logger.warning(
                    f"⛔ RATE LIMIT EXCEEDED: IP {request.client.host} en {request.url.path}"
                )
            except Exception:
                pass
            retry_after = retry_after_for_path(request.url.path)
            headers = {}
            if retry_after is not None:
                headers["Retry-After"] = str(int(retry_after))
            return JSONResponse(
                status_code=429,
                content={"detail": "Demasiadas peticiones. Calma, cowboy.", "retry_after": retry_after},
                headers=headers,
            )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        main_logger.error(f"Error no controlado: {exc}", exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


def _register_routers(app: FastAPI, main_logger) -> None:
    app.include_router(health_router, prefix="/api/v1", tags=["health"])
    app.include_router(auth_router, prefix="/api/v1", tags=["auth"])
    app.include_router(pdf_router, prefix="/api/v1/pdfs", tags=["pdfs"])
    app.include_router(rag_router, prefix="/api/v1/rag", tags=["rag"])
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["chat"])
    app.include_router(whatsapp_router, prefix="/api/v1/whatsapp", tags=["whatsapp"])
    app.include_router(bot_router, prefix="/api/v1/bot", tags=["bot"])
    app.include_router(bot_config_router, prefix="/api/v1/bot", tags=["bot"])
    app.include_router(users_router, prefix="/api/v1", tags=["users"])
    app.include_router(assets_router, prefix="/api/v1/assets", tags=["assets"])
    app.include_router(debug_router, prefix="/api/v1/debug", tags=["debug"])
    main_logger.info("Routers registrados.")


def create_app() -> FastAPI:
    """Create the FastAPI application."""
    setup_logging_and_warnings()
    main_logger = get_logger(__name__)
    main_logger.info("Creando instancia de FastAPI...")

    _init_sentry(main_logger)

    if settings.model_type == "OPENAI" and not settings.openai_api_key:
        main_logger.error("Error Crítico: OpenAI API key no está configurada.")
        raise ValueError("OpenAI API key es requerida para el modelo OPENAI.")

    app = FastAPI(
        title=settings.app_title or "LangChain Chatbot API",
        description=settings.app_description or "API for the LangChain chatbot",
        version=settings.app_version or "1.0.0",
        lifespan=lifespan,
    )
    main_logger.info(enterprise_banner())

    app.state.limiter = limiter

    _register_middlewares(app, main_logger)
    _register_exception_handlers(app, main_logger)
    _register_routers(app, main_logger)

    main_logger.info("Aplicación FastAPI creada y configurada exitosamente.")
    return app
