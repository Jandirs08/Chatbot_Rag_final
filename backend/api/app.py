"""FastAPI application for the chatbot."""

# ---- Builtins ----
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

# ---- Third-party ----
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# ---- Internos ----
from utils.logging_utils import get_logger, suppress_cl100k_warnings
from config import settings
from utils.rate_limiter import limiter, retry_after_for_path
from chat.manager import ChatManager
from rag.retrieval import HierarchicalRetriever
from rag.retrieval.reranker import build_parent_reranker
from storage.documents import PDFManager
from database.config_repository import ConfigRepository
from database import RAGChildLexicalRepository, RAGParentDocumentRepository
from database.whatsapp_session_repository import WhatsAppSessionRepository

# ---- Logging Setup ----
def _setup_logging_and_warnings() -> None:
    """Configura logging y suprime warnings ruidosos sin afectar la lógica."""
    logging.basicConfig(
        level=settings.log_level.upper(),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    try:
        suppress_cl100k_warnings()
    except Exception:
        pass
    try:
        import warnings
        warnings.filterwarnings("ignore", category=DeprecationWarning, module="langchain._api.module_import")
        warnings.filterwarnings("ignore", message=r".*cl100k_base.*", category=Warning)
        warnings.filterwarnings("ignore", message=r".*model not found.*cl100k_base.*", category=Warning)
        warnings.filterwarnings("ignore", module="langchain_openai.embeddings.base")
        warnings.filterwarnings("ignore", module="tiktoken")
        logging.getLogger("pymongo").setLevel(logging.WARNING)
        logging.getLogger("motor").setLevel(logging.WARNING)
        logging.getLogger("uvicorn").setLevel(logging.INFO)
        logging.getLogger("uvicorn.error").setLevel(logging.INFO)
        logging.getLogger("uvicorn.access").setLevel(logging.INFO)
        logging.getLogger("watchfiles").setLevel(logging.WARNING)
        logging.getLogger("langchain").setLevel(logging.WARNING)
        logging.getLogger("langchain_core").setLevel(logging.WARNING)
        logging.getLogger("langchain_openai").setLevel(logging.WARNING)
        # Suprimir específicamente el warning de "model not found" de embeddings
        logging.getLogger("langchain_openai.embeddings.base").setLevel(logging.ERROR)
        logging.getLogger("langchain_community").setLevel(logging.WARNING)
        logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
        logging.getLogger("urllib3").setLevel(logging.WARNING)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        logging.getLogger("qdrant_client.http").setLevel(logging.WARNING)
    except Exception:
        pass

def get_cors_origins_list() -> list:
    """
    Obtiene la lista de orígenes CORS permitidos basada en la configuración.
    
    Returns:
        Lista de orígenes CORS permitidos
    """
    main_logger = get_logger(__name__)
    
    # Combinar todas las configuraciones CORS
    all_origins = []
    
    # Agregar orígenes generales
    if settings.cors_origins:
        if isinstance(settings.cors_origins, str):
            all_origins.extend([origin.strip() for origin in settings.cors_origins.split(',') if origin.strip()])
        elif isinstance(settings.cors_origins, list):
            all_origins.extend(settings.cors_origins)

    # Agregar origen explícito del cliente si está configurado (Vercel)
    if getattr(settings, "client_origin_url", None):
        all_origins.append(settings.client_origin_url)
    
    # Agregar orígenes específicos del widget
    if settings.cors_origins_widget:
        all_origins.extend(settings.cors_origins_widget)
    
    # Agregar orígenes específicos del admin
    if settings.cors_origins_admin:
        all_origins.extend(settings.cors_origins_admin)
    
    # Normalizar y eliminar duplicados manteniendo el orden
    def _normalize_origin(val: str) -> str:
        try:
            # Intentar extraer sólo esquema+host(+puerto)
            from urllib.parse import urlparse
            p = urlparse(val.strip())
            if p.scheme and p.netloc:
                return f"{p.scheme}://{p.netloc}"
        except Exception:
            pass
        # Fallback: quitar barras finales y espacios
        return val.strip().rstrip('/')

    unique_origins = []
    for origin in all_origins:
        norm = _normalize_origin(origin)
        if norm and norm not in unique_origins:
            unique_origins.append(norm)
    
    # Si no hay orígenes configurados, usar default
    if not unique_origins:
        unique_origins = ["*"]
    
    # En desarrollo, si está en abierto, restringir por defecto a localhost:3000
    if settings.environment == "development" and unique_origins == ["*"]:
        unique_origins = ["http://localhost:3000"]

    # En producción, si se configuró CLIENT_ORIGIN_URL, forzar su uso explícito
    if settings.environment == "production" and getattr(settings, "client_origin_url", None):
        unique_origins = [_normalize_origin(settings.client_origin_url)]
    
    # Consolidar logs de CORS para reducir redundancia en consola
    main_logger.info(f"CORS Origins configurados: {unique_origins}")
    main_logger.debug(f"CORS Widget Origins: {settings.cors_origins_widget}")
    main_logger.debug(f"CORS Admin Origins: {settings.cors_origins_admin}")
    main_logger.debug(f"CORS Max Age: {settings.cors_max_age}")
    
    return unique_origins

# ---- Routers (import) ----
from .routes.health.health_routes import router as health_router
from .routes.pdf.pdf_routes import router as pdf_router
from .routes.rag.rag_routes import router as rag_router
from .routes.chat.chat_routes import router as chat_router
from .routes.whatsapp.webhook_routes import router as whatsapp_router
from .routes.bot.bot_routes import router as bot_router
from .routes.bot.config_routes import (
    router as bot_config_router,
    apply_runtime_config,
    build_runtime_config_payload,
    read_runtime_config_from_cache,
    write_runtime_config_to_cache,
)
from .routes.assets.assets_routes import router as assets_router
from .routes.users.users_routes import router as users_router
from .auth import router as auth_router
from auth.middleware import AuthenticationMiddleware

# Dependencias para inicializar managers
from core.bot import Bot
from memory import MemoryTypes
from rag.embeddings.embedding_manager import EmbeddingManager
from rag.vector_store.vector_store import VectorStore
from rag.ingestion.hierarchical_chunker import HierarchicalChunker
from rag.ingestion.hierarchical_ingestion_service import HierarchicalIngestionService
from utils.deploy_log import build_full_startup_summary
from storage.pdf_processor_adapter import PDFProcessorAdapter
from cache.manager import cache

BOT_CONFIG_COLLECTION = "bot_config"
BOT_CONFIG_DOC_ID = "default"
BOT_IS_ACTIVE_CACHE_KEY = "bot:is_active"
RUNTIME_SYNC_PATH_PREFIXES = ("/api/v1/bot", "/api/v1/chat", "/api/v1/whatsapp")


def _redis_coordination_available() -> bool:
    try:
        return bool(cache.get_health_status().get("redis_connected"))
    except Exception:
        return False


def _normalize_is_active(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return None


def _read_bot_is_active_from_cache() -> bool | None:
    if not _redis_coordination_available():
        return None

    try:
        return _normalize_is_active(cache.get(BOT_IS_ACTIVE_CACHE_KEY))
    except Exception:
        return None


def _write_bot_is_active_to_cache(value: bool) -> None:
    if not _redis_coordination_available():
        return

    try:
        cache.set(BOT_IS_ACTIVE_CACHE_KEY, bool(value), ttl=0)
    except Exception:
        pass


async def _read_bot_is_active_from_mongo(mongo_client) -> bool | None:
    try:
        if mongo_client is None:
            return None

        doc = await mongo_client.db.get_collection(BOT_CONFIG_COLLECTION).find_one(
            {"_id": BOT_CONFIG_DOC_ID},
            {"is_active": 1},
        )
        if not doc:
            return None

        return _normalize_is_active(doc.get("is_active"))
    except Exception:
        return None


async def _read_runtime_config_from_mongo(mongo_client) -> dict | None:
    try:
        if mongo_client is None:
            return None

        repo = ConfigRepository(mongo=mongo_client)
        config = await repo.get_config()
        return build_runtime_config_payload(config)
    except Exception:
        return None


async def _load_shared_runtime_snapshot(mongo_client) -> tuple[dict | None, bool | None]:
    runtime_config = read_runtime_config_from_cache()
    if runtime_config is None:
        runtime_config = await _read_runtime_config_from_mongo(mongo_client)
        if runtime_config is not None:
            write_runtime_config_to_cache(runtime_config)

    is_active = _read_bot_is_active_from_cache()
    if is_active is None:
        is_active = await _read_bot_is_active_from_mongo(mongo_client)
        if is_active is not None:
            _write_bot_is_active_to_cache(is_active)

    return runtime_config, is_active


def _apply_shared_runtime_snapshot(app: FastAPI, runtime_config: dict | None, is_active: bool | None, *, reload_chain: bool) -> None:
    config_changed = False

    if runtime_config is not None and getattr(app.state, "settings", None) is not None:
        current_config = getattr(app.state, "last_synced_bot_config", None)
        if current_config != runtime_config:
            config_changed = apply_runtime_config(app.state.settings, runtime_config)
            app.state.last_synced_bot_config = runtime_config

    bot = getattr(app.state, "bot_instance", None)
    if bot is not None and is_active is not None and bot.is_active != is_active:
        bot.is_active = is_active

    if is_active is not None:
        app.state.last_synced_bot_is_active = is_active

    if reload_chain and config_changed and bot is not None:
        try:
            bot.reload_chain(app.state.settings)
        except Exception as e:
            get_logger(__name__).error(f"Error recargando chain desde estado compartido: {e}", exc_info=True)


async def _sync_worker_runtime_state(app: FastAPI, *, reload_chain: bool) -> None:
    mongo_client = getattr(app.state, "mongodb_client", None)
    runtime_config, is_active = await _load_shared_runtime_snapshot(mongo_client)
    _apply_shared_runtime_snapshot(app, runtime_config, is_active, reload_chain=reload_chain)


def _should_sync_runtime_state(path: str) -> bool:
    return path.startswith(RUNTIME_SYNC_PATH_PREFIXES)


def _refresh_rag_availability_state(app: FastAPI) -> bool:
    vector_store = getattr(app.state, "vector_store", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    rag_ingestor = getattr(app.state, "rag_ingestor", None)
    rag_available = bool(
        vector_store is not None
        and getattr(vector_store, "is_available", False)
        and rag_retriever is not None
        and rag_ingestor is not None
    )
    app.state.rag_available = rag_available
    return rag_available


async def _ensure_rag_runtime_available(app: FastAPI) -> bool:
    vector_store = getattr(app.state, "vector_store", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    rag_ingestor = getattr(app.state, "rag_ingestor", None)
    if vector_store is None or rag_retriever is None or rag_ingestor is None:
        app.state.rag_available = False
        return False

    if getattr(vector_store, "is_available", False):
        app.state.rag_available = True
        return True

    try:
        reconnected = await asyncio.to_thread(vector_store.ensure_connected)
    except Exception as exc:
        get_logger(__name__).warning("Intento de reconexión a Qdrant falló: %s", exc, exc_info=True)
        reconnected = False

    app.state.rag_available = bool(reconnected)
    if reconnected:
        get_logger(__name__).warning("Qdrant volvió a estar disponible. RAG reactivado en runtime.")
    return bool(reconnected)

# ---- Lifespan ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for setup and teardown."""
    logger = get_logger(__name__)
    logger.debug("Iniciando aplicación...")
    
    try:
        s = settings
        app.state.settings = s
        logger.info(f"SIMILARITY_THRESHOLD={s.similarity_threshold}")
        app.state.startup_bot_is_active = None

        # Visibilidad del backend de caché activo al inicio
        try:
            logger.info(
                f"Cache activo: backend={type(cache.backend).__name__}, ttl={cache.ttl}, max_size={cache.max_size}"
            )
        except Exception as e:
            logger.warning(f"No se pudo determinar el estado del cache en arranque: {e}")

        try:
            cache_health = cache.get_health_status()
        except Exception as cache_error:
            cache_health = {
                "backend_type": "unknown",
                "is_degraded": True,
                "redis_connected": False,
                "message": f"Cache health unavailable: {cache_error}",
            }

        if s.environment.lower() == "production" and not bool(cache_health.get("redis_connected")):
            raise RuntimeError(
                "Redis es obligatorio en producción. El backend detectó que CacheManager está en modo degradado "
                f"({cache_health.get('backend_type')}). Configure REDIS_URL y restaure la conectividad antes de iniciar."
            )

        # Cargar configuración dinámica del bot desde Mongo (si disponible)
        try:
            from database.mongodb import get_mongodb_client
            try:
                app.state.mongodb_client = get_mongodb_client()
            except Exception as mongo_error:
                app.state.mongodb_client = None
                logger.warning(f"No se pudo inicializar MongoDB para configuración dinámica inicial: {mongo_error}")

            runtime_config, startup_is_active = await _load_shared_runtime_snapshot(
                getattr(app.state, "mongodb_client", None)
            )
            if runtime_config is not None:
                apply_runtime_config(s, runtime_config)
                app.state.last_synced_bot_config = runtime_config
            app.state.startup_bot_is_active = startup_is_active
            logger.info(f"Config dinámica aplicada: temperature={s.temperature}")
        except Exception as e:
            logger.warning(f"No se pudo cargar configuración dinámica inicial: {e}")

        # Inicializar componentes
        app.state.pdf_file_manager = PDFManager(base_dir=Path(s.pdfs_dir).resolve() if s.pdfs_dir else None)

        app.state.embedding_manager = EmbeddingManager(model_name=s.embedding_model)

        app.state.vector_store = VectorStore(
            embedding_function=app.state.embedding_manager,
            distance_strategy=s.distance_strategy,
            cache_enabled=s.enable_cache,
            cache_ttl=s.cache_ttl,
            batch_size=s.batch_size,
            collection_name=s.rag_child_collection_name,
        )
        app.state.rag_available = bool(getattr(app.state.vector_store, "is_available", False))
        if app.state.rag_available:
            logger.debug("VectorStore inicializado (Qdrant)")
        else:
            logger.critical("Qdrant no disponible al arranque. La aplicación continuará sin contexto RAG.")

        app.state.rag_ingestor = None
        app.state.rag_retriever = None
        app.state.rag_parent_repository = None
        app.state.rag_child_lexical_repository = None
        app.state.hierarchical_chunker = None

        # Ping ligero de embeddings para visibilidad (sin bloquear arranque si falla)
        try:
            emb = await app.state.embedding_manager.embed_text("ping")
            emb_ok = bool(emb and isinstance(emb, list) and len(emb) > 0)
            logger.info(f"✅ Ping Embeddings: {'OK' if emb_ok else 'Fallback vector'}")
        except Exception as e:
            logger.warning(f"⚠️ Ping Embeddings falló: {e}")

        bot_memory_type = MemoryTypes.BASE_MEMORY
        if s.memory_type:
            try:
                bot_memory_type = MemoryTypes[s.memory_type.upper()]
            except KeyError:
                logger.warning(f"Tipo de memoria '{s.memory_type}' no válido en settings. Usando BASE_MEMORY.")

        app.state.bot_instance = Bot(
            settings=s,
            memory_type=bot_memory_type,
            memory_kwargs={"conversation_id": "default_session"},
            cache=None,
            model_type=None,
            rag_retriever=app.state.rag_retriever
        )
        if app.state.startup_bot_is_active is not None:
            app.state.bot_instance.is_active = app.state.startup_bot_is_active
        app.state.last_synced_bot_config = build_runtime_config_payload(app.state.settings)
        app.state.last_synced_bot_is_active = app.state.bot_instance.is_active
        logger.info(f"Instancia de Bot creada con tipo de memoria: {bot_memory_type}")

        app.state.chat_manager = ChatManager(bot_instance=app.state.bot_instance)

        logger.info("ChatManager inicializado.")

        # Inicializar MongoDB client persistente para middleware de autenticación
        try:
            from database.mongodb import get_mongodb_client
            logger.info("Initializing persistent MongoDB client for application lifespan...")
            if not getattr(app.state, "mongodb_client", None):
                app.state.mongodb_client = get_mongodb_client()
            await app.state.mongodb_client.ensure_indexes()
            logger.debug(f"[DB] MongoDB client id={id(app.state.mongodb_client)}")
            # Asegurar índices de usuarios (únicos y de estado)
            try:
                await app.state.mongodb_client.ensure_user_indexes()
            except Exception as e_idx:
                logger.warning(f"No se pudieron aplicar índices de usuarios al arranque: {e_idx}")
            try:
                wa_repo = WhatsAppSessionRepository(app.state.mongodb_client)
                await wa_repo.ensure_indexes()
            except Exception as e_idx:
                logger.warning(f"No se pudieron aplicar índices de whatsapp_sessions al arranque: {e_idx}")
            try:
                app.state.rag_parent_repository = RAGParentDocumentRepository(
                    mongodb_client=app.state.mongodb_client,
                    collection_name=s.rag_parent_collection_name,
                )
                await app.state.rag_parent_repository.ensure_indexes()
                app.state.rag_child_lexical_repository = RAGChildLexicalRepository(
                    mongodb_client=app.state.mongodb_client,
                    documents_collection_name=s.rag_child_lexical_collection_name,
                    postings_collection_name=s.rag_child_lexical_postings_collection_name,
                )
                await app.state.rag_child_lexical_repository.ensure_indexes()
                app.state.hierarchical_chunker = HierarchicalChunker()
                app.state.rag_ingestor = HierarchicalIngestionService(
                    chunker=app.state.hierarchical_chunker,
                    parent_repository=app.state.rag_parent_repository,
                    embedding_manager=app.state.embedding_manager,
                    vector_store=app.state.vector_store,
                    lexical_repository=app.state.rag_child_lexical_repository,
                )
                app.state.rag_retriever = HierarchicalRetriever(
                    child_vector_store=app.state.vector_store,
                    parent_repository=app.state.rag_parent_repository,
                    embedding_manager=app.state.embedding_manager,
                    lexical_repository=app.state.rag_child_lexical_repository,
                    reranker=build_parent_reranker(),
                    child_fetch_multiplier=getattr(s, "retrieval_k_multiplier", 3),
                    cache_enabled=s.enable_cache,
                )
                app.state.bot_instance.rag_retriever = app.state.rag_retriever
            except Exception as e_idx:
                app.state.rag_parent_repository = None
                app.state.rag_child_lexical_repository = None
                app.state.hierarchical_chunker = None
                app.state.rag_ingestor = None
                app.state.rag_retriever = None
                logger.warning(f"No se pudo inicializar el pipeline RAG jerarquico al arranque: {e_idx}")
            logger.info("🚀 Persistent MongoDB client initialized and indexes created successfully")
        except Exception as e:
            logger.error(f"⚠️ Error initializing persistent MongoDB client: {e}", exc_info=True)
            # No fallar la aplicación por esto, solo registrar el error
        try:
            from auth.dependencies import AuthDependencies
            from database.user_repository import get_user_repository
            
            user_repo = get_user_repository()
            app.state.auth_deps = AuthDependencies(user_repo)
            logger.info("AuthDependencies inicializado correctamente en app.state.")
        except Exception as e:
            logger.error(f"Error inicializando AuthDependencies: {e}", exc_info=True)
            raise
        # --- PDF Processor para RAG status ---
        app.state.pdf_processor = PDFProcessorAdapter(app.state.pdf_file_manager, app.state.vector_store)

        # Resumen de deploy del backend (Enterprise Clean Mode)
        try:
            summary = build_full_startup_summary(app)
            logger.info("\n" + summary)
        except Exception as e:
            logger.warning(f"No se pudo generar el resumen de deploy: {e}")

    except Exception as e:
        logger.error(f"Error fatal durante la inicialización en lifespan: {e}", exc_info=True)
        raise

    yield
    
    logger.info("Cerrando aplicación y liberando recursos...")
    try:
        # Cerrar ChatManager
        if hasattr(app.state, 'chat_manager'):
            if hasattr(app.state.chat_manager, 'close'):
                await app.state.chat_manager.close()
            logger.info("ChatManager cerrado.")

        # Cerrar VectorStore
        if hasattr(app.state, 'vector_store'):
            if hasattr(app.state.vector_store, 'close'):
                await app.state.vector_store.close()
            logger.info("VectorStore cerrado.")

        # Cerrar EmbeddingManager
        if hasattr(app.state, 'embedding_manager'):
            if hasattr(app.state.embedding_manager, 'close'):
                await app.state.embedding_manager.close()
            logger.info("EmbeddingManager cerrado.")

        # Cerrar MongoDB client
        if hasattr(app.state, 'mongodb_client') and app.state.mongodb_client:
            logger.info("Closing persistent MongoDB client...")
            try:
                await app.state.mongodb_client.close()
                logger.info("Persistent MongoDB client closed successfully.")
            except Exception as e:
                logger.error(f"Error during persistent MongoDB client cleanup: {e}", exc_info=True)
        else:
            logger.warning("No persistent MongoDB client found in app state to close.")

    except Exception as e:
        logger.error(f"Error durante la limpieza de recursos: {e}", exc_info=True)
    finally:
        logger.info("Proceso de limpieza completado.")

def create_app() -> FastAPI:
    """Create the FastAPI application."""
    _setup_logging_and_warnings()
    main_logger = get_logger(__name__)
    main_logger.info("Creando instancia de FastAPI...")

    if settings.model_type == "OPENAI" and not settings.openai_api_key:
        main_logger.error("Error Crítico: OpenAI API key no está configurada.")
        raise ValueError("OpenAI API key es requerida para el modelo OPENAI.")
    
    app = FastAPI(
        title=settings.app_title or "LangChain Chatbot API",
        description=settings.app_description or "API for the LangChain chatbot",
        version=settings.app_version or "1.0.0",
        lifespan=lifespan
    )
    main_logger.info(enterprise_banner())

    app.state.limiter = limiter

    @app.middleware("http")
    async def sync_runtime_state(request: Request, call_next):
        if not _refresh_rag_availability_state(request.app):
            await _ensure_rag_runtime_available(request.app)
        if _should_sync_runtime_state(request.url.path):
            await _sync_worker_runtime_state(request.app, reload_chain=True)
        return await call_next(request)

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        from utils.request_context import set_request_id, clear_request_id, get_request_id
        
        # Generar o reutilizar request_id del header entrante
        incoming_id = request.headers.get("X-Request-ID")
        request_id = set_request_id(incoming_id)
        
        start_time = time.time()
        try:
            response = await call_next(request)
        finally:
            # Limpiar contexto después del request
            clear_request_id()
        
        process_time = time.time() - start_time
        
        # Agregar request_id al header de respuesta para trazabilidad
        response.headers["X-Request-ID"] = request_id
        
        body = None
        try:
            # Solo loguear el body en modo debug para evitar ruido y posibles datos sensibles
            if settings.debug:
                body_bytes = await request.body()
                if body_bytes:
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

    # ---- CORS ----
    # Configurar CORS usando la función helper
    allow_origins_list = get_cors_origins_list()
            
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
        max_age=settings.cors_max_age,
    )
    # Evitar duplicar logs de CORS; el detalle ya se muestra en get_cors_origins_list
    main_logger.debug(f"CORS configurado para orígenes: {allow_origins_list}")

    if settings.enable_rate_limiting:
        app.add_middleware(SlowAPIMiddleware)

    # ---- Middleware ----
    # Agregar middleware de autenticación (se inicializará con MongoDB client en lifespan)
    app.add_middleware(AuthenticationMiddleware)
    main_logger.info("Middleware de autenticación configurado.")

    # ---- Exception Handlers ----
    # Handlers globales de excepciones
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        main_logger.error(f"Error de validación: {exc}")
        return JSONResponse(status_code=422, content={"detail": "Solicitud inválida", "errors": exc.errors()})

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        main_logger.error(f"HTTPException: {exc.detail}")
        
        # Sanitizar errores 5xx en producción para no exponer detalles técnicos
        detail = exc.detail
        if settings.environment == "production" and exc.status_code >= 500:
            # En producción, usar mensaje genérico para errores de servidor
            detail = "Error interno del servidor"
        
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})

    if settings.enable_rate_limiting:
        @app.exception_handler(RateLimitExceeded)
        async def ratelimit_exception_handler(request: Request, exc: RateLimitExceeded):
            try:
                main_logger.warning(f"⛔ RATE LIMIT EXCEEDED: IP {request.client.host} en {request.url.path}")
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

    # ---- Routers ----
    # Registrar routers
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
    
    main_logger.info("Routers registrados.")
    main_logger.info("Aplicación FastAPI creada y configurada exitosamente.")
    
    return app

# --- Creación de la instancia global de la aplicación --- 
# Esto permite que Uvicorn la encuentre si se ejecuta este archivo directamente (aunque es mejor usar main.py)

def enterprise_banner() -> str:
    """Banner limpio estilo enterprise para el arranque (una sola vez)."""
    sep = "-" * 68
    return (
        f"\n{sep}\n"
        f"  FASTAPI BACKEND INITIALIZED | Version {settings.app_version} | Env: {settings.environment}\n"
        f"{sep}"
    )
