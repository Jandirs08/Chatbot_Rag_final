"""
Middleware de autenticación.

Dos niveles:
  - PUBLIC  → acceso libre, sin token.
  - AUTHENTICATED → requiere token JWT válido + usuario activo.

Los endpoints protegidos también declaran su propio Depends() para hacer
la protección explícita por ruta (defense-in-depth). Esto facilita añadir
roles granulares mañana cambiando solo el Depends() del endpoint afectado.
"""

import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from .dependencies import _extract_token_from_request

logger = logging.getLogger(__name__)


class AuthenticationMiddleware(BaseHTTPMiddleware):

    # Rutas exactas que no requieren token.
    PUBLIC_EXACT: frozenset[str] = frozenset({
        "/api/v1/health",
        # Auth — sin token (login, refresh, recuperación de contraseña)
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        # Widget público — el chat del cliente no requiere login
        "/api/v1/chat",
        "/api/v1/bot/config/public",
        "/api/v1/whatsapp/webhook",
        # Assets públicos — el logo se muestra en el widget sin autenticación
        "/api/v1/assets/logo",
        # Docs
        "/docs",
        "/redoc",
        "/openapi.json",
    })

    # Prefijos que requieren usuario autenticado y activo.
    # NOTA: /api/v1/assets NO está aquí porque GET /logo es público.
    #       POST/DELETE /logo usan Depends(require_admin) directamente en la ruta.
    # Añadir prefijos aquí cuando se creen nuevos módulos protegidos.
    AUTHENTICATED_PREFIXES: tuple[str, ...] = (
        "/api/v1/pdfs",
        "/api/v1/rag",
        "/api/v1/bot",
        "/api/v1/users",
    )

    def _is_public(self, path: str) -> bool:
        return path in self.PUBLIC_EXACT

    def _requires_auth(self, path: str) -> bool:
        return any(
            path == prefix or path.startswith(prefix + "/")
            for prefix in self.AUTHENTICATED_PREFIXES
        )

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        # OPTIONS siempre pasa (preflight CORS).
        if method == "OPTIONS":
            return await call_next(request)

        # Rutas públicas pasan sin verificación.
        if self._is_public(path):
            return await call_next(request)

        # Rutas autenticadas: verificar token + usuario activo.
        if self._requires_auth(path):
            token = _extract_token_from_request(request)
            if not token:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Authentication required"},
                    headers={"WWW-Authenticate": "Bearer"},
                )

            try:
                auth_deps = request.app.state.auth_deps
                bearer = HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials=token,
                )
                user = await auth_deps.extract_user_from_token(bearer)
                await auth_deps.ensure_active_user(user)

            except Exception as e:
                if hasattr(e, "status_code"):
                    return JSONResponse(
                        status_code=e.status_code,
                        content={"detail": e.detail},
                    )
                logger.error(f"Unexpected authentication error: {e}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Authentication error"},
                )

        return await call_next(request)
