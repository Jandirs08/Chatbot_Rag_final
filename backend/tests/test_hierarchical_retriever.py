from __future__ import annotations

import pytest
from langchain_core.documents import Document

from rag.ingestion.models import PageSpan, ParentDocument
from rag.retrieval.hierarchical_retriever import HierarchicalRetriever
from rag.retrieval.reranker import BaseParentReranker, ParentCandidate


pytestmark = pytest.mark.anyio


class _FakeChildVectorStore:
    def __init__(self, documents: list[Document]):
        self.documents = documents
        self.calls = []

    async def retrieve(self, **kwargs):
        self.calls.append(kwargs)
        return list(self.documents)


class _FakeParentRepository:
    def __init__(self, parents: list[ParentDocument]):
        self.parents = {parent.parent_id: parent for parent in parents}
        self.calls = []

    async def get_by_parent_ids(self, parent_ids):
        self.calls.append(list(parent_ids))
        return [self.parents[parent_id] for parent_id in parent_ids if parent_id in self.parents]


class _FakeLexicalRepository:
    def __init__(self, hits):
        self.hits = hits
        self.calls = []

    async def search(self, query, *, limit, filter_criteria=None):
        self.calls.append({"query": query, "limit": limit, "filter_criteria": filter_criteria})
        return list(self.hits)


class _FakeEmbeddingManager:
    def embed_query(self, text: str):
        del text
        return [0.1] * 1536


class _FakeReranker(BaseParentReranker):
    async def rerank(self, *, query: str, candidates, limit: int):
        del query
        ranked = sorted(candidates, key=lambda candidate: candidate.lexical_score, reverse=True)
        return [
            ParentCandidate(
                parent=candidate.parent,
                evidence=candidate.evidence,
                dense_score=candidate.dense_score,
                lexical_score=candidate.lexical_score,
                fused_score=candidate.fused_score,
                rerank_score=candidate.lexical_score,
            )
            for candidate in ranked[:limit]
        ]


def _build_parent(parent_id: str, *, parent_index: int, source: str = "sample.pdf") -> ParentDocument:
    return ParentDocument(
        parent_id=parent_id,
        doc_id="doc_1",
        content=f"Contenido del padre {parent_id}",
        page_span=PageSpan(start_page=1 + parent_index, end_page=2 + parent_index),
        source=source,
        file_path=f"/tmp/{source}",
        parent_index=parent_index,
        section_title=f"Seccion {parent_index}",
        contains_table=parent_index == 0,
        contains_numeric=True,
        contains_date_like=parent_index == 1,
        block_types=["text", "table"] if parent_index == 0 else ["text"],
        token_count=120,
        block_count=3,
        child_count=2,
        content_hash=f"hash_{parent_id}",
    )


def _build_child(parent_id: str, score: float, content: str, *, child_id: str, page_start: int = 1) -> Document:
    return Document(
        page_content=content,
        metadata={
            "child_id": child_id,
            "parent_id": parent_id,
            "doc_id": "doc_1",
            "source": "sample.pdf",
            "file_path": "/tmp/sample.pdf",
            "section_title": "Seccion",
            "contains_table": False,
            "contains_numeric": True,
            "contains_date_like": False,
            "score": score,
            "page_start": page_start,
            "page_end": page_start,
        },
    )


@pytest.mark.asyncio
async def test_hierarchical_retriever_groups_children_and_hydrates_parents():
    dense_children = [
        _build_child("parent_a", 0.91, "Evidencia A1", child_id="child_a1", page_start=2),
        _build_child("parent_b", 0.89, "Evidencia B1", child_id="child_b1", page_start=5),
        _build_child("parent_a", 0.84, "Evidencia A2", child_id="child_a2", page_start=3),
    ]
    vector_store = _FakeChildVectorStore(dense_children)
    repository = _FakeParentRepository([
        _build_parent("parent_a", parent_index=0),
        _build_parent("parent_b", parent_index=1),
    ])
    lexical_repo = _FakeLexicalRepository(
        [
            type("LexicalHit", (), {
                "child_id": "child_b1",
                "parent_id": "parent_b",
                "doc_id": "doc_1",
                "score": 3.5,
                "content": "Error 500 y timeout",
                "source": "sample.pdf",
                "file_path": "/tmp/sample.pdf",
                "page_start": 5,
                "page_end": 5,
                "section_title": "Seccion 1",
                "contains_table": False,
                "contains_numeric": True,
                "contains_date_like": False,
                "token_count": 12,
            })()
        ]
    )
    retriever = HierarchicalRetriever(
        child_vector_store=vector_store,
        parent_repository=repository,
        embedding_manager=_FakeEmbeddingManager(),
        lexical_repository=lexical_repo,
        reranker=_FakeReranker(),
        child_fetch_multiplier=4,
    )

    results = await retriever.retrieve_parents(query="impacto del error 500 y timeout", k=2)

    assert [item.parent.parent_id for item in results] == ["parent_b", "parent_a"]
    assert results[0].rerank_score > results[1].rerank_score
    assert len(results[0].evidence) >= 1
    assert repository.calls == [["parent_b", "parent_a"]]
    assert vector_store.calls[0]["k"] == 8
    assert lexical_repo.calls[0]["limit"] == 8


@pytest.mark.asyncio
async def test_hierarchical_retriever_trace_includes_context_and_timings():
    children = [
        _build_child("parent_a", 0.93, "La tabla muestra el valor 2026.", child_id="child_a1", page_start=1),
    ]
    vector_store = _FakeChildVectorStore(children)
    repository = _FakeParentRepository([_build_parent("parent_a", parent_index=0)])
    lexical_repo = _FakeLexicalRepository([])
    retriever = HierarchicalRetriever(
        child_vector_store=vector_store,
        parent_repository=repository,
        embedding_manager=_FakeEmbeddingManager(),
        lexical_repository=lexical_repo,
        reranker=_FakeReranker(),
        child_fetch_multiplier=3,
    )

    trace = await retriever.retrieve_with_trace(query="valor exacto 2026 en la tabla", k=1, include_context=True)

    assert trace["query"] == "valor exacto 2026 en la tabla"
    assert trace["k"] == 1
    assert trace["child_k"] == 3
    assert trace["timings"]["parents_hydrated"] == 1
    assert trace["timings"]["retrieval_reason"] == "accepted"
    assert trace["timings"]["parents_hydrated"] == 1
    assert trace["retrieved"][0]["parent_id"] == "parent_a"
    assert trace["retrieved"][0]["child_hits"][0]["child_id"] == "child_a1"
    assert trace["retrieved"][0]["dense_score"] > 0
    assert "Contenido del padre parent_a" in (trace["context"] or "")
