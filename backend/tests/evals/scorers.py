from __future__ import annotations

from dataclasses import dataclass, field
import unicodedata
from typing import Any


@dataclass
class CheckResult:
    passed: bool
    notes: list[str] = field(default_factory=list)


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    without_marks = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(without_marks.casefold().split())


def _contains_any(text: str, candidates: list[str]) -> bool:
    normalized = normalize_text(text)
    return any(normalize_text(candidate) in normalized for candidate in candidates)


def _contains_all(text: str, candidates: list[str]) -> bool:
    normalized = normalize_text(text)
    return all(normalize_text(candidate) in normalized for candidate in candidates)


def evaluate_answer(case: dict[str, Any], answer: str) -> CheckResult:
    notes: list[str] = []
    passed = True

    if case.get("answer_should_not_be_empty") and not answer.strip():
        passed = False
        notes.append("La respuesta llego vacia.")

    must_contain_all = [item for item in case.get("must_contain_all", []) if item]
    if must_contain_all and not _contains_all(answer, must_contain_all):
        passed = False
        notes.append(f"Faltan fragmentos obligatorios: {must_contain_all}")

    must_contain_any = [item for item in case.get("must_contain_any", []) if item]
    if must_contain_any and not _contains_any(answer, must_contain_any):
        passed = False
        notes.append(f"No aparecio ninguno de los fragmentos esperados: {must_contain_any}")

    must_contain_any_casefold = [item for item in case.get("must_contain_any_casefold", []) if item]
    if must_contain_any_casefold and not _contains_any(answer, must_contain_any_casefold):
        passed = False
        notes.append(f"No aparecio ninguno de los fragmentos esperados (normalizados): {must_contain_any_casefold}")

    must_not_contain = [item for item in case.get("must_not_contain", []) if item]
    if must_not_contain:
        offending = [item for item in must_not_contain if normalize_text(item) in normalize_text(answer)]
        if offending:
            passed = False
            notes.append(f"Aparecieron fragmentos prohibidos: {offending}")

    return CheckResult(passed=passed, notes=notes)


def evaluate_retrieval(case: dict[str, Any], retrieval_trace: dict[str, Any] | None) -> CheckResult:
    if not case.get("requires_corpus"):
        return CheckResult(passed=True, notes=["Caso sin chequeo de retrieval."])

    if retrieval_trace is None:
        return CheckResult(passed=False, notes=["No hubo trace de retrieval para un caso con corpus."])

    notes: list[str] = []
    passed = True
    retrieved_items = retrieval_trace.get("retrieved", []) or []

    expected_source = case.get("expected_source")
    if expected_source:
        sources = {str(item.get("source") or "") for item in retrieved_items}
        if expected_source not in sources:
            passed = False
            notes.append(f"No se encontro la fuente esperada en retrieval: {expected_source}")

    snippets = [item for item in case.get("retrieval_snippets", []) if item]
    if snippets:
        haystack_parts: list[str] = [str(retrieval_trace.get("context") or "")]
        for item in retrieved_items:
            haystack_parts.append(str(item.get("preview") or ""))
            haystack_parts.append(str(item.get("section_title") or ""))
            for child in item.get("child_hits", []) or []:
                haystack_parts.append(str(child.get("preview") or ""))
        haystack = "\n".join(haystack_parts)
        missing = [snippet for snippet in snippets if normalize_text(snippet) not in normalize_text(haystack)]
        if missing:
            passed = False
            notes.append(f"No se encontraron snippets esperados en retrieval: {missing}")

    retrieval_reason = str((retrieval_trace.get("timings") or {}).get("retrieval_reason") or "")
    if not retrieval_reason:
        passed = False
        notes.append("El trace no devolvio retrieval_reason.")

    return CheckResult(passed=passed, notes=notes)
