"""Configuration management for the chatbot application.

Settings se compone por herencia múltiple desde fragmentos por dominio definidos
en `config_fragments.py`. La intención es:
- mantener un único `settings` global y la API existente (`from config import settings`)
- agrupar campos por área para que sean fáciles de localizar y editar
- concentrar validators y reglas de producción aquí (no en los fragmentos)
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import ValidationError, ValidationInfo, field_validator, model_validator
from pydantic_settings import SettingsConfigDict

from config_fragments import (
    AppMetaFields,
    AuthFields,
    BotUIFields,
    CORSFields,
    CacheFields,
    EmailFields,
    MemoryFields,
    ModelFields,
    MongoFields,
    MonitoringFields,
    RAGChunkingFields,
    RAGEmbeddingFields,
    RAGRetrievalFields,
    RAGVectorStoreFields,
    RateLimitFields,
    RedisFields,
    ServerFields,
    StorageFields,
    WhatsAppFields,
)

# Carga el .env con ruta absoluta (más fiable que env_file relativo al CWD).
# pydantic-settings no necesita env_file porque las vars ya están en os.environ.
load_dotenv(Path(__file__).parent / '.env')


class Settings(
    ServerFields,
    AuthFields,
    CORSFields,
    AppMetaFields,
    RateLimitFields,
    ModelFields,
    BotUIFields,
    MongoFields,
    RedisFields,
    MemoryFields,
    RAGChunkingFields,
    RAGRetrievalFields,
    RAGVectorStoreFields,
    RAGEmbeddingFields,
    CacheFields,
    StorageFields,
    MonitoringFields,
    EmailFields,
    WhatsAppFields,
):
    """Configuraciones de la aplicación.

    Toda la lista de campos vive en `config_fragments.py`. Aquí solo:
    - `model_config` global (env case-insensitive, ignorar extras)
    - validators a través de campos de varios dominios
    - regla de producción anti-DEBUG
    """
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    # ---- Validators ----

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str):
        allowed = ["development", "testing", "staging", "production"]
        if v not in allowed:
            raise ValueError(f"Environment must be one of {allowed}")
        return v

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str):
        allowed = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        v = v.upper()
        if v not in allowed:
            raise ValueError(f"Log level must be one of {allowed}")
        return v

    @field_validator("cors_origins", "cors_origins_widget", "cors_origins_admin", mode="after")
    @classmethod
    def validate_cors_origins(cls, v, info: ValidationInfo):
        env = (info.data or {}).get("environment")
        if isinstance(v, str):
            v_str = v.strip()
            if v_str == "":
                v = []
            else:
                if "," in v_str and not v_str.startswith("["):
                    v = [origin.strip() for origin in v_str.split(",") if origin.strip()]
                else:
                    v = [v_str]
        if env == "production" and any(origin == "*" for origin in (v or [])):
            raise ValueError("Wildcard CORS origin (*) not allowed in production")
        return v

    @field_validator("mongo_uri", mode="before")
    @classmethod
    def validate_mongo_uri(cls, v):
        # Preferir MONGO_URI, fallback a MONGODB_URI
        if v is None:
            primary = os.getenv("MONGO_URI")
            if primary:
                return primary
            fallback = os.getenv("MONGODB_URI")
            if fallback:
                return fallback
            return None
        return v

    @field_validator("temperature")
    @classmethod
    def validate_temperature(cls, v: float):
        if not 0 <= v <= 1:
            raise ValueError("Temperature must be between 0 and 1")
        return v

    @field_validator("similarity_threshold", "deduplication_threshold")
    @classmethod
    def validate_threshold(cls, v: float):
        if not 0 <= v <= 1:
            raise ValueError("Threshold values must be between 0 and 1")
        return v

    @field_validator("max_file_size_mb")
    @classmethod
    def validate_max_file_size(cls, v: int):
        if v <= 0 or v > 100:
            raise ValueError("Max file size must be between 1 and 100 MB")
        return v

    @field_validator("stream_min_chunk_chars")
    @classmethod
    def validate_stream_min_chunk_chars(cls, v: int):
        if v <= 0 or v > 4096:
            raise ValueError("STREAM_MIN_CHUNK_CHARS must be between 1 and 4096")
        return v

    @model_validator(mode="after")
    def validate_production_constraints(self):
        if self.environment.lower() == "production" and self.debug:
            raise ValueError(
                "DEBUG=true no está permitido en production. "
                "Desactive DEBUG antes de iniciar en producción."
            )
        return self


# ---- Global instance ----

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
            settings = Settings(mongo_uri=None)
    else:
        print("=" * 80)
        print("ERROR: Faltan variables de entorno críticas para iniciar la aplicación.")
        print("La validación de configuración falló. Revise las siguientes variables en su configuración de entorno:")
        for error in e.errors():
            field_name = str(error['loc'][0])
            print(f"  - Campo '{field_name}': {error['msg']}.")
        print("\nSugerencia: Variables requeridas incluyen 'OPENAI_API_KEY', 'MONGO_URI' (o 'MONGODB_URI'), y 'JWT_SECRET'.")
        print("=" * 80)
        raise


def get_settings() -> Settings:
    """Get application settings."""
    return settings


# Endurecimiento de seguridad en producción: JWT_SECRET es obligatorio.
if settings.environment.lower() == "production":
    secret_value = (
        settings.jwt_secret.get_secret_value() if settings.jwt_secret is not None else None
    )
    if secret_value is None or secret_value.strip() == "":
        raise ValueError(
            "JWT_SECRET es obligatorio en producción. Configure la variable de entorno JWT_SECRET antes de iniciar."
        )
