from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import aiofiles
from langchain_core.documents import Document

from rag.ingestion.models import ChildChunk


class HierarchicalIngestionService:
    def __init__(
        self,
        *,
        chunker,
        parent_repository,
        embedding_manager,
        vector_store,
        lexical_repository=None,
    ) -> None:
        self.chunker = chunker
        self.parent_repository = parent_repository
        self.embedding_manager = embedding_manager
        self.vector_store = vector_store
        self.lexical_repository = lexical_repository

    async def ingest_pdf(self, pdf_path: Path, *, replace_existing: bool = True) -> dict[str, Any]:
        if not pdf_path.exists() or not pdf_path.is_file():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        doc_id = await self._build_doc_id(pdf_path)
        result = await self.chunker.chunk_pdf(pdf_path, doc_id=doc_id)
        if not result.parents or not result.children:
            raise RuntimeError("Hierarchical chunking produced no parents or children")

        await self.parent_repository.ensure_indexes()
        if self.lexical_repository is not None:
            await self.lexical_repository.ensure_indexes()

        if replace_existing:
            await self.parent_repository.delete_by_doc_id(doc_id)
            await self.vector_store.delete_documents(filter={"doc_id": doc_id})
            if self.lexical_repository is not None:
                await self.lexical_repository.delete_by_doc_id(doc_id)

        await self.parent_repository.upsert_documents(result.parents)
        if self.lexical_repository is not None:
            await self.lexical_repository.upsert_children(result.children)

        child_documents = [self._child_to_langchain_document(child) for child in result.children]
        child_embeddings = await self.embedding_manager.embed_documents_async(
            [child.content for child in result.children]
        )
        await self.vector_store.add_documents(child_documents, embeddings=child_embeddings)

        return {
            "doc_id": doc_id,
            "source": result.source,
            "page_count": result.page_count,
            "parent_count": len(result.parents),
            "child_count": len(result.children),
            "mongo_collection": getattr(self.parent_repository, "collection_name", None),
            "qdrant_collection": getattr(self.vector_store, "collection_name", None),
            "lexical_collection": getattr(self.lexical_repository, "documents_collection_name", None)
            if self.lexical_repository is not None
            else None,
        }

    async def delete_by_source(self, source: str) -> None:
        await self.parent_repository.delete_by_source(source)
        await self.vector_store.delete_documents(filter={"source": source})
        if self.lexical_repository is not None:
            await self.lexical_repository.delete_by_source(source)

    async def _build_doc_id(self, pdf_path: Path) -> str:
        md5 = hashlib.md5()
        async with aiofiles.open(pdf_path, "rb") as pdf_file:
            while chunk := await pdf_file.read(1024 * 1024):
                md5.update(chunk)
        return f"doc_{md5.hexdigest()}"

    def _child_to_langchain_document(self, child: ChildChunk) -> Document:
        metadata = {
            "child_id": child.child_id,
            "parent_id": child.parent_id,
            "doc_id": child.doc_id,
            "source": child.source,
            "file_path": child.file_path,
            "page_number": child.page_start,
            "page_start": child.page_start,
            "page_end": child.page_end,
            "section_title": child.section_title,
            "contains_table": child.contains_table,
            "contains_numeric": child.contains_numeric,
            "contains_date_like": child.contains_date_like,
            "chunk_type": "child_chunk",
            "token_count": child.token_count,
            "content_hash": child.content_hash,
            "point_id": child.child_id,
        }
        metadata.update(child.metadata)
        return Document(page_content=child.content, metadata=metadata)
