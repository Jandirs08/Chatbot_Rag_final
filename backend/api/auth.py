"""Authentication API endpoints."""
import logging
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, Request, status, Response

from models.auth import (
    LoginRequest,
    LogoutRequest,
    TokenResponse,
    RefreshTokenRequest,
    UserProfileResponse,
    AuthErrorResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from models.user import User
from database.user_repository import UserRepository, get_user_repository
from auth.jwt_handler import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    verify_token,
    decode_token,
    TokenExpiredError,
    InvalidTokenError,
    JWTError,
)
from auth.password_handler import verify_password, hash_password
from services.email_service import EmailService
from auth.dependencies import get_current_user, get_current_active_user, get_token_blacklist, extract_token_from_request
from config import get_settings
from utils.rate_limiter import conditional_limit
from utils.audit import audit

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
        429: {"description": "Too many requests"},
        422: {"description": "Validation error"},
        500: {"description": "Internal server error", "model": AuthErrorResponse}
    }
)
@conditional_limit(settings.login_rate_limit)
async def login(
    request: Request,
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
            logger.warning("Login attempt with non-existent email")
            audit("login_failure", None, email=login_data.email, ip=request.client.host if request.client else None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Check if user is active
        if not user.is_active:
            logger.warning("Login attempt by inactive user_id=%s", user.id)
            audit("login_failure", str(user.id), ip=request.client.host if request.client else None)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is inactive",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Verify password
        if not verify_password(login_data.password, user.hashed_password):
            logger.warning("Invalid password for user_id=%s", user.id)
            audit("login_failure", str(user.id), ip=request.client.host if request.client else None)
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

        logger.info("Successful login for user_id=%s", user.id)
        audit("login_success", str(user.id), ip=request.client.host if request.client else None)

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
        logger.error("Login error: %s", str(e))
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
        logger.debug("Profile requested for user_id=%s", current_user.id)
        
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
        logger.error("Error getting profile for user_id=%s: %s", current_user.id, str(e))
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
        429: {"description": "Too many requests"},
        422: {"description": "Validation error"},
        500: {"description": "Internal server error", "model": AuthErrorResponse}
    }
)
@conditional_limit(settings.auth_refresh_rate_limit)
async def refresh_access_token(
    request: Request,
    refresh_data: RefreshTokenRequest,
    user_repository: UserRepository = Depends(get_user_repository),
    token_blacklist=Depends(get_token_blacklist),
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
        jti = payload.get("jti")

        if not user_id:
            logger.warning("Refresh token missing user ID")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Reject blacklisted (already-used) refresh tokens.
        # Grace window: if the browser cancelled the response before receiving
        # new cookies, the same (now-blacklisted) RT arrives again. Return the
        # cached result instead of failing so the browser finally gets the cookies.
        if token_blacklist and jti and token_blacklist.is_blacklisted(jti):
            grace = token_blacklist.get_rotation_result(jti)
            if grace:
                logger.info("Returning cached rotation for jti=%s (grace window)", jti)
                return TokenResponse(**grace)
            logger.warning("Reuse of blacklisted refresh token jti=%s", jti)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token already used",
                headers={"WWW-Authenticate": "Bearer"},
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
            logger.warning("Refresh token for inactive user_id=%s", user.id)
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

        # Blacklist the consumed refresh token's JTI and cache the rotation
        # result for the grace window (handles browser-cancel race condition).
        if token_blacklist and jti:
            exp = payload.get("exp", 0)
            token_blacklist.blacklist(jti, int(exp))
            token_blacklist.store_rotation_result(jti, {
                "access_token": access_token,
                "refresh_token": new_refresh_token,
                "token_type": "bearer",
                "expires_in": settings.jwt_access_token_expire_minutes * 60,
            })

        logger.info("Token refreshed for user_id=%s", user.id)
        audit("token_refreshed", str(user.id))

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
    request: Request,
    logout_data: LogoutRequest = None,
    current_user: User = Depends(get_current_user),
    token_blacklist=Depends(get_token_blacklist),
    response: Response = None,
) -> Dict[str, str]:
    """Logout current user and revoke both access and refresh tokens."""
    logger.info("User logged out: user_id=%s", current_user.id)

    if token_blacklist:
        # Revoke the access token
        access_token_str = extract_token_from_request(request)
        if access_token_str:
            try:
                payload = decode_token(access_token_str)
                jti = payload.get("jti")
                exp = payload.get("exp", 0)
                if jti:
                    token_blacklist.blacklist(jti, int(exp))
            except Exception as exc:
                # Logout no debe fallar por error de revocación; logueamos a DEBUG
                # para diagnóstico sin afectar UX.
                logger.debug("Access token revocation skipped on logout: %s", exc)

        # Revoke the refresh token
        if logout_data and logout_data.refresh_token:
            try:
                payload = verify_token(logout_data.refresh_token, token_type="refresh")
                jti = payload.get("jti")
                exp = payload.get("exp", 0)
                if jti:
                    token_blacklist.blacklist(jti, int(exp))
            except Exception as exc:
                logger.debug("Refresh token revocation skipped on logout: %s", exc)

    if response is not None:
        response.delete_cookie(key="access_token", path="/")
    audit("logout", str(current_user.id), ip=request.client.host if request.client else None)
    return {"message": "Successfully logged out"}


@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    tags=["Authentication"],
)
@conditional_limit("5/hour")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    user_repository: UserRepository = Depends(get_user_repository),
) -> Dict[str, str]:
    try:
        user = await user_repository.get_user_by_email(payload.email)
        if user and user.is_active:
            token = create_reset_token({"sub": str(user.id)})
            base = getattr(settings, "password_reset_url_base", None)
            if not base:
                origin = (
                    getattr(settings, "client_origin_url", None)
                    or getattr(settings, "frontend_url", None)
                    or "http://localhost:3000"
                )
                base = f"{origin.rstrip('/')}/auth/reset-password"
            link = f"{base}?token={token}"
            svc = EmailService()
            await svc.send_reset_password(payload.email, link)
            audit("password_reset_requested", str(user.id), ip=request.client.host if request.client else None)
        return {"status": "ok"}
    except Exception:
        return {"status": "ok"}


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    tags=["Authentication"],
)
@conditional_limit("5/hour")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    user_repository: UserRepository = Depends(get_user_repository),
    token_blacklist=Depends(get_token_blacklist),
) -> Dict[str, str]:
    try:
        data = verify_token(payload.token, token_type="reset")
        user_id = data.get("sub")
        jti = data.get("jti")
        exp = data.get("exp", 0)
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        # Reject already-used reset tokens
        if token_blacklist and jti and token_blacklist.is_blacklisted(jti):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token already used")
        user = await user_repository.get_user_by_id(user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        hp = hash_password(payload.new_password)
        ok = await user_repository.update_password_by_id(str(user.id), hp)
        if not ok:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update password")
        # Consume the reset token so it cannot be reused
        if token_blacklist and jti:
            token_blacklist.blacklist(jti, int(exp))
        audit("password_reset_completed", str(user.id))
        return {"status": "ok"}
    except TokenExpiredError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


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
