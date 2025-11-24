"""User repository for MongoDB operations."""
import logging
from datetime import datetime, timezone
from typing import Optional, List
from pymongo.errors import DuplicateKeyError
from bson import ObjectId

from models.user import User, UserCreate, UserUpdate
from database.mongodb import MongodbClient

logger = logging.getLogger(__name__)


class UserRepository:
    """Repository class for user operations in MongoDB."""
    
    def __init__(self, mongodb_client: MongodbClient):
        """Initialize the user repository.
        
        Args:
            mongodb_client: MongoDB client instance
        """
        self.mongodb_client = mongodb_client
        self.collection_name = "users"
        # Los índices se aplican en el arranque de la aplicación (lifespan)
        # para evitar corutinas no esperadas dentro de __init__.
    
    def _ensure_indexes(self):
        """Deprecated: índices se aseguran desde MongodbClient en el startup."""
        logger.debug("_ensure_indexes() no-op; índices manejados en app startup.")
    
    async def create_user(self, user_data: UserCreate, hashed_password: str) -> Optional[User]:
        """Create a new user in the database.
        
        Args:
            user_data: User creation data
            hashed_password: Pre-hashed password
            
        Returns:
            Created user or None if creation failed
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            
            # Prepare user document
            user_doc = {
                "username": user_data.username,
                "email": user_data.email,
                "hashed_password": hashed_password,
                "full_name": user_data.full_name,
                "is_active": True,
                "is_admin": False,  # Default to non-admin
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "last_login": None
            }
            
            # Insert user
            result = await users_collection.insert_one(user_doc)
            
            if result.inserted_id:
                # Retrieve and return the created user
                created_user = await users_collection.find_one({"_id": result.inserted_id})
                return User(**created_user) if created_user else None
            
            return None
            
        except DuplicateKeyError as e:
            logger.warning(f"User creation failed - duplicate key: {e}")
            return None
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return None
    
    async def get_user_by_username(self, username: str) -> Optional[User]:
        """Get user by username.
        
        Args:
            username: Username to search for
            
        Returns:
            User if found, None otherwise
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            user_doc = await users_collection.find_one({"username": username})
            
            return User(**user_doc) if user_doc else None
            
        except Exception as e:
            logger.error(f"Error getting user by username: {e}")
            return None
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email.
        
        Args:
            email: Email to search for
            
        Returns:
            User if found, None otherwise
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            user_doc = await users_collection.find_one({"email": email})
            
            return User(**user_doc) if user_doc else None
            
        except Exception as e:
            logger.error(f"Error getting user by email: {e}")
            return None
    
    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID.
        
        Args:
            user_id: User ID to search for
            
        Returns:
            User if found, None otherwise
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            user_doc = await users_collection.find_one({"_id": ObjectId(user_id)})
            
            return User(**user_doc) if user_doc else None
            
        except Exception as e:
            logger.error(f"Error getting user by ID: {e}")
            return None
    
    async def update_user(self, user_id: str, user_update: UserUpdate) -> Optional[User]:
        """Update user information.
        
        Args:
            user_id: User ID to update
            user_update: Update data
            
        Returns:
            Updated user if successful, None otherwise
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            
            # Prepare update data (exclude None values)
            update_data = {k: v for k, v in user_update.dict().items() if v is not None}
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            # Update user
            result = await users_collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": update_data}
            )
            
            if result.modified_count > 0:
                # Return updated user
                updated_user = await users_collection.find_one({"_id": ObjectId(user_id)})
                return User(**updated_user) if updated_user else None
            
            return None
            
        except Exception as e:
            logger.error(f"Error updating user: {e}")
            return None
    
    async def update_last_login(self, user_id: str) -> bool:
        """Update user's last login timestamp.
        
        Args:
            user_id: User ID to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            
            result = await users_collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"last_login": datetime.now(timezone.utc)}}
            )
            
            return result.modified_count > 0
            
        except Exception as e:
            logger.error(f"Error updating last login: {e}")
            return False

    async def update_password_by_id(self, user_id: str, hashed_password: str) -> bool:
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            result = await users_collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"hashed_password": hashed_password, "updated_at": datetime.now(timezone.utc)}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error updating password by id: {e}")
            return False

    async def update_password_by_email(self, email: str, hashed_password: str) -> bool:
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            result = await users_collection.update_one(
                {"email": email},
                {"$set": {"hashed_password": hashed_password, "updated_at": datetime.now(timezone.utc)}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error updating password by email: {e}")
            return False
    
    async def deactivate_user(self, user_id: str) -> bool:
        """Deactivate a user account.
        
        Args:
            user_id: User ID to deactivate
            
        Returns:
            True if successful, False otherwise
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            
            result = await users_collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
            )
            
            return result.modified_count > 0
            
        except Exception as e:
            logger.error(f"Error deactivating user: {e}")
            return False
    
    async def get_all_users(self, skip: int = 0, limit: int = 100) -> List[User]:
        """Get all users with pagination.
        
        Args:
            skip: Number of users to skip
            limit: Maximum number of users to return
            
        Returns:
            List of users
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            
            cursor = users_collection.find().skip(skip).limit(limit)
            users = [User(**user_doc) async for user_doc in cursor]
            
            return users
            
        except Exception as e:
            logger.error(f"Error getting all users: {e}")
            return []
    
    async def count_users(self) -> int:
        """Count total number of users.
        
        Returns:
            Total number of users
        """
        try:
            users_collection = self.mongodb_client.db[self.collection_name]
            return await users_collection.count_documents({})
            
        except Exception as e:
            logger.error(f"Error counting users: {e}")
            return 0


# Dependency function for FastAPI
def get_user_repository() -> UserRepository:
    """Get UserRepository instance as a dependency.
    
    Returns:
        UserRepository instance
    """
    from database.mongodb import get_mongodb_client
    logger.debug("Usando cliente MongoDB global en get_user_repository")
    mongodb_client = get_mongodb_client()
    return UserRepository(mongodb_client)