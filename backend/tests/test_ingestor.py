from pathlib import Path
from types import SimpleNamespace
import uuid
import hashlib

import pytest
from langchain_core.documents import Document

from rag.ingestion.ingestor import RAGIngestor
from utils.hashing import hash_content_for_dedup


class _FakePDFLoader:
    def __init__(self, chunks):
        self._chunks = chunks
        self.calls = 0

    async def load_and_split_pdf(self, pdf_path: Path):
        self.calls += 1
        return self._chunks


class _FakeEmbeddingManager:
    def __init__(self):
        self.calls = []

    async def embed_documents_async(self, texts):
        self.calls.append(list(texts))
        return [[0.1, 0.2] for _ in texts]


class _FakeVectorStore:
    def __init__(self):
        self.client = SimpleNamespace(count=lambda *args, **kwargs: SimpleNamespace(count=0))
        self.collection_name = "test_collection"
        self.add_calls = []

    async def add_documents(self, documents, embeddings=None):
        self.add_calls.append((documents, embeddings))

    async def delete_by_content_hash_global(self, _content_hash_global):
        return None

    async def delete_by_pdf_hash(self, _pdf_hash):
        return None


class _FailingVectorStore(_FakeVectorStore):
    def __init__(self, fail_on_call=2, rollback_error: Exception | None = None):
        super().__init__()
        self.fail_on_call = fail_on_call
        self.rollback_error = rollback_error
        self.delete_by_pdf_hash_calls = []

    async def add_documents(self, documents, embeddings=None):
        self.add_calls.append((documents, embeddings))
        if len(self.add_calls) == self.fail_on_call:
            raise RuntimeError("fallo forzado en upsert")

    async def delete_by_pdf_hash(self, pdf_hash):
        self.delete_by_pdf_hash_calls.append(pdf_hash)
        if self.rollback_error is not None:
            raise self.rollback_error
        return None


@pytest.mark.asyncio
async def test_ingest_single_pdf_uses_chunk_text_for_content_hash_global():
    tmp_dir = Path(__file__).resolve().parent / "_tmp"
    tmp_dir.mkdir(exist_ok=True)
    pdf_path = tmp_dir / f"sample-{uuid.uuid4().hex}.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 sample")

    try:
        chunks = [
            Document(page_content="Primer chunk", metadata={"page_number": 1}),
            Document(page_content="Segundo chunk", metadata={"page_number": 1}),
        ]
        loader = _FakePDFLoader(chunks)
        embeddings = _FakeEmbeddingManager()
        vector_store = _FakeVectorStore()
        ingestor = RAGIngestor(
            pdf_file_manager=None,
            pdf_content_loader=loader,
            embedding_manager=embeddings,
            vector_store=vector_store,
            batch_size=10,
        )

        result = await ingestor.ingest_single_pdf(pdf_path)

        expected_hash = hash_content_for_dedup("Primer chunk\nSegundo chunk")

        assert result["status"] == "success"
        assert loader.calls == 1
        assert embeddings.calls == [["Primer chunk", "Segundo chunk"]]
        assert len(vector_store.add_calls) == 1

        stored_docs, stored_embeddings = vector_store.add_calls[0]
        assert stored_embeddings == [[0.1, 0.2], [0.1, 0.2]]
        assert [doc.metadata["content_hash_global"] for doc in stored_docs] == [
            expected_hash,
            expected_hash,
        ]
        assert all(doc.metadata["pdf_hash"] for doc in stored_docs)
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except PermissionError:
                pass


@pytest.mark.asyncio
async def test_ingest_single_pdf_rolls_back_by_pdf_hash_when_batch_fails():
    tmp_dir = Path(__file__).resolve().parent / "_tmp"
    tmp_dir.mkdir(exist_ok=True)
    pdf_bytes = b"%PDF-1.4 sample rollback"
    pdf_path = tmp_dir / f"sample-{uuid.uuid4().hex}.pdf"
    pdf_path.write_bytes(pdf_bytes)

    try:
        chunks = [
            Document(page_content="Primer chunk", metadata={"page_number": 1}),
            Document(page_content="Segundo chunk", metadata={"page_number": 2}),
        ]
        loader = _FakePDFLoader(chunks)
        embeddings = _FakeEmbeddingManager()
        vector_store = _FailingVectorStore(fail_on_call=2)
        ingestor = RAGIngestor(
            pdf_file_manager=None,
            pdf_content_loader=loader,
            embedding_manager=embeddings,
            vector_store=vector_store,
            batch_size=1,
        )

        result = await ingestor.ingest_single_pdf(pdf_path)

        expected_pdf_hash = hashlib.md5(pdf_bytes).hexdigest()

        assert result["status"] == "error"
        assert "fallo forzado en upsert" in result["error"]
        assert len(vector_store.add_calls) == 2
        assert vector_store.delete_by_pdf_hash_calls == [expected_pdf_hash]
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except PermissionError:
                pass


@pytest.mark.asyncio
async def test_ingest_single_pdf_logs_error_if_rollback_fails(caplog):
    tmp_dir = Path(__file__).resolve().parent / "_tmp"
    tmp_dir.mkdir(exist_ok=True)
    pdf_bytes = b"%PDF-1.4 sample rollback log"
    pdf_path = tmp_dir / f"sample-{uuid.uuid4().hex}.pdf"
    pdf_path.write_bytes(pdf_bytes)

    try:
        chunks = [
            Document(page_content="Primer chunk", metadata={"page_number": 1}),
            Document(page_content="Segundo chunk", metadata={"page_number": 2}),
        ]
        loader = _FakePDFLoader(chunks)
        embeddings = _FakeEmbeddingManager()
        vector_store = _FailingVectorStore(
            fail_on_call=2,
            rollback_error=RuntimeError("fallo rollback"),
        )
        ingestor = RAGIngestor(
            pdf_file_manager=None,
            pdf_content_loader=loader,
            embedding_manager=embeddings,
            vector_store=vector_store,
            batch_size=1,
        )

        expected_pdf_hash = hashlib.md5(pdf_bytes).hexdigest()

        with caplog.at_level("ERROR", logger="rag.ingestion.ingestor"):
            result = await ingestor.ingest_single_pdf(pdf_path)

        assert result["status"] == "error"
        assert vector_store.delete_by_pdf_hash_calls == [expected_pdf_hash]
        assert any(
            record.levelname == "ERROR"
            and "Rollback de Qdrant falló para pdf_hash=" in record.message
            and expected_pdf_hash in record.message
            for record in caplog.records
        )
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except PermissionError:
                pass
