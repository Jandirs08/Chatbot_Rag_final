"""
Middleware de autenticación seguro sin errores 401/403 mezclados.
Corregido: PUBLIC no expone rutas internas por accidente.
"""

import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from .dependencies import _extract_token_from_request

logger = logging.getLogger(__name__)



class AuthenticationMiddleware(BaseHTTPMiddleware):

    # PUBLIC paths must be exact unless explicitly intended.
    PUBLIC_EXACT = {
        "/api/v1/health",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/chat",           # POST chat (SSE / mensajes)
        "/api/v1/whatsapp/webhook",
        "/docs",
        "/redoc",
        "/openapi.json",
    }

    # Prefix-based admin protection remains OK.
    ADMIN = {
        "/api/v1/pdfs",
        "/api/v1/rag",
        "/api/v1/bot",
        "/api/v1/users",
    }

    def _is_public_exact(self, path: str) -> bool:
        return path in self.PUBLIC_EXACT

    def _is_admin_path(self, path: str) -> bool:
        return any(path == p or path.startswith(p + "/") for p in self.ADMIN)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        if method == "OPTIONS":
            return await call_next(request)

        # --- PUBLIC exact paths
        if self._is_public_exact(path):
            return await call_next(request)

        # --- ADMIN protected paths
        if self._is_admin_path(path):
            token = _extract_token_from_request(request)
            if not token:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Authentication required"},
                )

            try:
                auth_deps = request.app.state.auth_deps

                bearer = HTTPAuthorizationCredentials(
                    scheme="Bearer",
                    credentials=token,
                )

                user = await auth_deps.extract_user_from_token(bearer)
                user = await auth_deps.ensure_active_user(user)
                await auth_deps.ensure_admin(user)

            except Exception as e:
                if hasattr(e, "status_code"):
                    return JSONResponse(
                        status_code=e.status_code,
                        content={"detail": e.detail},
                    )

                logger.error(f"Unexpected authentication error: {e}")
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Authorization error"},
                )

        return await call_next(request)
