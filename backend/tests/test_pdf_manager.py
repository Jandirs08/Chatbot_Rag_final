from io import BytesIO
from pathlib import Path
import uuid

import pytest
from fastapi import UploadFile

from rag.ingestion.hierarchical_ingestion_service import HierarchicalIngestionService
from rag.ingestion.models import ChildChunk, HierarchicalChunkingResult, PageSpan, ParentDocument
from storage.documents import PDFManager


class _PropagatingChunker:
    def __init__(self):
        self.seen_paths = []

    async def chunk_pdf(self, pdf_path, *, doc_id):
        self.seen_paths.append(pdf_path)
        parent = ParentDocument(
            parent_id="parent-1",
            doc_id=doc_id,
            content="Contenido padre",
            page_span=PageSpan(start_page=1, end_page=1),
            source=pdf_path.name,
            file_path=str(pdf_path.resolve()),
            parent_index=0,
            contains_table=False,
            contains_numeric=False,
            contains_date_like=False,
            block_types=["text"],
            token_count=12,
            block_count=1,
            child_count=1,
            content_hash="parent-hash",
        )
        child = ChildChunk(
            child_id="child-1",
            parent_id="parent-1",
            doc_id=doc_id,
            content="Contenido hijo",
            page_span=PageSpan(start_page=1, end_page=1),
            source=pdf_path.name,
            file_path=str(pdf_path.resolve()),
            child_index=0,
            parent_index=0,
            contains_table=False,
            contains_numeric=False,
            contains_date_like=False,
            block_types=["text"],
            token_count=8,
            content_hash="child-hash",
        )
        return HierarchicalChunkingResult(
            doc_id=doc_id,
            source=pdf_path.name,
            file_path=str(pdf_path.resolve()),
            page_count=1,
            parents=[parent],
            children=[child],
        )


class _FakeParentRepository:
    def __init__(self):
        self._count = 0
        self.upserted = []

    async def ensure_indexes(self):
        return None

    async def count_by_doc_id(self, doc_id: str):
        return self._count

    async def delete_by_source(self, source: str):
        return 0

    async def upsert_documents(self, parents):
        self.upserted.extend(parents)
        self._count += len(parents)
        return len(parents)


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
        self.deleted_filters = []

    async def delete_documents(self, filter=None):
        self.deleted_filters.append(filter)

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
async def test_unique_saved_filename_propagates_to_hierarchical_ingestor_and_chunk_metadata():
    tmp_dir = _make_local_tmp_dir()
    manager = PDFManager(base_dir=tmp_dir)

    try:
        upload = UploadFile(filename="manual.pdf", file=BytesIO(b"%PDF-1.4 contenido"))
        saved_path = await manager.save_pdf(upload)
        await upload.close()

        chunker = _PropagatingChunker()
        vector_store = _FakeVectorStore()
        service = HierarchicalIngestionService(
            chunker=chunker,
            parent_repository=_FakeParentRepository(),
            embedding_manager=_FakeEmbeddingManager(),
            vector_store=vector_store,
        )

        result = await service.ingest_single_pdf(saved_path)

        assert result["status"] == "success"
        assert result["filename"] == saved_path.name
        assert chunker.seen_paths == [saved_path]
        assert len(vector_store.add_calls) == 1

        stored_docs, _ = vector_store.add_calls[0]
        assert stored_docs[0].metadata["source"] == saved_path.name
        assert stored_docs[0].metadata["file_path"] == str(saved_path.resolve())
        assert stored_docs[0].metadata["parent_id"] == "parent-1"
        assert stored_docs[0].metadata["point_id"] == "child-1"
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
