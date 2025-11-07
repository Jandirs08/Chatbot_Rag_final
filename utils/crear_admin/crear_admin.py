"""
Script interactivo para crear un usuario administrador en MongoDB.

- Pide por consola el email y la contraseña
- Usa el hash de contraseñas del backend si está disponible (bcrypt)
- Crea índices necesarios si no existen
- Si el usuario ya existe por email, ofrece elevarlo a admin y opcionalmente
  actualizar su contraseña

Requisitos:
- Python 3.10+
- Paquetes: pymongo, bcrypt (o usar el hash del backend si está disponible)

Cómo ejecutarlo:
  1) Configura la variable de entorno `MONGODB_URI` (o `MONGO_URI`)
     Ejemplo local (docker-compose): mongodb://localhost:27018/chatbot_rag_db
  2) Ejecuta: python utils/crear_admin/crear_admin.py
"""

import os
import sys
import getpass
from datetime import datetime, timezone
from typing import Optional

try:
    # Intentar usar el hash del backend para máxima compatibilidad
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
except Exception:
    print("[ERROR] Falta 'pymongo'. Instala con: pip install pymongo")
    raise


def hash_password(password: str) -> str:
    """Genera el hash de la contraseña.

    Usa el hash del backend si está disponible; de lo contrario, bcrypt directo.
    """
    if backend_hash_password is not None:
        return backend_hash_password(password)
    if bcrypt is None:
        print("[ERROR] No se pudo importar bcrypt. Instala con: pip install bcrypt")
        sys.exit(1)
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def resolve_db(client: MongoClient, mongo_uri: str, explicit_db: Optional[str]) -> str:
    """Obtiene el nombre de la BD desde la URI o del parámetro explícito."""
    if explicit_db:
        return explicit_db
    try:
        db = client.get_default_database()
        if db is not None:
            return db.name
    except Exception:
        pass
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


def password_policy_ok(pwd: str) -> bool:
    """Política básica: mínimo 8, una mayúscula y un caracter no alfanumérico."""
    if len(pwd) < 8:
        return False
    if not any(c.isupper() for c in pwd):
        return False
    if not any(not c.isalnum() for c in pwd):
        return False
    return True


def derive_unique_username(users, base: str) -> str:
    """Deriva un username único basado en `base` añadiendo -1, -2, ... si existe."""
    candidate = base
    if not users.find_one({"username": candidate}):
        return candidate
    for i in range(1, 101):
        candidate = f"{base}-{i}"
        if not users.find_one({"username": candidate}):
            return candidate
    # Si fallara (improbable), usar sufijo con timestamp
    return f"{base}-{int(datetime.now().timestamp())}"


def prompt_non_empty(prompt: str) -> str:
    while True:
        val = input(prompt).strip()
        if val:
            return val
        print("El valor no puede estar vacío.")


def prompt_email() -> str:
    while True:
        email = prompt_non_empty("Email del admin: ")
        if "@" in email and "." in email.split("@")[-1]:
            return email
        print("Email inválido. Intenta nuevamente.")


def prompt_password() -> str:
    while True:
        pwd = getpass.getpass("Contraseña del admin: ")
        if not password_policy_ok(pwd):
            print("La contraseña no cumple la política: mínimo 8, una mayúscula y un caracter especial.")
            continue
        confirm = getpass.getpass("Confirmar contraseña: ")
        if pwd != confirm:
            print("Las contraseñas no coinciden. Intenta nuevamente.")
            continue
        return pwd


def main():
    print("=== Crear/Elevar Usuario Administrador ===")

    # Leer configuración de conexión
    mongo_uri = (
        os.environ.get("MONGODB_URI")
        or os.environ.get("MONGO_URI")
        or "mongodb://localhost:27018/chatbot_rag_db"
    )
    mongo_db_env = os.environ.get("MONGO_DATABASE_NAME")

    print(f"Usando MongoDB URI: {mongo_uri}")
    if mongo_db_env:
        print(f"Base de datos (env): {mongo_db_env}")

    # Prompts interactivos
    email = prompt_email()
    full_name = input("Nombre completo (opcional): ").strip() or None
    password = prompt_password()

    # Conectar a MongoDB
    client = MongoClient(mongo_uri)
    db_name = resolve_db(client, mongo_uri, mongo_db_env)
    db = client[db_name]
    users = db["users"]

    # Asegurar índices
    ensure_indexes(users)

    # Derivar username a partir del email
    local_part = email.split("@")[0] if "@" in email else email
    base_username = local_part if local_part else "admin"
    username = derive_unique_username(users, base_username)

    now = datetime.now(timezone.utc)
    existing = users.find_one({"email": email})

    if existing:
        print("El usuario ya existe. Será elevado a admin.")
        # Preguntar si desea actualizar contraseña
        choice = input("¿Actualizar contraseña? (s/N): ").strip().lower()
        update_fields = {
            "is_admin": True,
            "is_active": True,
            "updated_at": now,
        }
        if choice in ("s", "si", "sí", "y", "yes"):
            update_fields["hashed_password"] = hash_password(password)
        if full_name is not None:
            update_fields["full_name"] = full_name
        users.update_one({"_id": existing["_id"]}, {"$set": update_fields})
        print(f"[OK] Usuario existente '{email}' elevado a admin. BD: {db_name}")
        return

    # Crear nuevo usuario admin
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
        print(f"[OK] Usuario admin creado: {email} (id={res.inserted_id}) | BD: {db_name}")
    except DuplicateKeyError:
        print("[WARN] Username o email ya existen. Ejecuta de nuevo y elige actualizar contraseña si corresponde.")
    except Exception as e:
        print(f"[ERROR] Fallo al crear admin: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()