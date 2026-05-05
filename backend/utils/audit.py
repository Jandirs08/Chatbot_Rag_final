"""Audit logging helpers."""
import logging

logger = logging.getLogger("audit")


def audit(action: str, user_id: str | None, **kwargs) -> None:
    """Emit a structured audit log entry.

    Always logs at INFO level with audit=True so log processors can filter
    on that field independently of the normal application log stream.
    """
    try:
        parts = [f"audit=True", f"action={action}", f"user_id={user_id}"]
        parts += [f"{k}={v}" for k, v in kwargs.items()]
        logger.info(" | ".join(parts))
    except Exception:
        pass
