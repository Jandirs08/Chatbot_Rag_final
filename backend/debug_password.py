import pymongo
import bcrypt
from backend.auth.password_handler import verify_password as backend_verify

MONGO_URI = "mongodb://localhost:27018/chatbot_rag_db"
EMAIL = "jandir.088@hotmail.com"
PASSWORD = "PPjhst1234$"

def main():
    try:
        client = pymongo.MongoClient(MONGO_URI)
        db = client.get_default_database()
        users = db.users
        
        user = users.find_one({"email": EMAIL})
        
        if not user:
            print(f"User {EMAIL} not found in DB.")
            return

        print(f"User found: {user.get('email')}")
        stored_hash = user.get('hashed_password')
        print(f"Stored hash: {stored_hash}")
        
        # Test using backend's verify_password
        print(f"Testing backend.auth.password_handler.verify_password with '{PASSWORD}'...")
        is_valid_backend = backend_verify(PASSWORD, stored_hash)
        print(f"Backend Verify Result: {is_valid_backend}")

        # Test using direct bcrypt
        print(f"Testing direct bcrypt.checkpw...")
        try:
            password_bytes = PASSWORD.encode('utf-8')
            hash_bytes = stored_hash.encode('utf-8')
            is_valid_direct = bcrypt.checkpw(password_bytes, hash_bytes)
            print(f"Direct Bcrypt Result: {is_valid_direct}")
        except Exception as e:
            print(f"Direct Bcrypt Error: {e}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
