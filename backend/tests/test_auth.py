"""
Unit tests for the auth module.

Covers:
- JWTHandler: create_access_token, verify_token (valid / expired / tampered)
- TokenBlacklist: is_blacklisted, blacklist  (Redis mocked via AsyncMock)
- AuthDependencies: extract_user_from_token, ensure_active_user
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt as jose_jwt

from auth.jwt_handler import (
    InvalidTokenError,
    JWTHandler,
    TokenExpiredError,
)
from auth.token_blacklist import TokenBlacklist
from auth.dependencies import AuthDependencies


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SECRET = "test-secret-key-for-unit-tests-only"
_ALGORITHM = "HS256"


# Module-level mark: every async def in this file runs under anyio
pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def jwt_settings():
    """Minimal mock of Settings required by JWTHandler."""
    secret = MagicMock()
    secret.get_secret_value.return_value = _SECRET

    settings = MagicMock()
    settings.jwt_secret = secret
    settings.jwt_algorithm = _ALGORITHM
    settings.jwt_access_token_expire_minutes = 30
    settings.jwt_refresh_token_expire_days = 7
    return settings


@pytest.fixture
def jwt_handler(jwt_settings):
    return JWTHandler(jwt_settings)


@pytest.fixture
def mock_redis():
    return AsyncMock()


@pytest.fixture
def blacklist(mock_redis):
    return TokenBlacklist(mock_redis)


@pytest.fixture
def active_user():
    user = MagicMock()
    user.is_active = True
    return user


@pytest.fixture
def inactive_user():
    user = MagicMock()
    user.is_active = False
    return user

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_expired_token() -> str:
    """Craft a signed JWT whose exp is 10 seconds in the past."""
    past = datetime.now(timezone.utc) - timedelta(seconds=10)
    payload = {
        "sub": "user-expired",
        "type": "access",
        "jti": "some-jti",
        "exp": past,
        "iat": past - timedelta(minutes=30),
    }
    return jose_jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def _make_credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


# ===========================================================================
# JWTHandler -- create_access_token
# ===========================================================================

class TestCreateAccessToken:
    def test_returns_decodable_jwt_with_correct_sub(self, jwt_handler):
        # Arrange
        data = {"sub": "user-123"}

        # Act
        token = jwt_handler.create_access_token(data)
        payload = jose_jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])

        # Assert
        assert payload["sub"] == "user-123"

    def test_token_contains_jti(self, jwt_handler):
        # Arrange / Act
        token = jwt_handler.create_access_token({"sub": "user-abc"})
        payload = jose_jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])

        # Assert -- jti must be a non-empty string
        assert isinstance(payload.get("jti"), str)
        assert len(payload["jti"]) > 0

    def test_token_type_is_access(self, jwt_handler):
        # Arrange / Act
        token = jwt_handler.create_access_token({"sub": "user-abc"})
        payload = jose_jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])

        # Assert
        assert payload["type"] == "access"

    def test_token_has_future_expiry(self, jwt_handler):
        # Arrange / Act
        token = jwt_handler.create_access_token({"sub": "user-abc"})
        payload = jose_jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])

        # Assert
        now_ts = int(datetime.now(timezone.utc).timestamp())
        assert payload["exp"] > now_ts

# ===========================================================================
# JWTHandler -- verify_token
# ===========================================================================

class TestVerifyToken:
    def test_returns_payload_for_valid_token(self, jwt_handler):
        # Arrange
        token = jwt_handler.create_access_token({"sub": "user-1"})

        # Act
        payload = jwt_handler.verify_token(token, "access")

        # Assert
        assert payload["sub"] == "user-1"
        assert payload["type"] == "access"

    def test_raises_token_expired_error(self, jwt_handler):
        # Arrange
        expired_token = _make_expired_token()

        # Act / Assert
        with pytest.raises(TokenExpiredError):
            jwt_handler.verify_token(expired_token, "access")

    def test_raises_invalid_token_error_for_tampered_signature(self, jwt_handler):
        # Arrange -- corrupt the signature section only
        token = jwt_handler.create_access_token({"sub": "user-1"})
        header, payload_b64, _sig = token.rsplit(".", 2)
        tampered = ".".join([header, payload_b64, "invalidsignatureXXX"])

        # Act / Assert
        with pytest.raises(InvalidTokenError):
            jwt_handler.verify_token(tampered, "access")

    def test_raises_invalid_token_error_for_wrong_type(self, jwt_handler):
        # Arrange -- token is access type but we ask for refresh
        token = jwt_handler.create_access_token({"sub": "user-1"})

        # Act / Assert
        with pytest.raises(InvalidTokenError):
            jwt_handler.verify_token(token, "refresh")


# ===========================================================================
# TokenBlacklist
# ===========================================================================

class TestTokenBlacklist:
    async def test_is_blacklisted_returns_false_when_jti_absent(
        self, blacklist, mock_redis
    ):
        # Arrange
        mock_redis.exists.return_value = 0

        # Act
        result = await blacklist.is_blacklisted("unknown-jti")

        # Assert
        assert result is False
        mock_redis.exists.assert_awaited_once_with("auth:jti:blocked:unknown-jti")

    async def test_is_blacklisted_returns_true_when_jti_present(
        self, blacklist, mock_redis
    ):
        # Arrange
        mock_redis.exists.return_value = 1

        # Act
        result = await blacklist.is_blacklisted("revoked-jti")

        # Assert
        assert result is True

    async def test_blacklist_calls_setex_with_correct_key_and_positive_ttl(
        self, blacklist, mock_redis
    ):
        # Arrange
        jti = "jti-to-block"
        future_exp = int(
            (datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()
        )

        # Act
        await blacklist.blacklist(jti, future_exp)

        # Assert
        mock_redis.setex.assert_awaited_once()
        key, ttl, _val = mock_redis.setex.call_args[0]
        assert key == "auth:jti:blocked:" + jti
        assert ttl > 0

# ===========================================================================
# AuthDependencies
# ===========================================================================

class TestExtractUserFromToken:
    async def test_valid_token_active_user_returns_user(
        self, jwt_handler, active_user, monkeypatch
    ):
        # Arrange
        token = jwt_handler.create_access_token({"sub": "user-99"})
        credentials = _make_credentials(token)

        mock_repo = AsyncMock()
        mock_repo.get_user_by_id.return_value = active_user
        mock_blacklist = AsyncMock()
        mock_blacklist.is_blacklisted.return_value = False

        monkeypatch.setattr("auth.dependencies.verify_token", jwt_handler.verify_token)
        auth_deps = AuthDependencies(mock_repo, mock_blacklist)

        # Act
        user = await auth_deps.extract_user_from_token(credentials)

        # Assert
        assert user is active_user

    async def test_blacklisted_token_raises_401(self, jwt_handler, monkeypatch):
        # Arrange
        token = jwt_handler.create_access_token({"sub": "user-99"})
        credentials = _make_credentials(token)

        mock_blacklist = AsyncMock()
        mock_blacklist.is_blacklisted.return_value = True

        monkeypatch.setattr("auth.dependencies.verify_token", jwt_handler.verify_token)
        auth_deps = AuthDependencies(AsyncMock(), mock_blacklist)

        # Act / Assert
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.extract_user_from_token(credentials)

        assert exc_info.value.status_code == 401
        assert "revoked" in exc_info.value.detail.lower()

    async def test_missing_credentials_raises_401(self):
        # Arrange
        auth_deps = AuthDependencies(AsyncMock(), None)

        # Act / Assert
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.extract_user_from_token(None)

        assert exc_info.value.status_code == 401


class TestEnsureActiveUser:
    async def test_active_user_is_returned_unchanged(self, active_user):
        # Arrange
        auth_deps = AuthDependencies(AsyncMock(), None)

        # Act
        result = await auth_deps.ensure_active_user(active_user)

        # Assert
        assert result is active_user

    async def test_inactive_user_raises_403(self, inactive_user):
        # Arrange
        auth_deps = AuthDependencies(AsyncMock(), None)

        # Act / Assert
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.ensure_active_user(inactive_user)

        assert exc_info.value.status_code == 403
        assert "inactive" in exc_info.value.detail.lower()
