"""API routes for user management.

Protección: todos los endpoints requieren usuario autenticado y activo.
Para restringir a admins en el futuro: cambiar Depends(get_current_active_user)
→ Depends(require_admin) en los endpoints que corresponda.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from pydantic import ValidationError
from typing import Optional, List, Dict, Any
from starlette.responses import Response

from database.user_repository import UserRepository, get_user_repository
from auth.password_handler import hash_password
from auth.dependencies import get_current_active_user
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])


class CreateUserRequest(BaseModel):
    username: str | None = None
    email: EmailStr
    password: str
    full_name: str | None = None
    is_admin: bool = False


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    is_admin: bool
    created_at: str
    updated_at: str
    last_login: str | None = None

    @classmethod
    def from_model(cls, u: User):
        return cls(
            id=str(u.id),
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            is_admin=u.is_admin,
            created_at=str(u.created_at),
            updated_at=str(u.updated_at),
            last_login=str(u.last_login) if u.last_login else None,
        )


class PaginatedUsersResponse(BaseModel):
    items: List[UserResponse]
    total: int
    skip: int
    limit: int


class UpdateUserRequest(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    is_admin: bool | None = None
    is_active: bool | None = None
    password: str | None = None


@router.get("/users", response_model=PaginatedUsersResponse)
async def list_users(
    _: User = Depends(get_current_active_user),
    user_repository: UserRepository = Depends(get_user_repository),
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
):
    """Lista usuarios. Requiere: usuario autenticado."""
    query: Dict[str, Any] = {}
    if search:
        query["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"username": {"$regex": search, "$options": "i"}},
        ]
    if role == "admin":
        query["is_admin"] = True
    elif role == "user":
        query["is_admin"] = False
    if is_active is not None:
        query["is_active"] = is_active

    users_collection = user_repository.mongodb_client.db[user_repository.collection_name]
    total = await users_collection.count_documents(query)
    cursor = users_collection.find(query).skip(skip).limit(limit)

    users: List[User] = []
    async for doc in cursor:
        try:
            users.append(User(**doc))
        except ValidationError as ve:
            logger.warning(f"Documento de usuario inválido omitido: {ve}")
            continue

    return PaginatedUsersResponse(
        items=[UserResponse.from_model(u) for u in users],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: CreateUserRequest,
    _: User = Depends(get_current_active_user),
    user_repository: UserRepository = Depends(get_user_repository),
):
    """Crea un usuario. Requiere: usuario autenticado."""
    if await user_repository.get_user_by_email(req.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    username = req.username or req.email.split("@")[0]
    if await user_repository.get_user_by_username(username):
        base = username
        for i in range(1, 51):
            candidate = f"{base}-{i}"
            if not await user_repository.get_user_by_username(candidate):
                username = candidate
                break
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to generate unique username",
            )

    hp = hash_password(req.password)
    req_with_username = CreateUserRequest(
        username=username,
        email=req.email,
        password=req.password,
        full_name=req.full_name,
        is_admin=req.is_admin,
    )
    created = await user_repository.create_user(user_data=req_with_username, hashed_password=hp)
    if not created:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user",
        )

    if req.is_admin:
        try:
            from bson import ObjectId
            users_collection = user_repository.mongodb_client.db[user_repository.collection_name]
            await users_collection.update_one(
                {"_id": ObjectId(str(created.id))},
                {"$set": {"is_admin": True}},
            )
            created.is_admin = True
        except Exception:
            logger.warning("Failed to set is_admin flag after creation")

    return UserResponse.from_model(created)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    req: UpdateUserRequest,
    _: User = Depends(get_current_active_user),
    user_repository: UserRepository = Depends(get_user_repository),
):
    """Actualiza un usuario. Requiere: usuario autenticado."""
    user = await user_repository.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_fields: dict = {}

    if req.email and req.email != user.email:
        if await user_repository.get_user_by_email(req.email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
        update_fields["email"] = req.email

    if req.full_name is not None:
        update_fields["full_name"] = req.full_name

    if req.is_admin is not None:
        update_fields["is_admin"] = req.is_admin

    if req.is_active is not None:
        update_fields["is_active"] = req.is_active

    if req.password:
        if (
            len(req.password) < 8
            or not any(c.isupper() for c in req.password)
            or not any(not c.isalnum() for c in req.password)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password does not meet policy requirements",
            )
        update_fields["hashed_password"] = hash_password(req.password)

    if not update_fields:
        return UserResponse.from_model(user)

    try:
        from bson import ObjectId
        users_collection = user_repository.mongodb_client.db[user_repository.collection_name]
        await users_collection.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})
        updated = await user_repository.get_user_by_id(user_id)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to load updated user",
            )
        return UserResponse.from_model(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user",
        )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    _: User = Depends(get_current_active_user),
    user_repository: UserRepository = Depends(get_user_repository),
):
    """Elimina un usuario. Requiere: usuario autenticado."""
    try:
        from bson import ObjectId
        users_collection = user_repository.mongodb_client.db[user_repository.collection_name]
        result = await users_collection.delete_one({"_id": ObjectId(user_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user",
        )