"""Tests para helpers y pipeline del RAGRetriever."""

from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest
from langchain_core.documents import Document


class TestCleanVector:
    def test_vector_valido_normalizado(self, retriever):
        vec = np.random.randn(1536).astype(np.float32)
        result = retriever._clean_vector(vec)
        assert result is not None
        assert result.shape == (1536,)
        assert abs(np.linalg.norm(result) - 1.0) < 1e-5

    def test_vector_none(self, retriever):
        assert retriever._clean_vector(None) is None

    def test_vector_ceros(self, retriever):
        vec = np.zeros(1536, dtype=np.float32)
        assert retriever._clean_vector(vec) is None

    def test_vector_dimension_incorrecta(self, retriever):
        vec = np.random.randn(768).astype(np.float32)
        assert retriever._clean_vector(vec) is None

    def test_vector_2d_reshape(self, retriever):
        vec = np.random.randn(1, 1536).astype(np.float32)
        result = retriever._clean_vector(vec)
        assert result is not None
        assert result.ndim == 1
        assert result.shape == (1536,)

    def test_vector_como_lista(self, retriever):
        vec = np.random.randn(1536).tolist()
        result = retriever._clean_vector(vec)
        assert result is not None
        assert isinstance(result, np.ndarray)
        assert result.shape == (1536,)

    def test_vector_ya_unitario(self, retriever):
        vec = np.random.randn(1536).astype(np.float32)
        vec = vec / np.linalg.norm(vec)
        result = retriever._clean_vector(vec)
        assert result is not None
        np.testing.assert_allclose(result, vec, atol=1e-5)


class TestGetContentTypeScore:
    @pytest.mark.parametrize(
        "chunk_type,expected_score",
        [
            ("header", 1.0),
            ("title", 0.95),
            ("subtitle", 0.9),
            ("paragraph", 0.8),
            ("text", 0.75),
            ("list", 0.7),
            ("bullet", 0.7),
            ("table", 0.6),
            ("code", 0.5),
        ],
    )
    def test_tipos_conocidos(self, retriever, chunk_type, expected_score):
        assert retriever._get_content_type_score(chunk_type) == expected_score

    def test_tipo_desconocido(self, retriever):
        assert retriever._get_content_type_score("image") == 0.6

    def test_none_como_tipo(self, retriever):
        assert retriever._get_content_type_score(None) == 0.75

    def test_tipo_case_insensitive(self, retriever):
        assert retriever._get_content_type_score("HEADER") == 1.0
        assert retriever._get_content_type_score("Header") == 1.0


class TestFormatContextFromDocuments:
    def test_lista_vacia(self, retriever):
        result = retriever.format_context_from_documents([])
        assert "No se encontro informacion relevante" in result

    def test_un_documento(self, retriever):
        docs = [Document(page_content="Python es un lenguaje de programacion.", metadata={"chunk_type": "text"})]
        result = retriever.format_context_from_documents(docs)
        assert "Python es un lenguaje de programacion." in result
        assert "Informacion relevante encontrada:" in result

    def test_multiples_documentos(self, retriever):
        docs = [
            Document(page_content="Encabezado principal", metadata={"chunk_type": "header"}),
            Document(page_content="Texto detallado", metadata={"chunk_type": "text"}),
            Document(page_content="Otro parrafo", metadata={"chunk_type": "paragraph"}),
        ]
        result = retriever.format_context_from_documents(docs)
        assert "Encabezado principal" in result
        assert "Texto detallado" in result
        assert "Otro parrafo" in result

    def test_agrupacion_por_tipo(self, retriever):
        docs = [
            Document(page_content="Texto normal", metadata={"chunk_type": "text"}),
            Document(page_content="Titulo importante", metadata={"chunk_type": "header"}),
        ]
        result = retriever.format_context_from_documents(docs)
        assert result.index("Titulo importante") < result.index("Texto normal")

    def test_whitespace_trimmed(self, retriever):
        docs = [Document(page_content="  texto con espacios  ", metadata={"chunk_type": "text"})]
        result = retriever.format_context_from_documents(docs)
        assert "texto con espacios" in result


class TestRetrievalCacheKeys:
    def test_build_retrieval_cache_key_es_estable(self, retriever):
        key_a = retriever._build_retrieval_cache_key(
            query="Consulta de prueba",
            k=4,
            filter_criteria={"source": "manual.pdf"},
            use_semantic_ranking=True,
            use_mmr=False,
        )
        key_b = retriever._build_retrieval_cache_key(
            query="Consulta de prueba",
            k=4,
            filter_criteria={"source": "manual.pdf"},
            use_semantic_ranking=True,
            use_mmr=False,
        )
        key_c = retriever._build_retrieval_cache_key(
            query="Consulta de prueba",
            k=4,
            filter_criteria={"source": "otro.pdf"},
            use_semantic_ranking=True,
            use_mmr=False,
        )

        assert key_a.startswith("rag:retrieval:")
        assert key_a == key_b
        assert key_a != key_c


@pytest.mark.anyio
class TestRetrieveDocumentsPipeline:
    async def test_cache_hit_evita_embedding_y_vector_retrieval(self, retriever, monkeypatch):
        import rag.retrieval.retriever as retriever_mod

        retriever.cache_enabled = True
        retriever_mod.settings.enable_cache = True
        docs = [Document(page_content="Doc cacheado", metadata={"chunk_type": "text", "score": 0.9})]
        fake_cache = MagicMock()
        fake_cache.get.return_value = {
            "kind": "documents",
            "reason": "accepted",
            "documents": retriever._serialize_documents(docs),
        }
        fake_cache.set = MagicMock()
        fake_cache.invalidate_prefix = MagicMock()
        monkeypatch.setattr(retriever_mod, "cache", fake_cache)

        retriever.embedding_manager.embed_query = MagicMock(side_effect=AssertionError("embed_query no debe llamarse"))
        retriever.vector_store.retrieve = AsyncMock(side_effect=AssertionError("retrieve no debe llamarse"))

        result = await retriever.retrieve_documents("Consulta de prueba", k=1)

        assert len(result) == 1
        assert result[0].page_content == "Doc cacheado"

    async def test_embedding_se_calcula_una_sola_vez(self, retriever):
        vector = np.random.randn(1536).astype(np.float32)
        vector = vector / np.linalg.norm(vector)
        retriever.embedding_manager.embed_query = MagicMock(return_value=vector.tolist())
        retriever.vector_store.retrieve = AsyncMock(
            return_value=[Document(page_content="Doc final", metadata={"chunk_type": "text", "score": 0.9})]
        )

        result = await retriever.retrieve_documents(
            "consulta relevante",
            k=1,
            use_semantic_ranking=False,
            use_mmr=False,
        )

        assert len(result) == 1
        assert retriever.embedding_manager.embed_query.call_count == 1
        kwargs = retriever.vector_store.retrieve.await_args.kwargs
        assert kwargs["query_embedding"] is not None
        np.testing.assert_allclose(kwargs["query_embedding"], retriever._clean_vector(vector.tolist()))

    async def test_cachea_no_context_final(self, retriever, monkeypatch):
        import rag.retrieval.retriever as retriever_mod

        retriever.cache_enabled = True
        retriever_mod.settings.enable_cache = True
        fake_cache = MagicMock()
        fake_cache.get.return_value = None
        fake_cache.set = MagicMock()
        fake_cache.invalidate_prefix = MagicMock()
        monkeypatch.setattr(retriever_mod, "cache", fake_cache)

        vector = np.random.randn(1536).astype(np.float32)
        vector = vector / np.linalg.norm(vector)
        retriever.embedding_manager.embed_query = MagicMock(return_value=vector.tolist())
        retriever.vector_store.retrieve = AsyncMock(return_value=[])

        result = await retriever.retrieve_documents("consulta sin resultados", k=2)

        assert result == []
        saved_payload = fake_cache.set.call_args.args[1]
        assert saved_payload["kind"] == "no_context"
        assert saved_payload["reason"] == "no_candidates"

    async def test_no_cachea_fallo_de_embedding(self, retriever, monkeypatch):
        import rag.retrieval.retriever as retriever_mod

        retriever.cache_enabled = True
        retriever_mod.settings.enable_cache = True
        fake_cache = MagicMock()
        fake_cache.get.return_value = None
        fake_cache.set = MagicMock()
        fake_cache.invalidate_prefix = MagicMock()
        monkeypatch.setattr(retriever_mod, "cache", fake_cache)

        retriever.embedding_manager.embed_query = MagicMock(side_effect=RuntimeError("boom"))
        retriever.vector_store.retrieve = AsyncMock()

        result = await retriever.retrieve_documents("consulta valida", k=2)

        assert result == []
        fake_cache.set.assert_not_called()
        retriever.vector_store.retrieve.assert_not_called()
