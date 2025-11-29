"""Configuration management for the chatbot application."""
import os
from typing import Any, Dict, Optional, List, Union
from pydantic import Field, validator, SecretStr, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from the correct location
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

class Settings(BaseSettings):
    """Configuraciones de la aplicación."""
    # Pydantic v2 / pydantic-settings config
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Configuraciones del Servidor
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8000, env="PORT")
    workers: int = Field(default=4, env="WORKERS")
    
    # Configuraciones de Seguridad
    # JWT - Configuraciones para autenticación
    jwt_secret: Optional[SecretStr] = Field(default=None, env="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(default=30, env="JWT_ACCESS_TOKEN_EXPIRE_MINUTES")
    jwt_refresh_token_expire_days: int = Field(default=7, env="JWT_REFRESH_TOKEN_EXPIRE_DAYS")
    reset_token_expire_minutes: int = Field(default=15, env="RESET_TOKEN_EXPIRE_MINUTES")
    
    # CORS - Configuraciones de origen cruzado (acepta string o lista para evitar errores de parseo)
    cors_origins: Union[str, List[str]] = Field(default=["*"], env="CORS_ORIGINS")
    cors_origins_widget: Union[str, List[str]] = Field(default=[], env="CORS_ORIGINS_WIDGET")
    cors_origins_admin: Union[str, List[str]] = Field(default=[], env="CORS_ORIGINS_ADMIN")
    # Origen del cliente (Frontend en Vercel)
    client_origin_url: Optional[str] = Field(default=None, env="CLIENT_ORIGIN_URL")
    frontend_url: Optional[str] = Field(default=None, env="FRONTEND_URL")
    cors_max_age: int = Field(default=3600, env="CORS_MAX_AGE")
    
    
    
    # Configuraciones de la App
    app_title: str = Field(default="ChatBot RAG API")
    app_description: str = Field(default="API para el ChatBot con RAG")
    app_version: str = Field(default="1.0.0")
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")
    
    # Configuraciones de Logging
    log_level: str = Field(default="DEBUG", env="LOG_LEVEL")
    
    
    # Rate Limiting
    enable_rate_limiting: bool = Field(default=True, env="ENABLE_RATE_LIMITING")
    rate_limit_strategy: str = Field(default="fixed-window", env="RATE_LIMIT_STRATEGY")
    global_rate_limit: str = Field(default="100/minute", env="GLOBAL_RATE_LIMIT")
    chat_rate_limit: str = Field(default="10/minute", env="CHAT_RATE_LIMIT")
    
    # Configuraciones del Modelo
    model_type: str = Field(default="OPENAI", env="MODEL_TYPE")
    openai_api_key: SecretStr = Field(..., env="OPENAI_API_KEY")
    base_model_name: str = Field(default="gpt-3.5-turbo", env="BASE_MODEL_NAME")
    max_tokens: int = Field(default=2000, env="MAX_TOKENS")
    temperature: float = Field(default=0.7, env="TEMPERATURE")
    
    system_prompt: Optional[str] = Field(default=None, env="SYSTEM_PROMPT")
    # Dynamic UI-driven config (complemento seguro)
    bot_name: Optional[str] = Field(default=None, env="BOT_NAME")
    ui_prompt_extra: Optional[str] = Field(default=None)
    main_prompt_name: str = Field(default="BASE_PROMPT_TEMPLATE", env="MAIN_PROMPT_NAME")
    ai_prefix: str = Field(default="assistant", env="AI_PREFIX")
    human_prefix: str = Field(default="user", env="HUMAN_PREFIX")
    
    # Configuraciones de MongoDB
    # Canonizamos a `MONGO_URI` (como en docker-compose), con fallback a `MONGODB_URI`
    mongo_uri: Optional[SecretStr] = Field(default=None, env="MONGO_URI")
    mongo_database_name: str = Field(default="chatbot_rag_db", env="MONGO_DATABASE_NAME")
    mongo_collection_name: str = Field(default="chat_history", env="MONGO_COLLECTION_NAME")
    mongo_max_pool_size: int = Field(default=100, env="MONGO_MAX_POOL_SIZE")
    mongo_timeout_ms: int = Field(default=5000, env="MONGO_TIMEOUT_MS")
    
    # Configuraciones de Redis
    # Nota: Se usa redis_url como configuración principal, no configuraciones individuales
    redis_url: Optional[SecretStr] = Field(default=None, env="REDIS_URL")
    
    
    # Configuraciones de Memoria
    memory_type: str = Field(default="BASE_MEMORY", env="MEMORY_TYPE")
    max_memory_entries: int = Field(default=1000, env="MAX_MEMORY_ENTRIES")
    
    # Configuraciones de RAG - Procesamiento de PDFs
    chunk_size: int = Field(default=500, validation_alias="RAG_CHUNK_SIZE")
    chunk_overlap: int = Field(default=50, validation_alias="RAG_CHUNK_OVERLAP")
    min_chunk_length: int = Field(default=100, validation_alias="MIN_CHUNK_LENGTH")
    max_file_size_mb: int = Field(default=10, validation_alias="MAX_FILE_SIZE_MB")
    
    # Configuraciones de RAG - Recuperación
    retrieval_k: int = Field(default=4, env="RETRIEVAL_K")
    retrieval_k_multiplier: int = Field(default=3, env="RETRIEVAL_K_MULTIPLIER")
    mmr_lambda_mult: float = Field(default=0.5, env="MMR_LAMBDA_MULT")
    similarity_threshold: float = Field(default=0.3, env="SIMILARITY_THRESHOLD")
    rag_gating_similarity_threshold: float = Field(default=0.20, env="RAG_GATING_SIMILARITY_THRESHOLD")
    
    # Configuraciones de RAG - Ingesta
    batch_size: int = Field(default=100, env="BATCH_SIZE")
    deduplication_threshold: float = Field(default=0.95, validation_alias="DEDUP_THRESHOLD")
    
    
    # Configuraciones de RAG - Vector Store
    vector_store_path: str = Field(default="./backend/storage/vector_store/chroma_db", env="VECTOR_STORE_PATH")
    distance_strategy: str = Field(default="cosine", env="DISTANCE_STRATEGY")
    qdrant_url: str = Field(default="http://localhost:6333", env="QDRANT_URL")
    qdrant_api_key: Optional[SecretStr] = Field(default=None, env="QDRANT_API_KEY")
    
    # Configuraciones de RAG - Embeddings
    embedding_model: str = Field(default="openai:text-embedding-3-small", env="EMBEDDING_MODEL")
    embedding_batch_size: int = Field(default=32, env="EMBEDDING_BATCH_SIZE")
    # Dimensión por defecto de embeddings (usada en fallbacks)
    default_embedding_dimension: int = Field(default=1536, env="DEFAULT_EMBEDDING_DIMENSION")

    # Configuraciones de caché locales (VectorStore / consultas)
    max_cache_size: int = Field(default=1024, env="MAX_CACHE_SIZE")
    
    cache_store_embeddings: bool = Field(default=True, env="CACHE_STORE_EMBEDDINGS")
    
    # Configuraciones de RAG - Caché
    enable_cache: bool = Field(default=True, env="ENABLE_CACHE")
    cache_ttl: int = Field(default=3600, env="CACHE_TTL")  # 1 hora por defecto
    
    # Feature Flag: Integración LCEL del RAG
    enable_rag_lcel: bool = Field(default=False, env="ENABLE_RAG_LCEL")
    
    # Configuraciones de Directorios
    storage_dir: str = Field(default="./backend/storage", env="STORAGE_DIR")
    documents_dir: str = Field(default="./backend/storage/documents", env="DOCUMENTS_DIR")
    pdfs_dir: str = Field(default="./backend/storage/documents/pdfs", env="PDFS_DIR")
    cache_dir: str = Field(default="./backend/storage/cache", env="CACHE_DIR")
    temp_dir: str = Field(default="./backend/storage/temp", env="TEMP_DIR")
    backup_dir: str = Field(default="./backend/storage/backups", env="BACKUP_DIR")

    resend_api_key: Optional[SecretStr] = Field(default=None, env="RESEND_API_KEY")
    email_from: Optional[str] = Field(default=None, env="EMAIL_FROM")
    password_reset_url_base: Optional[str] = Field(default=None, env="PASSWORD_RESET_URL_BASE")
    
    

    # Configuración personalizada para cantidad máxima de documentos recuperados
    max_documents: int = Field(default=5, env="MAX_DOCUMENTS")

    twilio_account_sid: Optional[str] = Field(default=None, env="TWILIO_ACCOUNT_SID")
    twilio_auth_token: Optional[str] = Field(default=None, env="TWILIO_AUTH_TOKEN")
    twilio_whatsapp_from: Optional[str] = Field(default=None, env="TWILIO_WHATSAPP_FROM")
    twilio_api_base: str = Field(default="https://api.twilio.com", env="TWILIO_API_BASE")
    
    # Nota: Config ya no aplica en Pydantic v2; usamos model_config arriba.

    @validator("environment")
    def validate_environment(cls, v):
        allowed = ["development", "testing", "staging", "production"]
        if v not in allowed:
            raise ValueError(f"Environment must be one of {allowed}")
        return v
        
    @validator("log_level")
    def validate_log_level(cls, v):
        allowed = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        v = v.upper()
        if v not in allowed:
            raise ValueError(f"Log level must be one of {allowed}")
        return v
        
    @validator("cors_origins", "cors_origins_widget", "cors_origins_admin")
    def validate_cors_origins(cls, v, values):
        env = values.get("environment")
        # Normalizar: si viene como string vacío, convertir a lista vacía
        if isinstance(v, str):
            v_str = v.strip()
            if v_str == "":
                v = []
            else:
                # Permitir CSV sencillo: "https://a,https://b"
                if "," in v_str and not v_str.startswith("["):
                    v = [origin.strip() for origin in v_str.split(",") if origin.strip()]
                else:
                    v = [v_str]
        # En producción, bloquear comodín
        if env == "production" and any(origin == "*" for origin in (v or [])):
            raise ValueError("Wildcard CORS origin (*) not allowed in production")
        return v

    @validator("mongo_uri", pre=True)
    def validate_mongo_uri(cls, v):
        # Preferir MONGO_URI, con fallback a MONGODB_URI
        if v is None:
            primary = os.getenv("MONGO_URI")
            if primary:
                return primary
            fallback = os.getenv("MONGODB_URI")
            if fallback:
                return fallback
            return None
        return v
        
    @validator("temperature")
    def validate_temperature(cls, v):
        if not 0 <= v <= 1:
            raise ValueError("Temperature must be between 0 and 1")
        return v
        
    @validator("similarity_threshold", "deduplication_threshold")
    def validate_threshold(cls, v):
        if not 0 <= v <= 1:
            raise ValueError("Threshold values must be between 0 and 1")
        return v
        
    @validator("max_file_size_mb")
    def validate_max_file_size(cls, v):
        if v <= 0 or v > 100:
            raise ValueError("Max file size must be between 1 and 100 MB")
        return v

# Create global settings instance
try:
    settings = Settings()
except ValidationError as e:
    # Si el único error es mongo_uri ausente, tolerarlo (útil para utilidades locales)
    error_fields = {str(err.get('loc', [''])[0]) for err in e.errors()}
    if error_fields == {"mongo_uri"}:
        mongo = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
        if mongo:
            settings = Settings(mongo_uri=mongo)
        else:
            # Crear instancia con mongo_uri=None para scripts que no tocan Mongo directamente
            settings = Settings(mongo_uri=None)
    else:
        print("="*80)
        print("ERROR: Faltan variables de entorno críticas para iniciar la aplicación.")
        print("La validación de configuración falló. Revise las siguientes variables en su configuración de entorno:")
        error_messages = []
        for error in e.errors():
            field_name = str(error['loc'][0])
            error_messages.append(f"  - Campo '{field_name}': {error['msg']}.")
        print("\n".join(error_messages))
        print("\nSugerencia: Variables requeridas incluyen 'OPENAI_API_KEY', 'MONGO_URI' (o 'MONGODB_URI'), y 'JWT_SECRET'.")
        print("="*80)
        raise


def get_settings() -> Settings:
    """Get application settings.
    
    Returns:
        Application settings object.
    """
    return settings

# Endurecimiento de seguridad en producción:
# - Si el entorno es "production" y JWT_SECRET no está definido o está vacío,
#   abortar el arranque con un ValueError claro. Las plataformas cloud (Render, Railway)
#   inyectan variables de entorno; esta validación evita arrancar sin un secreto adecuado.
try:
    if settings.environment.lower() == "production":
        secret_value = (
            settings.jwt_secret.get_secret_value() if settings.jwt_secret is not None else None
        )
        if secret_value is None or secret_value.strip() == "":
            raise ValueError(
                "JWT_SECRET es obligatorio en producción. Configure la variable de entorno JWT_SECRET antes de iniciar."
            )
except Exception:
    # Re-lanzar para que el arranque falle y quede registrado por el logger de la app/uvicorn.
    raise
