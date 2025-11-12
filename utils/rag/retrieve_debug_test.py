"""
Script para probar el endpoint POST /api/v1/rag/retrieve-debug con logs detallados.

Características:
- Login como admin y uso del access_token (Bearer) automáticamente
- Envía dos preguntas conocidas del PDF DocRag1.pdf
- Muestra tiempos, tamaño de respuesta, y lista detallada de chunks recuperados
- Guarda las respuestas completas en archivos JSON

Configurable por variables de entorno:
  - API_BASE_URL (default: http://localhost:8000/api/v1)
  - ADMIN_EMAIL   (default: admin@example.com)
  - ADMIN_PASSWORD(default: Admin123!)

Uso:
  python utils/rag/retrieve_debug_test.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def api_url(path: str) -> str:
    base = os.getenv("API_BASE_URL", "http://localhost:8000/api/v1").rstrip("/")
    return f"{base}{path}"


def http_post_json(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)

    print(f"\n[HTTP POST] {url}")
    print(f"Headers: {hdrs}")
    print(f"Payload: {json.dumps(payload, ensure_ascii=False)}")

    req = Request(url, data=body, headers=hdrs, method="POST")
    t0 = time.time()
    try:
        with urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            dt = time.time() - t0
            print(f"Status: {resp.status} | Elapsed: {dt:.3f}s | Length: {len(raw)} bytes")
            return json.loads(raw)
    except HTTPError as e:
        err_body = e.read().decode("utf-8") if hasattr(e, "read") else ""
        print(f"ERROR HTTP {e.code}: {err_body}")
        try:
            return json.loads(err_body)
        except Exception:
            raise RuntimeError(f"HTTP {e.code} en POST {url}: {err_body}")
    except URLError as e:
        raise RuntimeError(f"No se pudo conectar a {url}: {e.reason}")


def http_get_json(url: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    hdrs = {"Accept": "application/json"}
    if headers:
        hdrs.update(headers)

    print(f"\n[HTTP GET] {url}")
    print(f"Headers: {hdrs}")

    req = Request(url, headers=hdrs, method="GET")
    t0 = time.time()
    try:
        with urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            dt = time.time() - t0
            print(f"Status: {resp.status} | Elapsed: {dt:.3f}s | Length: {len(raw)} bytes")
            return json.loads(raw)
    except HTTPError as e:
        err_body = e.read().decode("utf-8") if hasattr(e, "read") else ""
        print(f"ERROR HTTP {e.code}: {err_body}")
        try:
            return json.loads(err_body)
        except Exception:
            raise RuntimeError(f"HTTP {e.code} en GET {url}: {err_body}")
    except URLError as e:
        raise RuntimeError(f"No se pudo conectar a {url}: {e.reason}")


def login_admin() -> str:
    email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    password = os.getenv("ADMIN_PASSWORD", "Admin123!")
    url = api_url("/auth/login")
    print("\n=== Login admin ===")
    resp = http_post_json(url, {"email": email, "password": password})
    token = resp.get("access_token")
    if not token:
        raise RuntimeError(f"Login no devolvió access_token. Respuesta: {resp}")
    print("Token obtenido correctamente.")
    return token


def pretty_print_retrieve(label: str, data: Dict[str, Any]) -> None:
    print(f"\n=== Resultado: {label} ===")
    # Campos conocidos: query, k, retrieved(list), context(str opcional), timings(dict)
    query = data.get("query")
    k = data.get("k")
    timings = data.get("timings", {})
    retrieved = data.get("retrieved", [])
    context = data.get("context")

    print(f"Query: {query}")
    print(f"k: {k} | retrieved_count: {len(retrieved)}")
    if timings:
        print("Timings:")
        for key, val in timings.items():
            print(f"  - {key}: {val}")

    if context:
        print("\nContext (recortado a 400 chars):")
        ctx = str(context)
        print(ctx[:400] + ("..." if len(ctx) > 400 else ""))

    if not retrieved:
        print("\n[WARN] No se recuperaron chunks. Es posible que el Vector Store esté vacío o sin PDFs indexados.")
        return

    print("\nRetrieved items (top N):")
    for i, item in enumerate(retrieved, start=1):
        # Imprimir claves y valores principales disponibles
        # Campos típicos podrían incluir: id, score, text, source, page, metadata, etc.
        print(f"-- Item #{i} --")
        if isinstance(item, dict):
            for k2, v2 in item.items():
                # Recortar textos largos para visualización
                if isinstance(v2, str) and len(v2) > 300:
                    vdisp = v2[:300] + "..."
                else:
                    vdisp = v2
                print(f"  {k2}: {vdisp}")


def save_json(path: str, data: Dict[str, Any]) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n[FILE] Guardado: {path}")
    except Exception as e:
        print(f"[ERROR] No se pudo guardar {path}: {e}")


def main() -> None:
    print("=== Prueba de /api/v1/rag/retrieve-debug ===")
    base_url = os.getenv("API_BASE_URL", "http://localhost:8000/api/v1")
    print(f"API_BASE_URL: {base_url}")

    # 1) Login admin
    token = login_admin()
    headers = {"Authorization": f"Bearer {token}"}

    # 2) Consultas (del DocRag1.pdf)
    q1 = "¿Cuál es el nombre en clave del protocolo de emergencia para una fluctuación de temperatura del Cryo-Gel?"
    q2 = "¿A qué temperatura exacta debe mantenerse el K-Spore?"

    payload_template = {
        "k": 5,
        "filter_criteria": None,
        "include_context": True,
    }

    # 3) Ejecutar retrieve-debug para q1
    url_dbg = api_url("/rag/retrieve-debug")
    p1 = dict(payload_template)
    p1["query"] = q1
    print("\n>>> Enviando consulta 1 (Cryo-Gel / Sepia-Tide)...")
    resp1 = http_post_json(url_dbg, p1, headers)
    pretty_print_retrieve("Cryo-Gel / Sepia-Tide", resp1)
    save_json("retrieve_debug_sepia_tide.json", resp1)

    # 4) Ejecutar retrieve-debug para q2
    p2 = dict(payload_template)
    p2["query"] = q2
    print("\n>>> Enviando consulta 2 (K-Spore / 4.5°C)...")
    resp2 = http_post_json(url_dbg, p2, headers)
    pretty_print_retrieve("K-Spore / 4.5°C", resp2)
    save_json("retrieve_debug_k_spore.json", resp2)

    # 5) Nota operativa si no hay resultados
    if not resp1.get("retrieved") or not resp2.get("retrieved"):
        print("\n[INFO] Alguna consulta devolvió 0 resultados. Si esperabas coincidencias, re-ingesta los PDFs:")
        print("  - Sube DocRag1.pdf de nuevo con /api/v1/pdfs/upload y reindexa si es necesario.")
        print("  - Verifica /api/v1/rag/rag-status para confirmar documentos y tamaño del vector store.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FATAL] {e}")
        sys.exit(1)