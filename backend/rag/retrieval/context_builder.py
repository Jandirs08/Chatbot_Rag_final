from __future__ import annotations

from typing import Dict, List

from langchain_core.documents import Document

from .retrieval_types import NO_CONTEXT_MESSAGE
from .sanitize import sanitize_doc_content, sanitize_metadata_field


def format_context_from_documents(documents: List[Document]) -> str:
    if not documents:
        return NO_CONTEXT_MESSAGE

    # Preserve reranking order — grouping by type would destroy relevance ranking.
    emit_doc_marker = len(documents) > 1

    def _format_chunk(idx: int, doc: Document) -> str:
        content = sanitize_doc_content(doc.page_content.strip())
        source = sanitize_metadata_field(doc.metadata.get("source") or "")
        page_number = doc.metadata.get("page_number")
        source_parts = []
        if source:
            source_parts.append(source)
        if page_number is not None and str(page_number).strip():
            source_parts.append(f"pagina {sanitize_metadata_field(page_number)}")
        header_lines: list[str] = []
        if emit_doc_marker:
            header_lines.append(f"--- DOC {idx} ---")
        if source_parts:
            header_lines.append(f"[Fuente: {', '.join(source_parts)}]")
        if header_lines:
            return "\n".join(header_lines + [content])
        return content

    parts = ["Informacion relevante encontrada:"]
    for i, doc in enumerate(documents, start=1):
        chunk = _format_chunk(i, doc)
        if chunk:
            parts.append(chunk)
    return "\n\n".join(filter(None, parts))


def _group_documents_by_type(documents: List[Document]) -> Dict[str, List[Document]]:
    grouped: Dict[str, List[Document]] = {}
    for doc in documents:
        chunk_type = doc.metadata.get("chunk_type", "text")
        grouped.setdefault(chunk_type, []).append(doc)
    return grouped
