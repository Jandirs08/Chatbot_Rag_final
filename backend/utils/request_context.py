"""
Request context management using contextvars.

Provides request-scoped storage for request_id (correlation ID) that is
automatically propagated to all log messages within a request.

Usage:
    # In middleware (automatically done by RequestContextMiddleware):
    from utils.request_context import set_request_id
    set_request_id(request_id)
    
    # Anywhere in the request lifecycle:
    from utils.request_context import get_request_id
    current_request_id = get_request_id()
"""

import uuid
from contextvars import ContextVar
from typing import Optional

# Context variable to store request_id per request (async-safe)
_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def get_request_id() -> Optional[str]:
    """
    Get the current request ID from context.
    
    Returns:
        The request ID for the current request, or None if not in a request context.
    """
    return _request_id_ctx.get()


def set_request_id(request_id: Optional[str] = None) -> str:
    """
    Set the request ID for the current context.
    
    Args:
        request_id: The request ID to set. If None, generates a new UUID.
    
    Returns:
        The request ID that was set.
    """
    if request_id is None:
        request_id = str(uuid.uuid4())[:8]  # Short UUID for readability
    _request_id_ctx.set(request_id)
    return request_id


def clear_request_id() -> None:
    """Clear the request ID from the current context."""
    _request_id_ctx.set(None)
