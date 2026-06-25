from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import sys
import time
from typing import Any
from uuid import uuid4

import httpx
import pytest

# Pytest integration: run with `pytest -m integration --run-integration`
def pytest_configure(config):
    config.addinivalue_line("markers", "integration: marks tests as integration (deselect with '-m not integration')")

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from prepare_eval_corpus import DEFAULT_MD, DEFAULT_PDF, prepare_corpus
from ragas_support import evaluate_with_ragas, is_ragas_available
from scorers import CheckResult, evaluate_answer, evaluate_retrieval
from sse_client import collect_chat_stream


DEFAULT_DATASET = SCRIPT_DIR / "datasets" / "rag_e2e_cases.json"
DEFAULT_REPORT_DIR = SCRIPT_DIR / "reports"


@dataclass
class CaseOutcome:
    id: str
    category: str
    passed: bool
    answer_passed: bool
    retrieval_passed: bool
    question: str
    answer: str
    answer_notes: list[str]
    retrieval_notes: list[str]
    retrieval_reason: str | None
    elapsed_ms: float
    error: str | None = None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ejecuta la evaluacion E2E del RAG usando endpoints reales.")
    parser.add_argument("--base-url", default=os.getenv("RAG_EVAL_BASE_URL", "http://127.0.0.1:8000"), help="Base URL del backend.")
    parser.add_argument("--email", default=os.getenv("RAG_EVAL_EMAIL"), help="Correo del usuario para login.")
    parser.add_argument("--password", default=os.getenv("RAG_EVAL_PASSWORD"), help="Password del usuario para login.")
    parser.add_argument("--access-token", default=os.getenv("RAG_EVAL_ACCESS_TOKEN"), help="Token Bearer opcional para evitar login.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET, help="Ruta del dataset JSON.")
    parser.add_argument("--corpus-markdown", type=Path, default=DEFAULT_MD, help="Ruta del corpus Markdown.")
    parser.add_argument("--corpus-pdf", type=Path, default=DEFAULT_PDF, help="Ruta del PDF generado.")
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR, help="Directorio de reportes.")
    parser.add_argument("--timeout", type=float, default=90.0, help="Timeout HTTP global en segundos.")
    parser.add_argument("--poll-attempts", type=int, default=8, help="Intentos para verificar que el PDF ya esta visible en el estado RAG.")
    parser.add_argument("--poll-sleep", type=float, default=1.0, help="Espera entre intentos de verificacion del estado RAG.")
    parser.add_argument("--case", action="append", dest="case_ids", default=None, help="Ejecuta solo uno o varios case IDs.")
    parser.add_argument("--limit", type=int, default=None, help="Limita el numero de casos a ejecutar despues del filtro.")
    parser.add_argument("--skip-clear-before", action="store_true", help="No limpia el RAG antes de subir el corpus.")
    parser.add_argument("--keep-corpus", action="store_true", help="No limpia el RAG al terminar.")
    parser.add_argument("--skip-retrieval-audit", action="store_true", help="No llama al endpoint retrieve-debug.")
    parser.add_argument("--no-prepare", action="store_true", help="No regenera el PDF antes de la corrida.")
    parser.add_argument("--with-ragas", action="store_true", help="Ejecuta una segunda evaluacion semantica con Ragas.")
    parser.add_argument("--ragas-model", default=os.getenv("RAGAS_EVAL_MODEL", "gpt-4o-mini"), help="Modelo evaluador para Ragas.")
    parser.add_argument("--ragas-embedding-model", default=os.getenv("RAGAS_EMBEDDING_MODEL", "text-embedding-3-small"), help="Modelo de embeddings para Ragas.")
    return parser


def require_credentials(email: str | None, password: str | None) -> tuple[str, str]:
    if not email or not password:
        raise SystemExit("Faltan credenciales. Define --email/--password o RAG_EVAL_EMAIL/RAG_EVAL_PASSWORD.")
    return email, password


def load_dataset(dataset_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases = payload.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError(f"Dataset invalido o vacio: {dataset_path}")
    return cases


def filter_cases(cases: list[dict[str, Any]], case_ids: list[str] | None, limit: int | None) -> list[dict[str, Any]]:
    selected = cases
    if case_ids:
        case_set = set(case_ids)
        selected = [case for case in selected if case.get("id") in case_set]
    if limit is not None:
        selected = selected[: max(0, limit)]
    if not selected:
        raise ValueError("No quedaron casos para ejecutar con los filtros indicados.")
    return selected


def join_url(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + path


def raise_for_status_with_context(response: httpx.Response, context: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        try:
            body = response.text.strip()
        except Exception:
            body = "<sin cuerpo>"
        raise RuntimeError(f"{context}: {response.status_code} {body}") from exc


def login(client: httpx.Client, base_url: str, email: str, password: str) -> str:
    response = client.post(
        join_url(base_url, "/api/v1/auth/login"),
        json={"email": email, "password": password},
    )
    raise_for_status_with_context(response, "Fallo el login")
    data = response.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError("El login no devolvio access_token.")
    return str(token)


def get_auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def ensure_bot_active(client: httpx.Client, base_url: str, headers: dict[str, str]) -> None:
    response = client.get(join_url(base_url, "/api/v1/bot/state"), headers=headers)
    raise_for_status_with_context(response, "No se pudo consultar el estado del bot")
    data = response.json()
    if not bool(data.get("is_active")):
        raise RuntimeError("El bot esta desactivado. Activalo antes de correr la evaluacion E2E.")


def clear_rag(client: httpx.Client, base_url: str, headers: dict[str, str]) -> dict[str, Any]:
    response = client.post(join_url(base_url, "/api/v1/rag/clear-rag"), headers=headers)
    raise_for_status_with_context(response, "Fallo clear-rag")
    return response.json()


def upload_pdf(client: httpx.Client, base_url: str, headers: dict[str, str], pdf_path: Path) -> dict[str, Any]:
    with pdf_path.open("rb") as file_handle:
        response = client.post(
            join_url(base_url, "/api/v1/pdfs/upload"),
            headers=headers,
            files={"file": (pdf_path.name, file_handle, "application/pdf")},
        )
    raise_for_status_with_context(response, f"Fallo upload del PDF '{pdf_path.name}'")
    return response.json()


def resolve_uploaded_filename(upload_payload: dict[str, Any], fallback_name: str) -> str:
    file_path = str(upload_payload.get("file_path") or "").strip()
    if file_path:
        return Path(file_path).name
    pdfs_in_directory = upload_payload.get("pdfs_in_directory") or []
    if pdfs_in_directory:
        return str(pdfs_in_directory[-1])
    return fallback_name


def get_rag_status(client: httpx.Client, base_url: str, headers: dict[str, str]) -> dict[str, Any]:
    response = client.get(join_url(base_url, "/api/v1/rag/rag-status"), headers=headers)
    raise_for_status_with_context(response, "Fallo rag-status")
    return response.json()


def wait_for_uploaded_pdf(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    filename: str,
    attempts: int,
    sleep_seconds: float,
) -> dict[str, Any]:
    last_status: dict[str, Any] | None = None
    for _ in range(max(1, attempts)):
        status_payload = get_rag_status(client, base_url, headers)
        last_status = status_payload
        filenames = {str(item.get("filename") or "") for item in status_payload.get("pdfs", [])}
        vector_count = int(((status_payload.get("vector_store") or {}).get("count")) or 0)
        if filename in filenames and vector_count > 0:
            return status_payload
        time.sleep(max(0.1, sleep_seconds))
    raise RuntimeError(f"El PDF '{filename}' no aparecio listo en rag-status. Ultimo estado: {last_status}")


def retrieve_debug(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    query: str,
) -> dict[str, Any]:
    response = client.post(
        join_url(base_url, "/api/v1/rag/retrieve-debug"),
        headers=headers,
        json={"query": query, "k": 4, "include_context": True},
    )
    raise_for_status_with_context(response, f"Fallo retrieve-debug para la pregunta '{query}'")
    return response.json()


def ask_chat(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    question: str,
    conversation_id: str,
) -> str:
    result = collect_chat_stream(
        client=client,
        url=join_url(base_url, "/api/v1/chat/"),
        headers=headers,
        payload={
            "input": question,
            "conversation_id": conversation_id,
            "source": "rag-e2e-eval"
        },
    )
    if result.error:
        raise RuntimeError(f"El endpoint de chat devolvio error SSE: {result.error}")
    if not result.text:
        raise RuntimeError("El endpoint de chat no devolvio texto.")
    return result.text


def build_conversation_id_map(cases: list[dict[str, Any]]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for case in cases:
        key = str(case.get("conversation_key") or case["id"])
        mapping.setdefault(key, f"rag-e2e-{key}-{uuid4().hex[:8]}")
    return mapping


def print_case_result(outcome: CaseOutcome) -> None:
    status = "PASS" if outcome.passed else "FAIL"
    print(f"[{status}] {outcome.id} ({outcome.category}) - {outcome.elapsed_ms:.0f} ms")
    if not outcome.passed:
        for note in outcome.answer_notes + outcome.retrieval_notes:
            print(f"  - {note}")


def write_report(report_dir: Path, payload: dict[str, Any]) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = report_dir / f"rag_e2e_report_{timestamp}.json"
    report_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path


def extract_retrieved_contexts(retrieval_trace: dict[str, Any] | None) -> list[str]:
    if not retrieval_trace:
        return []

    contexts: list[str] = []
    seen: set[str] = set()

    documents = retrieval_trace.get("documents", []) or []
    for item in documents:
        page_content = str((item or {}).get("page_content") or "").strip()
        if page_content and page_content not in seen:
            contexts.append(page_content)
            seen.add(page_content)

    if not contexts:
        context = str(retrieval_trace.get("context") or "").strip()
        if context and context not in seen:
            contexts.append(context)
            seen.add(context)

    if not contexts:
        for item in retrieval_trace.get("retrieved", []) or []:
            for child in item.get("child_hits", []) or []:
                child_preview = str(child.get("preview") or "").strip()
                if child_preview and child_preview not in seen:
                    contexts.append(child_preview)
                    seen.add(child_preview)

    return contexts[:3]


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    cases = filter_cases(load_dataset(args.dataset), args.case_ids, args.limit)

    if not args.no_prepare:
        prepare_corpus(markdown_path=args.corpus_markdown, pdf_path=args.corpus_pdf)
    elif not args.corpus_pdf.exists():
        raise SystemExit(f"No existe el PDF de corpus y se indico --no-prepare: {args.corpus_pdf}")

    outcomes: list[CaseOutcome] = []
    ragas_records: list[dict[str, Any]] = []
    headers: dict[str, str]
    conversation_ids = build_conversation_id_map(cases)
    client = httpx.Client(timeout=args.timeout)
    clear_before_payload: dict[str, Any] | None = None
    clear_after_payload: dict[str, Any] | None = None
    upload_payload: dict[str, Any] | None = None
    rag_status_payload: dict[str, Any] | None = None

    try:
        token = args.access_token or login(
            client,
            args.base_url,
            *require_credentials(args.email, args.password),
        )
        headers = get_auth_headers(token)
        ensure_bot_active(client, args.base_url, headers)

        if not args.skip_clear_before:
            clear_before_payload = clear_rag(client, args.base_url, headers)

        upload_payload = upload_pdf(client, args.base_url, headers, args.corpus_pdf)
        uploaded_filename = resolve_uploaded_filename(upload_payload, args.corpus_pdf.name)
        rag_status_payload = wait_for_uploaded_pdf(
            client,
            args.base_url,
            headers,
            uploaded_filename,
            attempts=args.poll_attempts,
            sleep_seconds=args.poll_sleep,
        )

        for case in cases:
            started = time.perf_counter()
            runtime_case = dict(case)
            if runtime_case.get("requires_corpus") and runtime_case.get("expected_source") == args.corpus_pdf.name:
                runtime_case["expected_source"] = uploaded_filename

            question = str(runtime_case["question"])
            conversation_key = str(runtime_case.get("conversation_key") or runtime_case["id"])
            conversation_id = conversation_ids[conversation_key]

            retrieval_trace = None
            try:
                answer = ask_chat(
                    client=client,
                    base_url=args.base_url,
                    headers=headers,
                    question=question,
                    conversation_id=conversation_id,
                )
                if not args.skip_retrieval_audit and runtime_case.get("requires_corpus"):
                    retrieval_trace = retrieve_debug(
                        client=client,
                        base_url=args.base_url,
                        headers=headers,
                        query=question,
                    )

                answer_result = evaluate_answer(runtime_case, answer)
                retrieval_result = (
                    CheckResult(passed=True, notes=["Retrieval audit omitido por flag."])
                    if args.skip_retrieval_audit
                    else evaluate_retrieval(runtime_case, retrieval_trace)
                )
                error_message = None
            except Exception as case_error:
                answer = ""
                answer_result = CheckResult(
                    passed=False,
                    notes=[f"Error ejecutando el caso: {case_error}"],
                )
                retrieval_result = CheckResult(
                    passed=False,
                    notes=["No se completo retrieval por error del caso."],
                )
                error_message = str(case_error)

            elapsed_ms = (time.perf_counter() - started) * 1000
            outcome = CaseOutcome(
                id=str(runtime_case["id"]),
                category=str(runtime_case.get("category") or "unknown"),
                passed=bool(answer_result.passed and retrieval_result.passed),
                answer_passed=answer_result.passed,
                retrieval_passed=retrieval_result.passed,
                question=question,
                answer=answer,
                answer_notes=answer_result.notes,
                retrieval_notes=retrieval_result.notes,
                retrieval_reason=str(((retrieval_trace or {}).get("timings") or {}).get("retrieval_reason") or "") or None,
                elapsed_ms=elapsed_ms,
                error=error_message,
            )
            outcomes.append(outcome)
            ragas_records.append(
                {
                    "id": str(runtime_case["id"]),
                    "category": str(runtime_case.get("category") or "unknown"),
                    "requires_corpus": bool(runtime_case.get("requires_corpus")),
                    "question": question,
                    "answer": answer,
                    "reference_answer": runtime_case.get("reference_answer"),
                    "retrieved_contexts": extract_retrieved_contexts(retrieval_trace),
                    "error": error_message,
                }
            )
            print_case_result(outcome)

    finally:
        if "headers" in locals() and not args.keep_corpus:
            try:
                clear_after_payload = clear_rag(client, args.base_url, headers)
            except Exception as cleanup_error:
                print(f"[WARN] Fallo la limpieza final del RAG: {cleanup_error}")
        client.close()

    passed = sum(1 for item in outcomes if item.passed)
    failed = len(outcomes) - passed
    report_payload = {
        "base_url": args.base_url,
        "dataset": str(args.dataset),
        "corpus_pdf": str(args.corpus_pdf),
        "summary": {
            "total": len(outcomes),
            "passed": passed,
            "failed": failed,
            "pass_rate": round((passed / len(outcomes)) * 100, 2) if outcomes else 0.0,
        },
        "preflight": {
            "clear_before": clear_before_payload,
            "upload": upload_payload,
            "rag_status_after_upload": rag_status_payload,
            "clear_after": clear_after_payload,
        },
        "results": [asdict(item) for item in outcomes],
    }

    if args.with_ragas:
        if not is_ragas_available():
            report_payload["ragas"] = {
                "status": "skipped",
                "reason": "Ragas no esta instalado. Instala backend/requirements-evals.txt.",
            }
        else:
            try:
                ragas_artifacts = evaluate_with_ragas(
                    case_records=ragas_records,
                    report_dir=args.report_dir,
                    model_name=args.ragas_model,
                    embedding_model=args.ragas_embedding_model,
                )
                report_payload["ragas"] = {
                    "status": "success",
                    "summary": ragas_artifacts.summary,
                    "report_path": str(ragas_artifacts.report_path),
                }
            except Exception as ragas_error:
                report_payload["ragas"] = {
                    "status": "failed",
                    "reason": str(ragas_error),
                }

    report_path = write_report(args.report_dir, report_payload)

    print("")
    print("Resumen final")
    print(f"- Total: {len(outcomes)}")
    print(f"- Pass: {passed}")
    print(f"- Fail: {failed}")
    print(f"- Pass rate: {report_payload['summary']['pass_rate']}%")
    print(f"- Reporte: {report_path}")
    if "ragas" in report_payload:
        print(f"- Ragas: {report_payload['ragas']}")

    return 0 if failed == 0 else 1


@pytest.mark.integration
def test_rag_e2e_eval_runs():
    """Smoke test: run_evaluation with a tiny dataset. Requires live backend."""
    pytest.skip("Integration test — run with --run-integration flag and live backend")


if __name__ == "__main__":
    raise SystemExit(main())
