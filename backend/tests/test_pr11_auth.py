import os
import time
import httpx

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000/api/v1")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")


def login(email: str, password: str):
    r = httpx.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=10)
    return r


def test_login_success():
    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Login failed: {r.text}"
    data = r.json()
    assert "access_token" in data and data["token_type"] == "bearer"


def test_me_requires_auth():
    r = httpx.get(f"{BASE_URL}/auth/me", timeout=10)
    assert r.status_code in (401, 403), f"Expected unauthorized, got {r.status_code}"


def test_me_with_token():
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD).json()["access_token"]
    r = httpx.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("email") == ADMIN_EMAIL
    assert data.get("is_admin") is True


def test_refresh_flow():
    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200
    refresh_token = r.json().get("refresh_token")
    assert refresh_token, "Missing refresh token"
    rr = httpx.post(f"{BASE_URL}/auth/refresh", json={"refresh_token": refresh_token}, timeout=10)
    assert rr.status_code == 200
    data = rr.json()
    assert "access_token" in data and data["token_type"] == "bearer"