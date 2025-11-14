import os
from datetime import datetime, timezone

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

try:
    from auth.password_handler import hash_password as backend_hash_password
except Exception:
    backend_hash_password = None


def hash_password(password: str) -> str:
    if backend_hash_password is None:
        raise RuntimeError("hash_password no disponible")
    return backend_hash_password(password)


def ensure_indexes(users) -> None:
    try:
        users.create_index("username", unique=True)
        users.create_index("email", unique=True)
        users.create_index("is_active")
    except Exception:
        pass


def main():
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    full_name = os.environ.get("ADMIN_FULL_NAME")
    if not email or not password:
        raise SystemExit("ADMIN_EMAIL y ADMIN_PASSWORD son requeridos")

    mongo_uri = os.environ.get("MONGO_URI", "mongodb://mongodb:27017/chatbot_rag_db")
    client = MongoClient(mongo_uri)
    db_name = os.environ.get("MONGO_DATABASE_NAME", "chatbot_rag_db")
    db = client[db_name]
    users = db["users"]
    ensure_indexes(users)

    now = datetime.now(timezone.utc)
    existing = users.find_one({"email": email})
    if existing:
        update = {
            "is_admin": True,
            "is_active": True,
            "updated_at": now,
        }
        if full_name:
            update["full_name"] = full_name
        users.update_one({"_id": existing["_id"]}, {"$set": update})
        print(f"[OK] Usuario existente elevado a admin: {email}")
        return

    username_base = (email.split("@")[0] or "admin")
    username = username_base
    i = 1
    while users.find_one({"username": username}):
        username = f"{username_base}-{i}"
        i += 1

    doc = {
        "username": username,
        "email": email,
        "hashed_password": hash_password(password),
        "full_name": full_name,
        "is_active": True,
        "is_admin": True,
        "created_at": now,
        "updated_at": now,
        "last_login": None,
    }
    try:
        res = users.insert_one(doc)
        print(f"[OK] Usuario admin creado: {email} (id={res.inserted_id})")
    except DuplicateKeyError:
        print("[WARN] Email ya existe")


if __name__ == "__main__":
    main()