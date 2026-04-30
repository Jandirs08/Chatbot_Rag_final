"""
Script para obtener el token de autorización (JWT) del backend.

Uso básico (Windows/PowerShell o bash):
  python tools/auth/get_token.py
  -> el script pide email y password por consola
  -> imprime el access_token al stdout

Para uso con pipe / asignación (no muestra refresh_token, no guarda archivo):
  python tools/auth/get_token.py --token-only
  TOKEN=$(python tools/auth/get_token.py --token-only)
  curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/...

Argumentos:
  --base-url       Base URL del backend (default: http://localhost:8000)
  --email          Email del usuario (si no se pasa, prompt interactivo)
  --token-only     Imprime SOLO el access_token (sin labels ni archivo).
                   Útil para pipear con `$()` en bash/PowerShell.
  --out            Ruta para guardar el JSON del token (solo modo verboso).
                   Default: tools/auth/token.json. Sin --out, no se guarda.

Notas seguridad:
  - El password se pide con getpass (no se loguea ni queda en historial).
  - El script NO contiene credenciales hardcodeadas.
  - El archivo token.json (cuando se genera) NO debe subirse a Git.
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
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


def _try_copy_to_clipboard(text: str) -> bool:
    """Best-effort copy al clipboard (Windows). Falla silencioso si no aplica."""
    try:
        import subprocess
        if sys.platform == "win32":
            subprocess.run("clip", input=text, text=True, check=False)
            return True
    except Exception:
        pass
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Obtener token JWT del backend")
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL del backend (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--email",
        default=None,
        help="Email (si no se pasa, prompt interactivo)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Modo detallado: muestra refresh_token, expires_in, opción --out",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="(--verbose) ruta para guardar JSON completo",
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="No espera ENTER al final (útil para uso en scripts/pipes)",
    )

    args = parser.parse_args()

    # Email + password siempre prompt si no se pasaron por arg.
    email = args.email or input("Email: ").strip()
    if not email:
        print("ERROR: email vacío.", file=sys.stderr)
        if not args.no_wait:
            input("\nPresiona ENTER para salir...")
        sys.exit(1)
    password = getpass.getpass("Password: ")
    if not password:
        print("ERROR: password vacío.", file=sys.stderr)
        if not args.no_wait:
            input("\nPresiona ENTER para salir...")
        sys.exit(1)

    print(f"\n-> Login en {args.base_url}{LOGIN_PATH}...")

    try:
        tokens = login(args.base_url, email, password)
    except RuntimeError as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        if not args.no_wait:
            input("\nPresiona ENTER para salir...")
        sys.exit(2)

    access = tokens.get("access_token") or ""

    if args.verbose:
        refresh = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in")
        print("\nLogin correcto. Tokens recibidos:")
        print(f"  access_token : {access}")
        print(f"  refresh_token: {refresh}")
        if expires_in is not None:
            print(f"  expires_in   : {expires_in} s")
        if args.out:
            save_json(tokens, args.out)
            print(f"\nJSON completo guardado en: {args.out}")
    else:
        # Modo default: solo el access_token, claramente delimitado para copiar.
        copied = _try_copy_to_clipboard(access)
        sep = "─" * 60
        print(f"\n{sep}")
        print("ACCESS TOKEN (copia esto):")
        print(sep)
        print(access)
        print(sep)
        if copied:
            print("(ya copiado al portapapeles automáticamente)")
        print()

    if not args.no_wait:
        input("Presiona ENTER para cerrar...")


if __name__ == "__main__":
    main()