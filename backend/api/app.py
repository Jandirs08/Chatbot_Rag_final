"""FastAPI application for the chatbot."""
import logging
from utils.logging_utils import get_logger
import time
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from contextlib import asynccontextmanager
from pathlib import Path

from config import settings
from chat.manager import ChatManager
from rag.retrieval.retriever import RAGRetriever
from storage.documents import PDFManager

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
    
    main_logger.info(f"CORS Origins configurados: {unique_origins}")
    main_logger.info(f"CORS Widget Origins: {settings.cors_origins_widget}")
    main_logger.info(f"CORS Admin Origins: {settings.cors_origins_admin}")
    main_logger.info(f"CORS Max Age: {settings.cors_max_age}")
    
    return unique_origins

# Importar Routers
from .routes.health.health_routes import router as health_router
from .routes.pdf.pdf_routes import router as pdf_router
from .routes.rag.rag_routes import router as rag_router
from .routes.chat.chat_routes import router as chat_router
from .routes.bot.bot_routes import router as bot_router

# Dependencias para inicializar managers
from core.bot import Bot
from memory import MemoryTypes
from rag.pdf_processor.pdf_loader import PDFContentLoader
from rag.embeddings.embedding_manager import EmbeddingManager
from rag.vector_store.vector_store import VectorStore
from rag.ingestion.ingestor import RAGIngestor

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for setup and teardown."""
    logger = get_logger(__name__)
    logger.info("Iniciando aplicación y configurando recursos...")
    
    try:
        s = settings
        app.state.settings = s

        # Inicializar componentes
        app.state.pdf_file_manager = PDFManager(base_dir=Path(s.pdfs_dir).resolve() if s.pdfs_dir else None)
        logger.info(f"PDFManager inicializado. Directorio de PDFs: {app.state.pdf_file_manager.pdf_dir}")

        app.state.pdf_content_loader = PDFContentLoader(chunk_size=s.chunk_size, chunk_overlap=s.chunk_overlap)
        logger.info(f"PDFContentLoader inicializado con chunk_size={s.chunk_size}, overlap={s.chunk_overlap}")

        app.state.embedding_manager = EmbeddingManager(model_name=s.embedding_model)
        logger.info(f"EmbeddingManager inicializado con modelo: {s.embedding_model}")

        vector_store_path = Path(s.vector_store_path).resolve()
        vector_store_path.mkdir(parents=True, exist_ok=True)
        app.state.vector_store = VectorStore(
            persist_directory=str(vector_store_path),
            embedding_function=app.state.embedding_manager
        )
        logger.info(f"VectorStore inicializado en: {vector_store_path}")

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
            cache=None
        )
        logger.info(f"Instancia de Bot creada con tipo de memoria: {bot_memory_type}")

        app.state.chat_manager = ChatManager(
            bot_instance=app.state.bot_instance,
            rag_retriever_instance=app.state.rag_retriever
        )
        logger.info("ChatManager inicializado.")

        # Inicializar índices MongoDB para optimización de rendimiento
        try:
            from database.mongodb import MongodbClient
            mongodb_client = MongodbClient(s)
            await mongodb_client.ensure_indexes()
            await mongodb_client.close()
            logger.info("🚀 Índices MongoDB inicializados correctamente")
        except Exception as e:
            logger.error(f"⚠️ Error inicializando índices MongoDB: {e}")
            # No fallar la aplicación por esto, solo registrar el error

        # --- PDF Processor para RAG status ---
        class PDFProcessorAdapter:
            def __init__(self, pdf_manager, vector_store):
                self.pdf_manager = pdf_manager
                self.vector_store = vector_store

            async def list_pdfs(self):
                return await self.pdf_manager.list_pdfs()

            def get_vector_store_info(self):
                path = str(self.vector_store.persist_directory)
                exists = self.vector_store.persist_directory.exists()
                size = 0
                if exists:
                    try:
                        size = sum(f.stat().st_size for f in self.vector_store.persist_directory.glob('**/*') if f.is_file())
                    except Exception:
                        pass
                return {"path": path, "exists": exists, "size": size}

            async def clear_pdfs(self):
                return await self.pdf_manager.clear_all_pdfs()

        app.state.pdf_processor = PDFProcessorAdapter(app.state.pdf_file_manager, app.state.vector_store)

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

    except Exception as e:
        logger.error(f"Error durante la limpieza de recursos: {e}", exc_info=True)
    finally:
        logger.info("Proceso de limpieza completado.")

def create_app() -> FastAPI:
    """Create the FastAPI application."""
    logging.basicConfig(
        level=settings.log_level.upper(),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
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

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        
        body = None
        try:
            body = await request.body()
            if body:
                body = body.decode()
        except:
            pass

        main_logger.info(
            f"Request: {request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Time: {process_time:.2f}s - "
            f"Body: {body if body else 'No body'}"
        )
        
        return response

    # Configurar CORS usando la función helper
    allow_origins_list = get_cors_origins_list()
            
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        max_age=settings.cors_max_age,
    )
    main_logger.info(f"CORS configurado para orígenes: {allow_origins_list}")

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

    # Registrar routers
    app.include_router(health_router, prefix="/api/v1", tags=["health"])
    app.include_router(pdf_router, prefix="/api/v1/pdfs", tags=["pdfs"])
    app.include_router(rag_router, prefix="/api/v1/rag", tags=["rag"])
    app.include_router(chat_router, prefix="/api/v1/chat", tags=["chat"])
    app.include_router(bot_router, prefix="/api/v1/bot", tags=["bot"])
    
    main_logger.info("Routers registrados.")
    main_logger.info("Aplicación FastAPI creada y configurada exitosamente.")
    
    return app

# --- Creación de la instancia global de la aplicación --- 
# Esto permite que Uvicorn la encuentre si se ejecuta este archivo directamente (aunque es mejor usar main.py)
# global_app = create_app() # Comentado o eliminado si main.py es el único punto de entrada.