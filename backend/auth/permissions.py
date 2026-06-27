from __future__ import annotations

from enum import StrEnum

from fastapi import Depends, HTTPException, status

from domain.user import User

from .dependencies import get_current_active_user


class Permission(StrEnum):
    MANAGE_DOCUMENTS = "manage_documents"
    MANAGE_USERS = "manage_users"
    VIEW_DEBUG = "view_debug"
    MANAGE_BOT_CONFIG = "manage_bot_config"


def user_has_permission(user: User, permission: Permission) -> bool:
    """Semantic permission layer.

    Today every permission maps to `is_admin`. Keeping the indirection lets us
    split roles later without rewriting route dependencies.
    """
    del permission
    return bool(getattr(user, "is_admin", False))


def require_permission(permission: Permission):
    async def _dependency(user: User = Depends(get_current_active_user)) -> User:
        if not user_has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {permission.value}",
            )
        return user

    return _dependency


require_manage_documents = require_permission(Permission.MANAGE_DOCUMENTS)
require_manage_users = require_permission(Permission.MANAGE_USERS)
require_view_debug = require_permission(Permission.VIEW_DEBUG)
require_manage_bot_config = require_permission(Permission.MANAGE_BOT_CONFIG)
