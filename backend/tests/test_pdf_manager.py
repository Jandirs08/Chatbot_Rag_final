from io import BytesIO
from pathlib import Path
import uuid

import pytest
from fastapi import UploadFile
from langchain_core.documents import Document

from rag.ingestion.ingestor import RAGIngestor
from storage.documents import PDFManager


class _PropagatingPDFLoader:
    def __init__(self):
        self.seen_paths = []

    async def load_and_split_pdf(self, pdf_path):
        self.seen_paths.append(pdf_path)
        return [
            Document(
                page_content="Contenido unico",
                metadata={
                    "page_number": 1,
                    "source": pdf_path.name,
                    "file_path": str(pdf_path.resolve()),
                },
            )
        ]


class _FakeEmbeddingManager:
    async def embed_documents_async(self, texts):
        return [[0.1, 0.2] for _ in texts]


class _FakeVectorStore:
    def __init__(self):
        self.collection_name = "test_collection"
        self.client = type(
            "CountClient",
            (),
            {"count": staticmethod(lambda *args, **kwargs: type("CountResult", (), {"count": 0})())},
        )()
        self.add_calls = []

    async def add_documents(self, documents, embeddings=None):
        self.add_calls.append((documents, embeddings))


def _make_local_tmp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / "_tmp_pdf_manager"
    run_dir = base_dir / uuid.uuid4().hex
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


@pytest.mark.asyncio
async def test_save_pdf_uses_unique_filename():
    tmp_dir = _make_local_tmp_dir()
    manager = PDFManager(base_dir=tmp_dir)

    try:
        upload_a = UploadFile(filename="manual.pdf", file=BytesIO(b"%PDF-1.4 primer contenido"))
        upload_b = UploadFile(filename="manual.pdf", file=BytesIO(b"%PDF-1.4 segundo contenido"))

        first_path = await manager.save_pdf(upload_a)
        second_path = await manager.save_pdf(upload_b)
        await upload_a.close()
        await upload_b.close()

        assert first_path.name != second_path.name
        assert first_path.name.startswith("manual_")
        assert second_path.name.startswith("manual_")
        assert first_path.suffix == ".pdf"
        assert second_path.suffix == ".pdf"
        assert first_path.read_bytes() == b"%PDF-1.4 primer contenido"
        assert second_path.read_bytes() == b"%PDF-1.4 segundo contenido"
    finally:
        for pdf in tmp_dir.glob("*.pdf"):
            try:
                pdf.unlink(missing_ok=True)
            except PermissionError:
                pass
        try:
            tmp_dir.rmdir()
        except OSError:
            pass


@pytest.mark.asyncio
async def test_unique_saved_filename_propagates_to_ingestor_and_chunk_metadata():
    tmp_dir = _make_local_tmp_dir()
    manager = PDFManager(base_dir=tmp_dir)

    try:
        upload = UploadFile(filename="manual.pdf", file=BytesIO(b"%PDF-1.4 contenido"))
        saved_path = await manager.save_pdf(upload)
        await upload.close()

        loader = _PropagatingPDFLoader()
        vector_store = _FakeVectorStore()
        ingestor = RAGIngestor(
            pdf_file_manager=manager,
            pdf_content_loader=loader,
            embedding_manager=_FakeEmbeddingManager(),
            vector_store=vector_store,
            batch_size=10,
        )

        result = await ingestor.ingest_single_pdf(saved_path)

        assert result["status"] == "success"
        assert result["filename"] == saved_path.name
        assert loader.seen_paths == [saved_path]
        assert len(vector_store.add_calls) == 1

        stored_docs, _ = vector_store.add_calls[0]
        assert stored_docs[0].metadata["source"] == saved_path.name
        assert stored_docs[0].metadata["file_path"] == str(saved_path.resolve())
        assert stored_docs[0].metadata["pdf_hash"]
        assert stored_docs[0].metadata["content_hash_global"]
    finally:
        for pdf in tmp_dir.glob("*.pdf"):
            try:
                pdf.unlink(missing_ok=True)
            except PermissionError:
                pass
        try:
            tmp_dir.rmdir()
        except OSError:
            pass
