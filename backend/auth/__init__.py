"""Authentication module for JWT and password handling."""

from .jwt_handler import (
    create_access_token,
    create_refresh_token,
    verify_token,
    decode_token,
    JWTError,
    TokenExpiredError,
    InvalidTokenError
)
from .password_handler import (
    hash_password,
    verify_password
)
from .dependencies import (
    get_current_user,
    get_current_active_user,
    require_admin,
    get_optional_current_user
)

__all__ = [
    # JWT utilities
    "create_access_token",
    "create_refresh_token", 
    "verify_token",
    "decode_token",
    "JWTError",
    "TokenExpiredError",
    "InvalidTokenError",
    # Password utilities
    "hash_password",
    "verify_password",
    # Dependencies
    "get_current_user",
    "get_current_active_user",
    "require_admin",
    "get_optional_current_user"
]