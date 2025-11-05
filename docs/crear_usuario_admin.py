"""
Script para crear un usuario administrador directamente en MongoDB.

Útil para el arranque inicial cuando aún no existe un admin y
no hay endpoint público de registro.

Requisitos:
- Python 3.10+
- Paquetes: pymongo, bcrypt (o usar el hash del backend si está disponible)

Instalación rápida (si hace falta):
  pip install pymongo bcrypt

Uso básico:
  python docs/crear_usuario_admin.py \
    --email admin@example.com \
    --password "Admin123!" \
    --username admin \
    --full-name "Administrador"

Conexión por defecto (Docker Compose):
- MONGO_URI: mongodb://localhost:27018/chatbot_rag_db
- Si usas otra BD local, pasa --mongo-uri o configura variables de entorno.

Ejemplos:
- Docker/Compose local:
  python docs/crear_usuario_admin.py --email admin@example.com --password Admin123! --username admin

- Conectar a otra instancia:
  python docs/crear_usuario_admin.py --mongo-uri mongodb://127.0.0.1:27017/mi_bd \
    --email admin@midominio.com --password "S3gura!" --username admin

Nota: Si el usuario ya existe, el script lo eleva a admin y (si se
especifica) actualiza la contraseña con --force-update.
"""

import argparse
import os
import sys
from datetime import datetime, timezone

try:
    # Intentar usar el hash del backend para total compatibilidad
    from backend.auth.password_handler import hash_password as backend_hash_password
except Exception:
    backend_hash_password = None

try:
    import bcrypt
except Exception:
    bcrypt = None

try:
    from pymongo import MongoClient
    from pymongo.errors import DuplicateKeyError
except Exception as e:
    print("[ERROR] Falta 'pymongo'. Instala con: pip install pymongo")
    raise


def hash_password(password: str) -> str:
    """Genera el hash de la contraseña usando el backend o bcrypt."""
    if backend_hash_password is not None:
        return backend_hash_password(password)
    if bcrypt is None:
        print("[ERROR] No se pudo importar bcrypt. Instala con: pip install bcrypt")
        sys.exit(1)
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def resolve_db(client: MongoClient, mongo_uri: str, explicit_db: str | None) -> str:
    """Obtiene el nombre de la BD desde la URI o del parámetro explícito."""
    if explicit_db:
        return explicit_db
    try:
        db = client.get_default_database()
        if db is not None:
            return db.name
    except Exception:
        pass
    # Fallback: variable de entorno o default
    return os.environ.get("MONGO_DATABASE_NAME", "chatbot_rag_db")


def ensure_indexes(users_collection) -> None:
    """Crea índices mínimos requeridos si no existen."""
    try:
        users_collection.create_index("username", unique=True)
        users_collection.create_index("email", unique=True)
        users_collection.create_index("is_active")
    except Exception:
        # No bloquear si falla la creación de índices
        pass


def main():
    parser = argparse.ArgumentParser(description="Crear/elevar usuario admin en MongoDB")
    parser.add_argument("--mongo-uri", default=os.environ.get("MONGO_URI", "mongodb://localhost:27018/chatbot_rag_db"), help="Cadena de conexión MongoDB")
    parser.add_argument("--db", default=os.environ.get("MONGO_DATABASE_NAME"), help="Nombre de la BD (opcional si va en la URI)")
    parser.add_argument("--email", required=True, help="Email del usuario admin")
    parser.add_argument("--password", required=True, help="Contraseña del usuario admin")
    parser.add_argument("--username", default=None, help="Username (por defecto: parte local del email o 'admin')")
    parser.add_argument("--full-name", default=None, help="Nombre completo (opcional)")
    parser.add_argument("--force-update", action="store_true", help="Actualizar contraseña si el usuario ya existe")

    args = parser.parse_args()

    client = MongoClient(args.mongo_uri)
    db_name = resolve_db(client, args.mongo_uri, args.db)
    db = client[db_name]
    users = db["users"]

    ensure_indexes(users)

    # Si no se proporciona username, derivarlo del email
    username = args.username
    if not username:
        local_part = args.email.split("@")[0]
        username = local_part if local_part else "admin"

    # Buscar si existe por email
    existing = users.find_one({"email": args.email})
    now = datetime.now(timezone.utc)

    if existing:
        update_fields = {
            "is_admin": True,
            "is_active": True,
            "updated_at": now,
        }
        if args.force_update:
            update_fields["hashed_password"] = hash_password(args.password)

        users.update_one({"_id": existing["_id"]}, {"$set": update_fields})
        print(f"[OK] Usuario existente '{args.email}' elevado a admin. force_update={args.force_update}")
        print(f"      BD: {db_name} | URI: {args.mongo_uri}")
        return

    # Crear nuevo usuario admin
    doc = {
        "username": username,
        "email": args.email,
        "hashed_password": hash_password(args.password),
        "full_name": args.full_name,
        "is_active": True,
        "is_admin": True,
        "created_at": now,
        "updated_at": now,
        "last_login": None,
    }

    try:
        res = users.insert_one(doc)
        print(f"[OK] Usuario admin creado: {args.email} (id={res.inserted_id})")
        print(f"      BD: {db_name} | URI: {args.mongo_uri}")
    except DuplicateKeyError:
        print("[WARN] Username o email ya existen. Prueba con --force-update para elevar/actualizar.")
    except Exception as e:
        print(f"[ERROR] Fallo al crear admin: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()