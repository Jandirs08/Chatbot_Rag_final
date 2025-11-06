#!/usr/bin/env python3
"""
Provisiona usuarios en el backend (login admin + creación de usuario).

Uso rápido (PowerShell / CMD):

  python scripts_final/provision_user.py \
      --backend-url https://chatbot-backend-6ztr.onrender.com/api/v1 \
      --admin-email admin@example.com \
      --admin-password "TuPasswordAdmin123!" \
      --email nuevo.usuario@example.com \
      --password "PasswordUsuario123!" \
      --full-name "Nuevo Usuario" \
      --is-admin false

Notas:
- Requiere que el admin exista y sea activo.
- En producción, CORS no aplica a este script (solo aplica en navegador).
- Maneja login y usa el token para llamar POST /users.
"""

import argparse
import json
import sys
from typing import Any, Dict
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def http_request(method: str, url: str, headers: Dict[str, str] | None = None, body: Dict[str, Any] | None = None):
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)

    try:
        with urlopen(req) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            text = resp.read().decode(charset)
            if text:
                return resp.status, json.loads(text), dict(resp.headers)
            return resp.status, None, dict(resp.headers)
    except HTTPError as e:
        try:
            err_text = e.read().decode("utf-8")
            err_json = json.loads(err_text)
        except Exception:
            err_json = {"detail": err_text if 'err_text' in locals() else e.reason}
        return e.code, err_json, dict(e.headers or {})
    except URLError as e:
        return 0, {"detail": str(e.reason)}, {}


def check_health(base_url: str) -> None:
    status, body, _ = http_request("GET", f"{base_url}/health")
    if status != 200:
        raise RuntimeError(f"Health check falló ({status}): {body}")


def login(base_url: str, email: str, password: str) -> Dict[str, Any]:
    payload = {"email": email, "password": password}
    status, body, _ = http_request("POST", f"{base_url}/auth/login", body=payload)
    if status != 200:
        raise RuntimeError(f"Login falló ({status}): {body}")
    # Espera: { access_token, refresh_token, token_type, expires_in }
    return body


def create_user(base_url: str, token: str, email: str, password: str, full_name: str | None, username: str | None, is_admin: bool) -> Dict[str, Any]:
    payload = {
        "email": email,
        "password": password,
        "full_name": full_name,
        "username": username,
        "is_admin": is_admin,
    }
    headers = {"Authorization": f"Bearer {token}"}
    status, body, _ = http_request("POST", f"{base_url}/users", headers=headers, body=payload)
    if status != 201:
        raise RuntimeError(f"Creación de usuario falló ({status}): {body}")
    return body


def main():
    parser = argparse.ArgumentParser(description="Provisionar usuario vía API (login admin + create user)")
    parser.add_argument("--backend-url", default="https://chatbot-backend-6ztr.onrender.com/api/v1", help="Base URL del backend (ej. https://.../api/v1)")
    parser.add_argument("--admin-email", required=True, help="Email del admin para login")
    parser.add_argument("--admin-password", required=True, help="Password del admin para login")
    parser.add_argument("--email", required=True, help="Email del usuario a crear")
    parser.add_argument("--password", required=True, help="Password del usuario a crear")
    parser.add_argument("--full-name", default=None, help="Nombre completo del usuario")
    parser.add_argument("--username", default=None, help="Username (opcional; si no se pasa, se genera desde el email)")
    parser.add_argument("--is-admin", default="false", choices=["true", "false"], help="Si el usuario nuevo será admin")

    args = parser.parse_args()
    base_url: str = args.backend_url.rstrip("/")

    try:
        print(f"[1/3] Health check: {base_url}/health")
        check_health(base_url)
        print("  -> OK")

        print(f"[2/3] Login admin: {args.admin_email}")
        auth = login(base_url, args.admin_email, args.admin_password)
        access_token = auth.get("access_token")
        if not access_token:
            raise RuntimeError("No se recibió access_token en respuesta de login")
        print("  -> Login OK, token recibido")

        print(f"[3/3] Crear usuario: {args.email}")
        created = create_user(
            base_url,
            access_token,
            args.email,
            args.password,
            args.full_name,
            args.username,
            True if args.is_admin.lower() == "true" else False,
        )
        print("  -> Usuario creado")
        print(json.dumps(created, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()