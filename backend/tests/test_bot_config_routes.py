import os
import httpx

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000/api/v1")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")


def get_admin_token():
    r = httpx.post(f"{BASE_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


def auth_headers(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_get_config_requires_auth():
    r = httpx.get(f"{BASE_URL}/bot/config", timeout=10)
    assert r.status_code in (401, 403), f"Expected unauthorized, got {r.status_code}"


def test_put_config_requires_auth():
    r = httpx.put(f"{BASE_URL}/bot/config", json={"temperature": 0.5}, timeout=10)
    assert r.status_code in (401, 403), f"Expected unauthorized, got {r.status_code}"


def test_update_temperature_and_extras():
    token = get_admin_token()

    # Get current config
    r_get = httpx.get(f"{BASE_URL}/bot/config", headers=auth_headers(token), timeout=10)
    assert r_get.status_code == 200, f"GET config failed: {r_get.text}"
    cfg = r_get.json()

    # Update config
    payload = {
        "temperature": 0.6,
        "bot_name": "Asesor Académico",
        "ui_prompt_extra": "Responde con cortesía y de forma concisa.",
    }
    r_put = httpx.put(f"{BASE_URL}/bot/config", headers=auth_headers(token), json=payload, timeout=10)
    assert r_put.status_code == 200, f"PUT config failed: {r_put.text}"
    updated = r_put.json()

    assert abs(updated.get("temperature", 0) - 0.6) < 1e-6
    assert updated.get("bot_name") == "Asesor Académico"
    assert "Responde" in (updated.get("ui_prompt_extra") or "")

    # Confirm persisted
    r_get2 = httpx.get(f"{BASE_URL}/bot/config", headers=auth_headers(token), timeout=10)
    assert r_get2.status_code == 200
    cfg2 = r_get2.json()
    assert abs(cfg2.get("temperature", 0) - 0.6) < 1e-6
    assert cfg2.get("bot_name") == "Asesor Académico"
    assert "Responde" in (cfg2.get("ui_prompt_extra") or "")


def test_invalid_temperature_rejected():
    token = get_admin_token()

    for bad_temp in (-0.1, 1.5):
        r = httpx.put(
            f"{BASE_URL}/bot/config",
            headers=auth_headers(token),
            json={"temperature": bad_temp},
            timeout=10,
        )
        assert r.status_code == 422, f"Expected 422 for bad temperature {bad_temp}, got {r.status_code}: {r.text}"