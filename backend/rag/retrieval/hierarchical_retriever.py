from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import defaultdict
from dataclasses import replace
from typing import Any, Dict, Optional

_INJECTION_PATTERN = re.compile(
    r"</?(context|instructions|forbidden|system|system_personality|history)[^>]*>",
    re.IGNORECASE,
)

from langchain_core.documents import Document

from config import settings
from core.request_context import get_request_context
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

    def _child_first_context_enabled(self) -> bool:
        return bool(getattr(settings, "rag_child_first_context_enabled", False))

    def _child_first_top_children(self) -> int:
        return max(1, int(getattr(settings, "rag_child_first_context_top_children", 3)))

    def _child_first_window_tokens(self) -> int:
        return max(0, int(getattr(settings, "rag_child_first_context_window_tokens", 200)))

    def _split_text_tokens(self, text: str) -> list[str]:
        return re.findall(r"\S+", text or "")

    def _find_child_token_span(self, parent_text: str, child_text: str) -> tuple[int, int] | None:
        parent_tokens = self._split_text_tokens(parent_text)
        child_tokens = self._split_text_tokens(child_text)
        if not parent_tokens or not child_tokens:
            return None

        child_len = len(child_tokens)
        first_token = child_tokens[0]
        max_start = len(parent_tokens) - child_len
        for start in range(max_start + 1):
            if parent_tokens[start] != first_token:
                continue
            if parent_tokens[start : start + child_len] == child_tokens:
                return (start, start + child_len)
        return None

    def _extract_parent_window_for_child(self, *, parent_text: str, child_text: str, window_tokens: int) -> str:
        parent_tokens = self._split_text_tokens(parent_text)
        if not parent_tokens:
            return ""

        span = self._find_child_token_span(parent_text, child_text)
        if span is None:
            child_tokens = self._split_text_tokens(child_text)
            clipped = child_tokens[: max(1, window_tokens)]
            return " ".join(clipped).strip()

        start, end = span
        window_start = max(0, start - window_tokens)
        window_end = min(len(parent_tokens), end + window_tokens)
        return " ".join(parent_tokens[window_start:window_end]).strip()

    def _build_child_first_context(self, candidate: ParentCandidate) -> str:
        parent = candidate.parent
        evidence = list(candidate.evidence[: self._child_first_top_children()])
        if not evidence:
            return parent.content

        window_tokens = self._child_first_window_tokens()
        parts = []
        seen_windows: set[str] = set()

        for index, child in enumerate(evidence, start=1):
            child_content = str(child.get("content") or "").strip()
            if not child_content:
                continue

            window = self._extract_parent_window_for_child(
                parent_text=parent.content,
                child_text=child_content,
                window_tokens=window_tokens,
            )
            normalized_window = " ".join(window.split())
            if not normalized_window or normalized_window in seen_windows:
                continue
            seen_windows.add(normalized_window)

            parts.append(
                "\n".join(
                    [
                        f"[Fragmento relevante {index} | paginas {child.get('page_start')}-{child.get('page_end')}]",
                        child_content,
                        f"[Ventana del parent +/- {window_tokens} tokens]",
                        window,
                    ]
                ).strip()
            )

        return "\n\n".join(part for part in parts if part).strip() or parent.content

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

    async def _generate_hyde_embedding(self, query: str) -> list[float] | None:
        """Embed a hypothetical answer to the query (HyDE) for better dense recall."""
        try:
            from langchain_openai import ChatOpenAI
            hyde_model = getattr(settings, "hyde_model_name", None) or getattr(settings, "base_model_name", "gpt-4o-mini")
            hyde_max_tokens = int(getattr(settings, "hyde_max_tokens", 150))
            llm = ChatOpenAI(model_name=hyde_model, max_tokens=hyde_max_tokens, temperature=0)
            response = await llm.ainvoke(
                f"Write a short, factual paragraph that directly answers: {query}"
            )
            hyp_text = response.content if hasattr(response, "content") else str(response)
            if not hyp_text.strip():
                return None
            return await self._embed_query_async(hyp_text)
        except Exception as exc:
            logger.warning("HyDE embedding failed (%s); using original query embedding", exc)
            return None

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

        if getattr(settings, "enable_hyde", False):
            raw_emb, hyde_emb = await asyncio.gather(
                self._embed_query_async(normalized_query),
                self._generate_hyde_embedding(normalized_query),
            )
            if raw_emb is not None and hyde_emb is not None:
                import numpy as np
                avg = np.array(raw_emb) + np.array(hyde_emb)
                norm = float(np.linalg.norm(avg))
                query_embedding = (avg / norm).tolist() if norm > 1e-8 else raw_emb
            else:
                query_embedding = raw_emb
        else:
            query_embedding = await self._embed_query_async(normalized_query)

        async def _timed_dense_search():
            dense_started_at = time.perf_counter()
            try:
                if query_embedding is None:
                    return []
                return await self._dense_search(
                    normalized_query,
                    query_embedding,
                    child_k,
                    filter_criteria,
                )
            finally:
                try:
                    get_request_context().set_stage_timing_ms(
                        "dense_ms",
                        (time.perf_counter() - dense_started_at) * 1000,
                    )
                except Exception:
                    pass

        async def _timed_lexical_search():
            lexical_started_at = time.perf_counter()
            try:
                return await self._lexical_search(normalized_query, child_k, filter_criteria)
            finally:
                try:
                    get_request_context().set_stage_timing_ms(
                        "lexical_ms",
                        (time.perf_counter() - lexical_started_at) * 1000,
                    )
                except Exception:
                    pass

        dense_task = _timed_dense_search()
        lexical_task = _timed_lexical_search()
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

        hydrate_started_at = time.perf_counter()
        parent_candidates = await self._hydrate_parent_candidates(fused_children, k)
        try:
            get_request_context().set_stage_timing_ms(
                "hydrate_ms",
                (time.perf_counter() - hydrate_started_at) * 1000,
            )
        except Exception:
            pass
        if not parent_candidates:
            self._last_gating_reason = "no_parent_candidates"
            return []

        limit = max(
            max(1, int(k)),
            int(getattr(settings, "hybrid_parent_candidate_limit", 6)),
        )
        rerank_started_at = time.perf_counter()
        reranked = (
            await self.reranker.rerank(query=normalized_query, candidates=parent_candidates, limit=limit)
            if self.reranker is not None
            else parent_candidates[:limit]
        )
        try:
            get_request_context().set_stage_timing_ms(
                "rerank_ms",
                (time.perf_counter() - rerank_started_at) * 1000,
            )
        except Exception:
            pass
        if not reranked:
            self._last_gating_reason = "reranker_empty"
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
        max_attempts = int(getattr(settings, "qdrant_retry_attempts", 2))
        retry_delay = float(getattr(settings, "qdrant_retry_delay_base", 0.5))
        last_exc: Exception = RuntimeError("no attempts made")

        for attempt in range(1, max_attempts + 1):
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
                last_exc = exc
                breaker = getattr(self.child_vector_store, "_qdrant_breaker", None)
                if breaker is not None and breaker.is_open:
                    break
                if attempt < max_attempts:
                    logger.warning(
                        "_dense_search attempt %d/%d failed: %s — retrying in %.1fs",
                        attempt, max_attempts, exc, retry_delay * attempt,
                    )
                    await asyncio.sleep(retry_delay * attempt)

        raise RetrievalBackendUnavailableError(str(last_exc)) from last_exc

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

        orphan_ids = [pid for pid in ranked_parent_ids if pid not in parent_map]
        if orphan_ids:
            logger.warning(
                "_hydrate_parent_candidates: %d orphan parent_id(s) not found in MongoDB (data inconsistency): %s",
                len(orphan_ids), orphan_ids[:5],
            )

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
                            "content": str(child.get("content") or ""),
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
        """Pure RRF score for parent candidate selection.
        Quality bonuses (lexical, table, numeric, date) belong exclusively to the reranker.
        """
        if not evidence_children:
            return 0.0
        return max(float(child.get("rrf_score", 0.0) or 0.0) for child in evidence_children)

    def _parent_candidate_to_document(self, candidate: ParentCandidate) -> Document:
        parent = candidate.parent
        page_content = (
            self._build_child_first_context(candidate)
            if self._child_first_context_enabled()
            else parent.content
        )
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
            "context_mode": "child_first" if self._child_first_context_enabled() else "parent_full",
        }
        return Document(page_content=page_content, metadata=metadata)

    @staticmethod
    def _sanitize_content(text: str) -> str:
        """Strip XML tags that could escape the <context> boundary and inject instructions."""
        return _INJECTION_PATTERN.sub("[REDACTED]", text or "")

    def format_context_from_documents(self, documents: list[Document]) -> str:
        if not documents:
            return NO_CONTEXT_MESSAGE

        parts = ["Informacion relevante encontrada (contexto jerarquico):"]
        for doc in documents:
            metadata = doc.metadata or {}
            parts.append(
                f"[Documento: {metadata.get('source')}, paginas {metadata.get('page_start')}-{metadata.get('page_end')}, "
                f"seccion: {metadata.get('section_title') or 'sin seccion'}, "
                f"modo_contexto: {metadata.get('context_mode') or 'parent_full'}]"
            )
            parts.append(self._sanitize_content(doc.page_content).strip())

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
