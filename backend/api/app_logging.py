"""Logging and warning configuration for the FastAPI application."""
import logging
import warnings

from config import settings
from infra.logging_utils import suppress_cl100k_warnings


def _setup_logging_and_warnings() -> None:
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
        warnings.filterwarnings("ignore", category=DeprecationWarning, module="langchain._api.module_import")
        warnings.filterwarnings("ignore", message=r".*cl100k_base.*", category=Warning)
        warnings.filterwarnings("ignore", message=r".*model not found.*cl100k_base.*", category=Warning)
        warnings.filterwarnings("ignore", module="langchain_openai.embeddings.base")
        warnings.filterwarnings("ignore", module="tiktoken")
        logging.getLogger("pymongo").setLevel(logging.WARNING)
        logging.getLogger("motor").setLevel(logging.WARNING)
        logging.getLogger("uvicorn").setLevel(logging.INFO)
        logging.getLogger("uvicorn.error").setLevel(logging.INFO)
        # uvicorn.access duplica el log_requests middleware — silenciar para evitar 2 lineas por request.
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("watchfiles").setLevel(logging.WARNING)
        logging.getLogger("langchain").setLevel(logging.WARNING)
        logging.getLogger("langchain_core").setLevel(logging.WARNING)
        logging.getLogger("langchain_openai").setLevel(logging.WARNING)
        logging.getLogger("langchain_openai.embeddings.base").setLevel(logging.ERROR)
        logging.getLogger("langchain_community").setLevel(logging.WARNING)
        logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
        logging.getLogger("urllib3").setLevel(logging.WARNING)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        logging.getLogger("qdrant_client.http").setLevel(logging.WARNING)
    except Exception:
        pass
