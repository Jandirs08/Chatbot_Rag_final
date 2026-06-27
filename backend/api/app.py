"""FastAPI application for the chatbot."""
import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from infra.logging_utils import get_logger
from config import settings
from infra.rate_limiter import limiter, retry_after_for_path
from infra.deploy_log import build_full_startup_summary
from storage.pdf_processor_adapter import PDFProcessorAdapter

from .app_logging import _setup_logging_and_warnings
from .app_cors import get_cors_origins_list
from .app_startup import (
    _init_cache,
    _init_rag,
    _init_bot,
    _init_mongodb,
    _init_auth,
    _load_shared_runtime_snapshot,
    _sync_worker_runtime_state,
    _should_sync_runtime_state,
    _refresh_rag_availability_state,
    _ensure_rag_runtime_available,
)

# ---- Routers ----
from .routes.health.health_routes import router as health_router
from .routes.pdf.pdf_routes import router as pdf_router
from .routes.rag.rag_routes import router as rag_router
from .routes.chat.chat_routes import router as chat_router
from .routes.chat.chat_analytics_routes import router as chat_analytics_router
from .routes.chat.chat_export_routes import router as chat_export_router
from .routes.whatsapp.webhook_routes import router as whatsapp_router
from .routes.bot.bot_routes import router as bot_router
from .routes.bot.config_routes import router as bot_config_router
from .bot_config_service import apply_runtime_config
from .routes.assets.assets_routes import router as assets_router
from .routes.users.users_routes import router as users_router
from .routes.inbox.inbox_routes import router as inbox_router
from .routes.dashboard.dashboard_routes import router as dashboard_router
from .routes.debug.debug_routes import router as debug_router
from .auth import router as auth_router
from auth.middleware import AuthenticationMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for setup and teardown."""
    logger = get_logger(__name__)
    logger.debug("Iniciando aplicacion...")

    try:
        s = settings
        app.state.settings = s
        app.state.startup_time = time.time()
        logger.debug("SIMILARITY_THRESHOLD=%s", s.similarity_threshold)
        app.state.startup_bot_is_active = None

        await _init_cache(app, s)

        try:
            from database.mongodb import get_mongodb_client
            try:
                app.state.mongodb_client = get_mongodb_client()
            except Exception as mongo_error:
                app.state.mongodb_client = None
                logger.warning("No se pudo inicializar MongoDB para config dinamica inicial: %s", mongo_error)

            runtime_config, startup_is_active = await _load_shared_runtime_snapshot(
                getattr(app.state, "mongodb_client", None)
            )
            if runtime_config is not None:
                apply_runtime_config(s, runtime_config)
                app.state.last_synced_bot_config = runtime_config
            app.state.startup_bot_is_active = startup_is_active
            logger.debug("Config dinamica aplicada: temperature=%s", s.temperature)
        except Exception as e:
            logger.warning("No se pudo cargar config dinamica inicial: %s", e)

        await _init_rag(app, s)
        await _init_bot(app, s)
        await _init_mongodb(app, s)
        await _init_auth(app, s)

        app.state.pdf_processor = PDFProcessorAdapter(app.state.pdf_file_manager, app.state.vector_store)

        try:
            summary = build_full_startup_summary(app)
            logger.info("\n" + summary)
        except Exception as e:
            logger.warning("No se pudo generar el resumen de deploy: %s", e)

    except Exception as e:
        logger.error("Error fatal durante la inicializacion en lifespan: %s", e, exc_info=True)
        raise

    auto_complete_task = None
    try:
        from services.inbox.auto_complete import auto_complete_loop
        auto_complete_task = asyncio.create_task(
            auto_complete_loop(app.state.mongodb_client)
        )
        app.state.auto_complete_task = auto_complete_task
        logger.info("[AutoComplete] background loop started")
    except Exception as e:
        logger.warning("[AutoComplete] could not start loop: %s", e)

    yield

    logger.info("Cerrando aplicacion y liberando recursos...")
    try:
        if auto_complete_task is not None:
            auto_complete_task.cancel()
            try:
                await auto_complete_task
            except (asyncio.CancelledError, Exception):
                pass

        if hasattr(app.state, "chat_manager"):
            if hasattr(app.state.chat_manager, "close"):
                await app.state.chat_manager.close()
            logger.info("ChatManager cerrado.")

        if hasattr(app.state, "vector_store"):
            if hasattr(app.state.vector_store, "close"):
                await app.state.vector_store.close()
            logger.info("VectorStore cerrado.")

        if hasattr(app.state, "embedding_manager"):
            if hasattr(app.state.embedding_manager, "close"):
                await app.state.embedding_manager.close()
            logger.info("EmbeddingManager cerrado.")

        if hasattr(app.state, "mongodb_client") and app.state.mongodb_client:
            logger.info("Closing persistent MongoDB client...")
            try:
                await app.state.mongodb_client.close()
                logger.info("Persistent MongoDB client closed successfully.")
            except Exception as e:
                logger.error("Error during persistent MongoDB client cleanup: %s", e, exc_info=True)
        else:
            logger.warning("No persistent MongoDB client found in app state to close.")

    except Exception as e:
        logger.error("Error durante la limpieza de recursos: %s", e, exc_info=True)
    finally:
        logger.info("Proceso de limpieza completado.")


def create_app() -> FastAPI:
    """Create the FastAPI application."""
    _setup_logging_and_warnings()
    main_logger = get_logger(__name__)
    main_logger.debug("Creando instancia de FastAPI...")

    if settings.model_type == "OPENAI" and not settings.openai_api_key:
        main_logger.error("Error Critico: OpenAI API key no esta configurada.")
        raise ValueError("OpenAI API key es requerida para el modelo OPENAI.")

    app = FastAPI(
        title=settings.app_title or "LangChain Chatbot API",
        description=settings.app_description or "API for the LangChain chatbot",
        version=settings.app_version or "1.0.0",
        lifespan=lifespan,
    )

    app.state.limiter = limiter

    @app.middleware("http")
    async def sync_runtime_state(request: Request, call_next):
        if not _refresh_rag_availability_state(request.app):
            await _ensure_rag_runtime_available(request.app)
        if _should_sync_runtime_state(request.url.path):
            await _sync_worker_runtime_state(request.app, reload_chain=True)
        return await call_next(request)

    _LOG_SKIP_PATHS = frozenset({
        "/api/v1/health",
        "/api/v1/health/ready",
        "/api/v1/health/cache",
        "/api/v1/internal/status",
        "/api/v1/bot/config/public",
    })
    _LOG_SKIP_PREFIXES = ("/api/v1/chat/history/",)

    def _should_log_request(path: str, status_code: int) -> bool:
        if status_code >= 400:
            return True
        if path in _LOG_SKIP_PATHS:
            return False
        return not any(path.startswith(p) for p in _LOG_SKIP_PREFIXES)

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        from infra.request_id import set_request_id, clear_request_id

        incoming_id = request.headers.get("X-Request-ID")
        request_id = set_request_id(incoming_id)

        start_time = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            clear_request_id()

        process_time_ms = (time.perf_counter() - start_time) * 1000.0
        response.headers["X-Request-ID"] = request_id

        if _should_log_request(request.url.path, response.status_code):
            main_logger.info(
                "%s %s -> %s in %.0fms",
                request.method,
                request.url.path,
                response.status_code,
                process_time_ms,
            )
        return response

    allow_origins_list = get_cors_origins_list()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        expose_headers=["Content-Disposition", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
        max_age=settings.cors_max_age,
    )
    main_logger.debug("CORS configurado para origenes: %s", allow_origins_list)

    if settings.enable_rate_limiting:
        app.add_middleware(SlowAPIMiddleware)

    app.add_middleware(AuthenticationMiddleware)
    main_logger.debug("Middleware de autenticacion configurado.")

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        safe_errors = [
            {"type": e.get("type"), "loc": e.get("loc"), "msg": e.get("msg")}
            for e in exc.errors()
        ]
        main_logger.warning("Error de validacion en %s: %s", request.url.path, safe_errors)
        return JSONResponse(status_code=422, content={"detail": "Solicitud invalida", "errors": safe_errors})

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        main_logger.error("HTTPException: %s", exc.detail)
        if exc.status_code >= 500:
            try:
                import sentry_sdk
                sentry_sdk.capture_exception(exc)
            except Exception:
                pass
        detail = exc.detail
        if settings.environment == "production" and exc.status_code >= 500:
            detail = "Error interno del servidor"
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})

    if settings.enable_rate_limiting:
        @app.exception_handler(RateLimitExceeded)
        async def ratelimit_exception_handler(request: Request, exc: RateLimitExceeded):
            try:
                main_logger.warning("RATE LIMIT EXCEEDED: IP %s en %s", request.client.host, request.url.path)
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
        main_logger.error("Error no controlado: %s", exc, exc_info=True)
        try:
            import sentry_sdk
            with sentry_sdk.new_scope() as scope:
                scope.set_tag("request_id", request.headers.get("X-Request-ID", "unknown"))
                scope.set_tag("path", request.url.path)
                sentry_sdk.capture_exception(exc)
        except Exception:
            pass
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})

    app.include_router(health_router, prefix="/api/v1", tags=["health"])
    app.include_router(auth_router, prefix="/api/v1", tags=["auth"])
    app.include_router(pdf_router, prefix="/api/v1/pdfs", tags=["pdfs"])
    app.include_router(rag_router, prefix="/api/v1/rag", tags=["rag"])
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["chat"])
    app.include_router(chat_analytics_router, prefix="/api/v1/chat", tags=["chat"])
    app.include_router(chat_export_router, prefix="/api/v1/chat", tags=["chat"])
    app.include_router(whatsapp_router, prefix="/api/v1/whatsapp", tags=["whatsapp"])
    app.include_router(bot_router, prefix="/api/v1/bot", tags=["bot"])
    app.include_router(bot_config_router, prefix="/api/v1/bot", tags=["bot"])
    app.include_router(users_router, prefix="/api/v1", tags=["users"])
    app.include_router(assets_router, prefix="/api/v1/assets", tags=["assets"])
    app.include_router(inbox_router, prefix="/api/v1", tags=["inbox"])
    app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["dashboard"])
    app.include_router(debug_router, prefix="/api/v1/debug", tags=["debug"])

    main_logger.debug("Routers registrados.")
    main_logger.debug("Aplicacion FastAPI creada y configurada exitosamente.")

    return app
