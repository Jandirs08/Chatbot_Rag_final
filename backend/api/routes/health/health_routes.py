"""Health check routes for the API."""
from fastapi import APIRouter, status
from config import settings
from api.schemas.health import HealthResponse, CacheHealthResponse

router = APIRouter()

@router.get("/health", status_code=status.HTTP_200_OK, response_model=HealthResponse)
async def health_check():
    """Health check endpoint for the API."""
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        environment=settings.environment
    )

@router.get("/health/cache", status_code=status.HTTP_200_OK, response_model=CacheHealthResponse)
async def cache_health_check():
    """Cache health check endpoint to monitor backend status."""
    from cache.manager import cache
    health_status = cache.get_health_status()
    return CacheHealthResponse(**health_status)