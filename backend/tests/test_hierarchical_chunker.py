from __future__ import annotations

from pathlib import Path

import pytest
from langchain_core.documents import Document

from rag.ingestion.hierarchical_chunker import HierarchicalChunker


pytestmark = pytest.mark.anyio


async def _fake_page_loader(_pdf_path: Path):
    return [
        Document(
            page_content=(
                "# RESUMEN EJECUTIVO\n\n"
                "Este es un bloque introductorio con varias palabras repetidas para generar tokens suficientes. "
                "Este es un bloque introductorio con varias palabras repetidas para generar tokens suficientes.\n\n"
                "| Fecha | Monto |\n"
                "| --- | --- |\n"
                "| 2026-01-01 | 100 |\n"
                "| 2026-01-02 | 150 |\n\n"
                "Conclusiones finales con mas texto de apoyo y referencias numericas 2026."
            ),
            metadata={"page_number": 1},
        )
    ]


async def test_hierarchical_chunker_builds_parent_and_child_chunks():
    chunker = HierarchicalChunker(
        page_loader=_fake_page_loader,
        parent_target_tokens=80,
        parent_max_tokens=120,
        parent_min_tokens=20,
        child_target_tokens=30,
        child_max_tokens=50,
        child_min_tokens=10,
    )

    result = await chunker.chunk_pdf(pdf_path=Path("dummy.pdf"), doc_id="doc_test")

    assert result.parents
    assert result.children
    assert any(parent.contains_table for parent in result.parents)
    assert any("| Fecha | Monto |" in parent.content for parent in result.parents)
    assert all(child.parent_id for child in result.children)
    assert all(child.doc_id == "doc_test" for child in result.children)


async def _fake_sectioned_page_loader(_pdf_path: Path):
    return [
        Document(
            page_content=(
                "# SECCION UNO\n\n"
                "Texto de la seccion uno con suficiente contenido para formar un bloque propio. "
                "Texto de la seccion uno con suficiente contenido para formar un bloque propio. "
                "Texto de la seccion uno con suficiente contenido para formar un bloque propio.\n\n"
                "# SECCION DOS\n\n"
                "Texto de la seccion dos con suficiente contenido para formar otro bloque independiente. "
                "Texto de la seccion dos con suficiente contenido para formar otro bloque independiente. "
                "Texto de la seccion dos con suficiente contenido para formar otro bloque independiente."
            ),
            metadata={"page_number": 1},
        )
    ]


async def test_hierarchical_chunker_flushes_on_new_section_headers_even_before_parent_min_tokens():
    chunker = HierarchicalChunker(
        page_loader=_fake_sectioned_page_loader,
        parent_target_tokens=500,
        parent_max_tokens=800,
        parent_min_tokens=400,
        child_target_tokens=80,
        child_max_tokens=120,
        child_min_tokens=20,
    )

    result = await chunker.chunk_pdf(pdf_path=Path("dummy.pdf"), doc_id="doc_test")

    assert len(result.parents) == 2
    assert "SECCION UNO" in result.parents[0].content
    assert "SECCION DOS" not in result.parents[0].content
    assert "SECCION DOS" in result.parents[1].content
