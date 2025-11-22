"""
FastAPI dependencies for authentication and authorization.
Simplified, safer, no global singletons, no redundancy.
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials,
    OAuth2PasswordBearer,
)

from models.user import User
from database.user_repository import UserRepository
from .jwt_handler import (
    verify_token,
    TokenExpiredError,
    InvalidTokenError,
    JWTError,
)

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,
)


class AuthDependencies:
    """Container for auth-related operations."""

    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def extract_user_from_token(
        self,
        credentials: Optional[HTTPAuthorizationCredentials],
    ) -> User:
        """Decode JWT, validate it, and load user from DB."""
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = credentials.credentials

        try:
            payload = verify_token(token, token_type="access")
            user_id = payload.get("sub")

            if not user_id:
                logger.warning("JWT missing 'sub' claim")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing subject",
                )

            user = await self.user_repository.get_user_by_id(user_id)
            if not user:
                logger.warning(f"User not found for id: {user_id}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                )

            return user

        except TokenExpiredError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError as e:
            logger.error(f"JWT error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication error",
            )

    async def ensure_active_user(self, user: User) -> User:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is inactive",
            )
        return user

    async def ensure_admin(self, user: User) -> User:
        if not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required",
            )
        return user


# -------- FASTAPI DEPENDENCY WRAPPERS ----------

def _get_auth_deps(request: Request) -> AuthDependencies:
    """Get instance from app.state initialized in lifespan."""
    return request.app.state.auth_deps


def _extract_token_from_request(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization")
    if auth_header and isinstance(auth_header, str):
        parts = auth_header.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1]:
            return parts[1]

    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token

    return None


async def get_current_user(
    request: Request,
    deps: AuthDependencies = Depends(_get_auth_deps),
) -> User:
    token = _extract_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=token,
    )
    return await deps.extract_user_from_token(credentials)


async def get_current_active_user(
    user: User = Depends(get_current_user),
    deps: AuthDependencies = Depends(_get_auth_deps),
) -> User:
    return await deps.ensure_active_user(user)


async def require_admin(
    user: User = Depends(get_current_active_user),
    deps: AuthDependencies = Depends(_get_auth_deps),
) -> User:
    return await deps.ensure_admin(user)


async def get_optional_current_user(
    request: Request,
    deps: AuthDependencies = Depends(_get_auth_deps),
) -> Optional[User]:
    token = _extract_token_from_request(request)
    if not token:
        return None

    try:
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )
        return await deps.extract_user_from_token(credentials)
    except Exception:
        # Token inválido o expirado → tratamos como "no autenticado"
        return None
