"""Fragmentos de configuración por dominio.

Cada clase agrupa los campos de un área (auth, RAG, persistencia, etc.) y se
compone en `Settings` por herencia múltiple. Los fragmentos NO se instancian
solos; viven aquí únicamente para hacer la configuración legible y editable
por dominio.

Reglas:
- Solo declarar campos con `Field(...)`. Sin validators, sin model_config.
- Toda validación cruza-dominio vive en `config.Settings`.
"""
from typing import List, Optional, Union

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings


class ServerFields(BaseSettings):
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8000, env="PORT")
    workers: int = Field(default=1, env="WORKERS")


class AuthFields(BaseSettings):
    jwt_secret: Optional[SecretStr] = Field(default=None, env="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(default=30, env="JWT_ACCESS_TOKEN_EXPIRE_MINUTES")
    jwt_refresh_token_expire_days: int = Field(default=7, env="JWT_REFRESH_TOKEN_EXPIRE_DAYS")
    reset_token_expire_minutes: int = Field(default=15, env="RESET_TOKEN_EXPIRE_MINUTES")


class CORSFields(BaseSettings):
    cors_origins: Union[str, List[str]] = Field(default=["*"], env="CORS_ORIGINS")
    cors_origins_widget: Union[str, List[str]] = Field(default=[], env="CORS_ORIGINS_WIDGET")
    cors_origins_admin: Union[str, List[str]] = Field(default=[], env="CORS_ORIGINS_ADMIN")
    client_origin_url: Optional[str] = Field(default=None, env="CLIENT_ORIGIN_URL")
    frontend_url: Optional[str] = Field(default=None, env="FRONTEND_URL")
    cors_max_age: int = Field(default=3600, env="CORS_MAX_AGE")


class AppMetaFields(BaseSettings):
    app_title: str = Field(default="ChatBot RAG API")
    app_description: str = Field(default="API para el ChatBot con RAG")
    app_version: str = Field(default="1.0.0")
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")
    log_level: str = Field(default="DEBUG", env="LOG_LEVEL")
    mock_mode: bool = Field(default=False, env="MOCK_MODE")


class RateLimitFields(BaseSettings):
    enable_rate_limiting: bool = Field(default=True, env="ENABLE_RATE_LIMITING")
    rate_limit_strategy: str = Field(default="fixed-window", env="RATE_LIMIT_STRATEGY")
    global_rate_limit: str = Field(default="100/minute", env="GLOBAL_RATE_LIMIT")
    chat_rate_limit: str = Field(default="10/minute", env="CHAT_RATE_LIMIT")
    pdf_upload_rate_limit: str = Field(default="5/hour", env="PDF_UPLOAD_RATE_LIMIT")
    login_rate_limit: str = Field(default="10/minute", env="LOGIN_RATE_LIMIT")
    auth_refresh_rate_limit: str = Field(default="30/minute", env="AUTH_REFRESH_RATE_LIMIT")
    auth_register_rate_limit: str = Field(default="5/hour", env="AUTH_REGISTER_RATE_LIMIT")
    whatsapp_rate_limit_per_window: int = Field(default=15, env="WHATSAPP_RATE_LIMIT_PER_WINDOW")
    whatsapp_rate_limit_window_seconds: int = Field(default=60, env="WHATSAPP_RATE_LIMIT_WINDOW_SECONDS")
    max_message_length: int = Field(default=2000, env="MAX_MESSAGE_LENGTH")


class ModelFields(BaseSettings):
    model_type: str = Field(default="OPENAI", env="MODEL_TYPE")
    openai_api_key: SecretStr = Field(..., env="OPENAI_API_KEY")
    base_model_name: str = Field(default="gpt-4o-mini", env="BASE_MODEL_NAME")
    max_tokens: int = Field(default=2000, env="MAX_TOKENS")
    temperature: float = Field(default=0.7, env="TEMPERATURE")
    stream_min_chunk_chars: int = Field(default=32, env="STREAM_MIN_CHUNK_CHARS")
    llm_request_timeout_seconds: float = Field(default=60.0, env="LLM_REQUEST_TIMEOUT_SECONDS")
    llm_stream_chunk_timeout_seconds: float = Field(default=30.0, env="LLM_STREAM_CHUNK_TIMEOUT_SECONDS")


class BotUIFields(BaseSettings):
    """Configuración dinámica del bot (UI-driven)."""
    bot_name: Optional[str] = Field(default=None, env="BOT_NAME")
    ui_prompt_extra: Optional[str] = Field(default=None)
    theme_color: str = Field(default="#F97316", env="THEME_COLOR")
    starters: list[str] = Field(default_factory=list)
    input_placeholder: Optional[str] = Field(default="Escribe aquí...", env="INPUT_PLACEHOLDER")
    main_prompt_name: str = Field(default="BASE_PROMPT_TEMPLATE", env="MAIN_PROMPT_NAME")
    ai_prefix: str = Field(default="assistant", env="AI_PREFIX")
    human_prefix: str = Field(default="user", env="HUMAN_PREFIX")
    enable_agentic_handoff: bool = Field(default=False, env="ENABLE_AGENTIC_HANDOFF")
    enable_agentic_rag: bool = Field(default=False, env="ENABLE_AGENTIC_RAG")


class MongoFields(BaseSettings):
    mongo_uri: Optional[SecretStr] = Field(default=None, env="MONGO_URI")
    mongo_database_name: str = Field(default="chatbot_rag_db", env="MONGO_DATABASE_NAME")
    mongo_collection_name: str = Field(default="chat_history", env="MONGO_COLLECTION_NAME")
    mongo_max_pool_size: int = Field(default=500, env="MONGO_MAX_POOL_SIZE")
    mongo_timeout_ms: int = Field(default=5000, env="MONGO_TIMEOUT_MS")
    mongo_wait_queue_timeout_ms: int = Field(default=5000, env="MONGO_WAIT_QUEUE_TIMEOUT_MS")


class RedisFields(BaseSettings):
    redis_url: Optional[SecretStr] = Field(default=None, env="REDIS_URL")
    redis_max_connections: int = Field(default=200, env="REDIS_MAX_CONNECTIONS")
    cache_retry_attempts: int = Field(default=3, env="CACHE_RETRY_ATTEMPTS")
    cache_retry_delay_base: float = Field(default=0.5, env="CACHE_RETRY_DELAY_BASE")


class MemoryFields(BaseSettings):
    memory_type: str = Field(default="BASE_MEMORY", env="MEMORY_TYPE")
    memory_window_size: int = Field(default=20, env="MEMORY_WINDOW_SIZE")
    max_memory_entries: int = Field(default=1000, env="MAX_MEMORY_ENTRIES")


class RAGChunkingFields(BaseSettings):
    chunk_size: int = Field(default=500, validation_alias="RAG_CHUNK_SIZE")
    chunk_overlap: int = Field(default=50, validation_alias="RAG_CHUNK_OVERLAP")
    min_chunk_length: int = Field(default=100, validation_alias="MIN_CHUNK_LENGTH")
    max_file_size_mb: int = Field(default=10, validation_alias="MAX_FILE_SIZE_MB")
    rag_child_overlap_tokens: int = Field(default=40, env="RAG_CHILD_OVERLAP_TOKENS")
    rag_parent_overlap_tokens: int = Field(default=120, env="RAG_PARENT_OVERLAP_TOKENS")
    llm_context_window: int = Field(default=16000, env="LLM_CONTEXT_WINDOW")
    enable_semantic_chunking: bool = Field(default=False, env="ENABLE_SEMANTIC_CHUNKING")
    semantic_chunk_threshold: float = Field(default=0.5, env="SEMANTIC_CHUNK_THRESHOLD")
    semantic_chunk_model: str = Field(default="all-MiniLM-L6-v2", env="SEMANTIC_CHUNK_MODEL")
    batch_size: int = Field(default=100, env="BATCH_SIZE")
    deduplication_threshold: float = Field(default=0.95, validation_alias="DEDUP_THRESHOLD")


class RAGRetrievalFields(BaseSettings):
    retrieval_k: int = Field(default=4, env="RETRIEVAL_K")
    retrieval_k_multiplier: int = Field(default=3, env="RETRIEVAL_K_MULTIPLIER")
    mmr_lambda_mult: float = Field(default=0.5, env="MMR_LAMBDA_MULT")
    similarity_threshold: float = Field(default=0.3, env="SIMILARITY_THRESHOLD")
    rag_gating_similarity_threshold: float = Field(default=0.20, env="RAG_GATING_SIMILARITY_THRESHOLD")
    enable_hybrid_search: bool = Field(default=True, env="ENABLE_HYBRID_SEARCH")
    enable_llm_reranker: bool = Field(default=False, env="ENABLE_LLM_RERANKER")
    hybrid_rrf_k: int = Field(default=60, env="HYBRID_RRF_K")
    hybrid_child_candidate_limit: int = Field(default=12, env="HYBRID_CHILD_CANDIDATE_LIMIT")
    hybrid_parent_candidate_limit: int = Field(default=6, env="HYBRID_PARENT_CANDIDATE_LIMIT")
    rag_child_first_context_enabled: bool = Field(default=False, env="RAG_CHILD_FIRST_CONTEXT_ENABLED")
    rag_child_first_context_top_children: int = Field(default=3, env="RAG_CHILD_FIRST_CONTEXT_TOP_CHILDREN")
    rag_child_first_context_window_tokens: int = Field(default=200, env="RAG_CHILD_FIRST_CONTEXT_WINDOW_TOKENS")
    rag_reranker_model_name: Optional[str] = Field(default=None, env="RAG_RERANKER_MODEL_NAME")
    rag_reranker_timeout_seconds: float = Field(default=12.0, env="RAG_RERANKER_TIMEOUT_SECONDS")
    rag_reranker_type: str = Field(default="openai", env="RAG_RERANKER_TYPE")
    cross_encoder_model_name: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2", env="CROSS_ENCODER_MODEL_NAME")
    cohere_api_key: Optional[SecretStr] = Field(default=None, env="COHERE_API_KEY")
    cohere_rerank_model: str = Field(default="rerank-multilingual-v3.0", env="COHERE_RERANK_MODEL")
    enable_hyde: bool = Field(default=False, env="ENABLE_HYDE")
    hyde_max_tokens: int = Field(default=150, env="HYDE_MAX_TOKENS")
    hyde_model_name: Optional[str] = Field(default=None, env="HYDE_MODEL_NAME")
    max_documents: int = Field(default=5, env="MAX_DOCUMENTS")
    enable_rag_lcel: bool = Field(default=False, env="ENABLE_RAG_LCEL")


class RAGVectorStoreFields(BaseSettings):
    vector_store_path: str = Field(default="./backend/storage/vector_store/chroma_db", env="VECTOR_STORE_PATH")
    distance_strategy: str = Field(default="cosine", env="DISTANCE_STRATEGY")
    qdrant_url: str = Field(default="http://localhost:6333", env="QDRANT_URL")
    qdrant_api_key: Optional[SecretStr] = Field(default=None, env="QDRANT_API_KEY")
    qdrant_collection_name: str = Field(default="rag_collection", env="QDRANT_COLLECTION_NAME")
    qdrant_max_connections: int = Field(default=200, env="QDRANT_MAX_CONNECTIONS")
    qdrant_keepalive_connections: int = Field(default=40, env="QDRANT_KEEPALIVE_CONNECTIONS")
    qdrant_timeout_seconds: int = Field(default=30, env="QDRANT_TIMEOUT_SECONDS")
    qdrant_circuit_breaker_threshold: int = Field(default=5, env="QDRANT_CIRCUIT_BREAKER_THRESHOLD")
    qdrant_circuit_breaker_recovery_s: float = Field(default=60.0, env="QDRANT_CIRCUIT_BREAKER_RECOVERY_S")
    qdrant_retry_attempts: int = Field(default=2, env="QDRANT_RETRY_ATTEMPTS")
    qdrant_retry_delay_base: float = Field(default=0.5, env="QDRANT_RETRY_DELAY_BASE")
    rag_child_collection_name: str = Field(default="rag_child_chunks", env="RAG_CHILD_COLLECTION_NAME")
    rag_child_lexical_collection_name: str = Field(default="rag_child_lexical_documents", env="RAG_CHILD_LEXICAL_COLLECTION_NAME")
    rag_child_lexical_postings_collection_name: str = Field(default="rag_child_lexical_postings", env="RAG_CHILD_LEXICAL_POSTINGS_COLLECTION_NAME")
    rag_parent_collection_name: str = Field(default="rag_parent_documents", env="RAG_PARENT_COLLECTION_NAME")


class RAGEmbeddingFields(BaseSettings):
    embedding_model: str = Field(default="openai:text-embedding-3-small", env="EMBEDDING_MODEL")
    embedding_batch_size: int = Field(default=32, env="EMBEDDING_BATCH_SIZE")
    default_embedding_dimension: int = Field(default=1536, env="DEFAULT_EMBEDDING_DIMENSION")


class CacheFields(BaseSettings):
    max_cache_size: int = Field(default=1024, env="MAX_CACHE_SIZE")
    cache_store_embeddings: bool = Field(default=True, env="CACHE_STORE_EMBEDDINGS")
    enable_cache: bool = Field(default=True, env="ENABLE_CACHE")
    cache_ttl: int = Field(default=3600, env="CACHE_TTL")


class StorageFields(BaseSettings):
    storage_dir: str = Field(default="./backend/storage", env="STORAGE_DIR")
    documents_dir: str = Field(default="./backend/storage/documents", env="DOCUMENTS_DIR")
    pdfs_dir: str = Field(default="./backend/storage/documents/pdfs", env="PDFS_DIR")
    cache_dir: str = Field(default="./backend/storage/cache", env="CACHE_DIR")
    temp_dir: str = Field(default="./backend/storage/temp", env="TEMP_DIR")
    backup_dir: str = Field(default="./backend/storage/backups", env="BACKUP_DIR")


class MonitoringFields(BaseSettings):
    sentry_dsn: Optional[str] = Field(default=None, env="SENTRY_DSN")
    sentry_traces_sample_rate: float = Field(default=0.1, env="SENTRY_TRACES_SAMPLE_RATE")


class EmailFields(BaseSettings):
    resend_api_key: Optional[SecretStr] = Field(default=None, env="RESEND_API_KEY")
    email_from: Optional[str] = Field(default=None, env="EMAIL_FROM")
    password_reset_url_base: Optional[str] = Field(default=None, env="PASSWORD_RESET_URL_BASE")


class WhatsAppFields(BaseSettings):
    twilio_account_sid: Optional[str] = Field(default=None, env="TWILIO_ACCOUNT_SID")
    twilio_auth_token: Optional[str] = Field(default=None, env="TWILIO_AUTH_TOKEN")
    twilio_whatsapp_from: Optional[str] = Field(default=None, env="TWILIO_WHATSAPP_FROM")
    twilio_api_base: str = Field(default="https://api.twilio.com", env="TWILIO_API_BASE")
