"""
Middleware de autenticación seguro sin errores 401/403 mezclados.
"""

import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# No FastAPI dependency imports needed here; use app.state.auth_deps

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


class AuthenticationMiddleware(BaseHTTPMiddleware):

    PUBLIC = {
        "/api/v1/health",
        "/api/v1/auth",
        "/api/v1/chat",
        "/docs",
        "/redoc",
        "/openapi.json",
    }

    ADMIN = {
        "/api/v1/pdfs",
        "/api/v1/rag",
        "/api/v1/bot",
        "/api/v1/users",
    }

    def _match(self, path: str, patterns: set[str]) -> bool:
        """Prefix match but safe."""
        return any(path == p or path.startswith(p + "/") for p in patterns)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        if method == "OPTIONS":
            return await call_next(request)

        # 1. Rutas públicas
        if self._match(path, self.PUBLIC):
            return await call_next(request)

        # 2. Rutas admin
        if self._match(path, self.ADMIN):
            credentials = await security.__call__(request)
            if not credentials:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Authentication required"},
                )

            try:
                # Extract token string
                token = credentials.credentials

                # Get dependency container
                auth_deps = request.app.state.auth_deps

                # Build HTTPAuthorizationCredentials and perform checks
                bearer_credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
                user = await auth_deps.extract_user_from_token(bearer_credentials)
                user = await auth_deps.ensure_active_user(user)
                await auth_deps.ensure_admin(user)
            except Exception as e:
                # Mantener status original (401 o 403)
                if hasattr(e, "status_code"):
                    return JSONResponse(status_code=e.status_code, content={"detail": e.detail})

                logger.error(f"Unexpected authentication error: {e}")
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Authorization error"},
                )

        return await call_next(request)