"""
Middleware de autenticación para proteger rutas administrativas.

Este middleware intercepta requests automáticamente y delega la validación
de usuarios y permisos a las dependencias estándar, manteniendo las rutas
públicas accesibles.
"""
import logging
from typing import List
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from auth.dependencies import (
    security,
    get_current_user,
    get_current_active_user,
    require_admin,
)

logger = logging.getLogger(__name__)

class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Middleware de autenticación que protege rutas administrativas.
    
    Rutas públicas (sin autenticación):
    - /api/v1/health
    - /api/v1/auth/*
    - /api/v1/chat/*
    - /docs, /redoc, /openapi.json
    
    Rutas protegidas (requieren admin):
    - /api/v1/pdfs/*
    - /api/v1/rag/*
    - /api/v1/bot/*
    - /api/v1/users/*
    """
    
    def __init__(self, app):
        super().__init__(app)
        
        # Rutas que NO requieren autenticación
        self.public_paths: List[str] = [
            "/api/v1/health",
            "/api/v1/auth",
            "/api/v1/chat",
            "/docs",
            "/redoc",
            "/openapi.json"
        ]
        
        # Rutas que requieren autenticación de admin
        self.protected_paths: List[str] = [
            "/api/v1/pdfs",
            "/api/v1/rag", 
            "/api/v1/bot",
            "/api/v1/users"
        ]
    
    def _is_public_path(self, path: str) -> bool:
        """Verifica si una ruta es pública (no requiere autenticación)."""
        return any(path.startswith(public_path) for public_path in self.public_paths)
    
    def _is_protected_path(self, path: str) -> bool:
        """Verifica si una ruta está protegida (requiere autenticación)."""
        return any(path.startswith(protected_path) for protected_path in self.protected_paths)
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Procesa cada request y aplica autenticación según la ruta.
        """
        path = request.url.path
        method = request.method

        # Preflight CORS: permitir siempre que CORSMiddleware gestione los headers
        if method == "OPTIONS":
            return await call_next(request)
        
        logger.debug(f"Middleware procesando: {method} {path}")
        
        # Si es una ruta pública, continuar sin autenticación
        if self._is_public_path(path):
            logger.debug(f"Ruta pública permitida: {path}")
            return await call_next(request)
        
        # Si es una ruta protegida, validar autenticación delegando en dependencias
        if self._is_protected_path(path):
            logger.debug(f"Ruta protegida, validando autenticación: {path}")
            
            # Obtener credenciales Bearer usando el esquema estándar
            credentials = await security.__call__(request)
            
            if not credentials:
                logger.warning(f"Acceso denegado - Token faltante para: {path}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={
                        "detail": "Token de autenticación requerido",
                        "error": "missing_token",
                        "path": path
                    }
                )
            
            # Validación completa delegada:
            try:
                current_user = await get_current_user(credentials)
                active_user = await get_current_active_user(current_user)
                await require_admin(active_user)
                logger.info(f"Acceso autorizado a ruta protegida: {path}")
            except HTTPException as e:
                logger.warning(
                    f"Acceso denegado para ruta protegida {path} - {e.detail}"
                )
                # Mantener respuesta similar: usar 403 para fallos de autorización
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "detail": "Acceso denegado. Se requieren permisos de administrador",
                        "error": "insufficient_permissions",
                        "path": path
                    }
                )
            except Exception as e:
                logger.error(f"Error inesperado de autenticación en {path}: {str(e)}")
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "detail": "Acceso denegado por error de autenticación",
                        "error": "auth_error",
                        "path": path
                    }
                )
        
        # Continuar con el request
        return await call_next(request)