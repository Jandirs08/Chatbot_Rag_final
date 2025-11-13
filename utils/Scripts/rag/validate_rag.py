import os
import time
import json
import csv
import uuid
import datetime as dt
from pathlib import Path

import requests

def log(msg: str):
    ts = dt.datetime.now().strftime('%H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)

def health() -> int:
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=3)
        return r.status_code
    except Exception:
        return 0


BASE_URL = os.environ.get("RAG_BASE_URL", "http://localhost:8000/api/v1")
ADMIN_EMAIL = os.environ.get("RAG_ADMIN_EMAIL", "jandir.088@hotmail.com")
ADMIN_PASSWORD = os.environ.get("RAG_ADMIN_PASSWORD", "PPjhst1234$")

# Rutas de recursos de prueba
ROOT_DIR = Path(__file__).resolve().parents[3]
PDF_PATH = ROOT_DIR / "utils" / "pdfs" / "pdf2" / "test_semantico.pdf"
PREGUNTAS_MD = ROOT_DIR / "utils" / "pdfs" / "pdf2" / "preguntas.md"

OUTPUT_DIR = ROOT_DIR / "utils" / "Scripts" / "rag" / "results"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
print(f"[validate_rag] BASE_URL={BASE_URL}")
print(f"[validate_rag] ROOT_DIR={ROOT_DIR}")
print(f"[validate_rag] PDF_PATH exists={PDF_PATH.exists()} -> {PDF_PATH}")


def login(email: str, password: str) -> str:
    url = f"{BASE_URL}/auth/login"
    log(f"Login admin: {email}")
    try:
        r = requests.post(url, json={"email": email, "password": password}, timeout=15)
        r.raise_for_status()
        data = r.json()
    except requests.exceptions.RequestException as e:
        msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        log(f"Login error: {msg}")
        raise
    return data["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def rag_status(token: str) -> dict:
    url = f"{BASE_URL}/rag/rag-status"
    log("GET rag-status")
    try:
        r = requests.get(url, headers=auth_headers(token), timeout=15)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        log(f"rag-status error: {msg}")
        raise


def list_pdfs(token: str) -> dict:
    url = f"{BASE_URL}/pdfs/list"
    log("GET pdfs/list")
    try:
        r = requests.get(url, headers=auth_headers(token), timeout=15)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        log(f"pdfs/list error: {msg}")
        raise


def upload_pdf(token: str, pdf_path: Path) -> dict:
    url = f"{BASE_URL}/pdfs/upload"
    log(f"POST pdfs/upload -> {pdf_path.name}")
    try:
        with pdf_path.open("rb") as f:
            files = {"file": (pdf_path.name, f, "application/pdf")}
            r = requests.post(url, headers=auth_headers(token), files=files, timeout=60)
            r.raise_for_status()
            return r.json()
    except requests.exceptions.RequestException as e:
        msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        log(f"upload error: {msg}")
        raise


def delete_pdf(token: str, filename: str) -> dict:
    url = f"{BASE_URL}/pdfs/{filename}"
    log(f"DELETE pdfs/{filename}")
    try:
        r = requests.delete(url, headers=auth_headers(token), timeout=30)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        log(f"delete error: {msg}")
        raise


def clear_rag(token: str) -> dict:
    url = f"{BASE_URL}/rag/clear-rag"
    log("POST rag/clear-rag")
    try:
        r = requests.post(url, headers=auth_headers(token), timeout=60)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        log(f"clear-rag error: {msg}")
        raise


def retrieve_debug(token: str, query: str, k: int = 5, filter_criteria: dict | None = None, include_context: bool = True) -> dict:
    url = f"{BASE_URL}/rag/retrieve-debug"
    payload = {
        "query": query,
        "k": k,
        "filter_criteria": filter_criteria,
        "include_context": include_context,
    }
    log(f"POST rag/retrieve-debug k={k} include_context={include_context}")
    try:
        r = requests.post(url, headers=auth_headers(token), json=payload, timeout=30)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
        log(f"retrieve-debug error: {msg}")
        raise


def chat_stream(token: str, text: str, conversation_id: str | None = None) -> str:
    url = f"{BASE_URL}/chat/"
    payload = {"input": text, "conversation_id": conversation_id}
    log("POST chat/ (SSE)")
    with requests.post(url, headers=auth_headers(token), json=payload, stream=True) as r:
        try:
            r.raise_for_status()
        except requests.exceptions.RequestException as e:
            msg = getattr(e.response, 'text', str(e)) if hasattr(e, 'response') and e.response is not None else str(e)
            log(f"chat SSE error: {msg}")
            raise
        full = ""
        for line in r.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data: "):
                try:
                    obj = json.loads(line[len("data: "):])
                    full += obj.get("streamed_output", "")
                except Exception:
                    pass
        return full.strip()


def parse_preguntas(md_path: Path) -> list[dict]:
    items = []
    current_q = None
    with md_path.open("r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("¿") or line.endswith("?"):
                current_q = {"question": line, "expected": None}
                items.append(current_q)
            elif "✅ Esperado:" in line and current_q is not None:
                expected = line.split("✅ Esperado:", 1)[1].strip().strip("\"'")
                current_q["expected"] = expected
    return items


def write_csv(path: Path, rows: list[dict]) -> None:
    cols = [
        "phase", "question", "expected", "answer", "retrieved_count",
        "status", "notes"
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def write_md(path: Path, summary: dict, rows: list[dict]) -> None:
    lines = []
    lines.append(f"# Validación RAG — {dt.datetime.now().isoformat(timespec='seconds')}\n")
    lines.append("## Resumen Inicial\n")
    lines.append(f"- PDFs iniciales: {summary['initial_pdfs']}\n")
    lines.append(f"- VectorStore size inicial: {summary['initial_vs_size']}\n")
    lines.append("\n## Resultados\n")
    for r in rows:
        lines.append(f"- [{r.get('phase')}] Q: {r.get('question')}\n")
        lines.append(f"  - Esperado: {r.get('expected')}\n")
        lines.append(f"  - Answer: {r.get('answer')}\n")
        lines.append(f"  - Retrieved: {r.get('retrieved_count')}\n")
        lines.append(f"  - Status: {r.get('status')}\n")
        if r.get('notes'):
            lines.append(f"  - Notes: {r.get('notes')}\n")
        lines.append("")
    lines.append("\n## Resumen Final\n")
    lines.append(f"- PDFs finales: {summary['final_pdfs']}\n")
    lines.append(f"- VectorStore size final: {summary['final_vs_size']}\n")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    hc = health()
    log(f"Health status: {hc}")
    initial_status = rag_status(token)
    initial_list = list_pdfs(token)
    summary = {
        "initial_pdfs": len(initial_list.get("pdfs", [])),
        "initial_vs_size": initial_status.get("vector_store", {}).get("size", 0),
    }
    log(f"Estado inicial: PDFs={summary['initial_pdfs']} VS_size={summary['initial_vs_size']}")

    # Limpieza previa para estado controlado
    try:
        clear_rag(token)
    except Exception as e:
        log(f"Clear-rag inicial falló: {e}")

    # Subir PDF de prueba
    resp_up = upload_pdf(token, PDF_PATH)
    log(f"Upload resp: {resp_up.get('message','ok')}")

    # Esperar ingesta (poll hasta que retrieve funcione)
    preguntas = parse_preguntas(PREGUNTAS_MD)
    rows: list[dict] = []
    deadline = time.time() + 60.0
    ready = False
    while time.time() < deadline:
        try:
            dbg = retrieve_debug(token, preguntas[0]["question"], k=5, include_context=False)
            if dbg.get("retrieved"):
                ready = True
                break
        except Exception as e:
            log(f"Poll retrieve error: {e}")
        time.sleep(2)
    log(f"Ingesta lista={ready}")

    # Evaluación con preguntas
    for item in preguntas:
        q = item.get("question")
        exp = item.get("expected")
        dbg = retrieve_debug(token, q, k=5, include_context=True)
        ans = chat_stream(token, q, conversation_id=str(uuid.uuid4()))
        retrieved_count = len(dbg.get("retrieved", []))
        status = "ok" if (exp and ans and exp.lower() in ans.lower()) else "check"
        log(f"Pregunta: {q} | retrieved={retrieved_count} | status={status}")
        rows.append({
            "phase": "ingested",
            "question": q,
            "expected": exp,
            "answer": ans,
            "retrieved_count": retrieved_count,
            "status": status,
            "notes": "" if status == "ok" else "Respuesta no coincide exactamente",
        })

    # Eliminar PDF y validar limpieza
    try:
        resp_del = delete_pdf(token, PDF_PATH.name)
        log(f"Delete resp: {resp_del.get('message','ok')}")
    except Exception as e:
        log(f"Delete falló: {e}")

    # Validar que ya no recupera contexto
    for item in preguntas:
        q = item.get("question")
        dbg = retrieve_debug(token, q, k=5, include_context=True)
        retrieved_count = len(dbg.get("retrieved", []))
        log(f"Post-delete: {q} | retrieved={retrieved_count}")
        rows.append({
            "phase": "after_delete",
            "question": q,
            "expected": item.get("expected"),
            "answer": "(no verificado)",
            "retrieved_count": retrieved_count,
            "status": "ok" if retrieved_count == 0 else "residuals",
            "notes": "Contexto residual" if retrieved_count > 0 else "",
        })

    # Limpieza total y verificación final
    clear_rag(token)
    for item in preguntas:
        q = item.get("question")
        dbg = retrieve_debug(token, q, k=5, include_context=False)
        retrieved_count = len(dbg.get("retrieved", []))
        log(f"Post-clear: {q} | retrieved={retrieved_count}")
        rows.append({
            "phase": "after_clear_rag",
            "question": q,
            "expected": item.get("expected"),
            "answer": "(no verificado)",
            "retrieved_count": retrieved_count,
            "status": "ok" if retrieved_count == 0 else "residuals",
            "notes": "Contexto residual" if retrieved_count > 0 else "",
        })

    final_status = rag_status(token)
    final_list = list_pdfs(token)
    summary["final_pdfs"] = len(final_list.get("pdfs", []))
    summary["final_vs_size"] = final_status.get("vector_store", {}).get("size", 0)

    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    md_path = OUTPUT_DIR / f"rag_validation_{ts}.md"
    csv_path = OUTPUT_DIR / f"rag_validation_{ts}.csv"
    write_md(md_path, summary, rows)
    write_csv(csv_path, rows)
    log(f"Resultados MD: {md_path}")
    log(f"Resultados CSV: {csv_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[validate_rag] ERROR: {e}")