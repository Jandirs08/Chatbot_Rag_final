"""Health check routes for the API."""
from fastapi import APIRouter, status
from config import settings
from api.schemas.health import HealthResponse

router = APIRouter()

@router.get("/health", status_code=status.HTTP_200_OK, response_model=HealthResponse)
async def health_check():
    """Health check endpoint for the API."""
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        environment=settings.environment
    )