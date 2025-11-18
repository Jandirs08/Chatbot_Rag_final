import asyncio
import base64
import json
from datetime import timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from jose import jwt

from backend.auth.jwt_handler import (
    get_jwt_handler,
    create_access_token,
    decode_token,
)
from backend.auth.password_handler import hash_password
from backend.database.mongodb import get_mongodb_client
from backend.database.user_repository import UserRepository
from bson import ObjectId


BASE_URL = "http://localhost:8000/api/v1"


# --------------------------
# FIXTURES ASYNC CORREGIDOS
# --------------------------

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(base_url=BASE_URL, timeout=10.0) as ac:
        yield ac


async def _create_user(email: str, password: str, is_admin: bool = False):
    mongo = get_mongodb_client()
    repo = UserRepository(mongo)
    hashed = hash_password(password)
    user_doc = {
        "username": email.split("@")[0] + "-" + uuid4().hex[:6],
        "email": email,
        "hashed_password": hashed,
        "full_name": None,
        "is_active": True,
        "is_admin": is_admin,
    }
    result = await mongo.db[repo.collection_name].insert_one(user_doc)
    created = await mongo.db[repo.collection_name].find_one({"_id": result.inserted_id})
    return created


@pytest_asyncio.fixture
async def admin_user():
    email = f"admin-{uuid4().hex[:8]}@example.com"
    password = "SecretPwd!123"
    doc = await _create_user(email, password, is_admin=True)
    try:
        yield {"email": email, "password": password, "_id": str(doc["_id"])}
    finally:
        mongo = get_mongodb_client()
        await mongo.db["users"].delete_one({"_id": ObjectId(doc["_id"])})


@pytest_asyncio.fixture
async def normal_user():
    email = f"user-{uuid4().hex[:8]}@example.com"
    password = "SecretPwd!123"
    doc = await _create_user(email, password, is_admin=False)
    try:
        yield {"email": email, "password": password, "_id": str(doc["_id"])}
    finally:
        mongo = get_mongodb_client()
        await mongo.db["users"].delete_one({"_id": ObjectId(doc["_id"])})


@pytest_asyncio.fixture
async def admin_tokens(client, admin_user):
    resp = await client.post("/auth/login", json={"email": admin_user["email"], "password": admin_user["password"]})
    assert resp.status_code == 200
    data = resp.json()
    return data["access_token"], data["refresh_token"]


@pytest_asyncio.fixture
async def user_tokens(client, normal_user):
    resp = await client.post("/auth/login", json={"email": normal_user["email"], "password": normal_user["password"]})
    assert resp.status_code == 200
    data = resp.json()
    return data["access_token"], data["refresh_token"]


# --------------------------
# TESTS
# --------------------------

@pytest.mark.asyncio
async def test_login_exitoso(client, admin_user):
    resp = await client.post("/auth/login", json={"email": admin_user["email"], "password": admin_user["password"]})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data and "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_token_valido(client, admin_tokens):
    _, refresh = admin_tokens
    resp = await client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data and "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_sin_jti_falla(client, admin_tokens):
    _, refresh = admin_tokens
    handler = get_jwt_handler()
    payload = decode_token(refresh)
    payload.pop("jti", None)
    token = jwt.encode(payload, handler.secret_key, algorithm=handler.algorithm)
    resp = await client.post("/auth/refresh", json={"refresh_token": token})
    assert resp.status_code == 401
    detail = resp.json().get("detail", "")
    assert detail in ("Invalid refresh token", "Refresh token missing jti")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


@pytest.mark.asyncio
async def test_refresh_alg_modificado_falla(client, admin_tokens):
    _, refresh = admin_tokens
    parts = refresh.split(".")
    new_header = _b64url_encode(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    tampered = ".".join([new_header, parts[1], parts[2] if len(parts) > 2 else ""])
    resp = await client.post("/auth/refresh", json={"refresh_token": tampered})
    assert resp.status_code in (401, 403)
    detail = resp.json().get("detail", "")
    assert detail in ("Invalid refresh token", "Invalid token algorithm")


@pytest.mark.asyncio
async def test_usar_access_como_refresh_falla(client, admin_tokens):
    access, _ = admin_tokens
    resp = await client.post("/auth/refresh", json={"refresh_token": access})
    assert resp.status_code == 401
    detail = resp.json().get("detail", "")
    assert detail in ("Invalid refresh token", "Expected refresh token")


@pytest.mark.asyncio
async def test_acceso_admin_permitido(client, admin_tokens):
    access, _ = admin_tokens
    resp = await client.get("/pdfs/list", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_acceso_no_admin_denegado(client, user_tokens):
    access, _ = user_tokens
    resp = await client.get("/pdfs/list", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_token_ausente_denegado(client):
    resp = await client.get("/pdfs/list")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_expirado_simulado(client, admin_user):
    handler = get_jwt_handler()
    token = create_access_token(
        {"sub": admin_user["_id"], "email": admin_user["email"], "is_admin": True},
        expires_delta=timedelta(seconds=-30)
    )
    resp = await client.get("/pdfs/list", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code in (401, 403)
