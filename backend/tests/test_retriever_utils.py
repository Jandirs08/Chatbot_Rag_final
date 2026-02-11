"""
Tests para funciones auxiliares puras del RAGRetriever.

Cubre:
- _clean_vector: normalización y validación de vectores
- _get_content_type_score: mapping de tipo de chunk a score
- format_context_from_documents: formateo de contexto textual
"""
import pytest
import numpy as np
from unittest.mock import patch
from langchain_core.documents import Document


# ============================================================
#   _clean_vector
# ============================================================

class TestCleanVector:
    """Tests para normalización y validación de vectores."""

    def test_vector_valido_normalizado(self, retriever):
        """Vector válido de 1536 dims se normaliza a norma L2 = 1."""
        vec = np.random.randn(1536).astype(np.float32)
        result = retriever._clean_vector(vec)
        assert result is not None
        assert result.shape == (1536,)
        assert abs(np.linalg.norm(result) - 1.0) < 1e-5

    def test_vector_none(self, retriever):
        result = retriever._clean_vector(None)
        assert result is None

    def test_vector_ceros(self, retriever):
        """Vector de ceros → None (no se puede normalizar)."""
        vec = np.zeros(1536, dtype=np.float32)
        result = retriever._clean_vector(vec)
        assert result is None

    def test_vector_dimension_incorrecta(self, retriever):
        """Vector con dimensiones != 1536 → None."""
        vec = np.random.randn(768).astype(np.float32)
        result = retriever._clean_vector(vec)
        assert result is None

    def test_vector_2d_reshape(self, retriever):
        """Vector 2D (1, 1536) se aplana a 1D."""
        vec = np.random.randn(1, 1536).astype(np.float32)
        result = retriever._clean_vector(vec)
        assert result is not None
        assert result.ndim == 1
        assert result.shape == (1536,)

    def test_vector_como_lista(self, retriever):
        """Vector pasado como lista de Python."""
        vec = np.random.randn(1536).tolist()
        result = retriever._clean_vector(vec)
        assert result is not None
        assert isinstance(result, np.ndarray)
        assert result.shape == (1536,)

    def test_vector_ya_unitario(self, retriever):
        """Vector ya normalizado no cambia significativamente."""
        vec = np.random.randn(1536).astype(np.float32)
        vec = vec / np.linalg.norm(vec)
        result = retriever._clean_vector(vec)
        assert result is not None
        np.testing.assert_allclose(result, vec, atol=1e-5)


# ============================================================
#   _get_content_type_score
# ============================================================

class TestGetContentTypeScore:
    """Tests para el mapping de tipo de contenido a score."""

    @pytest.mark.parametrize("chunk_type,expected_score", [
        ("header", 1.0),
        ("title", 0.95),
        ("subtitle", 0.9),
        ("paragraph", 0.8),
        ("text", 0.75),
        ("list", 0.7),
        ("bullet", 0.7),
        ("table", 0.6),
        ("code", 0.5),
    ])
    def test_tipos_conocidos(self, retriever, chunk_type, expected_score):
        assert retriever._get_content_type_score(chunk_type) == expected_score

    def test_tipo_desconocido(self, retriever):
        """Tipo no mapeado → default 0.6."""
        assert retriever._get_content_type_score("image") == 0.6

    def test_none_como_tipo(self, retriever):
        """None → se trata como "text" → 0.75."""
        assert retriever._get_content_type_score(None) == 0.75

    def test_tipo_case_insensitive(self, retriever):
        """Los tipos se normalizan a lowercase."""
        assert retriever._get_content_type_score("HEADER") == 1.0
        assert retriever._get_content_type_score("Header") == 1.0


# ============================================================
#   format_context_from_documents
# ============================================================

class TestFormatContextFromDocuments:
    """Tests para el formateo de contexto para el prompt."""

    def test_lista_vacia(self, retriever):
        """Sin documentos → mensaje por defecto."""
        result = retriever.format_context_from_documents([])
        assert "No se encontró información relevante" in result

    def test_un_documento(self, retriever):
        docs = [Document(page_content="Python es un lenguaje de programación.", metadata={"chunk_type": "text"})]
        result = retriever.format_context_from_documents(docs)
        assert "Python es un lenguaje de programación." in result
        assert "Información relevante encontrada:" in result

    def test_multiples_documentos(self, retriever):
        docs = [
            Document(page_content="Encabezado principal", metadata={"chunk_type": "header"}),
            Document(page_content="Texto detallado", metadata={"chunk_type": "text"}),
            Document(page_content="Otro párrafo", metadata={"chunk_type": "paragraph"}),
        ]
        result = retriever.format_context_from_documents(docs)
        assert "Encabezado principal" in result
        assert "Texto detallado" in result
        assert "Otro párrafo" in result

    def test_agrupacion_por_tipo(self, retriever):
        """Los headers aparecen antes que los textos."""
        docs = [
            Document(page_content="Texto normal", metadata={"chunk_type": "text"}),
            Document(page_content="Título importante", metadata={"chunk_type": "header"}),
        ]
        result = retriever.format_context_from_documents(docs)
        # Header debe aparecer antes que text en el output
        header_pos = result.index("Título importante")
        text_pos = result.index("Texto normal")
        assert header_pos < text_pos

    def test_whitespace_trimmed(self, retriever):
        """Espacios en blanco se limpian del contenido."""
        docs = [Document(page_content="  texto con espacios  ", metadata={"chunk_type": "text"})]
        result = retriever.format_context_from_documents(docs)
        assert "texto con espacios" in result
