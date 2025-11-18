"""FastAPI dependencies for authentication and authorization."""
import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from models.user import User
from database.user_repository import UserRepository
from .jwt_handler import verify_token, TokenExpiredError, InvalidTokenError, JWTError

# Configure logging
logger = logging.getLogger(__name__)

# Security scheme for JWT Bearer tokens
security = HTTPBearer(auto_error=False)

class AuthDependencies:
    """Authentication dependencies for FastAPI."""
    
    def __init__(self, user_repository: UserRepository):
        """
        Initialize auth dependencies.
        
        Args:
            user_repository: User repository instance
        """
        self.user_repository = user_repository
    
    async def get_current_user(
        self,
        credentials: Optional[HTTPAuthorizationCredentials]
    ) -> User:
        """
        Get current authenticated user from JWT token.
        
        Args:
            credentials: HTTP Bearer credentials from request
            
        Returns:
            Current authenticated user
            
        Raises:
            HTTPException: If authentication fails
        """
        if not credentials:
            logger.warning("No credentials provided")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        try:
            # Verify the token
            payload = verify_token(credentials.credentials, token_type="access")
            user_id: str = payload.get("sub")
            
            if not user_id:
                logger.warning("Token missing user ID (sub)")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing user ID",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Get user from database
            user = await self.user_repository.get_user_by_id(user_id)
            if not user:
                logger.warning(f"User not found: {user_id}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            logger.debug(f"Successfully authenticated user: {user.email}")
            return user
            
        except TokenExpiredError:
            logger.warning("Token has expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except InvalidTokenError as e:
            logger.warning(f"Invalid token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError as e:
            logger.error(f"JWT error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            logger.error(f"Unexpected authentication error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal server error during authentication"
            )
    
    async def get_current_active_user(
        self,
        current_user: User
    ) -> User:
        """
        Get current authenticated and active user.
        
        Args:
            current_user: Current user from get_current_user dependency
            
        Returns:
            Current active user
            
        Raises:
            HTTPException: If user is inactive
        """
        if not current_user.is_active:
            logger.warning(f"Inactive user attempted access: {current_user.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Inactive user"
            )
        
        return current_user
    
    async def require_admin(
        self,
        current_user: User
    ) -> User:
        """
        Require admin privileges.
        
        Args:
            current_user: Current active user
            
        Returns:
            Current user if admin
            
        Raises:
            HTTPException: If user is not admin
        """
        if not current_user.is_admin:
            logger.warning(f"Non-admin user attempted admin access: {current_user.email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        
        return current_user
    
    async def get_optional_current_user(
        self,
        credentials: Optional[HTTPAuthorizationCredentials]
    ) -> Optional[User]:
        """
        Get current user if authenticated, None otherwise.
        
        This is useful for endpoints that work for both authenticated and 
        unauthenticated users but provide different functionality.
        
        Args:
            credentials: HTTP Bearer credentials from request
            
        Returns:
            Current user if authenticated, None otherwise
        """
        if not credentials:
            return None
        
        try:
            return await self.get_current_user(credentials)
        except HTTPException:
            # Log at debug level since this is expected behavior
            logger.debug("Optional authentication failed, returning None")
            return None
        except Exception as e:
            logger.warning(f"Unexpected error in optional auth: {str(e)}")
            return None

# Global dependencies instance (will be initialized in main app)
_auth_deps: Optional[AuthDependencies] = None

def get_auth_dependencies() -> AuthDependencies:
    """Get or create auth dependencies instance."""
    global _auth_deps
    if _auth_deps is None:
        from database.user_repository import get_user_repository
        user_repo = get_user_repository()
        _auth_deps = AuthDependencies(user_repo)
    return _auth_deps

# Convenience dependency functions
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> User:
    """Get current authenticated user."""
    auth_deps = get_auth_dependencies()
    return await auth_deps.get_current_user(credentials)

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current authenticated and active user."""
    auth_deps = get_auth_dependencies()
    return await auth_deps.get_current_active_user(current_user)

async def require_admin(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Require admin privileges."""
    auth_deps = get_auth_dependencies()
    return await auth_deps.require_admin(current_user)

async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[User]:
    """Get current user if authenticated, None otherwise."""
    auth_deps = get_auth_dependencies()
    return await auth_deps.get_optional_current_user(credentials)