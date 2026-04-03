from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from rag.ingestion.hierarchical_ingestion_service import HierarchicalIngestionService
from rag.ingestion.models import ChildChunk, HierarchicalChunkingResult, PageSpan, ParentDocument


pytestmark = pytest.mark.anyio


class _FakeChunker:
    async def chunk_pdf(self, pdf_path: Path, *, doc_id: str):
        parent = ParentDocument(
            parent_id="parent_1",
            doc_id=doc_id,
            content="Parent content",
            page_span=PageSpan(start_page=1, end_page=2),
            source=pdf_path.name,
            file_path=str(pdf_path),
            parent_index=0,
            contains_table=True,
            contains_numeric=True,
            contains_date_like=True,
            block_types=["header", "table", "text"],
            token_count=42,
            block_count=3,
            child_count=1,
            content_hash="parent_hash",
        )
        child = ChildChunk(
            child_id="child_1",
            parent_id="parent_1",
            doc_id=doc_id,
            content="Child content",
            page_span=PageSpan(start_page=1, end_page=1),
            source=pdf_path.name,
            file_path=str(pdf_path),
            child_index=0,
            parent_index=0,
            contains_table=True,
            contains_numeric=True,
            contains_date_like=True,
            block_types=["table"],
            token_count=12,
            content_hash="child_hash",
        )
        return HierarchicalChunkingResult(
            doc_id=doc_id,
            source=pdf_path.name,
            file_path=str(pdf_path),
            page_count=2,
            parents=[parent],
            children=[child],
        )


class _FakeParentRepository:
    def __init__(self):
        self.collection_name = "rag_parent_documents"
        self.deleted_doc_ids = []
        self.deleted_sources = []
        self.upserted = []
        self.ensure_calls = 0
        self.doc_counts: dict[str, int] = {}

    async def ensure_indexes(self):
        self.ensure_calls += 1

    async def delete_by_doc_id(self, doc_id: str):
        self.deleted_doc_ids.append(doc_id)
        self.doc_counts.pop(doc_id, None)
        return 0

    async def delete_by_source(self, source: str):
        self.deleted_sources.append(source)
        return 0

    async def upsert_documents(self, parents):
        self.upserted.extend(parents)
        for parent in parents:
            self.doc_counts[parent.doc_id] = self.doc_counts.get(parent.doc_id, 0) + 1
        return len(parents)

    async def count_by_doc_id(self, doc_id: str):
        return self.doc_counts.get(doc_id, 0)


class _FakeEmbeddingManager:
    def __init__(self):
        self.calls = []

    async def embed_documents_async(self, texts):
        self.calls.append(list(texts))
        return [[0.1, 0.2] for _ in texts]


class _FakeVectorStore:
    def __init__(self):
        self.collection_name = "rag_child_chunks"
        self.deleted_filters = []
        self.add_calls = []

    async def delete_documents(self, filter=None):
        self.deleted_filters.append(filter)

    async def add_documents(self, documents, embeddings=None):
        self.add_calls.append((documents, embeddings))


class _FakeLexicalRepository:
    def __init__(self):
        self.documents_collection_name = "rag_child_lexical_documents"
        self.deleted_doc_ids = []
        self.deleted_sources = []
        self.upserted = []
        self.ensure_calls = 0

    async def ensure_indexes(self):
        self.ensure_calls += 1

    async def delete_by_doc_id(self, doc_id: str):
        self.deleted_doc_ids.append(doc_id)
        return 0

    async def delete_by_source(self, source: str):
        self.deleted_sources.append(source)
        return 0

    async def upsert_children(self, children):
        self.upserted.extend(children)
        return len(children)


def _make_local_tmp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / "_tmp_hier"
    run_dir = base_dir / uuid4().hex
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


@pytest.mark.asyncio
async def test_hierarchical_ingestion_service_persists_parents_and_children():
    tmp_dir = _make_local_tmp_dir()
    pdf_path = tmp_dir / f"sample-{uuid4().hex}.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 sample")

    try:
        parent_repo = _FakeParentRepository()
        embedding_manager = _FakeEmbeddingManager()
        vector_store = _FakeVectorStore()
        lexical_repo = _FakeLexicalRepository()
        service = HierarchicalIngestionService(
            chunker=_FakeChunker(),
            parent_repository=parent_repo,
            embedding_manager=embedding_manager,
            vector_store=vector_store,
            lexical_repository=lexical_repo,
        )

        result = await service.ingest_pdf(pdf_path, replace_existing=True)

        assert result["parent_count"] == 1
        assert result["child_count"] == 1
        assert parent_repo.ensure_calls == 1
        assert lexical_repo.ensure_calls == 1
        assert len(parent_repo.upserted) == 1
        assert len(lexical_repo.upserted) == 1
        assert embedding_manager.calls == [["Child content"]]
        assert vector_store.deleted_filters == [{"source": pdf_path.name}]
        assert parent_repo.deleted_sources == [pdf_path.name]
        assert lexical_repo.deleted_sources == [pdf_path.name]
        assert len(vector_store.add_calls) == 1
        stored_documents, stored_embeddings = vector_store.add_calls[0]
        assert stored_embeddings == [[0.1, 0.2]]
        assert stored_documents[0].metadata["parent_id"] == "parent_1"
        assert stored_documents[0].metadata["point_id"] == "child_1"
        assert result["lexical_collection"] == "rag_child_lexical_documents"
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except PermissionError:
                pass
        try:
            tmp_dir.rmdir()
        except OSError:
            pass


@pytest.mark.asyncio
async def test_hierarchical_ingestion_service_skips_duplicate_pdf_when_force_update_is_false():
    tmp_dir = _make_local_tmp_dir()
    pdf_path = tmp_dir / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 sample")

    try:
        parent_repo = _FakeParentRepository()
        service = HierarchicalIngestionService(
            chunker=_FakeChunker(),
            parent_repository=parent_repo,
            embedding_manager=_FakeEmbeddingManager(),
            vector_store=_FakeVectorStore(),
        )

        first = await service.ingest_single_pdf(pdf_path)
        second = await service.ingest_single_pdf(pdf_path)

        assert first["status"] == "success"
        assert second["status"] == "skipped"
        assert second["doc_id"] == first["doc_id"]
        assert second["parent_count"] == 1
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except PermissionError:
                pass
        try:
            tmp_dir.rmdir()
        except OSError:
            pass
