import os
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import time
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from functools import wraps
import statistics
import json
import asyncio

from langchain_core.documents import Document

from ..vector_store.vector_store import VectorStore
from cache.manager import cache
from config import settings

logger = logging.getLogger(__name__)


# ============================================================
#   WRAPPER: MEASURE TIME
# ============================================================

def measure_time(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        self_obj = args[0] if args else None
        start_time = time.perf_counter()
        try:
            return await func(*args, **kwargs)
        finally:
            end_time = time.perf_counter()
            execution_time = end_time - start_time
            if self_obj and hasattr(self_obj, "performance_metrics"):
                try:
                    self_obj.performance_metrics.add_metric('query_processing', execution_time)
                except Exception:
                    pass
    return wrapper


# ============================================================
#   PERFORMANCE METRICS
# ============================================================

class PerformanceMetrics:
    """Clase para almacenar y analizar métricas de rendimiento."""

    def __init__(self):
        self.metrics = {
            'query_processing': [],
            'vector_retrieval': [],
            'semantic_reranking': [],
            'mmr_application': [],
            'cache_operations': [],
            'total_time': []
        }

    def add_metric(self, operation: str, time_taken: float):
        if operation in self.metrics:
            self.metrics[operation].append(time_taken)

    def get_statistics(self) -> Dict[str, Dict[str, float]]:
        stats = {}
        for operation, times in self.metrics.items():
            if times:
                stats[operation] = {
                    'min': min(times),
                    'max': max(times),
                    'avg': statistics.mean(times),
                    'median': statistics.median(times),
                    'count': len(times)
                }
        return stats

    def log_statistics(self):
        stats = self.get_statistics()
        logger.info("Estadísticas de rendimiento:")
        for operation, metrics in stats.items():
            logger.info(f"{operation}:")
            for metric, value in metrics.items():
                logger.info(f"  {metric}: {value:.3f}s" if metric != 'count' else f"  {metric}: {value}")


# ============================================================
#   RAG RETRIEVER
# ============================================================

class RAGRetriever:
    """Retriever optimizado para RAG con reranking avanzado + gating premium robusto."""

    def __init__(
        self,
        vector_store: VectorStore,
        embedding_manager: Optional[Any] = None,
        cache_enabled: bool = True
    ):
        self.vector_store = vector_store
        self.embedding_manager = embedding_manager
        self.cache_enabled = cache_enabled
        self.performance_metrics = PerformanceMetrics()

        # Centroide cacheado
        self._centroid_embedding: Optional[np.ndarray] = None

        # Umbral de gating
        try:
            self._gating_threshold: float = float(
                getattr(settings, "rag_gating_similarity_threshold", 0.20)
            )
        except Exception:
            self._gating_threshold = 0.45

        logger.info("RAGRetriever inicializado con optimizaciones y gating robusto.")


    # ============================================================
    #   VECTOR CLEANER (Patch 3)
    # ============================================================

    def _clean_vector(self, v: Any) -> Optional[np.ndarray]:
        """
        Normaliza y valida un vector proveniente de Qdrant o metadata.
        - Rechaza vectores corruptos
        - Rechaza dimensiones incorrectas
        - Normaliza unitariamente
        """
        try:
            if v is None:
                return None

            if isinstance(v, np.ndarray):
                arr = v.astype(np.float32)
            else:
                arr = np.array(v, dtype=np.float32)

            if arr.ndim != 1:
                arr = arr.reshape(-1)

            dim = int(getattr(settings, "default_embedding_dimension", 1536))
            if arr.size != dim:
                return None

            norm = np.linalg.norm(arr)
            if norm == 0:
                return None

            return arr / norm

        except Exception:
            return None


    # ============================================================
    #   DOCUMENT RETRIEVAL
    # ============================================================

    @measure_time
    async def retrieve_documents(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        use_semantic_ranking: bool = True
    ) -> List[Document]:
        """
        Recupera documentos relevantes con reranking avanzado.
        Incluye patch 2: NO filtramos nada en vector_store.
        """

        start_time = time.perf_counter()
        query = query.strip() if query else ""

        trivial_queries = [
            "hola", "buenos días", "buenas tardes", "buenas noches",
            "como estás", "qué tal", "gracias", "adios", "hasta luego",
            "ayuda", "quien eres", "como te llamas"
        ]

        if query.lower() in trivial_queries or len(query) < 5:
            logger.info(f"Consulta trivial: '{query}', omitiendo RAG.")
            return []

        # ====== Cache =======
        cache_start = time.perf_counter()
        if self.cache_enabled and bool(getattr(settings, "enable_cache", True)):
            try:
                cached_results = self._get_from_cache(query, k, filter_criteria)
                if cached_results:
                    self.performance_metrics.add_metric(
                        'cache_operations',
                        time.perf_counter() - cache_start
                    )
                    return cached_results
            except Exception:
                pass

        # ====== VectorStore retrieve =======
        try:
            vector_start = time.perf_counter()
            initial_k = min(k * settings.retrieval_k_multiplier, 20)

            try:
                relevant_docs = await asyncio.wait_for(
                    self.vector_store.retrieve(
                        query,
                        k=initial_k,
                        filter=filter_criteria,
                        use_mmr=False
                    ),
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                relevant_docs = []
            except Exception:
                relevant_docs = []

            self.performance_metrics.add_metric(
                'vector_retrieval',
                time.perf_counter() - vector_start
            )

            if not relevant_docs:
                return []

            # ====== No need for reranking if <= k =======
            if len(relevant_docs) <= k:
                return relevant_docs

            # ====== Reranking =======
            final_docs = []
            if use_semantic_ranking:
                rerank_start = time.perf_counter()
                reranked = await self._semantic_reranking(query, relevant_docs)
                self.performance_metrics.add_metric(
                    'semantic_reranking',
                    time.perf_counter() - rerank_start
                )
                final_docs = reranked[:k]
            else:
                mmr_start = time.perf_counter()
                final_docs = await self._apply_mmr(query, relevant_docs, k)
                self.performance_metrics.add_metric(
                    'mmr_application',
                    time.perf_counter() - mmr_start
                )

            # ====== Cache store =======
            if self.cache_enabled and bool(getattr(settings, "enable_cache", True)):
                try:
                    cache_update = time.perf_counter()
                    self._add_to_cache(query, k, filter_criteria, final_docs)
                    self.performance_metrics.add_metric(
                        'cache_operations',
                        time.perf_counter() - cache_update
                    )
                except Exception:
                    pass

            # ====== Stats =======
            total_time = time.perf_counter() - start_time
            self.performance_metrics.add_metric('total_time', total_time)

            if len(self.performance_metrics.metrics['total_time']) % 5 == 0:
                self.performance_metrics.log_statistics()

            return final_docs

        except Exception as e:
            logger.error(f"Error retrieve_documents: {e}", exc_info=True)
            return []


    # ============================================================
    #   TRACE MODE
    # ============================================================

    async def retrieve_with_trace(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        include_context: bool = True,
    ) -> Dict[str, Any]:

        try:
            docs = await self.retrieve_documents(query, k, filter_criteria)
            items = []

            for doc in docs:
                meta = doc.metadata or {}
                preview = doc.page_content[:300] if doc.page_content else ""

                items.append({
                    "score": float(meta.get("score", 0.0)),
                    "source": meta.get("source"),
                    "file_path": meta.get("file_path"),
                    "content_hash": meta.get("content_hash"),
                    "chunk_type": meta.get("chunk_type"),
                    "word_count": int(meta.get("word_count", 0)),
                    "preview": preview,
                })

            return {
                "query": query,
                "k": k,
                "retrieved": items,
                "context": self.format_context_from_documents(docs) if include_context else None,
                "timings": self.performance_metrics.get_statistics(),
            }

        except Exception as e:
            logger.error(f"Error retrieve_with_trace: {e}")
            return {
                "query": query,
                "k": k,
                "retrieved": [],
                "context": None,
                "timings": {},
            }


    # ============================================================
    #   SEMANTIC RERANKING
    # ============================================================

    async def _semantic_reranking(self, query: str, docs: List[Document]) -> List[Document]:
        if not self.embedding_manager:
            return docs

        try:
            query_embedding = self.embedding_manager.embed_query(query)

            texts_to_embed = []
            missing_indices = []

            for idx, doc in enumerate(docs):
                if doc.metadata.get("embedding") is None:
                    texts_to_embed.append(doc.page_content)
                    missing_indices.append(idx)

            if texts_to_embed:
                batch_embeddings = self.embedding_manager.embed_documents(texts_to_embed)
                for pos, emb in enumerate(batch_embeddings):
                    docs[missing_indices[pos]].metadata["embedding"] = emb

            scored_docs = []

            for doc in docs:
                doc_embedding = doc.metadata.get("embedding")
                semantic_score = 0.0

                if doc_embedding is not None:
                    semantic_score = float(
                        cosine_similarity([query_embedding], [doc_embedding])[0][0]
                    )

                quality_score = float(doc.metadata.get('quality_score', 0.5))
                length_score = min(len(doc.page_content.split()) / 100, 1.0)
                content_type_score = self._get_content_type_score(doc.metadata.get('chunk_type', 'text'))

                pdf_priority_factor = 1.5 if str(doc.metadata.get("source", "")).lower().endswith(".pdf") else 1.0

                final_score = (
                    semantic_score * 0.5 +
                    quality_score * 0.35 +
                    length_score * 0.1 +
                    content_type_score * 0.05
                ) * pdf_priority_factor

                scored_docs.append((doc, final_score))

            return [doc for doc, _ in sorted(scored_docs, key=lambda x: x[1], reverse=True)]

        except Exception as e:
            logger.error(f"Error en reranking semántico: {e}")
            return docs


    # ============================================================
    #   MMR
    # ============================================================

    async def _apply_mmr(self, query: str, docs: List[Document], k: int, lambda_mult: float = 0.5) -> List[Document]:
        if not self.embedding_manager:
            return docs[:k]

        try:
            query_embedding = self.embedding_manager.embed_query(query)

            doc_embeddings = []
            texts_to_embed = []
            missing_indices = []

            for idx, doc in enumerate(docs):
                emb = doc.metadata.get("embedding")
                if emb is None:
                    texts_to_embed.append(doc.page_content)
                    missing_indices.append(idx)
                    doc_embeddings.append(None)
                else:
                    doc_embeddings.append(emb)

            if texts_to_embed:
                batch_embeddings = self.embedding_manager.embed_documents(texts_to_embed)
                for pos, emb in enumerate(batch_embeddings):
                    d_idx = missing_indices[pos]
                    docs[d_idx].metadata["embedding"] = emb
                    doc_embeddings[d_idx] = emb

            selected_indices = []
            remaining = list(range(len(docs)))

            for _ in range(min(k, len(docs))):
                mmr_scores = []

                for idx in remaining:
                    relevance = float(cosine_similarity([query_embedding], [doc_embeddings[idx]])[0][0])

                    if selected_indices:
                        selected_embeds = [doc_embeddings[i] for i in selected_indices]
                        similarities = cosine_similarity([doc_embeddings[idx]], selected_embeds)[0]
                        diversity = 1 - max(similarities)
                    else:
                        diversity = 1.0

                    mmr_score = lambda_mult * relevance + (1 - lambda_mult) * diversity
                    mmr_scores.append((idx, mmr_score))

                best_idx = max(mmr_scores, key=lambda x: x[1])[0]
                selected_indices.append(best_idx)
                remaining.remove(best_idx)

            return [docs[i] for i in selected_indices]

        except Exception:
            return docs[:k]


    # ============================================================
    #   CONTEXT FORMATTER
    # ============================================================

    def format_context_from_documents(self, documents: List[Document]) -> str:
        if not documents:
            return "No se encontró información relevante para esta pregunta."

        grouped = self._group_documents_by_type(documents)
        parts = ["Información relevante encontrada:"]

        if "header" in grouped:
            parts.extend([f"## {d.page_content.strip()}" for d in grouped["header"]])
            parts.append("")

        if "paragraph" in grouped:
            parts.extend([d.page_content.strip() for d in grouped["paragraph"]])
            parts.append("")

        for ltype in ["numbered_list", "bullet_list"]:
            if ltype in grouped:
                parts.extend([d.page_content.strip() for d in grouped[ltype]])
                parts.append("")

        if "text" in grouped:
            parts.extend([d.page_content.strip() for d in grouped["text"]])

        return "\n\n".join(filter(None, parts))


    def _group_documents_by_type(self, documents: List[Document]) -> Dict[str, List[Document]]:
        grouped = {}
        for doc in documents:
            t = doc.metadata.get("chunk_type", "text")
            grouped.setdefault(t, []).append(doc)
        return grouped


    # ============================================================
    #   PREMIUM GATING (Patch 3)
    # ============================================================

    def _ensure_centroid(self) -> bool:
        """
        Calcula un centroide ROBUSTO:
        - Limpia embeddings corruptos
        - Normaliza vectores
        - Evita vectores mal formados
        """

        try:
            if isinstance(self._centroid_embedding, np.ndarray) and self._centroid_embedding.size > 0:
                return True

            client = getattr(self.vector_store, "client", None)
            if client is None:
                logger.warning("VectorStore no disponible para centroide.")
                return False

            embeddings = []
            limit = 1000
            next_offset = None

            while True:
                try:
                    res = client.scroll(
                        collection_name="rag_collection",
                        limit=limit,
                        offset=next_offset,
                        with_payload=True,
                        with_vectors=True
                    )

                    points = getattr(res, "points", None)
                    next_offset = getattr(res, "next_page_offset", None)

                    # compat
                    if points is None and isinstance(res, tuple) and len(res) == 2:
                        points, next_offset = res

                    if not points:
                        break

                    for p in points:
                        payload = getattr(p, "payload", {}) or {}
                        emb = None

                        # Order of preference
                        if "embedding" in payload:
                            emb = self._clean_vector(payload["embedding"])

                        if emb is None and "vector" in payload:
                            emb = self._clean_vector(payload["vector"])

                        if emb is None and "text_vector" in payload:
                            emb = self._clean_vector(payload["text_vector"])

                        if emb is None:
                            emb = self._clean_vector(getattr(p, "vector", None))

                        if emb is None:
                            vs = getattr(p, "vectors", None)
                            if isinstance(vs, dict) and vs:
                                try:
                                    emb = self._clean_vector(next(iter(vs.values())))
                                except Exception:
                                    pass

                        if emb is not None:
                            embeddings.append(emb)

                    if not next_offset:
                        break

                except Exception as e:
                    logger.warning(f"Error scroll centroide: {e}")
                    break

            if not embeddings:
                logger.info("No embeddings disponibles para centroide.")
                return False

            mat = np.vstack(embeddings)
            centroid = mat.mean(axis=0)

            norm = np.linalg.norm(centroid)
            if norm == 0:
                return False

            self._centroid_embedding = centroid / norm
            logger.info("Centroide calculado exitosamente.")
            return True

        except Exception as e:
            logger.warning(f"Error _ensure_centroid: {e}")
            return False


    def should_use_rag(self, query: str) -> bool:
        """Decide activación RAG de manera segura."""

        try:
            q = (query or "").strip()
            if len(q) < 1:
                return False

            if not self.embedding_manager:
                return False

            if not self._ensure_centroid():
                return False

            q_emb = self.embedding_manager.embed_query(q)
            q_vec = self._clean_vector(q_emb)
            c_vec = self._centroid_embedding

            if q_vec is None or c_vec is None:
                return False

            try:
                sim = float(cosine_similarity(q_vec.reshape(1, -1), c_vec.reshape(1, -1))[0][0])
            except Exception:
                sim = float(np.dot(q_vec, c_vec))

            logger.debug(f"Gating → similitud={sim:.4f}, umbral={self._gating_threshold}")
            return sim >= self._gating_threshold

        except Exception as e:
            logger.warning(f"Error should_use_rag: {e}")
            return False


    # ============================================================
    #   CACHE
    # ============================================================

    def _get_from_cache(self, query: str, k: int, filter_criteria: Optional[Dict[str, Any]]) -> Optional[List[Document]]:
        try:
            if not bool(getattr(settings, "enable_cache", True)) or not self.cache_enabled:
                return None

            try:
                filter_key = json.dumps(filter_criteria, sort_keys=True) if filter_criteria else ""
            except Exception:
                filter_key = str(filter_criteria or "")

            cache_key = f"rag:{query}:{k}:{filter_key}"
            cached = cache.get(cache_key)

            if not cached:
                return None

            docs = []
            for item in cached:
                try:
                    docs.append(Document(page_content=item["page_content"], metadata=item["metadata"]))
                except Exception:
                    pass

            return docs

        except Exception:
            return None


    def _add_to_cache(self, query: str, k: int, filter_criteria: Optional[Dict[str, Any]], docs: List[Document]):
        try:
            if not bool(getattr(settings, "enable_cache", True)) or not self.cache_enabled:
                return

            try:
                filter_key = json.dumps(filter_criteria, sort_keys=True) if filter_criteria else ""
            except Exception:
                filter_key = str(filter_criteria or "")

            cache_key = f"rag:{query}:{k}:{filter_key}"

            serialized_docs = [
                {
                    "page_content": d.page_content,
                    "metadata": d.metadata
                }
                for d in docs
            ]

            cache.set(cache_key, serialized_docs)

        except Exception as e:
            logger.warning(f"Cache update error: {e}")


    def invalidate_rag_cache(self) -> None:
        try:
            if bool(getattr(settings, "enable_cache", True)):
                cache.invalidate_prefix("rag:")
        except Exception:
            pass

    def reset_centroid(self) -> None:
        self._centroid_embedding = None
