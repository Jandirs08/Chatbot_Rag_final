"""Authentication API endpoints."""
import logging
from datetime import timedelta
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import HTTPAuthorizationCredentials

from models.auth import (
    LoginRequest, 
    TokenResponse, 
    RefreshTokenRequest, 
    UserProfileResponse,
    AuthErrorResponse
)
from models.user import User
from database.user_repository import UserRepository, get_user_repository
from auth.jwt_handler import (
    create_access_token, 
    create_refresh_token, 
    verify_token,
    TokenExpiredError,
    InvalidTokenError,
    JWTError
)
from auth.password_handler import verify_password
from auth.dependencies import get_current_user, get_current_active_user
from config import get_settings

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Get settings
settings = get_settings()


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="User login",
    description="Authenticate user and return JWT tokens",
    responses={
        200: {"description": "Login successful", "model": TokenResponse},
        400: {"description": "Invalid request", "model": AuthErrorResponse},
        401: {"description": "Invalid credentials", "model": AuthErrorResponse},
        422: {"description": "Validation error"},
        500: {"description": "Internal server error", "model": AuthErrorResponse}
    }
)
async def login(
    login_data: LoginRequest,
    user_repository: UserRepository = Depends(get_user_repository),
    response: Response = None,
) -> TokenResponse:
    """
    Authenticate user and return JWT tokens.
    
    Args:
        login_data: Login credentials
        user_repository: User repository dependency
        
    Returns:
        JWT access and refresh tokens
        
    Raises:
        HTTPException: If authentication fails
    """
    try:
        # Get user by email
        user = await user_repository.get_user_by_email(login_data.email)
        if not user:
            logger.warning(f"Login attempt with non-existent email: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # Check if user is active
        if not user.is_active:
            logger.warning(f"Login attempt by inactive user: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is inactive",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # Verify password
        if not verify_password(login_data.password, user.hashed_password):
            logger.warning(f"Invalid password for user: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # Create token data
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "is_admin": user.is_admin
        }
        
        # Create tokens
        access_token = create_access_token(data=token_data)
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        # Update last login
        await user_repository.update_last_login(str(user.id))
        
        logger.info(f"Successful login for user: {login_data.email}")
        
        if response is not None:
            secure_flag = str(settings.environment).lower() in ("production", "prod", "staging")
            response.set_cookie(
                key="access_token",
                value=access_token,
                httponly=True,
                samesite="lax",
                secure=secure_flag,
                max_age=settings.jwt_access_token_expire_minutes * 60,
                path="/",
            )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.jwt_access_token_expire_minutes * 60
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error for {login_data.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during login"
        )


@router.get(
    "/me",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
    description="Get the profile of the currently authenticated user",
    responses={
        200: {"description": "User profile retrieved", "model": UserProfileResponse},
        401: {"description": "Not authenticated", "model": AuthErrorResponse},
        500: {"description": "Internal server error", "model": AuthErrorResponse}
    }
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
) -> UserProfileResponse:
    """
    Get current user profile.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User profile information
    """
    try:
        logger.debug(f"Profile requested for user: {current_user.email}")
        
        return UserProfileResponse(
            id=str(current_user.id),
            email=current_user.email,
            full_name=current_user.full_name,
            is_active=current_user.is_active,
            is_admin=current_user.is_admin,
            created_at=current_user.created_at,
            updated_at=current_user.updated_at,
            last_login=current_user.last_login
        )
        
    except Exception as e:
        logger.error(f"Error getting profile for {current_user.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error retrieving profile"
        )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
    description="Use refresh token to get new access token",
    responses={
        200: {"description": "Token refreshed successfully", "model": TokenResponse},
        401: {"description": "Invalid or expired refresh token", "model": AuthErrorResponse},
        422: {"description": "Validation error"},
        500: {"description": "Internal server error", "model": AuthErrorResponse}
    }
)
async def refresh_access_token(
    refresh_data: RefreshTokenRequest,
    user_repository: UserRepository = Depends(get_user_repository),
    response: Response = None,
) -> TokenResponse:
    """
    Refresh access token using refresh token.
    
    Args:
        refresh_data: Refresh token request
        user_repository: User repository dependency
        
    Returns:
        New JWT access and refresh tokens
        
    Raises:
        HTTPException: If refresh token is invalid
    """
    try:
        # Verify refresh token
        payload = verify_token(refresh_data.refresh_token, token_type="refresh")
        user_id = payload.get("sub")
        
        if not user_id:
            logger.warning("Refresh token missing user ID")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # Get user from database
        user = await user_repository.get_user_by_id(user_id)
        if not user:
            logger.warning(f"Refresh token for non-existent user: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # Check if user is still active
        if not user.is_active:
            logger.warning(f"Refresh token for inactive user: {user.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is inactive",
                headers={"WWW-Authenticate": "Bearer"}
            )
        
        # Create new token data
        token_data = {
            "sub": str(user.id),
            "email": user.email,
            "is_admin": user.is_admin
        }
        
        # Create new tokens
        access_token = create_access_token(data=token_data)
        new_refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        logger.info(f"Token refreshed for user: {user.email}")
        
        if response is not None:
            secure_flag = str(settings.environment).lower() in ("production", "prod", "staging")
            response.set_cookie(
                key="access_token",
                value=access_token,
                httponly=True,
                samesite="lax",
                secure=secure_flag,
                max_age=settings.jwt_access_token_expire_minutes * 60,
                path="/",
            )

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=settings.jwt_access_token_expire_minutes * 60
        )
        
    except TokenExpiredError:
        logger.warning("Expired refresh token used")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except InvalidTokenError as e:
        logger.warning(f"Invalid refresh token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except JWTError as e:
        logger.error(f"JWT error during refresh: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refresh failed",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refresh token error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during token refresh"
        )


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="User logout",
    description="Logout current user (client-side token removal)",
    responses={
        200: {"description": "Logout successful"},
        401: {"description": "Not authenticated", "model": AuthErrorResponse}
    }
)
async def logout(
    current_user: User = Depends(get_current_user),
    response: Response = None,
) -> Dict[str, str]:
    """
    Logout current user.
    
    Note: This is primarily a client-side operation. The client should
    remove the tokens from storage. In a production environment, you might
    want to implement token blacklisting.
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        Logout confirmation message
    """
    logger.info(f"User logged out: {current_user.email}")
    
    if response is not None:
        response.delete_cookie(key="access_token", path="/")
    return {"message": "Successfully logged out"}


# Health check endpoint for auth service
@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Authentication service health check",
    description="Check if authentication service is working",
    include_in_schema=False  # Don't include in OpenAPI docs
)
async def auth_health_check() -> Dict[str, str]:
    """Authentication service health check."""
    return {"status": "healthy", "service": "authentication"}