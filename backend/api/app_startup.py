"""Application startup helpers: service init and runtime state sync."""
import asyncio
from pathlib import Path

from fastapi import FastAPI

from infra.logging_utils import get_logger
from cache.manager import cache
from chat.manager import ChatManager
from chat.memory import MemoryTypes
from core.bot import Bot
from core.tools import bootstrap_tools, registry as tool_registry
from database import RAGChildLexicalRepository, RAGParentDocumentRepository
from database.bot_state_repo import (
    build_runtime_config_payload,
    read_is_active_from_mongo,
    read_is_active_from_redis,
    read_runtime_config_from_mongo,
    write_is_active_to_redis,
)
from database.whatsapp_session_repository import WhatsAppSessionRepository
from rag.embeddings.embedding_manager import EmbeddingManager
from rag.ingestion.hierarchical_chunker import HierarchicalChunker
from rag.ingestion.hierarchical_ingestion_service import HierarchicalIngestionService
from rag.retrieval import HierarchicalRetriever
from rag.retrieval.reranker import build_parent_reranker
from rag.vector_store.vector_store import VectorStore
from storage.documents import PDFManager
from .routes.bot.config_routes import (
    apply_runtime_config,
    read_runtime_config_from_cache,
    write_runtime_config_to_cache,
)

RUNTIME_SYNC_PATH_PREFIXES = ("/api/v1/bot", "/api/v1/chat", "/api/v1/whatsapp")


async def _load_shared_runtime_snapshot(mongo_client) -> tuple:
    runtime_config = read_runtime_config_from_cache()
    if runtime_config is None:
        runtime_config = await read_runtime_config_from_mongo(mongo_client)
        if runtime_config is not None:
            write_runtime_config_to_cache(runtime_config)

    is_active = read_is_active_from_redis()
    if is_active is None:
        is_active = await read_is_active_from_mongo(mongo_client)
        if is_active is not None:
            write_is_active_to_redis(is_active)

    return runtime_config, is_active


def _apply_shared_runtime_snapshot(
    app: FastAPI,
    runtime_config,
    is_active,
    *,
    reload_chain: bool,
) -> None:
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
            get_logger(__name__).error("Error recargando chain desde estado compartido: %s", e, exc_info=True)


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
        get_logger(__name__).warning("Intento de reconexion a Qdrant fallo: %s", exc, exc_info=True)
        reconnected = False

    app.state.rag_available = bool(reconnected)
    if reconnected:
        get_logger(__name__).warning("Qdrant volvio a estar disponible. RAG reactivado en runtime.")
    return bool(reconnected)


async def _init_cache(app: FastAPI, s) -> None:
    logger = get_logger(__name__)
    try:
        logger.debug(
            "Cache activo: backend=%s, ttl=%s, max_size=%s",
            type(cache.backend).__name__, cache.ttl, cache.max_size,
        )
    except Exception as e:
        logger.warning("No se pudo determinar el estado del cache en arranque: %s", e)

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
            "Redis es obligatorio en produccion. El backend detecto que CacheManager esta en modo degradado "
            f"({cache_health.get('backend_type')}). Configure REDIS_URL y restaure la conectividad antes de iniciar."
        )

    if s.environment.lower() == "production" and not getattr(s, "mongo_uri", None):
        raise RuntimeError(
            "MONGO_URI es obligatorio en produccion. Configure la variable de entorno MONGO_URI antes de iniciar."
        )


async def _init_rag(app: FastAPI, s) -> None:
    logger = get_logger(__name__)

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
        logger.critical("Qdrant no disponible al arranque. La aplicacion continuara sin contexto RAG.")

    app.state.rag_ingestor = None
    app.state.rag_retriever = None
    app.state.rag_parent_repository = None
    app.state.rag_child_lexical_repository = None
    app.state.hierarchical_chunker = None

    try:
        emb = await app.state.embedding_manager.embed_text("ping")
        emb_ok = bool(emb and isinstance(emb, list) and len(emb) > 0)
        if emb_ok:
            logger.debug("Ping Embeddings: OK")
        else:
            logger.warning("Ping Embeddings retorno fallback vector -- embeddings posiblemente degradados.")
    except Exception as e:
        logger.warning("Ping Embeddings fallo: %s", e)


async def _init_bot(app: FastAPI, s) -> None:
    logger = get_logger(__name__)

    bot_memory_type = MemoryTypes.BASE_MEMORY
    if s.memory_type:
        try:
            bot_memory_type = MemoryTypes[s.memory_type.upper()]
        except KeyError:
            logger.warning("Tipo de memoria '%s' no valido en settings. Usando BASE_MEMORY.", s.memory_type)

    bootstrap_tools(s)
    app.state.bot_instance = Bot(
        settings=s,
        memory_type=bot_memory_type,
        memory_kwargs={"conversation_id": "default_session"},
        model_type=None,
        rag_retriever=app.state.rag_retriever,
        tools=tool_registry.list_tools(),
    )
    if app.state.startup_bot_is_active is not None:
        app.state.bot_instance.is_active = app.state.startup_bot_is_active
    app.state.last_synced_bot_config = build_runtime_config_payload(app.state.settings)
    app.state.last_synced_bot_is_active = app.state.bot_instance.is_active
    logger.debug("Instancia de Bot creada con tipo de memoria: %s", bot_memory_type)

    app.state.chat_manager = ChatManager(bot_instance=app.state.bot_instance)
    logger.debug("ChatManager inicializado.")


async def _init_mongodb(app: FastAPI, s) -> None:
    logger = get_logger(__name__)

    try:
        from database.mongodb import get_mongodb_client
        logger.debug("Initializing persistent MongoDB client for application lifespan...")
        if not getattr(app.state, "mongodb_client", None):
            app.state.mongodb_client = get_mongodb_client()
        await app.state.mongodb_client.ensure_indexes()
        logger.debug("[DB] MongoDB client id=%s", id(app.state.mongodb_client))
        try:
            await app.state.mongodb_client.ensure_user_indexes()
        except Exception as e_idx:
            logger.warning("No se pudieron aplicar indices de usuarios al arranque: %s", e_idx)
        try:
            wa_repo = WhatsAppSessionRepository(app.state.mongodb_client)
            await wa_repo.ensure_indexes()
        except Exception as e_idx:
            logger.warning("No se pudieron aplicar indices de whatsapp_sessions al arranque: %s", e_idx)
        try:
            from database.conversation_repository import ConversationRepository
            conv_repo = ConversationRepository(app.state.mongodb_client)
            await conv_repo.ensure_indexes()
        except Exception as e_idx:
            logger.warning("No se pudieron aplicar indices de conversations al arranque: %s", e_idx)
        try:
            from database.failed_message_repository import FailedMessageRepository
            dlq_repo = FailedMessageRepository(app.state.mongodb_client)
            await dlq_repo.ensure_indexes()
        except Exception as e_idx:
            logger.warning("No se pudieron aplicar indices de failed_whatsapp_messages al arranque: %s", e_idx)
        try:
            from database.retrieval_log_repository import RetrievalLogRepository
            rl_repo = RetrievalLogRepository(app.state.mongodb_client)
            await rl_repo.ensure_indexes()
        except Exception as e_idx:
            logger.warning("No se pudieron aplicar indices de retrieval_logs al arranque: %s", e_idx)
        try:
            app.state.rag_parent_repository = RAGParentDocumentRepository(
                mongodb_client=app.state.mongodb_client,
                collection_name=s.rag_parent_collection_name,
            )
            app.state.rag_child_lexical_repository = RAGChildLexicalRepository(
                mongodb_client=app.state.mongodb_client,
                documents_collection_name=s.rag_child_lexical_collection_name,
                postings_collection_name=s.rag_child_lexical_postings_collection_name,
            )
        except Exception as e_idx:
            app.state.rag_parent_repository = None
            app.state.rag_child_lexical_repository = None
            logger.warning("No se pudieron crear repositorios RAG al arranque: %s", e_idx)
        try:
            if app.state.rag_parent_repository:
                await app.state.rag_parent_repository.ensure_indexes()
            if app.state.rag_child_lexical_repository:
                await app.state.rag_child_lexical_repository.ensure_indexes()
        except Exception as e_idx:
            logger.warning("No se pudieron aplicar indices RAG al arranque: %s", e_idx)
        try:
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
            app.state.hierarchical_chunker = None
            app.state.rag_ingestor = None
            app.state.rag_retriever = None
            logger.warning("No se pudo inicializar el pipeline RAG jerarquico al arranque: %s", e_idx)
        logger.debug("Persistent MongoDB client initialized and indexes created successfully")
    except Exception as e:
        logger.error("Error initializing persistent MongoDB client: %s", e, exc_info=True)


async def _init_auth(app: FastAPI, s) -> None:
    logger = get_logger(__name__)

    try:
        from auth.token_blacklist import build_token_blacklist

        redis_url_raw = getattr(s, "redis_url", None)
        if redis_url_raw is None:
            redis_url_str = None
        elif hasattr(redis_url_raw, "get_secret_value"):
            redis_url_str = redis_url_raw.get_secret_value()
        else:
            redis_url_str = str(redis_url_raw)

        if redis_url_str:
            app.state.token_blacklist = await build_token_blacklist(redis_url_str)
        else:
            app.state.token_blacklist = None

        if app.state.token_blacklist is None:
            if s.environment.lower() == "production":
                logger.warning(
                    "TokenBlacklist no disponible en produccion -- la revocacion de JWT esta desactivada. "
                    "Verifique REDIS_URL y la conectividad."
                )
            else:
                logger.debug("TokenBlacklist no disponible -- revocacion de tokens en modo no-op (dev/sin Redis).")
        else:
            logger.debug("TokenBlacklist inicializado (Redis).")
    except Exception as e:
        logger.warning("TokenBlacklist init error: %s", e)
        app.state.token_blacklist = None

    try:
        from auth.dependencies import AuthDependencies
        from database.user_repository import get_user_repository

        user_repo = get_user_repository()
        app.state.auth_deps = AuthDependencies(
            user_repo,
            token_blacklist=app.state.token_blacklist,
        )
        logger.debug("AuthDependencies inicializado correctamente en app.state.")
    except Exception as e:
        logger.error("Error inicializando AuthDependencies: %s", e, exc_info=True)
        raise
