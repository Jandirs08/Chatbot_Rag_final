"""FastAPI application for the chatbot."""

# ---- Builtins ----
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

# ---- Third-party ----
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse

# ---- Internos ----
from utils.logging_utils import get_logger, suppress_cl100k_warnings
from config import settings
from chat.manager import ChatManager
from rag.retrieval.retriever import RAGRetriever
from storage.documents import PDFManager
from database.config_repository import ConfigRepository

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
    
    # Eliminar duplicados manteniendo el orden
    unique_origins = []
    for origin in all_origins:
        if origin not in unique_origins:
            unique_origins.append(origin)
    
    # Si no hay orígenes configurados, usar default
    if not unique_origins:
        unique_origins = ["*"]
    
    # En desarrollo, si está en abierto, restringir por defecto a localhost:3000
    if settings.environment == "development" and unique_origins == ["*"]:
        unique_origins = ["http://localhost:3000"]

    # En producción, si se configuró CLIENT_ORIGIN_URL, forzar su uso explícito
    if settings.environment == "production" and getattr(settings, "client_origin_url", None):
        unique_origins = [settings.client_origin_url]
    
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
from .routes.bot.bot_routes import router as bot_router
from .routes.bot.config_routes import router as bot_config_router
from .routes.users.users_routes import router as users_router
from .auth import router as auth_router
from auth.middleware import AuthenticationMiddleware

# Dependencias para inicializar managers
from core.bot import Bot
from memory import MemoryTypes
from rag.pdf_processor.pdf_loader import PDFContentLoader
from rag.embeddings.embedding_manager import EmbeddingManager
from rag.vector_store.vector_store import VectorStore
from rag.ingestion.ingestor import RAGIngestor
from utils.deploy_log import build_full_startup_summary

# ---- Lifespan ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for setup and teardown."""
    logger = get_logger(__name__)
    logger.info("Iniciando aplicación y configurando recursos...")
    
    try:
        s = settings
        app.state.settings = s
        logger.info(f"SIMILARITY_THRESHOLD={s.similarity_threshold}")

        # Visibilidad del backend de caché activo al inicio
        try:
            from cache.manager import cache
            logger.info(
                f"Cache activo: backend={type(cache.backend).__name__}, ttl={cache.ttl}, max_size={cache.max_size}"
            )
        except Exception as e:
            logger.warning(f"No se pudo determinar el estado del cache en arranque: {e}")

        # Cargar configuración dinámica del bot desde Mongo (si disponible)
        try:
            config_repo = ConfigRepository()
            bot_config = await config_repo.get_config()
            # Sincronizar settings antes de crear el Bot (evitar system_prompt legado)
            # En modo complemento seguro, ignoramos system_prompt persistido y usamos la base del módulo.
            s.system_prompt = None
            if bot_config.temperature is not None:
                s.temperature = bot_config.temperature
            # Asignar nombre y prompt extra para composición en ChainManager
            s.bot_name = bot_config.bot_name
            s.ui_prompt_extra = bot_config.ui_prompt_extra
            logger.info(f"Config dinámica aplicada: temperature={s.temperature} system_prompt_len={len(s.system_prompt or '')}")
        except Exception as e:
            logger.warning(f"No se pudo cargar configuración dinámica inicial: {e}")

        # Inicializar componentes
        app.state.pdf_file_manager = PDFManager(base_dir=Path(s.pdfs_dir).resolve() if s.pdfs_dir else None)
        logger.info(f"PDFManager inicializado. Directorio de PDFs: {app.state.pdf_file_manager.pdf_dir}")

        app.state.pdf_content_loader = PDFContentLoader(
            chunk_size=s.chunk_size,
            chunk_overlap=s.chunk_overlap,
            min_chunk_length=s.min_chunk_length,
        )
        logger.info(
            f"PDFContentLoader inicializado con chunk_size={s.chunk_size}, overlap={s.chunk_overlap}, min_chunk_length={s.min_chunk_length}"
        )

        app.state.embedding_manager = EmbeddingManager(model_name=s.embedding_model)
        logger.info(f"EmbeddingManager inicializado con modelo: {s.embedding_model}")

        app.state.vector_store = VectorStore(
            embedding_function=app.state.embedding_manager,
            distance_strategy=s.distance_strategy,
            cache_enabled=s.enable_cache,
            cache_ttl=s.cache_ttl,
            batch_size=s.batch_size
        )
        logger.info("VectorStore inicializado (Qdrant)")
        logger.info(f"Umbral de similitud configurado: {s.similarity_threshold}")

        app.state.rag_ingestor = RAGIngestor(
            pdf_file_manager=app.state.pdf_file_manager,
            pdf_content_loader=app.state.pdf_content_loader,
            embedding_manager=app.state.embedding_manager,
            vector_store=app.state.vector_store
        )
        logger.info("RAGIngestor inicializado.")

        app.state.rag_retriever = RAGRetriever(
            vector_store=app.state.vector_store,
            embedding_manager=app.state.embedding_manager
        )
        logger.info("RAGRetriever inicializado.")

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
        logger.info(f"Instancia de Bot creada con tipo de memoria: {bot_memory_type}")

        app.state.chat_manager = ChatManager(bot_instance=app.state.bot_instance)

        logger.info("ChatManager inicializado.")

        # Inicializar MongoDB client persistente para middleware de autenticación
        try:
            from database.mongodb import get_mongodb_client
            logger.info("Initializing persistent MongoDB client for application lifespan...")
            app.state.mongodb_client = get_mongodb_client()
            await app.state.mongodb_client.ensure_indexes()
            # Asegurar índices de usuarios (únicos y de estado)
            try:
                await app.state.mongodb_client.ensure_user_indexes()
            except Exception as e_idx:
                logger.warning(f"No se pudieron aplicar índices de usuarios al arranque: {e_idx}")
            logger.info("🚀 Persistent MongoDB client initialized and indexes created successfully")
        except Exception as e:
            logger.error(f"⚠️ Error initializing persistent MongoDB client: {e}", exc_info=True)
            # No fallar la aplicación por esto, solo registrar el error

        # --- PDF Processor para RAG status ---
        class PDFProcessorAdapter:
            def __init__(self, pdf_manager, vector_store):
                self.pdf_manager = pdf_manager
                self.vector_store = vector_store

            async def list_pdfs(self):
                return await self.pdf_manager.list_pdfs()

            def get_vector_store_info(self):
                url = settings.qdrant_url
                count = 0
                try:
                    c = self.vector_store.client.count(collection_name="rag_collection")
                    count = int(getattr(c, "count", 0))
                except Exception:
                    count = 0
                return {"url": url, "collection": "rag_collection", "count": count}

            async def clear_pdfs(self):
                return await self.pdf_manager.clear_all_pdfs()

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

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        
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
        expose_headers=["Content-Disposition"],
        max_age=settings.cors_max_age,
    )
    # Evitar duplicar logs de CORS; el detalle ya se muestra en get_cors_origins_list
    main_logger.debug(f"CORS configurado para orígenes: {allow_origins_list}")

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
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

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
    app.include_router(bot_router, prefix="/api/v1/bot", tags=["bot"])
    app.include_router(bot_config_router, prefix="/api/v1/bot", tags=["bot"])
    app.include_router(users_router, prefix="/api/v1", tags=["users"])
    
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