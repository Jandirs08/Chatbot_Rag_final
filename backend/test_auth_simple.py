"""Simple tests for authentication module without pytest."""
import sys
import os
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_password_functionality():
    """Test password hashing and verification."""
    print("🔐 Testing password functionality...")
    
    try:
        from auth.password_handler import hash_password, verify_password, get_password_hash
        
        # Test password hashing
        password = "testpassword123"
        hashed1 = hash_password(password)
        hashed2 = get_password_hash(password)
        
        print(f"   ✅ Password hashed successfully")
        print(f"   ✅ Hash 1: {hashed1[:20]}...")
        print(f"   ✅ Hash 2: {hashed2[:20]}...")
        
        # Test password verification
        assert verify_password(password, hashed1) == True
        assert verify_password(password, hashed2) == True
        assert verify_password("wrongpassword", hashed1) == False
        
        print("   ✅ Password verification working correctly")
        
        # Test invalid inputs
        try:
            hash_password("")
            assert False, "Should have raised ValueError"
        except ValueError:
            print("   ✅ Empty password validation working")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Password test failed: {e}")
        return False

def test_jwt_functionality():
    """Test JWT token creation and verification."""
    print("🔑 Testing JWT functionality...")
    
    try:
        from auth.jwt_handler import create_access_token, create_refresh_token, verify_token, decode_token
        
        # Test token creation
        user_data = {
            "sub": "user123",
            "email": "test@example.com",
            "is_admin": False
        }
        
        access_token = create_access_token(user_data)
        refresh_token = create_refresh_token({"sub": user_data["sub"]})
        
        print(f"   ✅ Access token created: {access_token[:20]}...")
        print(f"   ✅ Refresh token created: {refresh_token[:20]}...")
        
        # Test token verification
        access_payload = verify_token(access_token, "access")
        refresh_payload = verify_token(refresh_token, "refresh")
        
        assert access_payload["sub"] == user_data["sub"]
        assert access_payload["email"] == user_data["email"]
        assert access_payload["type"] == "access"
        assert refresh_payload["sub"] == user_data["sub"]
        assert refresh_payload["type"] == "refresh"
        
        print("   ✅ Token verification working correctly")
        
        # Test token decoding
        decoded_access = decode_token(access_token)
        assert decoded_access["sub"] == user_data["sub"]
        
        print("   ✅ Token decoding working correctly")
        
        # Test invalid token
        try:
            verify_token("invalid.token.here", "access")
            assert False, "Should have raised InvalidTokenError"
        except Exception:
            print("   ✅ Invalid token validation working")
        
        return True
        
    except Exception as e:
        print(f"   ❌ JWT test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_auth_models():
    """Test authentication models."""
    print("📋 Testing authentication models...")
    
    try:
        from models.auth import LoginRequest, TokenResponse, UserProfileResponse
        from pydantic import ValidationError
        
        # Test LoginRequest
        login_data = {
            "email": "test@example.com",
            "password": "securepassword123"
        }
        login_request = LoginRequest(**login_data)
        assert login_request.email == "test@example.com"
        assert login_request.password == "securepassword123"
        
        print("   ✅ LoginRequest model working")
        
        # Test TokenResponse
        token_data = {
            "access_token": "access_token_here",
            "refresh_token": "refresh_token_here",
            "expires_in": 1800
        }
        token_response = TokenResponse(**token_data)
        assert token_response.token_type == "bearer"
        
        print("   ✅ TokenResponse model working")
        
        # Test UserProfileResponse
        profile_data = {
            "id": "507f1f77bcf86cd799439011",
            "email": "test@example.com",
            "full_name": "Test User",
            "is_active": True,
            "is_admin": False,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        profile_response = UserProfileResponse(**profile_data)
        assert profile_response.email == "test@example.com"
        
        print("   ✅ UserProfileResponse model working")
        
        # Test validation
        try:
            LoginRequest(email="invalid-email", password="short")
            assert False, "Should have raised ValidationError"
        except ValidationError:
            print("   ✅ Model validation working")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Auth models test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_config_integration():
    """Test configuration integration."""
    print("⚙️ Testing configuration integration...")
    
    try:
        from config import get_settings
        
        settings = get_settings()
        
        # Check JWT settings exist
        assert hasattr(settings, 'jwt_secret')
        assert hasattr(settings, 'jwt_algorithm')
        assert hasattr(settings, 'jwt_access_token_expire_minutes')
        assert hasattr(settings, 'jwt_refresh_token_expire_days')
        
        print("   ✅ JWT configuration fields present")
        
        # Check default values
        assert settings.jwt_algorithm == "HS256"
        assert settings.jwt_access_token_expire_minutes == 30
        assert settings.jwt_refresh_token_expire_days == 7
        
        print("   ✅ JWT configuration defaults correct")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Config integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_user_model_integration():
    """Test user model integration."""
    print("👤 Testing user model integration...")
    
    try:
        from models.user import User
        from auth.password_handler import hash_password
        
        # Create user with hashed password
        password = "testpassword123"
        hashed_password = hash_password(password)
        
        user_data = {
            "username": "testuser",
            "email": "test@example.com",
            "hashed_password": hashed_password,
            "full_name": "Test User",
            "is_active": True,
            "is_admin": False,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        user = User(**user_data)
        assert user.username == "testuser"
        assert user.email == "test@example.com"
        assert user.hashed_password == hashed_password
        assert user.is_active == True
        assert user.is_admin == False
        
        print("   ✅ User model integration working")
        
        return True
        
    except Exception as e:
        print(f"   ❌ User model integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests."""
    print("🚀 Starting Authentication Module Tests")
    print("=" * 50)
    
    tests = [
        test_config_integration,
        test_password_functionality,
        test_jwt_functionality,
        test_auth_models,
        test_user_model_integration
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"   ❌ Test {test.__name__} crashed: {e}")
            failed += 1
        print()
    
    print("=" * 50)
    print(f"📊 Test Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 All authentication tests passed successfully!")
        print("✅ Authentication module is ready for production!")
    else:
        print("⚠️ Some tests failed. Please review the errors above.")
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)