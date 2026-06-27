from pathlib import Path
import re


def analyze_backend(base_dir: Path) -> None:
    """
    Analiza el código del backend para detectar el tipo de RAG:
    - RAG FAQ (nivel 1): encuentra estructuras con 'question' y 'answer'.
    - RAG semántico (nivel 2): encuentra 'Document(page_content=...)' o prompts con 'context'.
    - RAG híbrido (nivel 3): detecta ambos o múltiples estrategias.
    Imprime el resultado en consola con evidencia resumida.
    """

    faq_files = set()
    sem_doc_files = set()
    context_prompt_files = set()

    for file in base_dir.rglob("*.py"):
        try:
            text = file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Heurística FAQ: presencia de 'question' y 'answer' en el mismo archivo
        has_question = bool(
            re.search(r"['\"]question['\"]\s*:|\bquestion\s*=", text)
        )
        has_answer = bool(
            re.search(r"['\"]answer['\"]\s*:|\banswer\s*=", text)
        )
        if has_question and has_answer:
            faq_files.add(file)

        # Heurística semántica: uso de Document(page_content=...)
        if re.search(r"Document\s*\([^)]*page_content\s*=", text, re.DOTALL):
            sem_doc_files.add(file)

        # Heurística prompts con 'context' (PromptTemplate/prompt/template o 'context' dentro de cadenas)
        prompt_with_context = bool(
            re.search(
                r"(PromptTemplate|prompt|template)[^\n]{0,200}?context|context[^\n]{0,200}?(PromptTemplate|prompt|template)",
                text,
                flags=re.IGNORECASE | re.DOTALL,
            )
        ) or bool(
            re.search(r"['\"][^'\"]*context[^'\"]*['\"]", text, flags=re.IGNORECASE)
        )
        if prompt_with_context:
            context_prompt_files.add(file)

    faq = len(faq_files) > 0
    semantic = (len(sem_doc_files) > 0) or (len(context_prompt_files) > 0)
    hybrid = faq and semantic

    if hybrid:
        rag_type = "RAG híbrido"
        level = "nivel 3"
    elif faq:
        rag_type = "RAG FAQ"
        level = "nivel 1"
    elif semantic:
        rag_type = "RAG semántico"
        level = "nivel 2"
    else:
        rag_type = "No se detectó un patrón RAG claro"
        level = "sin nivel"

    print(f"Tipo de RAG detectado: {rag_type} ({level}).")

    def sample(paths: set[Path]) -> str:
        if not paths:
            return "—"
        examples = list(paths)[:3]
        try:
            return ", ".join(str(p.relative_to(base_dir)) for p in examples)
        except Exception:
            return ", ".join(str(p) for p in examples)

    print(
        f"- Evidencia FAQ (question/answer): {len(faq_files)} archivos, ejemplos: {sample(faq_files)}"
    )
    print(
        f"- Evidencia semántico (Document(page_content=...)): {len(sem_doc_files)} archivos, ejemplos: {sample(sem_doc_files)}"
    )
    print(
        f"- Evidencia prompts con 'context': {len(context_prompt_files)} archivos, ejemplos: {sample(context_prompt_files)}"
    )


if __name__ == "__main__":
    # Asume que este script está en backend/utils/. Escanea el directorio backend/.
    backend_dir = Path(__file__).resolve().parents[1]
    analyze_backend(backend_dir)