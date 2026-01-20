"""Health check routes for the API."""
import asyncio
import time
from fastapi import APIRouter, status, Request
from fastapi.responses import JSONResponse
from config import settings
from api.schemas.health import (
    HealthResponse,
    CacheHealthResponse,
    ReadinessResponse,
    DependencyStatus,
)
from utils.logging_utils import get_logger

logger = get_logger(__name__)
router = APIRouter()

# Timeout para checks de dependencias (en segundos)
DEPENDENCY_CHECK_TIMEOUT = 3.0


@router.get("/health", status_code=status.HTTP_200_OK, response_model=HealthResponse)
async def health_check():
    """
    Health check básico (liveness probe).
    Siempre retorna 200 si la app está corriendo.
    """
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


@router.get("/health/ready", response_model=ReadinessResponse)
async def readiness_check(request: Request):
    """
    Readiness probe que valida todas las dependencias.
    
    Usado por load balancers para determinar si el servicio puede recibir tráfico.
    
    Estados posibles:
    - healthy: Todas las dependencias conectadas
    - degraded: Algunas dependencias degradadas pero funcionales
    - unhealthy: Dependencias críticas caídas (MongoDB o Qdrant)
    
    Status codes:
    - 200: healthy o degraded (puede recibir tráfico)
    - 503: unhealthy (no debe recibir tráfico)
    """
    mongodb_status = await _check_mongodb(request)
    redis_status = await _check_redis()
    qdrant_status = await _check_qdrant(request)
    
    # Determinar estado general
    critical_down = (
        mongodb_status.status == "disconnected" or
        qdrant_status.status == "disconnected"
    )
    any_degraded = (
        mongodb_status.status == "degraded" or
        redis_status.status == "degraded" or
        qdrant_status.status == "degraded"
    )
    
    if critical_down:
        overall_status = "unhealthy"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    elif any_degraded:
        overall_status = "degraded"
        http_status = status.HTTP_200_OK
    else:
        overall_status = "healthy"
        http_status = status.HTTP_200_OK
    
    response_data = ReadinessResponse(
        status=overall_status,
        mongodb=mongodb_status,
        redis=redis_status,
        qdrant=qdrant_status,
    )
    
    return JSONResponse(
        content=response_data.model_dump(),
        status_code=http_status
    )


async def _check_mongodb(request: Request) -> DependencyStatus:
    """Valida conexión a MongoDB con timeout."""
    try:
        start = time.perf_counter()
        
        # Obtener cliente desde el state de la app
        db_client = getattr(request.app.state, "db_client", None)
        if db_client is None:
            from database.mongodb import get_mongodb_client
            db_client = get_mongodb_client()
        
        # Ejecutar ping con timeout
        async def ping():
            await db_client.client.admin.command("ping")
        
        await asyncio.wait_for(ping(), timeout=DEPENDENCY_CHECK_TIMEOUT)
        latency = (time.perf_counter() - start) * 1000
        
        return DependencyStatus(
            status="connected",
            latency_ms=round(latency, 2),
            message="MongoDB responding normally"
        )
    except asyncio.TimeoutError:
        logger.warning("[HEALTH] MongoDB check timeout")
        return DependencyStatus(
            status="degraded",
            message=f"MongoDB timeout (>{DEPENDENCY_CHECK_TIMEOUT}s)"
        )
    except Exception as e:
        logger.error(f"[HEALTH] MongoDB check failed: {e}")
        return DependencyStatus(
            status="disconnected",
            message=f"MongoDB connection failed: {str(e)[:100]}"
        )


async def _check_redis() -> DependencyStatus:
    """Valida conexión a Redis (degraded si usa InMemory fallback)."""
    try:
        from cache.manager import cache
        health = cache.get_health_status()
        
        if health.get("redis_connected"):
            return DependencyStatus(
                status="connected",
                backend="RedisCache",
                message="Redis connected"
            )
        else:
            # Está usando InMemory fallback - degraded pero funcional
            return DependencyStatus(
                status="degraded",
                backend=health.get("backend_type", "InMemoryCache"),
                message=health.get("message", "Using in-memory fallback")
            )
    except Exception as e:
        logger.error(f"[HEALTH] Redis check failed: {e}")
        return DependencyStatus(
            status="degraded",
            backend="Unknown",
            message=f"Cache check failed: {str(e)[:100]}"
        )


async def _check_qdrant(request: Request) -> DependencyStatus:
    """Valida conexión a Qdrant con timeout."""
    try:
        start = time.perf_counter()
        
        # Obtener vector_store desde el state de la app
        vector_store = getattr(request.app.state, "vector_store", None)
        if vector_store is None:
            return DependencyStatus(
                status="degraded",
                message="VectorStore not initialized"
            )
        
        # Ejecutar count con timeout (operación ligera)
        async def get_collection_info():
            return await asyncio.to_thread(
                vector_store.client.count,
                collection_name=vector_store.collection_name
            )
        
        result = await asyncio.wait_for(get_collection_info(), timeout=DEPENDENCY_CHECK_TIMEOUT)
        latency = (time.perf_counter() - start) * 1000
        
        return DependencyStatus(
            status="connected",
            latency_ms=round(latency, 2),
            collection=vector_store.collection_name,
            points_count=result.count if hasattr(result, 'count') else None,
            message="Qdrant responding normally"
        )
    except asyncio.TimeoutError:
        logger.warning("[HEALTH] Qdrant check timeout")
        return DependencyStatus(
            status="degraded",
            message=f"Qdrant timeout (>{DEPENDENCY_CHECK_TIMEOUT}s)"
        )
    except Exception as e:
        logger.error(f"[HEALTH] Qdrant check failed: {e}")
        return DependencyStatus(
            status="disconnected",
            message=f"Qdrant connection failed: {str(e)[:100]}"
        )