"""
Middleware de autenticación para proteger rutas administrativas.

Este middleware intercepta requests automáticamente y valida tokens JWT
solo para rutas administrativas, manteniendo las rutas públicas accesibles.
"""
import logging
from typing import List, Optional
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from auth.jwt_handler import verify_token, JWTError
from database.user_repository import UserRepository
from database.mongodb import MongodbClient

logger = logging.getLogger(__name__)

class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Middleware de autenticación que protege rutas administrativas.
    
    Rutas públicas (sin autenticación):
    - /health
    - /api/v1/auth/*
    - /api/v1/chat/*
    
    Rutas protegidas (requieren admin):
    - /api/v1/pdf/*
    - /api/v1/rag/*
    - /api/v1/bot/*
    """
    
    def __init__(self, app):
        super().__init__(app)
        
        # Rutas que NO requieren autenticación
        self.public_paths: List[str] = [
            "/health",
            "/api/v1/auth",
            "/api/v1/chat",
            "/docs",
            "/redoc",
            "/openapi.json"
        ]
        
        # Rutas que requieren autenticación de admin
        self.protected_paths: List[str] = [
            "/api/v1/pdf",
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
    
    async def _extract_token_from_request(self, request: Request) -> Optional[str]:
        """Extrae el token JWT del header Authorization."""
        authorization: str = request.headers.get("Authorization")
        if not authorization:
            return None
        
        if not authorization.startswith("Bearer "):
            return None
        
        return authorization.split(" ")[1]
    
    async def _validate_admin_user(self, request: Request, token: str) -> bool:
        """
        Valida que el token sea válido y pertenezca a un usuario admin activo.
        
        Args:
            request: Request object para acceder al estado de la app
            token: JWT token a validar
            
        Returns:
            bool: True si el usuario es admin activo, False en caso contrario
        """
        try:
            # Obtener MongoDB client del estado de la aplicación
            if not hasattr(request.app.state, 'mongodb_client'):
                logger.error("MongoDB client no disponible en el estado de la aplicación")
                return False
            
            mongodb_client = request.app.state.mongodb_client
            user_repository = UserRepository(mongodb_client)
            
            # Verificar y decodificar token
            payload = verify_token(token)
            user_id = payload.get("sub")
            
            if not user_id:
                logger.warning("Token JWT sin user_id en payload")
                return False
            
            # Obtener usuario de la base de datos por ID
            user = await user_repository.get_user_by_id(user_id)
            
            if not user:
                logger.warning(f"Usuario no encontrado con ID: {user_id}")
                return False
            
            if not user.is_active:
                logger.warning(f"Usuario inactivo con ID: {user_id}")
                return False
            
            if not user.is_admin:
                logger.warning(f"Usuario sin permisos de admin con ID: {user_id}")
                return False
            
            # Actualizar último login
            await user_repository.update_last_login(str(user.id))
            
            logger.info(f"Acceso autorizado para admin: {user.username} (ID: {user_id})")
            return True
            
        except JWTError as e:
            logger.warning(f"Error de validación JWT: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Error inesperado en validación de admin: {str(e)}")
            return False
    
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
        
        # Si es una ruta protegida, validar autenticación
        if self._is_protected_path(path):
            logger.debug(f"Ruta protegida, validando autenticación: {path}")
            
            # Extraer token
            token = await self._extract_token_from_request(request)
            
            if not token:
                logger.warning(f"Acceso denegado - Token faltante para: {path}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={
                        "detail": "Token de autenticación requerido",
                        "error": "missing_token",
                        "path": path
                    }
                )
            
            # Validar que sea admin
            is_valid_admin = await self._validate_admin_user(request, token)
            
            if not is_valid_admin:
                logger.warning(f"Acceso denegado - Token inválido o sin permisos admin para: {path}")
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "detail": "Acceso denegado. Se requieren permisos de administrador",
                        "error": "insufficient_permissions",
                        "path": path
                    }
                )
            
            logger.info(f"Acceso autorizado a ruta protegida: {path}")
        
        # Continuar con el request
        return await call_next(request)