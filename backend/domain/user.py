"""User models for authentication and authorization."""
from datetime import datetime, timezone
from typing import Optional, Annotated
from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from bson import ObjectId


def validate_object_id(v):
    """Validate ObjectId."""
    if isinstance(v, ObjectId):
        return v
    if isinstance(v, str) and ObjectId.is_valid(v):
        return ObjectId(v)
    raise ValueError("Invalid ObjectId")


PyObjectId = Annotated[ObjectId, BeforeValidator(validate_object_id)]


class User(BaseModel):
    """User model for database operations."""
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    email: EmailStr = Field(..., description="User email address")
    hashed_password: str = Field(..., description="Hashed password")
    full_name: Optional[str] = Field(None, max_length=100, description="User's full name")
    is_active: bool = Field(default=True, description="Whether the user account is active")
    is_admin: bool = Field(default=False, description="Whether the user has admin privileges")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Account creation timestamp")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last update timestamp")
    last_login: Optional[datetime] = Field(None, description="Last login timestamp")

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        json_schema_extra = {
            "example": {
                "username": "admin",
                "email": "admin@example.com",
                "full_name": "Administrator",
                "is_active": True,
                "is_admin": True
            }
        }


class UserCreate(BaseModel):
    """Schema for user creation."""
    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (minimum 8 characters)")
    full_name: Optional[str] = Field(None, max_length=100, description="User's full name")

    class Config:
        json_schema_extra = {
            "example": {
                "username": "admin",
                "email": "admin@example.com",
                "password": "securepassword123",
                "full_name": "Administrator"
            }
        }


class UserLogin(BaseModel):
    """Schema for user login."""
    username: str = Field(..., description="Username or email")
    password: str = Field(..., description="User password")

    class Config:
        json_schema_extra = {
            "example": {
                "username": "admin",
                "password": "securepassword123"
            }
        }


class UserResponse(BaseModel):
    """Schema for user response (without sensitive data)."""
    id: str = Field(..., description="User ID")
    username: str = Field(..., description="Username")
    email: str = Field(..., description="Email address")
    full_name: Optional[str] = Field(None, description="Full name")
    is_active: bool = Field(..., description="Account status")
    is_admin: bool = Field(..., description="Admin privileges")
    created_at: datetime = Field(..., description="Creation timestamp")
    last_login: Optional[datetime] = Field(None, description="Last login timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "username": "admin",
                "email": "admin@example.com",
                "full_name": "Administrator",
                "is_active": True,
                "is_admin": True,
                "created_at": "2024-01-01T00:00:00Z",
                "last_login": "2024-01-01T12:00:00Z"
            }
        }


class UserUpdate(BaseModel):
    """Schema for user updates."""
    full_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        json_schema_extra = {
            "example": {
                "full_name": "Updated Name",
                "email": "newemail@example.com"
            }
        }