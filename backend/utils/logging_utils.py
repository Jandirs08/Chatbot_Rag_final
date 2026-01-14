import logging
import warnings
import os


def setup_logging():
    """Configure logging level from environment variable."""
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=log_level)


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


def get_logger(name: str | None = None) -> logging.Logger:
    """Return a module/class-specific logger.

    Keeps existing logging configuration; centralizes logger creation.
    """
    setup_logging()  # Ensure logging is configured
    return logging.getLogger(name or __name__)


# ============================================================
#   CHATBOT LOGGER: Sistema de logging escalable
# ============================================================

class ChatbotLogger:
    """
    Logger centralizado con prefijos estandarizados.
    
    Uso:
        from utils.logging_utils import ChatbotLogger
        log = ChatbotLogger("RAG")
        log.info("Gating completado", reason="small_talk", use_rag=False)
        # Output: [RAG] Gating completado | reason=small_talk use_rag=False
    """
    
    # Prefijos estándar para cada componente
    COMPONENTS = {
        "RAG": "RAG",
        "CHAT": "CHAT", 
        "HISTORY": "HISTORY",
        "CACHE": "CACHE",
        "DB": "DB",
        "API": "API",
        "BOT": "BOT",
        "PDF": "PDF",
        "AUTH": "AUTH",
    }
    
    def __init__(self, component: str, logger_name: str | None = None):
        """
        Args:
            component: Nombre del componente (RAG, CHAT, HISTORY, etc.)
            logger_name: Nombre del logger base (opcional, usa component si no se proporciona)
        """
        self.component = self.COMPONENTS.get(component.upper(), component.upper())
        self._logger = get_logger(logger_name or component)
    
    def _format_message(self, message: str, **kwargs) -> str:
        """Formatea mensaje con prefijo y kwargs opcional."""
        prefix = f"[{self.component}]"
        if kwargs:
            extras = " ".join(f"{k}={v}" for k, v in kwargs.items())
            return f"{prefix} {message} | {extras}"
        return f"{prefix} {message}"
    
    def debug(self, message: str, **kwargs) -> None:
        """Log nivel DEBUG con prefijo."""
        self._logger.debug(self._format_message(message, **kwargs))
    
    def info(self, message: str, **kwargs) -> None:
        """Log nivel INFO con prefijo."""
        self._logger.info(self._format_message(message, **kwargs))
    
    def warning(self, message: str, **kwargs) -> None:
        """Log nivel WARNING con prefijo."""
        self._logger.warning(self._format_message(message, **kwargs))
    
    def error(self, message: str, exc_info: bool = False, **kwargs) -> None:
        """Log nivel ERROR con prefijo."""
        self._logger.error(self._format_message(message, **kwargs), exc_info=exc_info)
    
    # Métodos helper para casos comunes
    def action(self, action: str, **kwargs) -> None:
        """Log de acción estándar (nivel INFO)."""
        self.info(action, **kwargs)
    
    def skip(self, reason: str, **kwargs) -> None:
        """Log cuando se salta/omite algo."""
        self.info(f"Omitido: {reason}", **kwargs)
    
    def start(self, operation: str, **kwargs) -> None:
        """Log de inicio de operación."""
        self.debug(f"Iniciando {operation}", **kwargs)
    
    def end(self, operation: str, **kwargs) -> None:
        """Log de fin de operación."""
        self.debug(f"Finalizado {operation}", **kwargs)


def get_component_logger(component: str, logger_name: str | None = None) -> ChatbotLogger:
    """
    Factory para obtener un ChatbotLogger por componente.
    
    Args:
        component: RAG, CHAT, HISTORY, CACHE, DB, API, BOT, PDF, AUTH
        logger_name: Nombre del logger base (opcional)
    
    Ejemplo:
        log = get_component_logger("RAG")
        log.info("Documentos recuperados", count=5, latency_ms=120)
    """
    return ChatbotLogger(component, logger_name)
