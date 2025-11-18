"""JWT token handling utilities."""
import logging
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Union
from jose import JWTError as JoseJWTError, jwt
from pydantic import ValidationError

from config import Settings

# Configure logging
logger = logging.getLogger(__name__)

# Custom JWT Exceptions
class JWTError(Exception):
    """Base JWT exception."""
    pass

class TokenExpiredError(JWTError):
    """Token has expired."""
    pass

class InvalidTokenError(JWTError):
    """Token is invalid."""
    pass

class JWTHandler:
    """JWT token handler with configuration management."""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self._validate_config()
    
    def _validate_config(self) -> None:
        """Validate JWT configuration."""
        if not self.settings.jwt_secret:
            raise ValueError("JWT_SECRET must be configured")
        
        if not self.settings.jwt_algorithm:
            raise ValueError("JWT_ALGORITHM must be configured")
    
    @property
    def secret_key(self) -> str:
        """Get JWT secret key."""
        return self.settings.jwt_secret.get_secret_value()
    
    @property
    def algorithm(self) -> str:
        """Get JWT algorithm."""
        return self.settings.jwt_algorithm
    
    def create_access_token(
        self, 
        data: Dict[str, Any], 
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """
        Create a JWT access token.
        
        Args:
            data: Payload data to encode in the token
            expires_delta: Custom expiration time, defaults to config value
            
        Returns:
            Encoded JWT token string
            
        Raises:
            JWTError: If token creation fails
        """
        try:
            to_encode = data.copy()
            
            # Set expiration time
            if expires_delta:
                expire = datetime.now(timezone.utc) + expires_delta
            else:
                expire = datetime.now(timezone.utc) + timedelta(
                    minutes=self.settings.jwt_access_token_expire_minutes
                )
            
            to_encode.update({
                "exp": expire,
                "iat": datetime.now(timezone.utc),
                "type": "access"
            })
            
            encoded_jwt = jwt.encode(
                to_encode, 
                self.secret_key, 
                algorithm=self.algorithm
            )
            
            logger.debug(f"Created access token for user: {data.get('sub', 'unknown')}")
            return encoded_jwt
            
        except Exception as e:
            logger.error(f"Failed to create access token: {str(e)}")
            raise JWTError(f"Token creation failed: {str(e)}")
    
    def create_refresh_token(
        self, 
        data: Dict[str, Any], 
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """
        Create a JWT refresh token.
        
        Args:
            data: Payload data to encode in the token
            expires_delta: Custom expiration time, defaults to config value
            
        Returns:
            Encoded JWT refresh token string
            
        Raises:
            JWTError: If token creation fails
        """
        try:
            to_encode = data.copy()
            
            # Set expiration time
            if expires_delta:
                expire = datetime.now(timezone.utc) + expires_delta
            else:
                expire = datetime.now(timezone.utc) + timedelta(
                    days=self.settings.jwt_refresh_token_expire_days
                )
            
            to_encode.update({
                "exp": expire,
                "iat": datetime.now(timezone.utc),
                "type": "refresh",
                "jti": str(uuid4())
            })
            
            encoded_jwt = jwt.encode(
                to_encode, 
                self.secret_key, 
                algorithm=self.algorithm
            )
            
            logger.debug(f"Created refresh token for user: {data.get('sub', 'unknown')}")
            return encoded_jwt
            
        except Exception as e:
            logger.error(f"Failed to create refresh token: {str(e)}")
            raise JWTError(f"Refresh token creation failed: {str(e)}")
    
    def decode_token(self, token: str) -> Dict[str, Any]:
        """
        Decode and validate a JWT token.
        
        Args:
            token: JWT token string to decode
            
        Returns:
            Decoded token payload
            
        Raises:
            TokenExpiredError: If token has expired
            InvalidTokenError: If token is invalid
            JWTError: For other JWT-related errors
        """
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != self.algorithm:
                raise InvalidTokenError("Invalid token algorithm")

            payload = jwt.decode(
                token, 
                self.secret_key, 
                algorithms=[self.algorithm]
            )
            
            # Validate token type exists
            if "type" not in payload:
                raise InvalidTokenError("Token missing type field")

            if payload.get("type") == "refresh" and not payload.get("jti"):
                raise InvalidTokenError("Refresh token missing jti")
            
            logger.debug(f"Successfully decoded {payload.get('type', 'unknown')} token")
            return payload
            
        except InvalidTokenError:
            raise
        except JoseJWTError as e:
            error_msg = str(e)
            logger.warning(f"JWT decode error: {error_msg}")
            
            if "expired" in error_msg.lower():
                raise TokenExpiredError("Token has expired")
            else:
                raise InvalidTokenError(f"Invalid token: {error_msg}")
        
        except Exception as e:
            logger.error(f"Unexpected error decoding token: {str(e)}")
            raise JWTError(f"Token decode failed: {str(e)}")
    
    def verify_token(self, token: str, token_type: str = "access") -> Dict[str, Any]:
        """
        Verify a JWT token and check its type.
        
        Args:
            token: JWT token string to verify
            token_type: Expected token type ("access" or "refresh")
            
        Returns:
            Decoded token payload if valid
            
        Raises:
            TokenExpiredError: If token has expired
            InvalidTokenError: If token is invalid or wrong type
            JWTError: For other JWT-related errors
        """
        payload = self.decode_token(token)
        
        # Verify token type
        if payload.get("type") != token_type:
            raise InvalidTokenError(f"Expected {token_type} token, got {payload.get('type')}")
        
        # Verify required fields
        if not payload.get("sub"):
            raise InvalidTokenError("Token missing subject (sub) field")
        if token_type == "refresh" and not payload.get("jti"):
            raise InvalidTokenError("Refresh token missing jti")
        
        logger.debug(f"Successfully verified {token_type} token for user: {payload.get('sub')}")
        return payload

# Global JWT handler instance (will be initialized in dependencies)
_jwt_handler: Optional[JWTHandler] = None

def get_jwt_handler() -> JWTHandler:
    """Get or create JWT handler instance."""
    global _jwt_handler
    if _jwt_handler is None:
        from config import get_settings
        settings = get_settings()
        _jwt_handler = JWTHandler(settings)
    return _jwt_handler

# Convenience functions for backward compatibility
def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create an access token."""
    return get_jwt_handler().create_access_token(data, expires_delta)

def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a refresh token."""
    return get_jwt_handler().create_refresh_token(data, expires_delta)

def verify_token(token: str, token_type: str = "access") -> Dict[str, Any]:
    """Verify a token."""
    return get_jwt_handler().verify_token(token, token_type)

def decode_token(token: str) -> Dict[str, Any]:
    """Decode a token."""
    return get_jwt_handler().decode_token(token)