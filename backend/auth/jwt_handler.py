"""
JWT utilities with hardened validation.
"""

import logging
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import jwt, JWTError as JoseJWTError

from config import Settings

logger = logging.getLogger(__name__)


# ----- Custom Exceptions -----

class JWTError(Exception):
    pass


class TokenExpiredError(JWTError):
    pass


class InvalidTokenError(JWTError):
    pass


# ----- Main Handler -----

class JWTHandler:
    def __init__(self, settings: Settings):
        self.settings = settings

        if not self.settings.jwt_secret:
            raise ValueError("JWT_SECRET must be set")

    @property
    def secret(self) -> str:
        return self.settings.jwt_secret.get_secret_value()

    @property
    def algorithm(self) -> str:
        return self.settings.jwt_algorithm

    # ------ Token Creation ------

    def create_access_token(self, data: Dict[str, Any]) -> str:
        payload = data.copy()
        payload.update({
            "exp": datetime.now(timezone.utc) + timedelta(
                minutes=self.settings.jwt_access_token_expire_minutes
            ),
            "iat": datetime.now(timezone.utc),
            "type": "access",
        })
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    def create_refresh_token(self, data: Dict[str, Any]) -> str:
        payload = data.copy()
        payload.update({
            "exp": datetime.now(timezone.utc) + timedelta(
                days=self.settings.jwt_refresh_token_expire_days
            ),
            "iat": datetime.now(timezone.utc),
            "type": "refresh",
            "jti": str(uuid4()),
        })
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    # ------ Token Verification ------

    def decode(self, token: str) -> Dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != self.algorithm:
                raise InvalidTokenError("Invalid algorithm")

            return jwt.decode(
                token, self.secret, algorithms=[self.algorithm]
            )

        except JoseJWTError as e:
            if "expired" in str(e).lower():
                raise TokenExpiredError("Token expired")
            raise InvalidTokenError("Invalid token")

        except Exception as e:
            raise JWTError(f"Decode error: {str(e)}")

    def verify_token(self, token: str, token_type: str = "access") -> Dict[str, Any]:
        payload = self.decode(token)

        if payload.get("type") != token_type:
            raise InvalidTokenError("Wrong token type")

        if not payload.get("sub"):
            raise InvalidTokenError("Missing subject")

        if token_type == "refresh" and not payload.get("jti"):
            raise InvalidTokenError("Refresh missing jti")

        return payload


# ---- Singleton via dependency-injected lifespan ----

_jwt_handler_instance: Optional[JWTHandler] = None


def get_jwt_handler() -> JWTHandler:
    global _jwt_handler_instance
    if _jwt_handler_instance is None:
        from config import get_settings
        _jwt_handler_instance = JWTHandler(get_settings())
    return _jwt_handler_instance


def create_access_token(data): return get_jwt_handler().create_access_token(data)
def create_refresh_token(data): return get_jwt_handler().create_refresh_token(data)
def verify_token(token, token_type="access"): return get_jwt_handler().verify_token(token, token_type)
def decode_token(token): return get_jwt_handler().decode(token)