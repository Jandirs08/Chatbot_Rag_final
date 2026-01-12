"""Health check related schemas."""

from pydantic import BaseModel

class HealthResponse(BaseModel):
    """Response model for health check endpoint."""
    status: str = "ok"
    version: str
    environment: str

class CacheHealthResponse(BaseModel):
    """Response model for cache health check endpoint."""
    backend_type: str
    is_degraded: bool
    redis_connected: bool
    message: str 