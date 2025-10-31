"""Comprehensive tests for authentication module."""
import pytest
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import HTTPException, status
from jose import jwt

# Import modules to test
from auth.jwt_handler import (
    JWTHandler, 
    create_access_token, 
    create_refresh_token, 
    verify_token, 
    decode_token,
    JWTError,
    TokenExpiredError,
    InvalidTokenError
)
from auth.password_handler import (
    PasswordHandler,
    hash_password,
    verify_password,
    get_password_hash,
    password_needs_update
)
from auth.dependencies import AuthDependencies
from models.user import User
from models.auth import LoginRequest, TokenResponse, RefreshTokenRequest, UserProfileResponse
from config import Settings


class TestJWTHandler:
    """Test JWT handler functionality."""
    
    @pytest.fixture
    def mock_settings(self):
        """Mock settings for testing."""
        settings = MagicMock()
        settings.jwt_secret.get_secret_value.return_value = "test-secret-key-for-testing-only"
        settings.jwt_algorithm = "HS256"
        settings.jwt_access_token_expire_minutes = 30
        settings.jwt_refresh_token_expire_days = 7
        return settings
    
    @pytest.fixture
    def jwt_handler(self, mock_settings):
        """Create JWT handler instance for testing."""
        return JWTHandler(mock_settings)
    
    def test_jwt_handler_initialization(self, mock_settings):
        """Test JWT handler initialization."""
        handler = JWTHandler(mock_settings)
        assert handler.secret_key == "test-secret-key-for-testing-only"
        assert handler.algorithm == "HS256"
    
    def test_jwt_handler_invalid_config(self):
        """Test JWT handler with invalid configuration."""
        settings = MagicMock()
        settings.jwt_secret = None
        
        with pytest.raises(ValueError, match="JWT_SECRET must be configured"):
            JWTHandler(settings)
    
    def test_create_access_token(self, jwt_handler):
        """Test access token creation."""
        data = {"sub": "user123", "email": "test@example.com"}
        token = jwt_handler.create_access_token(data)
        
        assert isinstance(token, str)
        assert len(token) > 0
        
        # Decode and verify token content
        payload = jwt.decode(
            token, 
            jwt_handler.secret_key, 
            algorithms=[jwt_handler.algorithm]
        )
        assert payload["sub"] == "user123"
        assert payload["email"] == "test@example.com"
        assert payload["type"] == "access"
        assert "exp" in payload
        assert "iat" in payload
    
    def test_create_refresh_token(self, jwt_handler):
        """Test refresh token creation."""
        data = {"sub": "user123"}
        token = jwt_handler.create_refresh_token(data)
        
        assert isinstance(token, str)
        assert len(token) > 0
        
        # Decode and verify token content
        payload = jwt.decode(
            token, 
            jwt_handler.secret_key, 
            algorithms=[jwt_handler.algorithm]
        )
        assert payload["sub"] == "user123"
        assert payload["type"] == "refresh"
        assert "exp" in payload
        assert "iat" in payload
    
    def test_create_token_with_custom_expiry(self, jwt_handler):
        """Test token creation with custom expiry."""
        data = {"sub": "user123"}
        custom_expiry = timedelta(minutes=5)
        token = jwt_handler.create_access_token(data, expires_delta=custom_expiry)
        
        payload = jwt.decode(
            token, 
            jwt_handler.secret_key, 
            algorithms=[jwt_handler.algorithm]
        )
        
        # Check that expiry is approximately 5 minutes from now
        exp_time = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected_time = datetime.now(timezone.utc) + custom_expiry
        time_diff = abs((exp_time - expected_time).total_seconds())
        assert time_diff < 5  # Allow 5 seconds tolerance
    
    def test_decode_token_valid(self, jwt_handler):
        """Test decoding valid token."""
        data = {"sub": "user123", "email": "test@example.com"}
        token = jwt_handler.create_access_token(data)
        
        payload = jwt_handler.decode_token(token)
        assert payload["sub"] == "user123"
        assert payload["email"] == "test@example.com"
        assert payload["type"] == "access"
    
    def test_decode_token_invalid(self, jwt_handler):
        """Test decoding invalid token."""
        invalid_token = "invalid.token.here"
        
        with pytest.raises(InvalidTokenError):
            jwt_handler.decode_token(invalid_token)
    
    def test_decode_token_expired(self, jwt_handler):
        """Test decoding expired token."""
        data = {"sub": "user123"}
        # Create token that expires immediately
        expired_token = jwt_handler.create_access_token(
            data, 
            expires_delta=timedelta(seconds=-1)
        )
        
        with pytest.raises(TokenExpiredError):
            jwt_handler.decode_token(expired_token)
    
    def test_verify_token_valid_access(self, jwt_handler):
        """Test verifying valid access token."""
        data = {"sub": "user123", "email": "test@example.com"}
        token = jwt_handler.create_access_token(data)
        
        payload = jwt_handler.verify_token(token, "access")
        assert payload["sub"] == "user123"
        assert payload["type"] == "access"
    
    def test_verify_token_wrong_type(self, jwt_handler):
        """Test verifying token with wrong type."""
        data = {"sub": "user123"}
        access_token = jwt_handler.create_access_token(data)
        
        with pytest.raises(InvalidTokenError, match="Expected refresh token"):
            jwt_handler.verify_token(access_token, "refresh")
    
    def test_verify_token_missing_subject(self, jwt_handler):
        """Test verifying token without subject."""
        # Create token manually without 'sub' field
        payload = {
            "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
            "iat": datetime.now(timezone.utc),
            "type": "access"
        }
        token = jwt.encode(payload, jwt_handler.secret_key, algorithm=jwt_handler.algorithm)
        
        with pytest.raises(InvalidTokenError, match="Token missing subject"):
            jwt_handler.verify_token(token, "access")


class TestPasswordHandler:
    """Test password handler functionality."""
    
    @pytest.fixture
    def password_handler(self):
        """Create password handler instance for testing."""
        return PasswordHandler()
    
    def test_hash_password_valid(self, password_handler):
        """Test hashing valid password."""
        password = "testpassword123"
        hashed = password_handler.hash_password(password)
        
        assert isinstance(hashed, str)
        assert len(hashed) > 0
        assert hashed != password  # Should be different from original
        assert hashed.startswith("$2b$")  # bcrypt format
    
    def test_hash_password_empty(self, password_handler):
        """Test hashing empty password."""
        with pytest.raises(ValueError, match="Password must be a non-empty string"):
            password_handler.hash_password("")
        
        with pytest.raises(ValueError, match="Password cannot be empty"):
            password_handler.hash_password("   ")
    
    def test_hash_password_invalid_type(self, password_handler):
        """Test hashing invalid password type."""
        with pytest.raises(ValueError, match="Password must be a non-empty string"):
            password_handler.hash_password(None)
        
        with pytest.raises(ValueError, match="Password must be a non-empty string"):
            password_handler.hash_password(123)
    
    def test_verify_password_valid(self, password_handler):
        """Test verifying valid password."""
        password = "testpassword123"
        hashed = password_handler.hash_password(password)
        
        assert password_handler.verify_password(password, hashed) is True
        assert password_handler.verify_password("wrongpassword", hashed) is False
    
    def test_verify_password_invalid_inputs(self, password_handler):
        """Test verifying password with invalid inputs."""
        with pytest.raises(ValueError, match="Plain password must be a non-empty string"):
            password_handler.verify_password("", "hash")
        
        with pytest.raises(ValueError, match="Hashed password must be a non-empty string"):
            password_handler.verify_password("password", "")
    
    def test_needs_update(self, password_handler):
        """Test checking if password needs update."""
        password = "testpassword123"
        hashed = password_handler.hash_password(password)
        
        # Fresh hash should not need update
        assert password_handler.needs_update(hashed) is False
        
        # Invalid hash should need update
        assert password_handler.needs_update("invalid_hash") is True
        assert password_handler.needs_update("") is True
    
    def test_convenience_functions(self):
        """Test convenience functions."""
        password = "testpassword123"
        
        # Test hash_password function
        hashed1 = hash_password(password)
        hashed2 = get_password_hash(password)
        
        assert isinstance(hashed1, str)
        assert isinstance(hashed2, str)
        assert hashed1 != hashed2  # Different salts
        
        # Test verify_password function
        assert verify_password(password, hashed1) is True
        assert verify_password(password, hashed2) is True
        assert verify_password("wrong", hashed1) is False
        
        # Test password_needs_update function
        assert password_needs_update(hashed1) is False
        assert password_needs_update("invalid") is True


class TestAuthDependencies:
    """Test authentication dependencies."""
    
    @pytest.fixture
    def mock_user_repository(self):
        """Mock user repository."""
        repo = AsyncMock()
        return repo
    
    @pytest.fixture
    def auth_deps(self, mock_user_repository):
        """Create auth dependencies instance."""
        return AuthDependencies(mock_user_repository)
    
    @pytest.fixture
    def sample_user(self):
        """Create sample user for testing."""
        return User(
            id="507f1f77bcf86cd799439011",
            email="test@example.com",
            hashed_password="$2b$12$hashed_password",
            full_name="Test User",
            is_active=True,
            is_admin=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
    
    @pytest.mark.asyncio
    async def test_get_current_user_valid_token(self, auth_deps, mock_user_repository, sample_user):
        """Test getting current user with valid token."""
        # Mock repository response
        mock_user_repository.get_user_by_id.return_value = sample_user
        
        # Create valid token
        token_data = {"sub": str(sample_user.id), "email": sample_user.email}
        token = create_access_token(token_data)
        
        # Mock credentials
        credentials = MagicMock()
        credentials.credentials = token
        
        # Test
        user = await auth_deps.get_current_user(credentials)
        assert user.id == sample_user.id
        assert user.email == sample_user.email
        mock_user_repository.get_user_by_id.assert_called_once_with(str(sample_user.id))
    
    @pytest.mark.asyncio
    async def test_get_current_user_no_credentials(self, auth_deps):
        """Test getting current user without credentials."""
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.get_current_user(None)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Not authenticated" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_get_current_user_invalid_token(self, auth_deps):
        """Test getting current user with invalid token."""
        credentials = MagicMock()
        credentials.credentials = "invalid.token.here"
        
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.get_current_user(credentials)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    
    @pytest.mark.asyncio
    async def test_get_current_user_user_not_found(self, auth_deps, mock_user_repository):
        """Test getting current user when user not found in database."""
        # Mock repository to return None
        mock_user_repository.get_user_by_id.return_value = None
        
        # Create valid token
        token_data = {"sub": "nonexistent_user_id"}
        token = create_access_token(token_data)
        
        credentials = MagicMock()
        credentials.credentials = token
        
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.get_current_user(credentials)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert "User not found" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_get_current_active_user_active(self, auth_deps, sample_user):
        """Test getting current active user when user is active."""
        user = await auth_deps.get_current_active_user(sample_user)
        assert user == sample_user
    
    @pytest.mark.asyncio
    async def test_get_current_active_user_inactive(self, auth_deps, sample_user):
        """Test getting current active user when user is inactive."""
        sample_user.is_active = False
        
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.get_current_active_user(sample_user)
        
        assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
        assert "Inactive user" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_require_admin_is_admin(self, auth_deps, sample_user):
        """Test requiring admin when user is admin."""
        sample_user.is_admin = True
        
        user = await auth_deps.require_admin(sample_user)
        assert user == sample_user
    
    @pytest.mark.asyncio
    async def test_require_admin_not_admin(self, auth_deps, sample_user):
        """Test requiring admin when user is not admin."""
        sample_user.is_admin = False
        
        with pytest.raises(HTTPException) as exc_info:
            await auth_deps.require_admin(sample_user)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN
        assert "Not enough permissions" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_get_optional_current_user_valid(self, auth_deps, mock_user_repository, sample_user):
        """Test getting optional current user with valid token."""
        # Mock repository response
        mock_user_repository.get_user_by_id.return_value = sample_user
        
        # Create valid token
        token_data = {"sub": str(sample_user.id), "email": sample_user.email}
        token = create_access_token(token_data)
        
        credentials = MagicMock()
        credentials.credentials = token
        
        user = await auth_deps.get_optional_current_user(credentials)
        assert user.id == sample_user.id
    
    @pytest.mark.asyncio
    async def test_get_optional_current_user_no_credentials(self, auth_deps):
        """Test getting optional current user without credentials."""
        user = await auth_deps.get_optional_current_user(None)
        assert user is None
    
    @pytest.mark.asyncio
    async def test_get_optional_current_user_invalid_token(self, auth_deps):
        """Test getting optional current user with invalid token."""
        credentials = MagicMock()
        credentials.credentials = "invalid.token.here"
        
        user = await auth_deps.get_optional_current_user(credentials)
        assert user is None


def test_integration_jwt_and_password():
    """Integration test for JWT and password functionality."""
    # Create user data
    user_data = {
        "sub": "user123",
        "email": "test@example.com",
        "is_admin": False
    }
    
    # Test password hashing
    password = "securepassword123"
    hashed_password = hash_password(password)
    assert verify_password(password, hashed_password) is True
    
    # Test JWT token creation and verification
    access_token = create_access_token(user_data)
    refresh_token = create_refresh_token({"sub": user_data["sub"]})
    
    # Verify tokens
    access_payload = verify_token(access_token, "access")
    refresh_payload = verify_token(refresh_token, "refresh")
    
    assert access_payload["sub"] == user_data["sub"]
    assert access_payload["email"] == user_data["email"]
    assert refresh_payload["sub"] == user_data["sub"]
    
    print("✅ All authentication tests passed!")


if __name__ == "__main__":
    # Run integration test
    test_integration_jwt_and_password()
    print("🎉 Authentication module is working correctly!")