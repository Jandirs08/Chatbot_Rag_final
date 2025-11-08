"""
Script para obtener el token de autorización (JWT) del backend.

Uso básico (Windows/PowerShell):
  python utils/auth/get_token.py --base-url http://localhost:8000

Por defecto usa el endpoint `/api/v1/auth/login` y las credenciales
proporcionadas por ti, pero puedes sobreescribirlas por argumentos o
variables de entorno.

Variables de entorno opcionales:
  - API_BASE_URL   (ej: http://localhost:8000)
  - API_EMAIL      (email de usuario)
  - API_PASSWORD   (password de usuario)

Argumentos opcionales:
  --base-url       Base URL del backend (default: http://localhost:8000)
  --email          Email del usuario
  --password       Password del usuario
  --out            Ruta para guardar el JSON del token (default: utils/auth/token.json)

El script imprime en consola el access_token y refresh_token, y guarda
la respuesta completa en el archivo indicado.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict

from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


LOGIN_PATH = "/api/v1/auth/login"


def login(base_url: str, email: str, password: str) -> Dict[str, Any]:
    """Realiza el login y devuelve el JSON con los tokens.

    Args:
        base_url: URL base del backend (ej: http://localhost:8000)
        email: Email del usuario
        password: Password del usuario

    Returns:
        Dict con la respuesta del backend (access_token, refresh_token, etc.)

    Raises:
        RuntimeError: Si la petición falla o el backend devuelve un error.
    """
    url = base_url.rstrip("/") + LOGIN_PATH
    payload = {"email": email, "password": password}
    data = json.dumps(payload).encode("utf-8")

    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")

    try:
        with urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body)
            # Validación mínima esperada
            if not isinstance(parsed, dict) or "access_token" not in parsed:
                raise RuntimeError(f"Respuesta inesperada del servidor: {parsed}")
            return parsed
    except HTTPError as e:
        error_body = e.read().decode("utf-8") if hasattr(e, "read") else ""
        try:
            err_json = json.loads(error_body)
        except Exception:
            err_json = {"detail": error_body or str(e)}
        raise RuntimeError(f"HTTP {e.code} al iniciar sesión: {err_json}")
    except URLError as e:
        raise RuntimeError(f"No se pudo conectar al backend en {url}: {e.reason}")
    except Exception as e:
        raise RuntimeError(f"Error al procesar la respuesta de login: {e}")


def save_json(data: Dict[str, Any], out_path: str) -> None:
    """Guarda el dict en un archivo JSON, creando la carpeta si es necesario."""
    out_file = Path(out_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Obtener token JWT del backend")
    parser.add_argument(
        "--base-url",
        default=os.getenv("API_BASE_URL", "http://localhost:8000"),
        help="Base URL del backend (ej: http://localhost:8000)",
    )
    parser.add_argument(
        "--email",
        default=os.getenv("API_EMAIL", "jandir.088@hotmail.com"),
        help="Email del usuario",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("API_PASSWORD", "PPjhst1234$"),
        help="Password del usuario",
    )
    parser.add_argument(
        "--out",
        default=str(Path("utils/auth/token.json")),
        help="Ruta para guardar el JSON del token",
    )

    args = parser.parse_args()

    print(f"-> Intentando login en {args.base_url}{LOGIN_PATH} como {args.email}...")
    tokens = login(args.base_url, args.email, args.password)

    # Mostrar por consola lo más importante
    access = tokens.get("access_token")
    refresh = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in")

    print("\nLogin correcto. Tokens recibidos:")
    print(f"  access_token: {access}")
    print(f"  refresh_token: {refresh}")
    if expires_in is not None:
        print(f"  expires_in: {expires_in} segundos")

    # Guardar JSON completo por si se necesita reutilizar
    save_json(tokens, args.out)
    print(f"\nRespuesta completa guardada en: {args.out}")


if __name__ == "__main__":
    main()