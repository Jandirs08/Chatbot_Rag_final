import asyncio
from typing import List

import pytest
from langchain_core.documents import Document

try:
    from backend.rag.ingestion.ingestor import RAGIngestor
except ModuleNotFoundError:
    from rag.ingestion.ingestor import RAGIngestor


class DummyPDFManager:
    pdf_dir = None


class DummyPDFContentLoader:
    pass


class DummyEmbeddingManager:
    pass


class CapturingVectorStore:
    def __init__(self):
        self.last_added_docs: List[Document] = []
        self.last_added_embeddings: List[List[float]] | None = None

    async def add_documents(self, documents: List[Document], embeddings: list = None) -> None:
        self.last_added_docs = documents
        self.last_added_embeddings = embeddings


@pytest.mark.asyncio
async def test_ingestor_persists_embeddings_in_metadata():
    vs = CapturingVectorStore()
    ingestor = RAGIngestor(
        pdf_file_manager=DummyPDFManager(),
        pdf_content_loader=DummyPDFContentLoader(),
        embedding_manager=DummyEmbeddingManager(),
        vector_store=vs,
    )

    batch = [
        Document(page_content="a", metadata={"source": "test.pdf", "content_hash": "h1"}),
        Document(page_content="b", metadata={"source": "test.pdf", "content_hash": "h2"}),
        Document(page_content="c", metadata={"source": "test.pdf", "content_hash": "h3"}),
    ]
    embeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
    ]

    await ingestor._add_batch_to_vector_store(batch=batch, batch_number=1, embeddings=embeddings)

    # Verificar que se haya llamado a add_documents con embeddings
    assert vs.last_added_embeddings == embeddings
    assert len(vs.last_added_docs) == len(batch)
    # Verificar que cada doc tenga embedding persistido en metadatos
    for i, doc in enumerate(vs.last_added_docs):
        assert "embedding" in doc.metadata
        assert doc.metadata["embedding"] == embeddings[i]