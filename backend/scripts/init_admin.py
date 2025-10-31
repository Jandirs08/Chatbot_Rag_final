"""Script to initialize the database with a default admin user."""
import asyncio
import logging
import sys
import os
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from passlib.context import CryptContext
from database.mongodb import MongodbClient
from database.user_repository import UserRepository
from models.user import UserCreate
from config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def create_admin_user():
    """Create the default admin user if it doesn't exist."""
    mongodb_client = None
    
    try:
        # Initialize MongoDB client
        mongodb_client = MongodbClient(
            mongo_uri=settings.mongo_uri,
            database_name=settings.mongo_database_name
        )
        
        # Initialize user repository
        user_repo = UserRepository(mongodb_client)
        
        # Check if admin user already exists
        admin_username = "admin"
        existing_admin = await user_repo.get_user_by_username(admin_username)
        
        if existing_admin:
            logger.info(f"Admin user '{admin_username}' already exists. Skipping creation.")
            return
        
        # Create admin user
        admin_password = "admin123"  # Default password - should be changed after first login
        hashed_password = pwd_context.hash(admin_password)
        
        admin_data = UserCreate(
            username=admin_username,
            email="admin@example.com",
            password=admin_password,  # This won't be used directly
            full_name="System Administrator"
        )
        
        # Create the user
        created_user = await user_repo.create_user(admin_data, hashed_password)
        
        if created_user:
            # Make the user an admin
            users_collection = mongodb_client.db["users"]
            users_collection.update_one(
                {"_id": created_user.id},
                {"$set": {"is_admin": True}}
            )
            
            logger.info(f"✅ Admin user created successfully!")
            logger.info(f"   Username: {admin_username}")
            logger.info(f"   Email: admin@example.com")
            logger.info(f"   Password: {admin_password}")
            logger.info(f"   ⚠️  IMPORTANT: Change the default password after first login!")
        else:
            logger.error("❌ Failed to create admin user")
            
    except Exception as e:
        logger.error(f"❌ Error creating admin user: {e}")
        
    finally:
        if mongodb_client:
            mongodb_client.close()


async def main():
    """Main function."""
    logger.info("🚀 Initializing admin user...")
    await create_admin_user()
    logger.info("✅ Admin initialization completed!")


if __name__ == "__main__":
    asyncio.run(main())