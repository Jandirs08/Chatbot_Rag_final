import os
import time
import uuid
import httpx

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000/api/v1")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")


def get_admin_token():
    r = httpx.post(f"{BASE_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


def auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_list_users_pagination_and_filters():
    token = get_admin_token()
    # Basic list
    r = httpx.get(f"{BASE_URL}/users", headers=auth_headers(token), timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "total" in data
    # Search by admin email
    r2 = httpx.get(f"{BASE_URL}/users", headers=auth_headers(token), params={"search": ADMIN_EMAIL}, timeout=10)
    assert r2.status_code == 200
    d2 = r2.json()
    assert any(u["email"] == ADMIN_EMAIL for u in d2["items"]) or d2["total"] >= 1


def test_crud_user_admin():
    token = get_admin_token()
    email = f"testuser+{uuid.uuid4().hex[:8]}@example.com"
    # Create
    rc = httpx.post(
        f"{BASE_URL}/users",
        headers=auth_headers(token),
        json={"email": email, "password": "Strong@Pass1", "full_name": "Test User", "is_admin": False},
        timeout=10,
    )
    assert rc.status_code == 201, rc.text
    user = rc.json()
    user_id = user["id"]
    assert user["email"] == email and user["is_admin"] is False

    # Update name and activate
    ru = httpx.patch(
        f"{BASE_URL}/users/{user_id}",
        headers=auth_headers(token),
        json={"full_name": "Updated Name", "is_active": True},
        timeout=10,
    )
    assert ru.status_code == 200
    up = ru.json()
    assert up["full_name"] == "Updated Name" and up["is_active"] is True

    # Delete
    rd = httpx.delete(f"{BASE_URL}/users/{user_id}", headers=auth_headers(token), timeout=10)
    assert rd.status_code in (200, 204), rd.text


def test_forbidden_for_non_admin():
    token = get_admin_token()
    # Create non-admin
    email = f"plainuser+{uuid.uuid4().hex[:8]}@example.com"
    rc = httpx.post(
        f"{BASE_URL}/users",
        headers=auth_headers(token),
        json={"email": email, "password": "Strong@Pass1", "full_name": "Plain User", "is_admin": False},
        timeout=10,
    )
    assert rc.status_code == 201
    user = rc.json()
    # Login as non-admin
    rlogin = httpx.post(f"{BASE_URL}/auth/login", json={"email": email, "password": "Strong@Pass1"}, timeout=10)
    assert rlogin.status_code == 200
    u_token = rlogin.json()["access_token"]
    # Try listing users
    rlist = httpx.get(f"{BASE_URL}/users", headers=auth_headers(u_token), timeout=10)
    assert rlist.status_code in (401, 403), f"Non-admin should not access: {rlist.status_code}"