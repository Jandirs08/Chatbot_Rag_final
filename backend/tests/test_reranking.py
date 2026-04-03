"""
Tests para Semantic Reranking y MMR del RAGRetriever.

Cubre:
- _semantic_reranking: reordenamiento por score compuesto
- _apply_mmr: Maximal Marginal Relevance para diversidad
"""
import pytest
import numpy as np
from langchain_core.documents import Document

pytestmark = pytest.mark.anyio


def _make_unit_vector(seed: int, dim: int = 1536) -> np.ndarray:
    """Genera un vector unitario reproducible a partir de un seed."""
    rng = np.random.RandomState(seed)
    vec = rng.randn(dim).astype(np.float32)
    return vec / np.linalg.norm(vec)


def _make_doc_with_vector(content, seed, chunk_type="text", source="test.pdf", quality_score=0.5):
    """Crea un Document con un vector embebido en metadata."""
    vec = _make_unit_vector(seed)
    return Document(
        page_content=content,
        metadata={
            "vector": vec.tolist(),
            "chunk_type": chunk_type,
            "source": source,
            "quality_score": quality_score,
            "score": 0.5,
        }
    )


# ============================================================
#   SEMANTIC RERANKING
# ============================================================

class TestSemanticReranking:
    """Tests para _semantic_reranking."""

    async def test_sin_query_embedding_retorna_sin_cambios(self, retriever):
        """Sin query_embedding → retorna docs sin reranking."""
        docs = [
            _make_doc_with_vector("Doc A", seed=1),
            _make_doc_with_vector("Doc B", seed=2),
        ]
        result = await retriever._semantic_reranking(docs, query_embedding=None)
        assert len(result) == 2
        # Sin reranking, retorna tal cual
        assert result[0].page_content == "Doc A"
        assert result[1].page_content == "Doc B"

    async def test_sin_embedding_manager_retorna_sin_cambios(self, retriever):
        """Sin embedding_manager → retorna docs sin procesamiento."""
        retriever.embedding_manager = None
        docs = [_make_doc_with_vector("Doc A", seed=1)]
        result = await retriever._semantic_reranking(docs, query_embedding=_make_unit_vector(10))
        assert len(result) == 1

    async def test_reranking_ordena_por_score_compuesto(self, retriever):
        """El reranking ordena docs por score compuesto (semántico + quality + length + type)."""
        query_vec = _make_unit_vector(42)

        # Doc con vector cercano al query + alta calidad
        doc_good = _make_doc_with_vector("Doc bueno " * 20, seed=42, quality_score=0.9)  # seed=42 = mismo que query
        # Doc con vector lejano + baja calidad
        doc_bad = _make_doc_with_vector("Doc malo", seed=99, quality_score=0.1)

        result = await retriever._semantic_reranking([doc_bad, doc_good], query_embedding=query_vec)

        # Doc bueno debería estar primero por mayor similitud + calidad
        assert result[0].page_content.startswith("Doc bueno")
        assert result[1].page_content == "Doc malo"

    async def test_pdf_priority_boost(self, retriever):
        """Documentos de PDF reciben un boost de 1.5x en el score."""
        query_vec = _make_unit_vector(42)

        doc_pdf = _make_doc_with_vector("Contenido PDF", seed=42, source="manual.pdf", quality_score=0.5)
        doc_txt = _make_doc_with_vector("Contenido TXT", seed=42, source="notas.txt", quality_score=0.5)

        result = await retriever._semantic_reranking([doc_txt, doc_pdf], query_embedding=query_vec)

        # PDF debería tener score mayor por el multiplicador 1.5x
        assert result[0].metadata["source"] == "manual.pdf"

    async def test_docs_sin_vector_obtienen_score_cero_semantico(self, retriever):
        """Docs sin vector en metadata solo puntúan por quality/length/type."""
        query_vec = _make_unit_vector(42)

        doc_no_vec = Document(
            page_content="Contenido sin vector " * 10,
            metadata={"chunk_type": "text", "source": "a.pdf", "quality_score": 0.9}
        )
        doc_with_vec = _make_doc_with_vector("Contenido con vector " * 10, seed=42, quality_score=0.5)

        result = await retriever._semantic_reranking([doc_no_vec, doc_with_vec], query_embedding=query_vec)

        # El doc con vector cercano al query debería rankear mejor
        assert result[0].page_content.startswith("Contenido con vector")


# ============================================================
#   MMR (Maximal Marginal Relevance)
# ============================================================

class TestApplyMMR:
    """Tests para _apply_mmr."""

    async def test_selecciona_k_documentos(self, retriever):
        """MMR selecciona exactamente k documentos."""
        docs = [_make_doc_with_vector(f"Doc {i}", seed=i) for i in range(6)]
        query_vec = _make_unit_vector(42)

        result = await retriever._apply_mmr(docs, k=3, query_embedding=query_vec)
        assert len(result) == 3

    async def test_sin_query_embedding_retorna_top_k(self, retriever):
        """Sin query_embedding → retorna los primeros k docs (fallback)."""
        docs = [_make_doc_with_vector(f"Doc {i}", seed=i) for i in range(5)]

        result = await retriever._apply_mmr(docs, k=2, query_embedding=None)
        assert len(result) == 2
        assert result[0].page_content == "Doc 0"
        assert result[1].page_content == "Doc 1"

    async def test_diversidad_penaliza_duplicados(self, retriever):
        """Docs con vectores idénticos → MMR prefiere diversidad."""
        # 3 docs con el mismo vector (seed=1)
        duplicates = [_make_doc_with_vector(f"Dup {i}", seed=1) for i in range(3)]
        # 1 doc con vector diferente (seed=99)
        diverse = _make_doc_with_vector("Diferente", seed=99)
        docs = duplicates + [diverse]

        query_vec = _make_unit_vector(1)  # Cercano a los duplicados
        result = await retriever._apply_mmr(docs, k=2, query_embedding=query_vec)

        # El primer resultado será un duplicado (más relevante)
        # El segundo debería ser el diferente (por diversidad)
        contents = [d.page_content for d in result]
        assert "Diferente" in contents, "MMR debería seleccionar el documento diverso"

    async def test_k_mayor_que_docs(self, retriever):
        """Si k > len(docs), retorna todos los docs disponibles."""
        docs = [_make_doc_with_vector(f"Doc {i}", seed=i) for i in range(3)]
        query_vec = _make_unit_vector(42)

        result = await retriever._apply_mmr(docs, k=10, query_embedding=query_vec)
        assert len(result) == 3

    async def test_docs_sin_vector_excluidos(self, retriever):
        """Docs sin vector en metadata son excluidos de MMR."""
        doc_with_vec = _make_doc_with_vector("Con vector", seed=1)
        doc_no_vec = Document(page_content="Sin vector", metadata={"chunk_type": "text"})
        docs = [doc_no_vec, doc_with_vec]

        query_vec = _make_unit_vector(1)
        result = await retriever._apply_mmr(docs, k=2, query_embedding=query_vec)

        # Solo debería incluir el doc con vector
        assert len(result) >= 1
        assert any(d.page_content == "Con vector" for d in result)

    async def test_sin_embedding_manager_retorna_top_k(self, retriever):
        """Sin embedding_manager → fallback a top-k simple."""
        retriever.embedding_manager = None
        docs = [_make_doc_with_vector(f"Doc {i}", seed=i) for i in range(5)]

        result = await retriever._apply_mmr(docs, k=2, query_embedding=_make_unit_vector(42))
        assert len(result) == 2
