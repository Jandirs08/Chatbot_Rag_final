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