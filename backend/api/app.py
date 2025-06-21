"""FastAPI application for the chatbot."""
import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path

from ..config import get_settings, settings
from ..chat.manager import ChatManager
from ..rag.retrieval.retriever import RAGRetriever
from ..storage.documents import PDFManager

# Importar Routers
from .routes.health.health_routes import router as health_router
from .routes.pdf.pdf_routes import router as pdf_router
from .routes.rag.rag_routes import router as rag_router
from .routes.chat.chat_routes import router as chat_router
from .routes.bot.bot_routes import router as bot_router

# Dependencias para inicializar managers
from ..core.bot import Bot
from ..memory import MemoryTypes
from ..rag.pdf_processor.pdf_loader import PDFContentLoader
from ..rag.embeddings.embedding_manager import EmbeddingManager
from ..rag.vector_store.vector_store import VectorStore
from ..rag.ingestion.ingestor import RAGIngestor

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for setup and teardown."""
    logger = logging.getLogger(__name__)
    logger.info("Iniciando aplicación y configurando recursos...")
    
    try:
        s = get_settings()
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
            settings=settings,
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
    main_logger = logging.getLogger(__name__)
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

    # Configurar CORS
    cors_origins_setting = settings.cors_origins
    if cors_origins_setting:
        allow_origins_list = []
        if isinstance(cors_origins_setting, str):
            allow_origins_list = [origin.strip() for origin in cors_origins_setting.split(',') if origin.strip()]
        elif isinstance(cors_origins_setting, list):
            allow_origins_list = cors_origins_setting
        else:
            main_logger.warning(f"cors_origins tiene un tipo inesperado: {type(cors_origins_setting)}. Usando default ['*'].")
            allow_origins_list = ["*"]
    else:
        allow_origins_list = ["*"]
            
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    main_logger.info(f"CORS configurado para orígenes: {allow_origins_list}")

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