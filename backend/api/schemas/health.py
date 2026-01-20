"""Health check related schemas."""

from typing import Optional
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


class DependencyStatus(BaseModel):
    """Status of a single dependency."""
    status: str  # "connected", "degraded", "disconnected"
    latency_ms: Optional[float] = None
    message: Optional[str] = None
    # Extra fields for specific dependencies
    backend: Optional[str] = None  # For Redis
    collection: Optional[str] = None  # For Qdrant
    points_count: Optional[int] = None  # For Qdrant


class ReadinessResponse(BaseModel):
    """
    Response model for readiness check endpoint.
    Used by load balancers to determine if the service is ready to receive traffic.
    """
    status: str  # "healthy", "degraded", "unhealthy"
    mongodb: DependencyStatus
    redis: DependencyStatus
    qdrant: DependencyStatus 