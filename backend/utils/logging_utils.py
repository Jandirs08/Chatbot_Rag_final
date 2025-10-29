import logging

def get_logger(name: str | None = None) -> logging.Logger:
    """Return a module/class-specific logger.

    Keeps existing logging configuration; centralizes logger creation.
    """
    return logging.getLogger(name or __name__)