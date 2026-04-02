from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import replace
from typing import Any, Dict, Optional

from langchain_core.documents import Document

from config import settings
from database import LexicalSearchHit
from rag.ingestion.models import ParentDocument

from .reranker import BaseParentReranker, ParentCandidate
from .retriever import NO_CONTEXT_MESSAGE, RAGRetriever, RetrievalBackendUnavailableError

logger = logging.getLogger(__name__)


class HierarchicalRetriever(RAGRetriever):
    def __init__(
        self,
        *,
        child_vector_store,
        parent_repository,
        embedding_manager=None,
        lexical_repository=None,
        reranker: BaseParentReranker | None = None,
        child_fetch_multiplier: int = 4,
        cache_enabled: bool = True,
    ) -> None:
        super().__init__(
            vector_store=child_vector_store,
            embedding_manager=embedding_manager,
            cache_enabled=cache_enabled,
        )
        self.child_vector_store = child_vector_store
        self.parent_repository = parent_repository
        self.lexical_repository = lexical_repository
        self.reranker = reranker
        self.child_fetch_multiplier = max(1, int(child_fetch_multiplier))

    def _candidate_child_k(self, parent_k: int) -> int:
        base = max(1, int(parent_k))
        configured_limit = max(base, int(getattr(settings, "hybrid_child_candidate_limit", 12)))
        return min(max(base * self.child_fetch_multiplier, base), configured_limit)

    async def retrieve_documents(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        use_semantic_ranking: bool = True,
        use_mmr: bool = False,
    ) -> list[Document]:
        normalized_query = self._normalize_query(query)
        cache_lookup = self._get_cached_result(
            query=normalized_query,
            k=k,
            filter_criteria=filter_criteria,
            use_semantic_ranking=bool(use_semantic_ranking and self.reranker is not None),
            use_mmr=bool(use_mmr or self.lexical_repository is not None),
        )
        if cache_lookup is not None:
            self._last_gating_reason = cache_lookup.reason
            return cache_lookup.documents

        trace = await self.retrieve_with_trace(
            query=normalized_query,
            k=k,
            filter_criteria=filter_criteria,
            include_context=False,
        )
        documents = []
        for item in trace.get("documents", []):
            documents.append(Document(page_content=item["page_content"], metadata=item["metadata"]))
        self._store_cached_result(
            query=normalized_query,
            k=k,
            filter_criteria=filter_criteria,
            documents=documents,
            reason=self._last_gating_reason or ("accepted" if documents else "no_candidates"),
            use_semantic_ranking=bool(use_semantic_ranking and self.reranker is not None),
            use_mmr=bool(use_mmr or self.lexical_repository is not None),
        )
        return documents

    async def retrieve_parents(
        self,
        *,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
    ) -> list[ParentCandidate]:
        normalized_query = self._normalize_query(query)
        cheap_gate_decision = self._cheap_gate(normalized_query)
        self._last_gating_reason = cheap_gate_decision.reason
        if not cheap_gate_decision.should_retrieve:
            return []

        child_k = self._candidate_child_k(k)
        query_embedding = await self._embed_query_async(normalized_query)

        dense_task = (
            self._dense_search(normalized_query, query_embedding, child_k, filter_criteria)
            if query_embedding is not None
            else asyncio.sleep(0, result=[])
        )
        lexical_task = self._lexical_search(normalized_query, child_k, filter_criteria)
        dense_hits, lexical_hits = await asyncio.gather(dense_task, lexical_task)
        if query_embedding is None and lexical_hits:
            self._last_gating_reason = "lexical_only"
        elif query_embedding is None:
            self._last_gating_reason = "embedding_failed"
            return []
        fused_children = self._fuse_child_hits(dense_hits, lexical_hits)
        if not fused_children:
            self._last_gating_reason = "no_candidates"
            return []

        parent_candidates = await self._hydrate_parent_candidates(fused_children, k)
        if not parent_candidates:
            self._last_gating_reason = "no_parent_candidates"
            return []

        limit = max(
            max(1, int(k)),
            int(getattr(settings, "hybrid_parent_candidate_limit", 6)),
        )
        reranked = (
            await self.reranker.rerank(query=normalized_query, candidates=parent_candidates, limit=limit)
            if self.reranker is not None
            else parent_candidates[:limit]
        )
        self._last_gating_reason = "accepted" if reranked else "reranker_empty"
        return reranked[: max(1, int(k))]

    async def retrieve_with_trace(
        self,
        *,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        include_context: bool = True,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        normalized_query = self._normalize_query(query)
        child_k = self._candidate_child_k(k)
        parent_results = await self.retrieve_parents(
            query=normalized_query,
            k=k,
            filter_criteria=filter_criteria,
        )

        items = []
        documents = []
        for candidate in parent_results:
            parent = candidate.parent
            document = self._parent_candidate_to_document(candidate)
            documents.append({"page_content": document.page_content, "metadata": document.metadata})
            items.append(
                {
                    "parent_id": parent.parent_id,
                    "doc_id": parent.doc_id,
                    "source": parent.source,
                    "file_path": parent.file_path,
                    "score": float(candidate.rerank_score or candidate.fused_score or 0.0),
                    "dense_score": float(candidate.dense_score),
                    "lexical_score": float(candidate.lexical_score),
                    "fused_score": float(candidate.fused_score),
                    "rerank_score": float(candidate.rerank_score or candidate.fused_score),
                    "page_start": parent.page_start,
                    "page_end": parent.page_end,
                    "section_title": parent.section_title,
                    "contains_table": parent.contains_table,
                    "contains_numeric": parent.contains_numeric,
                    "contains_date_like": parent.contains_date_like,
                    "child_hits": candidate.evidence[:5],
                    "preview": parent.content[:500],
                }
            )

        langchain_documents = [Document(page_content=item["page_content"], metadata=item["metadata"]) for item in documents]
        return {
            "query": normalized_query,
            "k": k,
            "child_k": child_k,
            "retrieved": items,
            "documents": documents,
            "context": self.format_context_from_documents(langchain_documents) if include_context else None,
            "timings": {
                "total_ms": round((time.perf_counter() - started_at) * 1000, 2),
                "parent_candidates": len(parent_results),
                "parents_hydrated": len(parent_results),
                "retrieval_reason": self._last_gating_reason,
            },
        }

    async def _dense_search(
        self,
        query: str,
        query_embedding,
        limit: int,
        filter_criteria: Optional[Dict[str, Any]],
    ) -> list[Document]:
        try:
            return await self.child_vector_store.retrieve(
                query=query,
                k=limit,
                filter=filter_criteria,
                score_threshold=float(getattr(settings, "similarity_threshold", 0.0)),
                with_vectors=False,
                query_embedding=query_embedding,
            )
        except Exception as exc:
            raise RetrievalBackendUnavailableError(str(exc)) from exc

    async def _lexical_search(
        self,
        query: str,
        limit: int,
        filter_criteria: Optional[Dict[str, Any]],
    ) -> list[LexicalSearchHit]:
        if self.lexical_repository is None or not getattr(settings, "enable_hybrid_search", True):
            return []
        return await self.lexical_repository.search(
            query,
            limit=limit,
            filter_criteria=filter_criteria,
        )

    def _fuse_child_hits(
        self,
        dense_hits: list[Document],
        lexical_hits: list[LexicalSearchHit],
    ) -> list[dict[str, Any]]:
        rrf_k = max(1, int(getattr(settings, "hybrid_rrf_k", 60)))
        children: dict[str, dict[str, Any]] = {}

        for rank, doc in enumerate(dense_hits, start=1):
            metadata = dict(doc.metadata or {})
            child_id = str(metadata.get("child_id") or metadata.get("id") or "").strip()
            if not child_id:
                continue
            entry = children.setdefault(
                child_id,
                {
                    "child_id": child_id,
                    "parent_id": metadata.get("parent_id"),
                    "doc_id": metadata.get("doc_id"),
                    "content": doc.page_content,
                    "source": metadata.get("source"),
                    "file_path": metadata.get("file_path"),
                    "page_start": metadata.get("page_start"),
                    "page_end": metadata.get("page_end"),
                    "section_title": metadata.get("section_title"),
                    "contains_table": bool(metadata.get("contains_table", False)),
                    "contains_numeric": bool(metadata.get("contains_numeric", False)),
                    "contains_date_like": bool(metadata.get("contains_date_like", False)),
                    "dense_score": 0.0,
                    "lexical_score": 0.0,
                    "rrf_score": 0.0,
                },
            )
            dense_score = float(metadata.get("score", 0.0) or 0.0)
            entry["dense_score"] = max(entry["dense_score"], dense_score)
            entry["rrf_score"] += 1.0 / (rrf_k + rank)

        for rank, hit in enumerate(lexical_hits, start=1):
            entry = children.setdefault(
                hit.child_id,
                {
                    "child_id": hit.child_id,
                    "parent_id": hit.parent_id,
                    "doc_id": hit.doc_id,
                    "content": hit.content,
                    "source": hit.source,
                    "file_path": hit.file_path,
                    "page_start": hit.page_start,
                    "page_end": hit.page_end,
                    "section_title": hit.section_title,
                    "contains_table": hit.contains_table,
                    "contains_numeric": hit.contains_numeric,
                    "contains_date_like": hit.contains_date_like,
                    "dense_score": 0.0,
                    "lexical_score": 0.0,
                    "rrf_score": 0.0,
                },
            )
            entry["lexical_score"] = max(entry["lexical_score"], float(hit.score))
            entry["rrf_score"] += 1.0 / (rrf_k + rank)

        return sorted(children.values(), key=lambda item: item["rrf_score"], reverse=True)

    async def _hydrate_parent_candidates(
        self,
        fused_children: list[dict[str, Any]],
        k: int,
    ) -> list[ParentCandidate]:
        grouped_children: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for child in fused_children:
            parent_id = str(child.get("parent_id") or "").strip()
            if not parent_id:
                continue
            grouped_children[parent_id].append(child)

        ranked_parent_ids = self._rank_parent_ids(grouped_children, limit=max(1, int(getattr(settings, "hybrid_parent_candidate_limit", 6))))
        parents = await self.parent_repository.get_by_parent_ids(ranked_parent_ids)
        parent_map = {parent.parent_id: parent for parent in parents}

        candidates: list[ParentCandidate] = []
        for parent_id in ranked_parent_ids:
            parent = parent_map.get(parent_id)
            if parent is None:
                continue
            evidence = sorted(grouped_children.get(parent_id, []), key=lambda item: item["rrf_score"], reverse=True)
            fused_score = self._parent_score(evidence)
            candidates.append(
                ParentCandidate(
                    parent=parent,
                    evidence=[
                        {
                            "child_id": child.get("child_id"),
                            "score": float(child.get("rrf_score", 0.0) or 0.0),
                            "dense_score": float(child.get("dense_score", 0.0) or 0.0),
                            "lexical_score": float(child.get("lexical_score", 0.0) or 0.0),
                            "page_start": child.get("page_start"),
                            "page_end": child.get("page_end"),
                            "preview": str(child.get("content") or "")[:300],
                        }
                        for child in evidence[:5]
                    ],
                    dense_score=max(float(child.get("dense_score", 0.0) or 0.0) for child in evidence),
                    lexical_score=max(float(child.get("lexical_score", 0.0) or 0.0) for child in evidence),
                    fused_score=fused_score,
                )
            )
        return candidates[: max(1, k)]

    def _rank_parent_ids(
        self,
        grouped_children: dict[str, list[dict[str, Any]]],
        *,
        limit: int,
    ) -> list[str]:
        ranked = sorted(
            grouped_children.items(),
            key=lambda item: self._parent_score(item[1]),
            reverse=True,
        )
        return [parent_id for parent_id, _ in ranked[: max(1, int(limit))]]

    def _parent_score(self, evidence_children: list[dict[str, Any]]) -> float:
        if not evidence_children:
            return 0.0

        max_fused = max(float(child.get("rrf_score", 0.0) or 0.0) for child in evidence_children)
        lexical_bonus = max(float(child.get("lexical_score", 0.0) or 0.0) for child in evidence_children)
        support_bonus = min(0.2, max(0, len(evidence_children) - 1) * 0.03)
        return max_fused + lexical_bonus * 0.05 + support_bonus

    def _parent_candidate_to_document(self, candidate: ParentCandidate) -> Document:
        parent = candidate.parent
        metadata = {
            "parent_id": parent.parent_id,
            "doc_id": parent.doc_id,
            "source": parent.source,
            "file_path": parent.file_path,
            "page_number": parent.page_start,
            "page_start": parent.page_start,
            "page_end": parent.page_end,
            "section_title": parent.section_title,
            "contains_table": parent.contains_table,
            "contains_numeric": parent.contains_numeric,
            "contains_date_like": parent.contains_date_like,
            "score": float(candidate.rerank_score or candidate.fused_score or 0.0),
            "dense_score": float(candidate.dense_score),
            "lexical_score": float(candidate.lexical_score),
            "fused_score": float(candidate.fused_score),
            "rerank_score": float(candidate.rerank_score or candidate.fused_score),
            "chunk_type": "parent_document",
            "child_hits": candidate.evidence,
        }
        return Document(page_content=parent.content, metadata=metadata)

    def format_context_from_documents(self, documents: list[Document]) -> str:
        if not documents:
            return NO_CONTEXT_MESSAGE

        parts = ["Informacion relevante encontrada (contexto jerarquico):"]
        for doc in documents:
            metadata = doc.metadata or {}
            parts.append(
                f"[Documento: {metadata.get('source')}, paginas {metadata.get('page_start')}-{metadata.get('page_end')}, "
                f"seccion: {metadata.get('section_title') or 'sin seccion'}]"
            )
            parts.append((doc.page_content or "").strip())

            child_hits = metadata.get("child_hits") or []
            if child_hits:
                parts.append("Fragmentos activadores:")
                for index, child in enumerate(child_hits[:3], start=1):
                    parts.append(
                        f"{index}. paginas {child.get('page_start')}-{child.get('page_end')} | "
                        f"hybrid_score={float(child.get('score', 0.0) or 0.0):.4f} | "
                        f"{str(child.get('preview') or '').strip()}"
                    )
            parts.append("")

        return "\n\n".join(part for part in parts if part)
