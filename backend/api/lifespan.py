"""Lifespan FastAPI: arranque y cierre ordenado de recursos.

Concentrado aquí para mantener app.py como factory delgada. Cualquier dependencia
nueva (cliente externo, manager) debe inicializarse aquí en `app.state` y cerrarse
en el bloque post-yield.
"""
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from utils.logging_utils import get_logger
from config import settings
from cache.manager import cache
from chat.manager import ChatManager
from rag.retrieval import HierarchicalRetriever
from rag.retrieval.reranker import build_parent_reranker
from rag.embeddings.embedding_manager import EmbeddingManager
from rag.vector_store.vector_store import VectorStore
from rag.ingestion.hierarchical_chunker import HierarchicalChunker
from rag.ingestion.hierarchical_ingestion_service import HierarchicalIngestionService
from storage.documents import PDFManager
from storage.pdf_processor_adapter import PDFProcessorAdapter
from database import RAGChildLexicalRepository, RAGParentDocumentRepository
from database.whatsapp_session_repository import WhatsAppSessionRepository
from core.bot import Bot
from memory import MemoryTypes
from utils.deploy_log import build_full_startup_summary

from .routes.bot.config_routes import (
    apply_runtime_config,
    build_runtime_config_payload,
)
from .runtime_sync import load_shared_runtime_snapshot


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Setup/teardown de la aplicación."""
    logger = get_logger(__name__)
    logger.debug("Iniciando aplicación...")

    try:
        s = settings
        app.state.settings = s
        app.state.startup_time = time.time()
        logger.info(f"SIMILARITY_THRESHOLD={s.similarity_threshold}")
        app.state.startup_bot_is_active = None

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

        if s.environment.lower() == "production" and (not getattr(s, "mongo_uri", None)):
            raise RuntimeError(
                "MONGO_URI es obligatorio en producción. Configure la variable de entorno MONGO_URI antes de iniciar."
            )

        # Cargar configuración dinámica del bot desde Mongo (si disponible)
        try:
            from database.mongodb import get_mongodb_client
            try:
                app.state.mongodb_client = get_mongodb_client()
            except Exception as mongo_error:
                app.state.mongodb_client = None
                logger.warning(f"No se pudo inicializar MongoDB para configuración dinámica inicial: {mongo_error}")

            runtime_config, startup_is_active = await load_shared_runtime_snapshot(
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
            rag_retriever=app.state.rag_retriever,
        )
        if app.state.startup_bot_is_active is not None:
            app.state.bot_instance.is_active = app.state.startup_bot_is_active
        app.state.last_synced_bot_config = build_runtime_config_payload(app.state.settings)
        app.state.last_synced_bot_is_active = app.state.bot_instance.is_active
        logger.info(f"Instancia de Bot creada con tipo de memoria: {bot_memory_type}")

        app.state.chat_manager = ChatManager(bot_instance=app.state.bot_instance)
        logger.info("ChatManager inicializado.")

        # MongoDB persistente + índices + pipeline RAG jerárquico
        try:
            from database.mongodb import get_mongodb_client
            logger.info("Initializing persistent MongoDB client for application lifespan...")
            if not getattr(app.state, "mongodb_client", None):
                app.state.mongodb_client = get_mongodb_client()
            await app.state.mongodb_client.client.admin.command("ping")
            await app.state.mongodb_client.ensure_indexes()
            logger.debug(f"[DB] MongoDB client id={id(app.state.mongodb_client)}")
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
            if s.environment.lower() == "production":
                raise RuntimeError(f"MongoDB no disponible en producción: {e}") from e

        try:
            from auth.token_blacklist import build_token_blacklist
            redis_url = (
                s.redis_url.get_secret_value()
                if hasattr(s.redis_url, "get_secret_value")
                else str(s.redis_url)
            )
            app.state.token_blacklist = build_token_blacklist(redis_url)
            if app.state.token_blacklist:
                logger.info("TokenBlacklist inicializado (Redis).")
            else:
                logger.warning("TokenBlacklist no disponible — revocación de tokens desactivada.")
        except Exception as e:
            logger.warning(f"TokenBlacklist init error: {e}")
            app.state.token_blacklist = None

        try:
            from auth.dependencies import AuthDependencies
            from database.user_repository import get_user_repository

            user_repo = get_user_repository()
            app.state.auth_deps = AuthDependencies(
                user_repo,
                token_blacklist=app.state.token_blacklist,
            )
            logger.info("AuthDependencies inicializado correctamente en app.state.")
        except Exception as e:
            logger.error(f"Error inicializando AuthDependencies: {e}", exc_info=True)
            raise

        app.state.pdf_processor = PDFProcessorAdapter(app.state.pdf_file_manager, app.state.vector_store)

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
        if hasattr(app.state, 'chat_manager'):
            if hasattr(app.state.chat_manager, 'close'):
                await app.state.chat_manager.close()
            logger.info("ChatManager cerrado.")

        if hasattr(app.state, 'vector_store'):
            if hasattr(app.state.vector_store, 'close'):
                await app.state.vector_store.close()
            logger.info("VectorStore cerrado.")

        if hasattr(app.state, 'embedding_manager'):
            if hasattr(app.state.embedding_manager, 'close'):
                await app.state.embedding_manager.close()
            logger.info("EmbeddingManager cerrado.")

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
