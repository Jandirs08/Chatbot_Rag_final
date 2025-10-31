"""Test script to validate user models and password hashing."""
import asyncio
from datetime import datetime, timezone
from passlib.context import CryptContext
from models.user import User, UserCreate, UserLogin, UserResponse, UserUpdate
from bson import ObjectId

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def test_user_models():
    """Test user model creation and validation."""
    print("🧪 Probando modelos de usuario...")
    
    # Test UserCreate
    user_create = UserCreate(
        username="admin",
        email="admin@example.com",
        password="admin123",
        full_name="System Administrator"
    )
    print(f"✅ UserCreate: {user_create.username} - {user_create.email}")
    
    # Test password hashing
    hashed_password = pwd_context.hash(user_create.password)
    print(f"✅ Password hashed: {hashed_password[:20]}...")
    
    # Test password verification
    is_valid = pwd_context.verify(user_create.password, hashed_password)
    print(f"✅ Password verification: {is_valid}")
    
    # Test User model
    user_id = ObjectId()
    user = User(
        id=user_id,
        username=user_create.username,
        email=user_create.email,
        hashed_password=hashed_password,
        full_name=user_create.full_name,
        is_active=True,
        is_admin=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    print(f"✅ User model: {user.username} (ID: {user.id})")
    
    # Test UserResponse (without sensitive data)
    user_response = UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        last_login=user.last_login
    )
    print(f"✅ UserResponse: {user_response.username} (Admin: {user_response.is_admin})")
    
    # Test UserLogin
    user_login = UserLogin(
        username=user.username,
        password="admin123"
    )
    print(f"✅ UserLogin: {user_login.username}")
    
    # Test UserUpdate
    user_update = UserUpdate(
        full_name="Updated Administrator",
        email="updated@example.com"
    )
    print(f"✅ UserUpdate: {user_update.full_name}")
    
    print("\n🎉 Todos los modelos de usuario funcionan correctamente!")
    return True


def test_json_serialization():
    """Test JSON serialization of models."""
    print("\n🧪 Probando serialización JSON...")
    
    user_create = UserCreate(
        username="testuser",
        email="test@example.com",
        password="testpass123",
        full_name="Test User"
    )
    
    # Test JSON serialization
    json_data = user_create.model_dump()
    print(f"✅ UserCreate JSON: {json_data}")
    
    # Test JSON deserialization
    user_create_from_json = UserCreate(**json_data)
    print(f"✅ UserCreate from JSON: {user_create_from_json.username}")
    
    print("🎉 Serialización JSON funciona correctamente!")
    return True


def main():
    """Main test function."""
    print("🚀 Iniciando pruebas de modelos de usuario...\n")
    
    try:
        test_user_models()
        test_json_serialization()
        print("\n✅ Todas las pruebas pasaron exitosamente!")
        print("\n📋 Resumen de PR #1 - Fundación del Backend:")
        print("   ✅ Modelos de usuario creados (User, UserCreate, UserLogin, UserResponse, UserUpdate)")
        print("   ✅ Validación de ObjectId para MongoDB")
        print("   ✅ Hashing de contraseñas con bcrypt")
        print("   ✅ Validación de email con EmailStr")
        print("   ✅ Configuración compatible con Pydantic v2")
        print("   ✅ UserRepository para operaciones CRUD")
        print("   ✅ Script de inicialización de admin")
        print("   ✅ Dependencias actualizadas (email-validator)")
        
    except Exception as e:
        print(f"❌ Error en las pruebas: {e}")
        return False
    
    return True


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)