import logging
import warnings
import os


def setup_logging():
    """Configure logging level and format from environment variables."""
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    
    # Formato que incluye request_id cuando está disponible
    # El filtro RequestIdFilter inyecta el request_id en cada record
    log_format = "%(asctime)s | %(levelname)s:%(name)s:%(request_id)s%(message)s"
    date_format = "%Y-%m-%d %H:%M:%S.%f"
    
    # Configurar el formato con datefmt personalizado
    logging.basicConfig(
        level=log_level,
        format=log_format,
        datefmt=date_format[:-3],  # Quitar .%f ya que basicConfig no lo soporta
        force=True,
    )
    
    # Aplicar filtro de request_id al root logger
    _ensure_request_id_filter()


class _MessageExclusionFilter(logging.Filter):
    """Logging filter that excludes records containing any of the substrings.

    Use to suppress noisy library messages like tiktoken's 'cl100k_base' hints.
    """
    def __init__(self, substrings: list[str]):
        super().__init__()
        self.substrings = substrings

    def filter(self, record: logging.LogRecord) -> bool:
        msg = str(record.getMessage())
        for s in self.substrings:
            if s in msg:
                return False
        return True


def install_message_exclusion_filter(substrings: list[str]) -> None:
    """Install a filter on the root logger to drop messages containing substrings."""
    root_logger = logging.getLogger()
    # Avoid adding duplicate filters
    existing = any(isinstance(f, _MessageExclusionFilter) for f in getattr(root_logger, 'filters', []))
    if not existing:
        root_logger.addFilter(_MessageExclusionFilter(substrings))

    # Also apply to common noisy libraries
    for lib in ("tiktoken", "langchain_openai", "openai"):
        try:
            logging.getLogger(lib).addFilter(_MessageExclusionFilter(substrings))
            logging.getLogger(lib).setLevel(logging.ERROR)
        except Exception:
            pass


def suppress_cl100k_warnings() -> None:
    """Aggressively suppress 'cl100k_base' warnings and logs from libraries."""
    # Suppress Python warnings that match the message pattern
    try:
        warnings.filterwarnings("ignore", message=r".*cl100k_base.*", category=Warning)
        warnings.filterwarnings("ignore", module="tiktoken")
        warnings.filterwarnings("ignore", module="langchain_openai")
    except Exception:
        pass

    # Suppress logging messages containing the substring
    install_message_exclusion_filter(["cl100k_base"])


class _RequestIdFilter(logging.Filter):
    """
    Logging filter that injects the current request_id into log records.
    
    If no request_id is available (e.g., startup logs), uses empty string.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            from infra.request_id import get_request_id
            request_id = get_request_id()
            record.request_id = f"[{request_id}] " if request_id else ""
        except Exception:
            record.request_id = ""
        return True


def _ensure_request_id_filter() -> None:
    """Ensure the RequestIdFilter is installed on the root logger."""
    root_logger = logging.getLogger()
    existing = any(isinstance(f, _RequestIdFilter) for f in getattr(root_logger, 'filters', []))
    if not existing:
        root_logger.addFilter(_RequestIdFilter())
    
    # Also apply to all existing handlers
    for handler in root_logger.handlers:
        handler_existing = any(isinstance(f, _RequestIdFilter) for f in getattr(handler, 'filters', []))
        if not handler_existing:
            handler.addFilter(_RequestIdFilter())


def get_logger(name: str | None = None) -> logging.Logger:
    """Return a module/class-specific logger.

    Keeps existing logging configuration; centralizes logger creation.
    Ensures request_id filter is applied.
    """
    setup_logging()  # Ensure logging is configured
    logger = logging.getLogger(name or __name__)
    
    # Ensure this logger also has the filter (for loggers created before setup)
    _ensure_request_id_filter()
    
    return logger
