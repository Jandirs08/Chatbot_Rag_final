import asyncio
from typing import List

import pytest
from langchain_core.documents import Document

# Permitir importar tanto en entorno local (raíz del repo) como dentro del contenedor (/app)
try:
    from backend.rag.retrieval.retriever import RAGRetriever
except ModuleNotFoundError:
    from rag.retrieval.retriever import RAGRetriever


class DummyVectorStore:
    async def retrieve(self, query: str, k: int = 4, filter=None, use_mmr=True, fetch_k=None, lambda_mult=0.5, score_threshold: float = 0.0) -> List[Document]:
        docs = []
        for i in range(k + 2):  # devolver más para simular reranking
            d = Document(
                page_content=f"Contenido relevante {i} para: {query}",
                metadata={
                    "score": 0.9 - i * 0.05,
                    "source": "test.pdf",
                    "file_path": "/abs/path/test.pdf",
                    "content_hash": f"hash_{i}",
                    "chunk_type": "paragraph",
                    "word_count": 10 + i,
                },
            )
            docs.append(d)
        return docs


class DummyEmbeddingManager:
    def embed_query(self, text: str):
        # Dimensión pequeña para prueba unitaria
        return [0.0] * 8


@pytest.mark.asyncio
async def test_retrieve_with_trace_basic():
    retriever = RAGRetriever(vector_store=DummyVectorStore(), embedding_manager=DummyEmbeddingManager())
    result = await retriever.retrieve_with_trace(query="pregunta de prueba", k=3, include_context=True)

    assert result["query"] == "pregunta de prueba"
    assert result["k"] == 3
    assert isinstance(result["retrieved"], list)
    assert len(result["retrieved"]) <= 3  # trazamos top-k tras reranking
    # Validar campos del primer item
    if result["retrieved"]:
        item = result["retrieved"][0]
        assert "score" in item and isinstance(item["score"], float)
        assert item.get("source") == "test.pdf"
        assert item.get("chunk_type") == "paragraph"
        assert isinstance(item.get("preview"), str)

    # Contexto debe existir si include_context=True
    assert isinstance(result.get("context"), str)
    # Timings es un dict (puede estar vacío si métricas aún no registran)
    assert isinstance(result.get("timings"), dict)