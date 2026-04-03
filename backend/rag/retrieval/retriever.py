from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import statistics
import time
from collections import deque
from dataclasses import dataclass
from functools import wraps
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from langchain_core.documents import Document

from cache.manager import cache
from config import settings

from ..vector_store.vector_store import VectorStore, VectorStoreUnavailableError
from .gating import CheapGateDecision, cheap_gate

logger = logging.getLogger(__name__)

RETRIEVAL_CACHE_PREFIX = "rag:retrieval:"
RETRIEVAL_UNAVAILABLE_MESSAGE = (
    "La base documental no esta disponible en este momento. "
    "Por favor, intentalo nuevamente mas tarde."
)
NO_CONTEXT_MESSAGE = "No se encontro informacion relevante para esta pregunta."
_METRICS_MAX_SAMPLES = 1000


class RetrievalBackendUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class CachedRetrievalResult:
    documents: List[Document]
    reason: str
    kind: str


def measure_time(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        self_obj = args[0] if args else None
        start_time = time.perf_counter()
        try:
            return await func(*args, **kwargs)
        finally:
            execution_time = time.perf_counter() - start_time
            if self_obj and hasattr(self_obj, "performance_metrics"):
                try:
                    self_obj.performance_metrics.add_metric("query_processing", execution_time)
                except Exception:
                    pass

    return wrapper


class PerformanceMetrics:
    def __init__(self, max_samples: int = _METRICS_MAX_SAMPLES):
        self.max_samples = max_samples
        self.metrics = {
            "query_processing": deque(maxlen=max_samples),
            "vector_retrieval": deque(maxlen=max_samples),
            "semantic_reranking": deque(maxlen=max_samples),
            "mmr_application": deque(maxlen=max_samples),
            "cache_operations": deque(maxlen=max_samples),
            "total_time": deque(maxlen=max_samples),
        }

    def add_metric(self, operation: str, time_taken: float) -> None:
        if operation in self.metrics:
            self.metrics[operation].append(time_taken)

    def get_statistics(self) -> Dict[str, Dict[str, float]]:
        stats: Dict[str, Dict[str, float]] = {}
        for operation, times in self.metrics.items():
            if not times:
                continue
            samples = list(times)
            stats[operation] = {
                "min": min(samples),
                "max": max(samples),
                "avg": statistics.mean(samples),
                "median": statistics.median(samples),
                "count": len(samples),
                "buffer_size": self.max_samples,
            }
        return stats

    def log_statistics(self) -> None:
        stats = self.get_statistics()
        logger.info("Performance statistics (last %d samples):", self.max_samples)
        for operation, metrics in stats.items():
            logger.info("%s:", operation)
            for metric, value in metrics.items():
                if metric in {"count", "buffer_size"}:
                    logger.info("  %s: %s", metric, value)
                else:
                    logger.info("  %s: %.3fs", metric, value)

    def reset(self) -> None:
        for key in self.metrics:
            self.metrics[key].clear()


class RAGRetriever:
    _TOP_DOCS_LOG_N = 5
    _PREVIEW_CHARS = 180
    _MAX_QUERY_LOG_CHARS = 160

    def __init__(
        self,
        vector_store: VectorStore,
        embedding_manager: Optional[Any] = None,
        cache_enabled: bool = True,
    ):
        self.vector_store = vector_store
        self.embedding_manager = embedding_manager
        self.cache_enabled = cache_enabled
        self.performance_metrics = PerformanceMetrics()
        self._last_gating_reason: Optional[str] = None

        logger.info(
            "RAGRetriever initialized with normalize -> cheap gate -> cache -> single embedding -> retrieval"
        )

    def _normalize_query(self, query: str | None) -> str:
        return " ".join(str(query or "").split())

    def _cache_is_enabled(self) -> bool:
        return self.cache_enabled and bool(getattr(settings, "enable_cache", True))

    def _safe_query_for_log(self, query: str) -> str:
        sanitized = (query or "").replace("\n", " ").strip()
        if len(sanitized) > self._MAX_QUERY_LOG_CHARS:
            return sanitized[: self._MAX_QUERY_LOG_CHARS] + "..."
        return sanitized

    def _extract_doc_fields_for_log(self, doc: Document) -> Dict[str, Any]:
        metadata = doc.metadata or {}
        source = metadata.get("source") or metadata.get("file_path") or "unknown"
        page = metadata.get("page_number")
        try:
            score = float(metadata.get("score", 0.0) or 0.0)
        except Exception:
            score = 0.0

        preview = (doc.page_content or "").replace("\n", " ").strip()
        if len(preview) > self._PREVIEW_CHARS:
            preview = preview[: self._PREVIEW_CHARS] + "..."

        return {"source": source, "page": page, "score": score, "preview": preview}

    def _log_score_distribution(self, docs: List[Document], stage: str, query: str) -> None:
        try:
            scores = [float((doc.metadata or {}).get("score", 0.0) or 0.0) for doc in docs or []]
            if not scores:
                return
            logger.debug(
                "[RAG][SCORES][%s] q='%s' count=%s min=%.4f max=%.4f avg=%.4f",
                stage,
                self._safe_query_for_log(query),
                len(scores),
                min(scores),
                max(scores),
                statistics.mean(scores),
            )
        except Exception:
            pass

    def _log_top_docs(self, docs: List[Document], stage: str, query: str, k: int) -> None:
        try:
            if not docs:
                return

            ranked_docs = sorted(
                docs,
                key=lambda doc: float((doc.metadata or {}).get("score", 0.0) or 0.0),
                reverse=True,
            )
            top_docs = ranked_docs[: max(1, min(self._TOP_DOCS_LOG_N, k, len(ranked_docs)))]
            logger.debug(
                "[RAG][TOP_DOCS][%s] q='%s' showing=%s/%s",
                stage,
                self._safe_query_for_log(query),
                len(top_docs),
                len(ranked_docs),
            )
            for index, doc in enumerate(top_docs, start=1):
                info = self._extract_doc_fields_for_log(doc)
                logger.debug(
                    "[RAG][TOP_DOCS][%s] #%s score=%.4f source=%s page=%s preview='%s'",
                    stage,
                    index,
                    info["score"],
                    info["source"],
                    info["page"],
                    info["preview"],
                )
        except Exception:
            pass

    def _cheap_gate(self, query: str) -> CheapGateDecision:
        return cheap_gate(query)

    def _build_retrieval_cache_key(
        self,
        query: str,
        k: int,
        filter_criteria: Optional[Dict[str, Any]],
        use_semantic_ranking: bool,
        use_mmr: bool,
    ) -> str:
        payload = {
            "query": self._normalize_query(query).lower(),
            "k": int(max(1, k)),
            "filter": filter_criteria or {},
            "semantic_ranking": bool(use_semantic_ranking),
            "mmr": bool(use_mmr),
        }
        raw_payload = json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
        digest = hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()
        return f"{RETRIEVAL_CACHE_PREFIX}{digest}"

    def _serialize_documents(self, documents: List[Document]) -> List[Dict[str, Any]]:
        serialized_docs: List[Dict[str, Any]] = []
        for doc in documents:
            metadata = dict(doc.metadata or {})
            for heavy_key in ("vector", "vectors", "embedding", "embeddings"):
                metadata.pop(heavy_key, None)
            serialized_docs.append({"page_content": doc.page_content, "metadata": metadata})
        return serialized_docs

    def _deserialize_documents(self, payload: Any) -> List[Document]:
        documents: List[Document] = []
        if not isinstance(payload, list):
            return documents
        for item in payload:
            if not isinstance(item, dict):
                continue
            try:
                documents.append(
                    Document(
                        page_content=str(item.get("page_content", "")),
                        metadata=dict(item.get("metadata") or {}),
                    )
                )
            except Exception:
                continue
        return documents

    def _get_cached_result(
        self,
        query: str,
        k: int,
        filter_criteria: Optional[Dict[str, Any]],
        use_semantic_ranking: bool,
        use_mmr: bool,
    ) -> Optional[CachedRetrievalResult]:
        if not self._cache_is_enabled():
            return None

        cache_key = self._build_retrieval_cache_key(
            query=query,
            k=k,
            filter_criteria=filter_criteria,
            use_semantic_ranking=use_semantic_ranking,
            use_mmr=use_mmr,
        )
        payload = cache.get(cache_key)
        if not isinstance(payload, dict):
            return None

        kind = str(payload.get("kind") or "")
        reason = str(payload.get("reason") or "cache_hit")

        if kind == "no_context":
            return CachedRetrievalResult(documents=[], reason=reason, kind=kind)

        if kind != "documents":
            return None

        return CachedRetrievalResult(
            documents=self._deserialize_documents(payload.get("documents")),
            reason=reason,
            kind=kind,
        )

    def _store_cached_result(
        self,
        query: str,
        k: int,
        filter_criteria: Optional[Dict[str, Any]],
        documents: List[Document],
        reason: str,
        use_semantic_ranking: bool,
        use_mmr: bool,
    ) -> None:
        if not self._cache_is_enabled():
            return

        cache_key = self._build_retrieval_cache_key(
            query=query,
            k=k,
            filter_criteria=filter_criteria,
            use_semantic_ranking=use_semantic_ranking,
            use_mmr=use_mmr,
        )

        if documents:
            payload = {
                "kind": "documents",
                "reason": reason,
                "documents": self._serialize_documents(documents),
            }
        else:
            payload = {"kind": "no_context", "reason": reason}

        cache.set(cache_key, payload)

    def invalidate_rag_cache(self) -> None:
        try:
            cache.invalidate_prefix(RETRIEVAL_CACHE_PREFIX)
        except Exception:
            pass

    def _vector_similarity_threshold(self) -> float:
        try:
            return float(getattr(settings, "similarity_threshold", 0.0))
        except Exception:
            return 0.0

    def _candidate_retrieval_k(self, k: int) -> int:
        multiplier = max(1, int(getattr(settings, "retrieval_k_multiplier", 3)))
        return min(max(1, int(k)) * multiplier, 20)

    def _accept_retrieved_documents(self, documents: List[Document]) -> Tuple[List[Document], str]:
        usable_documents = [doc for doc in documents if (doc.page_content or "").strip()]
        if not usable_documents:
            return ([], "no_usable_documents")
        return (usable_documents, "accepted")

    async def _embed_query_async(self, text: str) -> Optional[np.ndarray]:
        try:
            if not self.embedding_manager:
                return None
            embedding = await asyncio.to_thread(self.embedding_manager.embed_query, text)
            return self._clean_vector(embedding)
        except Exception:
            return None

    def _get_content_type_score(self, chunk_type: str) -> float:
        try:
            normalized_type = str(chunk_type or "text").lower()
            mapping = {
                "header": 1.0,
                "title": 0.95,
                "subtitle": 0.9,
                "paragraph": 0.8,
                "text": 0.75,
                "list": 0.7,
                "bullet": 0.7,
                "numbered_list": 0.7,
                "table": 0.6,
                "code": 0.5,
            }
            return float(mapping.get(normalized_type, 0.6))
        except Exception:
            return 0.6

    def _clean_vector(self, vector: Any) -> Optional[np.ndarray]:
        try:
            if vector is None:
                return None

            if isinstance(vector, np.ndarray):
                array = vector.astype(np.float32)
            else:
                array = np.array(vector, dtype=np.float32)

            if array.ndim != 1:
                array = array.reshape(-1)

            dimension = int(getattr(settings, "default_embedding_dimension", 1536))
            if array.size != dimension:
                return None

            norm = np.linalg.norm(array)
            if norm == 0:
                return None

            return array / norm
        except Exception:
            return None

    async def _retrieve_vector_candidates(
        self,
        query: str,
        query_embedding: np.ndarray,
        k: int,
        filter_criteria: Optional[Dict[str, Any]],
        use_semantic_ranking: bool,
        use_mmr: bool,
    ) -> List[Document]:
        initial_k = self._candidate_retrieval_k(k)
        need_vectors = bool(use_semantic_ranking or use_mmr)
        similarity_threshold = self._vector_similarity_threshold()

        logger.info(
            "[RAG] Vector retrieval threshold=%.2f initial_k=%s q='%s'",
            similarity_threshold,
            initial_k,
            self._safe_query_for_log(query),
        )

        try:
            return await asyncio.wait_for(
                self.vector_store.retrieve(
                    query,
                    k=initial_k,
                    filter=filter_criteria,
                    with_vectors=need_vectors,
                    score_threshold=similarity_threshold,
                    query_embedding=query_embedding,
                ),
                timeout=5.0,
            )
        except asyncio.TimeoutError as exc:
            logger.warning(
                "[RAG][VECTOR] Timeout during retrieve q='%s'",
                self._safe_query_for_log(query),
            )
            raise RetrievalBackendUnavailableError(RETRIEVAL_UNAVAILABLE_MESSAGE) from exc
        except VectorStoreUnavailableError as exc:
            logger.warning(
                "[RAG][VECTOR] Backend unavailable q='%s': %s",
                self._safe_query_for_log(query),
                exc,
            )
            raise RetrievalBackendUnavailableError(RETRIEVAL_UNAVAILABLE_MESSAGE) from exc

    async def _post_process_documents(
        self,
        documents: List[Document],
        query_embedding: np.ndarray,
        k: int,
        use_semantic_ranking: bool,
        use_mmr: bool,
        query: str,
    ) -> List[Document]:
        if use_semantic_ranking:
            rerank_start = time.perf_counter()
            reranked = await self._semantic_reranking(documents, query_embedding=query_embedding)
            self.performance_metrics.add_metric("semantic_reranking", time.perf_counter() - rerank_start)
            final_docs = reranked[:k]
            self._log_score_distribution(reranked, stage="post_rerank", query=query)
            self._log_top_docs(final_docs, stage="final", query=query, k=k)
            return final_docs

        if use_mmr:
            mmr_start = time.perf_counter()
            final_docs = await self._apply_mmr(documents, k, query_embedding=query_embedding)
            self.performance_metrics.add_metric("mmr_application", time.perf_counter() - mmr_start)
            final_docs = final_docs[:k]
            self._log_top_docs(final_docs, stage="final", query=query, k=k)
            return final_docs

        final_docs = documents[:k]
        self._log_top_docs(final_docs, stage="final", query=query, k=k)
        return final_docs

    @measure_time
    async def retrieve_documents(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        use_semantic_ranking: bool = True,
        use_mmr: bool = False,
    ) -> List[Document]:
        start_time = time.perf_counter()
        normalized_query = self._normalize_query(query)
        safe_query = self._safe_query_for_log(normalized_query)
        rerank_mode = "semantic" if use_semantic_ranking else "mmr" if use_mmr else "none"

        cheap_gate_decision = self._cheap_gate(normalized_query)
        self._last_gating_reason = cheap_gate_decision.reason
        logger.info(
            "[RAG] Cheap gate: %s | reason=%s q='%s'",
            "retrieve" if cheap_gate_decision.should_retrieve else "skip",
            cheap_gate_decision.reason,
            safe_query,
        )

        if not cheap_gate_decision.should_retrieve:
            logger.info("[RAG][CACHE] SKIP reason=%s q='%s'", cheap_gate_decision.reason, safe_query)
            logger.info("[RAG][EMBEDDING] skipped reason=%s q='%s'", cheap_gate_decision.reason, safe_query)
            logger.info("[RAG][POST] rerank_mmr ran=no mode=skipped q='%s'", safe_query)
            logger.info(
                "[RAG][POST] acceptance=rejected reason=%s docs=0 q='%s'",
                cheap_gate_decision.reason,
                safe_query,
            )
            logger.info("[RAG][RESULT] used_context=no reason=%s q='%s'", cheap_gate_decision.reason, safe_query)
            return []

        cache_lookup_start = time.perf_counter()
        cached_result = self._get_cached_result(
            query=normalized_query,
            k=k,
            filter_criteria=filter_criteria,
            use_semantic_ranking=use_semantic_ranking,
            use_mmr=use_mmr,
        )
        if cached_result is not None:
            self.performance_metrics.add_metric("cache_operations", time.perf_counter() - cache_lookup_start)
            self._last_gating_reason = cached_result.reason
            logger.info(
                "[RAG][CACHE] HIT kind=%s docs=%s q='%s'",
                cached_result.kind,
                len(cached_result.documents),
                safe_query,
            )
            logger.info("[RAG][EMBEDDING] skipped reason=cache_hit q='%s'", safe_query)
            logger.info("[RAG][POST] rerank_mmr ran=no mode=cache q='%s'", safe_query)
            logger.info(
                "[RAG][POST] acceptance=%s reason=%s docs=%s q='%s'",
                "accepted" if cached_result.documents else "rejected",
                cached_result.reason,
                len(cached_result.documents),
                safe_query,
            )
            logger.info(
                "[RAG][RESULT] used_context=%s reason=%s q='%s'",
                "yes" if cached_result.documents else "no",
                cached_result.reason,
                safe_query,
            )
            logger.debug(
                "[RAG][CACHE][HIT] q='%s' kind=%s docs=%s",
                safe_query,
                cached_result.kind,
                len(cached_result.documents),
            )
            if cached_result.documents:
                self._log_top_docs(cached_result.documents, stage="cache", query=normalized_query, k=k)
            return cached_result.documents
        self.performance_metrics.add_metric("cache_operations", time.perf_counter() - cache_lookup_start)
        logger.info("[RAG][CACHE] MISS q='%s'", safe_query)

        logger.info("[RAG][EMBEDDING] start q='%s'", safe_query)
        query_embedding = await self._embed_query_async(normalized_query)
        if query_embedding is None:
            self._last_gating_reason = "embedding_failed"
            logger.warning("[RAG][EMBEDDING] fail q='%s'", safe_query)
            logger.info("[RAG][POST] rerank_mmr ran=no mode=skipped q='%s'", safe_query)
            logger.info("[RAG][POST] acceptance=rejected reason=embedding_failed docs=0 q='%s'", safe_query)
            logger.info("[RAG][RESULT] used_context=no reason=embedding_failed q='%s'", safe_query)
            logger.warning(
                "[RAG] Query embedding failed; returning no context q='%s'",
                safe_query,
            )
            return []
        logger.info("[RAG][EMBEDDING] success dim=%s q='%s'", int(query_embedding.size), safe_query)

        try:
            vector_start = time.perf_counter()
            relevant_docs = await self._retrieve_vector_candidates(
                query=normalized_query,
                query_embedding=query_embedding,
                k=k,
                filter_criteria=filter_criteria,
                use_semantic_ranking=use_semantic_ranking,
                use_mmr=use_mmr,
            )
            self.performance_metrics.add_metric("vector_retrieval", time.perf_counter() - vector_start)

            if not relevant_docs:
                self._last_gating_reason = "no_candidates"
                logger.info("[RAG][POST] rerank_mmr ran=no mode=%s q='%s'", rerank_mode, safe_query)
                logger.info("[RAG][POST] acceptance=rejected reason=no_candidates docs=0 q='%s'", safe_query)
                self._store_cached_result(
                    query=normalized_query,
                    k=k,
                    filter_criteria=filter_criteria,
                    documents=[],
                    reason="no_candidates",
                    use_semantic_ranking=use_semantic_ranking,
                    use_mmr=use_mmr,
                )
                logger.info("[RAG][RESULT] used_context=no reason=no_candidates q='%s'", safe_query)
                return []

            logger.debug(
                "[RAG][VECTOR] q='%s' requested_k=%s fetched=%s sr=%s mmr=%s",
                safe_query,
                k,
                len(relevant_docs),
                int(bool(use_semantic_ranking)),
                int(bool(use_mmr)),
            )
            self._log_score_distribution(relevant_docs, stage="raw_vector", query=normalized_query)
            self._log_top_docs(relevant_docs, stage="raw_vector", query=normalized_query, k=len(relevant_docs))

            final_docs = await self._post_process_documents(
                documents=relevant_docs,
                query_embedding=query_embedding,
                k=k,
                use_semantic_ranking=use_semantic_ranking,
                use_mmr=use_mmr,
                query=normalized_query,
            )
            logger.info(
                "[RAG][POST] rerank_mmr ran=%s mode=%s q='%s'",
                "yes" if rerank_mode != "none" else "no",
                rerank_mode,
                safe_query,
            )

            accepted_docs, acceptance_reason = self._accept_retrieved_documents(final_docs)
            self._last_gating_reason = acceptance_reason
            logger.info(
                "[RAG][POST] acceptance=%s reason=%s docs=%s q='%s'",
                "accepted" if accepted_docs else "rejected",
                acceptance_reason,
                len(accepted_docs),
                safe_query,
            )

            cache_store_start = time.perf_counter()
            self._store_cached_result(
                query=normalized_query,
                k=k,
                filter_criteria=filter_criteria,
                documents=accepted_docs,
                reason=acceptance_reason,
                use_semantic_ranking=use_semantic_ranking,
                use_mmr=use_mmr,
            )
            self.performance_metrics.add_metric("cache_operations", time.perf_counter() - cache_store_start)
            logger.info(
                "[RAG][RESULT] used_context=%s reason=%s q='%s'",
                "yes" if accepted_docs else "no",
                acceptance_reason,
                safe_query,
            )

            total_time = time.perf_counter() - start_time
            self.performance_metrics.add_metric("total_time", total_time)

            if len(self.performance_metrics.metrics["total_time"]) % 5 == 0:
                self.performance_metrics.log_statistics()

            return accepted_docs
        except RetrievalBackendUnavailableError:
            logger.info("[RAG][POST] rerank_mmr ran=no mode=skipped q='%s'", safe_query)
            logger.info(
                "[RAG][POST] acceptance=rejected reason=retrieval_backend_unavailable docs=0 q='%s'",
                safe_query,
            )
            logger.info("[RAG][RESULT] used_context=no reason=retrieval_backend_unavailable q='%s'", safe_query)
            raise
        except Exception as exc:
            logger.info("[RAG][POST] rerank_mmr ran=no mode=skipped q='%s'", safe_query)
            logger.info("[RAG][POST] acceptance=rejected reason=unexpected_error docs=0 q='%s'", safe_query)
            logger.info("[RAG][RESULT] used_context=no reason=unexpected_error q='%s'", safe_query)
            logger.error("Error retrieve_documents: %s", exc, exc_info=True)
            return []

    async def retrieve_with_trace(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        include_context: bool = True,
    ) -> Dict[str, Any]:
        try:
            documents = await self.retrieve_documents(query, k, filter_criteria)
            items = []
            for doc in documents:
                metadata = doc.metadata or {}
                preview = doc.page_content[:300] if doc.page_content else ""
                items.append(
                    {
                        "score": float(metadata.get("score", 0.0)),
                        "source": metadata.get("source"),
                        "file_path": metadata.get("file_path"),
                        "content_hash": metadata.get("content_hash"),
                        "chunk_type": metadata.get("chunk_type"),
                        "word_count": int(metadata.get("word_count", 0)),
                        "preview": preview,
                        "page_number": (
                            int(metadata.get("page_number"))
                            if isinstance(metadata.get("page_number"), (int, float))
                            else None
                        ),
                    }
                )
            return {
                "query": query,
                "k": k,
                "retrieved": items,
                "context": self.format_context_from_documents(documents) if include_context else None,
                "timings": self.performance_metrics.get_statistics(),
            }
        except Exception as exc:
            logger.error("Error retrieve_with_trace: %s", exc)
            return {"query": query, "k": k, "retrieved": [], "context": None, "timings": {}}

    async def _semantic_reranking(
        self,
        docs: List[Document],
        query_embedding: Optional[np.ndarray] = None,
    ) -> List[Document]:
        if not self.embedding_manager:
            return docs
        try:
            query_vec = query_embedding
            if query_vec is None:
                logger.debug("[RERANK] query_embedding not provided; returning docs unchanged")
                return docs

            for doc in docs:
                if doc.metadata.get("vector") is None:
                    logger.warning("Document without vector during semantic reranking.")

            scored_docs = []
            for doc in docs:
                doc_embedding = doc.metadata.get("vector")
                semantic_score = 0.0
                if doc_embedding is not None:
                    doc_vec = self._clean_vector(doc_embedding)
                    if doc_vec is not None:
                        semantic_score = float(np.dot(query_vec, doc_vec))

                quality_score = float(doc.metadata.get("quality_score", 0.5))
                length_score = min(len(doc.page_content.split()) / 100, 1.0)
                content_type_score = self._get_content_type_score(doc.metadata.get("chunk_type", "text"))
                pdf_priority = 1.5 if str(doc.metadata.get("source", "")).lower().endswith(".pdf") else 1.0

                final_score = (
                    semantic_score * 0.5
                    + quality_score * 0.35
                    + length_score * 0.1
                    + content_type_score * 0.05
                ) * pdf_priority

                doc.metadata["score"] = final_score
                scored_docs.append((doc, final_score))

            return [doc for doc, _ in sorted(scored_docs, key=lambda item: item[1], reverse=True)]
        except Exception as exc:
            logger.error("Error in semantic reranking: %s", exc)
            return docs

    async def _apply_mmr(
        self,
        docs: List[Document],
        k: int,
        query_embedding: Optional[np.ndarray] = None,
        lambda_mult: float = 0.5,
    ) -> List[Document]:
        if not self.embedding_manager:
            return docs[:k]
        try:
            query_vec = query_embedding
            if query_vec is None:
                logger.debug("[MMR] query_embedding not provided; returning top-k without MMR")
                return docs[:k]

            candidate_indices = []
            doc_embeddings: Dict[int, np.ndarray] = {}

            for idx, doc in enumerate(docs):
                embedding = doc.metadata.get("vector")
                if embedding is None:
                    continue
                cleaned = self._clean_vector(embedding)
                if cleaned is None:
                    continue
                doc_embeddings[idx] = cleaned
                candidate_indices.append(idx)

            if not candidate_indices:
                return docs[:k]

            selected_indices: List[int] = []
            remaining = candidate_indices.copy()

            for _ in range(min(k, len(docs))):
                mmr_scores = []
                for idx in remaining:
                    relevance = float(np.dot(query_vec, doc_embeddings[idx]))
                    if selected_indices:
                        selected_embeddings = [doc_embeddings[selected_idx] for selected_idx in selected_indices]
                        similarities = [float(np.dot(doc_embeddings[idx], selected)) for selected in selected_embeddings]
                        diversity = 1 - max(similarities)
                    else:
                        diversity = 1.0
                    mmr_scores.append((idx, lambda_mult * relevance + (1 - lambda_mult) * diversity))

                best_idx = max(mmr_scores, key=lambda item: item[1])[0]
                selected_indices.append(best_idx)
                remaining.remove(best_idx)

            return [docs[idx] for idx in selected_indices]
        except Exception:
            return docs[:k]

    def format_context_from_documents(self, documents: List[Document]) -> str:
        if not documents:
            return NO_CONTEXT_MESSAGE

        grouped = self._group_documents_by_type(documents)
        known_types = ["header", "paragraph", "numbered_list", "bullet_list", "text"]

        def _format_chunk(doc: Document) -> str:
            content = doc.page_content.strip()
            source = doc.metadata.get("source")
            page_number = doc.metadata.get("page_number")
            source_parts = []
            if source:
                source_parts.append(str(source))
            if page_number is not None and str(page_number).strip():
                source_parts.append(f"pagina {page_number}")
            if source_parts:
                return f"[Fuente: {', '.join(source_parts)}]\n{content}"
            return content

        parts = ["Informacion relevante encontrada:"]
        for chunk_type in known_types:
            if chunk_type in grouped:
                parts.extend(_format_chunk(doc) for doc in grouped[chunk_type])
                parts.append("")
        for chunk_type, docs in grouped.items():
            if chunk_type not in known_types:
                parts.extend(_format_chunk(doc) for doc in docs)
                parts.append("")
        return "\n\n".join(filter(None, parts))

    def _group_documents_by_type(self, documents: List[Document]) -> Dict[str, List[Document]]:
        grouped: Dict[str, List[Document]] = {}
        for doc in documents:
            chunk_type = doc.metadata.get("chunk_type", "text")
            grouped.setdefault(chunk_type, []).append(doc)
        return grouped
