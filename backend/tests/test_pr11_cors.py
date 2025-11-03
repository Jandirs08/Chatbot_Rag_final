import os
import httpx

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000/api/v1")


def test_preflight_options_users_has_cors_headers():
    # Simula preflight desde frontend
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
    }
    r = httpx.options(f"{BASE_URL}/users", headers=headers, timeout=10)
    assert r.status_code in (200, 204), f"Preflight failed: {r.status_code}"
    # Verifica headers CORS
    allow_origin = r.headers.get("access-control-allow-origin")
    assert allow_origin in ("http://localhost:3000", "*")
    allow_methods = r.headers.get("access-control-allow-methods")
    assert allow_methods is not None