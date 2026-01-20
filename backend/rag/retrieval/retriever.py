import logging
from typing import List, Dict, Any, Optional, Tuple
import time
import numpy as np
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

from collections import deque

# Límite máximo de muestras por métrica para evitar memory leak en long-running
_METRICS_MAX_SAMPLES = 1000


class PerformanceMetrics:
    """
    Clase para almacenar y analizar métricas de rendimiento.
    
    Usa ring buffers (deque con maxlen) para evitar memory leak en
    aplicaciones long-running. Solo mantiene las últimas N muestras.
    """

    def __init__(self, max_samples: int = _METRICS_MAX_SAMPLES):
        self.max_samples = max_samples
        self.metrics = {
            'query_processing': deque(maxlen=max_samples),
            'vector_retrieval': deque(maxlen=max_samples),
            'semantic_reranking': deque(maxlen=max_samples),
            'mmr_application': deque(maxlen=max_samples),
            'cache_operations': deque(maxlen=max_samples),
            'total_time': deque(maxlen=max_samples)
        }

    def add_metric(self, operation: str, time_taken: float):
        """Agrega una métrica. El ring buffer descarta automáticamente las más antiguas."""
        if operation in self.metrics:
            self.metrics[operation].append(time_taken)

    def get_statistics(self) -> Dict[str, Dict[str, float]]:
        stats = {}
        for operation, times in self.metrics.items():
            if times:
                times_list = list(times)  # Convertir deque a list para statistics
                stats[operation] = {
                    'min': min(times_list),
                    'max': max(times_list),
                    'avg': statistics.mean(times_list),
                    'median': statistics.median(times_list),
                    'count': len(times_list),
                    'buffer_size': self.max_samples  # Info sobre el límite
                }
        return stats

    def log_statistics(self):
        stats = self.get_statistics()
        logger.info("Estadísticas de rendimiento (últimas %d muestras):", self.max_samples)
        for operation, metrics in stats.items():
            logger.info(f"{operation}:")
            for metric, value in metrics.items():
                if metric == 'count' or metric == 'buffer_size':
                    logger.info(f"  {metric}: {value}")
                else:
                    logger.info(f"  {metric}: {value:.3f}s")
    
    def reset(self):
        """Limpia todas las métricas."""
        for key in self.metrics:
            self.metrics[key].clear()


# ============================================================
#   RAG RETRIEVER
# ============================================================

class RAGRetriever:
    """
    Retriever optimizado para RAG con reranking avanzado + gating premium robusto.

    IMPORTANTE: Se debe llamar a `await retriever.warmup()` durante el inicio de la aplicación
    (startup event) para garantizar que el centroide esté calculado y el sistema de gating
    funcione correctamente desde la primera petición.
    """

    # --- Ajustes de logging (solo observabilidad) ---
    _TOP_DOCS_LOG_N = 5
    _PREVIEW_CHARS = 180
    _MAX_QUERY_LOG_CHARS = 160

    # --- Constantes de Gating (evitar magic numbers) ---
    _MIN_TOKENS_FOR_INTENT = 3          # Mínimo de tokens para considerar que hay intención real
    _SMALL_CORPUS_THRESHOLD = 20        # Corpus pequeño: relajar criterios
    _MEDIUM_CORPUS_THRESHOLD = 50       # Corpus mediano: fallback conservador
    _MIN_TOKENS_FOR_FALLBACK = 4        # Tokens mínimos para usar RAG en caso de duda

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

        # Control de Tareas (Concurrency & Race Conditions)
        self._recalc_task: Optional[asyncio.Task] = None

        # Lock async (lazy) para blindar llamadas concurrentes directas (warmup/trigger/gating)
        self._centroid_lock: Optional[asyncio.Lock] = None

        # Datos del Centroide
        self._centroid_embedding: Optional[np.ndarray] = None

        # Control de Invalidación (Puntos Totales en Qdrant)
        self._last_total_points_count: Optional[int] = None
        self._last_corpus_size_check_time: float = 0.0
        self._corpus_size_cache_ttl: int = 10
        self._last_centroid_recalc_timestamp: float = 0.0
        self._last_gating_reason: Optional[str] = None  # Para debug info del Bot

        # Umbral de gating
        try:
            self._gating_threshold: float = float(
                getattr(settings, "rag_gating_similarity_threshold", 0.20)
            )
        except Exception:
            self._gating_threshold = 0.45

        # Inicialización del centroide desde caché (con spawn automático por ser init)
        self._try_load_centroid_from_cache(spawn_if_missing=True)

        logger.info("RAGRetriever inicializado con optimizaciones y gating robusto.")
        try:
            logger.info(f"Umbral de gating (RAG_GATING_SIMILARITY_THRESHOLD)={self._gating_threshold}")
        except Exception:
            pass

    # ============================================================
    #   INTERNAL: LOG HELPERS
    # ============================================================

    def _safe_query_for_log(self, q: str) -> str:
        s = (q or "").replace("\n", " ").strip()
        if len(s) > self._MAX_QUERY_LOG_CHARS:
            return s[:self._MAX_QUERY_LOG_CHARS] + "..."
        return s

    def _extract_doc_fields_for_log(self, doc: Document) -> Dict[str, Any]:
        meta = doc.metadata or {}
        source = meta.get("source") or meta.get("file_path") or "unknown"
        page = meta.get("page_number")
        score = meta.get("score", 0.0)
        try:
            score = float(score or 0.0)
        except Exception:
            score = 0.0

        preview = (doc.page_content or "").replace("\n", " ").strip()
        if len(preview) > self._PREVIEW_CHARS:
            preview = preview[:self._PREVIEW_CHARS] + "..."

        return {"source": source, "page": page, "score": score, "preview": preview}

    def _log_score_distribution(self, docs: List[Document], stage: str, query: str) -> None:
        try:
            scores = []
            for d in docs or []:
                try:
                    scores.append(float((d.metadata or {}).get("score", 0.0) or 0.0))
                except Exception:
                    pass
            if not scores:
                return
            q = self._safe_query_for_log(query)
            logger.debug(
                f"[RAG][SCORES][{stage}] q='{q}' "
                f"count={len(scores)} min={min(scores):.4f} max={max(scores):.4f} avg={statistics.mean(scores):.4f}"
            )
        except Exception:
            pass

    def _log_top_docs(self, docs: List[Document], stage: str, query: str, k: int) -> None:
        """
        Loguea top N docs por score (ya sea score de Qdrant o score post-rerank).
        """
        try:
            if not docs:
                return

            # Ordenar por score desc
            def s(d: Document) -> float:
                try:
                    return float((d.metadata or {}).get("score", 0.0) or 0.0)
                except Exception:
                    return 0.0

            sorted_docs = sorted(docs, key=s, reverse=True)
            top_n = sorted_docs[: max(1, min(self._TOP_DOCS_LOG_N, k, len(sorted_docs)))]

            q = self._safe_query_for_log(query)
            logger.debug(f"[RAG][TOP_DOCS][{stage}] q='{q}' showing={len(top_n)}/{len(sorted_docs)}")

            for i, d in enumerate(top_n, start=1):
                info = self._extract_doc_fields_for_log(d)
                logger.debug(
                    f"[RAG][TOP_DOCS][{stage}] #{i} "
                    f"score={info['score']:.4f} source={info['source']} page={info['page']} "
                    f"preview='{info['preview']}'"
                )
        except Exception:
            pass

    # ============================================================
    #   INTERNAL: LOCK (LAZY)
    # ============================================================

    def _get_centroid_lock(self) -> asyncio.Lock:
        # Lazy para evitar problemas si se instancia fuera de un loop en ciertos entornos
        if self._centroid_lock is None:
            self._centroid_lock = asyncio.Lock()
        return self._centroid_lock

    # ============================================================
    #   CENTROID CACHE LOAD + SCHEDULER
    # ============================================================

    def _try_load_centroid_from_cache(self, spawn_if_missing: bool = True):
        """
        Intenta cargar el centroide desde caché de forma síncrona.
        Args:
            spawn_if_missing: Si es True, dispara un recálculo en background si no hay cache.
                              Si es False, solo carga o falla silenciosamente.
        """
        try:
            if not bool(getattr(settings, "enable_cache", True)):
                return

            cached = cache.get("rag:centroid")
            if cached and isinstance(cached, list):
                dim = int(getattr(settings, "default_embedding_dimension", 1536))
                if len(cached) != dim:
                    logger.warning(f"Centroide en caché con dimensión incorrecta ({len(cached)} vs {dim}).")
                    return

                arr = np.array(cached, dtype=np.float32)
                cleaned = self._clean_vector(arr)
                if cleaned is not None:
                    self._centroid_embedding = cleaned
                    logger.debug("[RAG] Centroide cargado desde cache")
                    return
                else:
                    logger.warning("Centroide en caché inválido (norma cero o corrupto).")
            elif cached:
                logger.warning("Centroide en caché tiene formato inválido (no es lista).")
        except Exception as e:
            logger.warning(f"Error cargando centroide de caché: {e}")

        if spawn_if_missing:
            self._schedule_centroid_recalc("cache_miss_on_load")

    def _schedule_centroid_recalc(self, reason: str):
        """
        Helper robusto para disparar recálculo.
        - Evita duplicados verificando Task en vuelo.
        - Actualiza timestamp SOLO si se agenda exitosamente.
        """
        if self._recalc_task and not self._recalc_task.done():
            return

        try:
            loop = asyncio.get_running_loop()
            self._recalc_task = loop.create_task(self._recalculate_centroid_logic())
            self._last_centroid_recalc_timestamp = time.time()
            logger.info(f"Recálculo de centroide disparado en background. Razón: {reason}")
        except RuntimeError:
            # No hay event loop corriendo: no tocamos timestamp para permitir reintento en path async.
            pass
        except Exception as e:
            logger.warning(f"Error agendando recálculo de centroide: {e}")

    def ensure_centroid(self) -> bool:
        """
        Método sync: intenta cargar desde caché; si falta, intenta agendar recálculo (si hay loop).
        """
        if self._centroid_embedding is not None:
            return True

        self._try_load_centroid_from_cache(spawn_if_missing=True)
        return self._centroid_embedding is not None

    # ============================================================
    #   SCORING HELPERS
    # ============================================================

    def _get_content_type_score(self, chunk_type: str) -> float:
        try:
            t = str(chunk_type or "text").lower()
            mapping = {
                "header": 1.0,
                "title": 0.95,
                "subtitle": 0.9,
                "paragraph": 0.8,
                "text": 0.75,
                "list": 0.7,
                "bullet": 0.7,
                "table": 0.6,
                "code": 0.5,
            }
            return float(mapping.get(t, 0.6))
        except Exception:
            return 0.6

    # ============================================================
    #   VECTOR CLEANER
    # ============================================================

    def _clean_vector(self, v: Any) -> Optional[np.ndarray]:
        """
        Normaliza y valida un vector proveniente de Qdrant o metadata.
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

    async def _embed_query_async(self, text: str) -> Optional[np.ndarray]:
        try:
            if not self.embedding_manager:
                return None
            emb = await asyncio.to_thread(self.embedding_manager.embed_query, text)
            return self._clean_vector(emb)
        except Exception:
            return None

    # ============================================================
    #   TRIVIAL QUERY
    # ============================================================

    def _is_trivial_query(self, q: str) -> Tuple[bool, str]:
        """Detecta queries triviales que no requieren RAG.
        
        Incluye: saludos, despedidas, agradecimientos, confirmaciones,
        y variantes comunes en español.
        """
        s = (q or "").strip().lower()
        
        # Set expandido con variantes comunes y errores tipográficos frecuentes
        small_talk = {
            # Saludos
            "hola", "hla", "ola", "hi", "hey", "buenos días", "buen dia", "buen día",
            "buenas tardes", "buenas noches", "buenas", "saludos",
            # Estado
            "como estás", "cómo estás", "como estas", "qué tal", "que tal",
            "todo bien", "bien y tú", "bien y tu",
            # Agradecimientos
            "gracias", "gracia", "grcias", "muchas gracias", "te agradezco",
            "thanks", "thx", "genial", "perfecto", "excelente",
            # Despedidas
            "adios", "adiós", "chao", "chau", "bye", "hasta luego",
            "hasta pronto", "nos vemos", "cuídate",
            # Confirmaciones
            "ok", "okey", "okay", "vale", "sí", "si", "no", "entendido",
            "de acuerdo", "claro", "listo",
            # Meta-preguntas
            "ayuda", "help", "quien eres", "quién eres", "como te llamas",
            "cómo te llamas", "qué puedes hacer", "que puedes hacer",
        }
        
        if s in small_talk:
            return (True, "small_talk")
        if len(s) < 3:
            return (True, "too_short")
        return (False, "")

    # ============================================================
    #   DOCUMENT RETRIEVAL
    # ============================================================

    @measure_time
    async def retrieve_documents(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        use_semantic_ranking: bool = True,
        use_mmr: bool = False
    ) -> List[Document]:
        start_time = time.perf_counter()
        query = query.strip() if query else ""

        # --- gating ---
        gating_reason, use_rag = await self.gating_async(query)
        self._last_gating_reason = gating_reason  # Exponer para debug info del Bot
        # Log consolidado de gating
        action = "usando RAG" if use_rag else "omitido"
        logger.info(f"[RAG] Gating: {action} | reason={gating_reason} q='{self._safe_query_for_log(query)}'")

        if not use_rag:
            return []

        # ====== Cache =======
        cache_start = time.perf_counter()
        if self.cache_enabled and bool(getattr(settings, "enable_cache", True)):
            try:
                cached_results = self._get_from_cache(query, k, filter_criteria, use_semantic_ranking, use_mmr)
                if cached_results:
                    self.performance_metrics.add_metric('cache_operations', time.perf_counter() - cache_start)
                    logger.debug(
                        f"[RAG][CACHE][HIT] q='{self._safe_query_for_log(query)}' "
                        f"k={k} sr={int(bool(use_semantic_ranking))} mmr={int(bool(use_mmr))} "
                        f"docs={len(cached_results)}"
                    )
                    # log de top docs (ya vienen con score si estaban serializados con metadata)
                    self._log_top_docs(cached_results, stage="cache", query=query, k=k)
                    return cached_results
                else:
                    logger.debug(
                        f"[RAG][CACHE][MISS] q='{self._safe_query_for_log(query)}' "
                        f"k={k} sr={int(bool(use_semantic_ranking))} mmr={int(bool(use_mmr))}"
                    )
            except Exception:
                pass

        # ====== VectorStore retrieve =======
        try:
            vector_start = time.perf_counter()

            # Traer más candidatos que k (para reranking / mmr)
            # Mantengo tu lógica original con cap a 20.
            initial_k = min(max(1, k) * int(getattr(settings, "retrieval_k_multiplier", 3)), 20)

            # OPTIMIZATION: Generar query embedding UNA sola vez para reutilizar en reranking/MMR
            # Esto evita llamadas duplicadas a la API de OpenAI Embeddings
            query_embedding: Optional[np.ndarray] = None
            need_vectors = bool(use_semantic_ranking or use_mmr)
            if need_vectors and self.embedding_manager:
                try:
                    query_embedding = await self._embed_query_async(query)
                except Exception as e:
                    logger.warning(f"[RAG] Failed to pre-compute query embedding: {e}")

            try:
                # Obtener threshold de settings (default 0.3)
                sim_threshold = float(getattr(settings, "similarity_threshold", 0.3))
                
                relevant_docs = await asyncio.wait_for(
                    self.vector_store.retrieve(
                        query,
                        k=initial_k,
                        filter=filter_criteria,
                        use_mmr=False,           # (tu pipeline aplica mmr/rerank aquí, no en VectorStore)
                        with_vectors=need_vectors,
                        score_threshold=sim_threshold,  # Filtrar documentos con score bajo
                    ),
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                relevant_docs = []
                logger.warning(f"[RAG][VECTOR] Timeout Qdrant retrieve (timeout=5s) q='{self._safe_query_for_log(query)}'")
            except Exception as e:
                relevant_docs = []
                logger.warning(f"[RAG][VECTOR] Error Qdrant retrieve: {e}")

            self.performance_metrics.add_metric('vector_retrieval', time.perf_counter() - vector_start)

            if not relevant_docs:
                logger.info(f"[RAG] 0 docs recuperados desde VectorStore | q='{self._safe_query_for_log(query)}'")
                return []

            # Logs de observabilidad (raw vector results)
            logger.debug(
                f"[RAG][VECTOR] q='{self._safe_query_for_log(query)}' "
                f"requested_k={k} initial_k={initial_k} got={len(relevant_docs)} "
                f"sr={int(bool(use_semantic_ranking))} mmr={int(bool(use_mmr))}"
            )
            self._log_score_distribution(relevant_docs, stage="raw_vector", query=query)
            self._log_top_docs(relevant_docs, stage="raw_vector", query=query, k=initial_k)

            if len(relevant_docs) <= k:
                # Aún así logueamos final
                self._log_top_docs(relevant_docs, stage="final", query=query, k=k)
                return relevant_docs

            # ====== Post-processing =======
            # OPTIMIZATION: Pasar query_embedding precalculado para evitar doble API call
            if use_semantic_ranking:
                rerank_start = time.perf_counter()
                reranked = await self._semantic_reranking(relevant_docs, query_embedding=query_embedding)
                self.performance_metrics.add_metric('semantic_reranking', time.perf_counter() - rerank_start)

                final_docs = reranked[:k]

                # Logs post-rerank
                self._log_score_distribution(reranked, stage="post_rerank", query=query)
                self._log_top_docs(final_docs, stage="final", query=query, k=k)

            elif use_mmr:
                mmr_start = time.perf_counter()
                final_docs = await self._apply_mmr(relevant_docs, k, query_embedding=query_embedding)
                self.performance_metrics.add_metric('mmr_application', time.perf_counter() - mmr_start)

                final_docs = final_docs[:k]
                self._log_top_docs(final_docs, stage="final", query=query, k=k)

            else:
                final_docs = relevant_docs[:k]
                self._log_top_docs(final_docs, stage="final", query=query, k=k)

            # ====== Cache store =======
            if self.cache_enabled and bool(getattr(settings, "enable_cache", True)):
                try:
                    cache_update = time.perf_counter()
                    self._add_to_cache(query, k, filter_criteria, final_docs, use_semantic_ranking, use_mmr)
                    self.performance_metrics.add_metric('cache_operations', time.perf_counter() - cache_update)
                    logger.debug(
                        f"[RAG][CACHE][SET] q='{self._safe_query_for_log(query)}' "
                        f"k={k} sr={int(bool(use_semantic_ranking))} mmr={int(bool(use_mmr))} "
                        f"docs={len(final_docs)}"
                    )
                except Exception:
                    pass

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
                    "page_number": (int(meta.get("page_number")) if isinstance(meta.get("page_number"), (int, float)) else None),
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
            return {"query": query, "k": k, "retrieved": [], "context": None, "timings": {}}

    # ============================================================
    #   SEMANTIC RERANKING & MMR
    # ============================================================

    async def _semantic_reranking(
        self,
        docs: List[Document],
        query_embedding: Optional[np.ndarray] = None
    ) -> List[Document]:
        """Reranking semántico usando embedding precalculado para evitar llamadas API duplicadas."""
        if not self.embedding_manager:
            return docs
        try:
            # OPTIMIZATION: Usar embedding precalculado si está disponible
            query_vec = query_embedding
            if query_vec is None:
                logger.debug("[RERANK] query_embedding no provisto, generando (fallback)")
                return docs  # Sin embedding, retornar sin reranking

            for doc in docs:
                if doc.metadata.get("vector") is None:
                    logger.warning("Documento sin vector durante semantic_reranking.")

            scored_docs = []
            for doc in docs:
                doc_embedding = doc.metadata.get("vector")
                semantic_score = 0.0
                if doc_embedding is not None:
                    doc_vec = self._clean_vector(doc_embedding)
                    if doc_vec is not None:
                        semantic_score = float(np.dot(query_vec, doc_vec))

                quality_score = float(doc.metadata.get('quality_score', 0.5))
                length_score = min(len(doc.page_content.split()) / 100, 1.0)
                content_type_score = self._get_content_type_score(doc.metadata.get('chunk_type', 'text'))
                pdf_priority = 1.5 if str(doc.metadata.get("source", "")).lower().endswith(".pdf") else 1.0

                final_score = (
                    semantic_score * 0.5 +
                    quality_score * 0.35 +
                    length_score * 0.1 +
                    content_type_score * 0.05
                ) * pdf_priority

                doc.metadata["score"] = final_score
                scored_docs.append((doc, final_score))

            return [doc for doc, _ in sorted(scored_docs, key=lambda x: x[1], reverse=True)]
        except Exception as e:
            logger.error(f"Error en reranking semántico: {e}")
            return docs

    async def _apply_mmr(
        self,
        docs: List[Document],
        k: int,
        query_embedding: Optional[np.ndarray] = None,
        lambda_mult: float = 0.5
    ) -> List[Document]:
        """MMR usando embedding precalculado para evitar llamadas API duplicadas."""
        if not self.embedding_manager:
            return docs[:k]
        try:
            # OPTIMIZATION: Usar embedding precalculado si está disponible
            query_vec = query_embedding
            if query_vec is None:
                logger.debug("[MMR] query_embedding no provisto, retornando top-k simple")
                return docs[:k]

            candidate_indices = []
            doc_embeddings = {}

            for idx, doc in enumerate(docs):
                emb = doc.metadata.get("vector")
                if emb is None:
                    continue
                cleaned = self._clean_vector(emb)
                if cleaned is None:
                    continue
                doc_embeddings[idx] = cleaned
                candidate_indices.append(idx)

            if not candidate_indices:
                return docs[:k]

            selected_indices = []
            remaining = candidate_indices.copy()

            for _ in range(min(k, len(docs))):
                mmr_scores = []
                for idx in remaining:
                    relevance = float(np.dot(query_vec, doc_embeddings[idx]))
                    if selected_indices:
                        selected_embeds = [doc_embeddings[i] for i in selected_indices]
                        similarities = [float(np.dot(doc_embeddings[idx], s)) for s in selected_embeds]
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
        for t in ["header", "paragraph", "numbered_list", "bullet_list", "text"]:
            if t in grouped:
                parts.extend([d.page_content.strip() for d in grouped[t]])
                parts.append("")
        return "\n\n".join(filter(None, parts))

    def _group_documents_by_type(self, documents: List[Document]) -> Dict[str, List[Document]]:
        grouped: Dict[str, List[Document]] = {}
        for doc in documents:
            t = doc.metadata.get("chunk_type", "text")
            grouped.setdefault(t, []).append(doc)
        return grouped

    # ============================================================
    #   PREMIUM GATING: CENTROID RECALC (FIXED + LOCKED)
    # ============================================================

    async def _recalculate_centroid_logic(self) -> bool:
        """
        Calcula el centroide usando Streaming Mean.
        FIXES:
        - Protegido con Lock async (evita 2 recalcs simultáneos incluso si llaman trigger/warmup a la vez).
        - Actualiza _last_total_points_count con COUNT real de Qdrant al final (alineado con gating_async).
        """
        lock = self._get_centroid_lock()
        async with lock:
            try:
                client = getattr(self.vector_store, "client", None)
                if client is None:
                    return False

                limit = 1000
                next_offset = None
                sum_vector: Optional[np.ndarray] = None
                valid_vectors_count: int = 0

                while True:
                    try:
                        res = await asyncio.to_thread(
                            client.scroll,
                            collection_name=self.vector_store.collection_name,
                            limit=limit,
                            offset=next_offset,
                            with_payload=True,
                            with_vectors=True,
                        )

                        points = getattr(res, "points", None)
                        next_offset = getattr(res, "next_page_offset", None)
                        if points is None and isinstance(res, tuple) and len(res) == 2:
                            points, next_offset = res

                        if not points:
                            break

                        for p in points:
                            emb = self._clean_vector(getattr(p, "vector", None))
                            if emb is None:
                                vs = getattr(p, "vectors", None)
                                if isinstance(vs, dict) and vs:
                                    try:
                                        emb = self._clean_vector(next(iter(vs.values())))
                                    except Exception:
                                        emb = None

                            if emb is None:
                                continue

                            if sum_vector is None:
                                try:
                                    sum_vector = np.zeros_like(emb, dtype=np.float32)
                                except Exception:
                                    continue

                            try:
                                sum_vector += emb.astype(np.float32)
                                valid_vectors_count += 1
                            except Exception:
                                pass

                        if not next_offset:
                            break

                    except Exception as e:
                        logger.warning(f"Error scroll streaming centroide: {e}")
                        break

                if sum_vector is None or valid_vectors_count == 0:
                    logger.info("No embeddings válidos disponibles para centroide.")
                    return False

                centroid = sum_vector / float(valid_vectors_count)
                norm = np.linalg.norm(centroid)
                if norm == 0:
                    return False

                self._centroid_embedding = (centroid / norm).astype(np.float32)

                # Alinear con gating_async: guardar COUNT total real
                try:
                    c = await asyncio.to_thread(client.count, collection_name=self.vector_store.collection_name)
                    self._last_total_points_count = int(getattr(c, "count", 0))
                    self._last_corpus_size_check_time = time.time()
                except Exception:
                    pass

                try:
                    if bool(getattr(settings, "enable_cache", True)):
                        cache.set("rag:centroid", self._centroid_embedding.tolist())
                except Exception:
                    pass

                logger.info(
                    f"Centroide recalculado. Valid Vectors: {valid_vectors_count}. "
                    f"Total Qdrant Points: {self._last_total_points_count}"
                )
                return True

            except asyncio.CancelledError:
                # Si cancelamos por reset_centroid(), salimos limpio
                logger.info("Recalculo de centroide cancelado.")
                return False
            except Exception as e:
                logger.warning(f"Error _recalculate_centroid_logic: {e}")
                return False

    # ============================================================
    #   GATING (SYNC + ASYNC)
    # ============================================================

    def should_use_rag(self, query: str) -> bool:
        """Compatibilidad: NO bloquear event loop. En async usar gating_async()."""
        try:
            try:
                asyncio.get_running_loop()
                logger.warning("should_use_rag() llamado dentro de un event loop; usar gating_async().")
                return True
            except RuntimeError:
                return self.gating(query)[1]
        except Exception:
            return True

    def gating(self, query: str) -> Tuple[str, bool]:
        """
        Sistema de gating Ruta B (Síncrono/Legacy).
        NO hace llamadas de red. Usa memoria local.
        """
        try:
            q = (query or "").strip()
            self.ensure_centroid()  # intenta cache + schedule si hay loop

            corpus_size = self._last_total_points_count
            q_vec = None  # legacy sync: no embebemos para no bloquear

            return self._evaluate_gating_logic(q, q_vec, corpus_size)
        except Exception as e:
            logger.warning(f"Error gating: {e}")
            return ("error", True)

    async def gating_async(self, query: str) -> Tuple[str, bool]:
        """
        Versión async de gating. Orquestador principal de recálculos.
        """
        try:
            q = (query or "").strip()
            # Log de inicio removido - consolidado en FINAL

            # 1) Carga rápida (sin spawnear)
            self._try_load_centroid_from_cache(spawn_if_missing=False)

            # 2) Verificar invalidación por tamaño (TOTAL vs TOTAL)
            current_total_points = None
            try:
                now = time.time()
                if (now - self._last_corpus_size_check_time) < float(self._corpus_size_cache_ttl):
                    current_total_points = self._last_total_points_count
                else:
                    c = await asyncio.to_thread(self.vector_store.client.count, collection_name=self.vector_store.collection_name)
                    new_count = int(getattr(c, "count", 0))

                    if new_count is not None and self._last_total_points_count is not None and new_count != self._last_total_points_count:
                        self._centroid_embedding = None
                        logger.info(
                            f"Corpus size changed ({self._last_total_points_count} -> {new_count}). "
                            f"Invalidating centroid."
                        )
                        self._schedule_centroid_recalc("corpus_size_changed")

                    self._last_total_points_count = new_count
                    self._last_corpus_size_check_time = now
                    current_total_points = new_count
            except Exception:
                pass

            # 3) Si falta centroide, agendar (task-check evita spam)
            if self._centroid_embedding is None:
                self._schedule_centroid_recalc("missing_centroid_async")

            # 4) Embedding query
            q_vec = None
            try:
                if self.embedding_manager:
                    q_vec = await self._embed_query_async(q)
            except Exception:
                pass

            reason, use = self._evaluate_gating_logic(q, q_vec, current_total_points)
            return (reason, use)

        except Exception as e:
            logger.warning(f"Error gating_async: {e}")
            return ("error", True)

    def _evaluate_gating_logic(self, query: str, query_vec: Optional[np.ndarray], corpus_size: Optional[int]) -> Tuple[str, bool]:
        """
        Lógica pura de gating sin I/O.
        """
        try:
            q = (query or "").strip()

            is_trivial, trivial_reason = self._is_trivial_query(q)
            if is_trivial:
                return (trivial_reason, False)

            interrogatives = ("qué", "como", "cómo", "donde", "dónde", "cuando", "cuándo", "por qué", "para qué", "puedo", "quiero", "necesito")
            has_interrogative = any(w in q.lower() for w in interrogatives) or ("?" in q)
            tokens = [t for t in q.lower().split() if t]

            if not has_interrogative and len(tokens) <= self._MIN_TOKENS_FOR_INTENT:
                return ("low_intent", False)

            if corpus_size is not None and corpus_size < self._SMALL_CORPUS_THRESHOLD:
                use_small = bool(has_interrogative or len(tokens) >= self._MIN_TOKENS_FOR_FALLBACK)
                return ("small_corpus", use_small)

            if not self.embedding_manager:
                return ("no_embedder_fail_open", True)

            c_vec = self._centroid_embedding
            if not isinstance(c_vec, np.ndarray) or c_vec.size == 0:
                return ("no_centroid", True)

            if query_vec is None:
                if corpus_size is None:
                    use_unknown = bool(has_interrogative or len(tokens) >= self._MIN_TOKENS_FOR_FALLBACK)
                    return ("no_vector_unknown_corpus", use_unknown)

                if 0 <= corpus_size < self._MEDIUM_CORPUS_THRESHOLD:
                    return ("no_vector_small_corpus", True)

                return ("no_vector_fail_closed", False)

            sim = float(np.dot(query_vec, c_vec))
            use = bool(sim >= self._gating_threshold)
            reason = "semantic_match" if use else "low_similarity"
            logger.info(f"Gating: similitud={sim:.4f}, threshold={self._gating_threshold:.4f}, reason={reason}")
            return (reason, use)

        except Exception as e:
            logger.warning(f"Error _evaluate_gating_logic: {e}")
            return ("error", True)

    # ============================================================
    #   CACHE
    # ============================================================

    def _get_from_cache(
        self,
        query: str,
        k: int,
        filter_criteria: Optional[Dict[str, Any]],
        use_semantic_ranking: bool,
        use_mmr: bool
    ) -> Optional[List[Document]]:
        try:
            if not bool(getattr(settings, "enable_cache", True)) or not self.cache_enabled:
                return None

            try:
                filter_key = json.dumps(filter_criteria, sort_keys=True) if filter_criteria else ""
            except Exception:
                filter_key = str(filter_criteria or "")

            query_norm = query.strip().lower()
            cache_key = f"rag:{query_norm}:sr={int(bool(use_semantic_ranking))}:mmr={int(bool(use_mmr))}:{k}:{filter_key}"
            cached = cache.get(cache_key)
            if not cached:
                return None

            docs: List[Document] = []
            for item in cached:
                try:
                    docs.append(Document(page_content=item["page_content"], metadata=item["metadata"]))
                except Exception:
                    pass
            return docs
        except Exception:
            return None

    def _add_to_cache(
        self,
        query: str,
        k: int,
        filter_criteria: Optional[Dict[str, Any]],
        docs: List[Document],
        use_semantic_ranking: bool,
        use_mmr: bool
    ):
        try:
            if not bool(getattr(settings, "enable_cache", True)) or not self.cache_enabled:
                return

            try:
                filter_key = json.dumps(filter_criteria, sort_keys=True) if filter_criteria else ""
            except Exception:
                filter_key = str(filter_criteria or "")

            query_norm = query.strip().lower()
            cache_key = f"rag:{query_norm}:sr={int(bool(use_semantic_ranking))}:mmr={int(bool(use_mmr))}:{k}:{filter_key}"

            serialized_docs = []
            for d in docs:
                meta = dict(d.metadata or {})
                for heavy_key in ("vector", "vectors", "embedding", "embeddings"):
                    if heavy_key in meta:
                        del meta[heavy_key]
                serialized_docs.append({"page_content": d.page_content, "metadata": meta})

            cache.set(cache_key, serialized_docs)
        except Exception as e:
            logger.warning(f"Cache update error: {e}")

    def invalidate_rag_cache(self) -> None:
        try:
            if bool(getattr(settings, "enable_cache", True)):
                cache.invalidate_prefix("rag:")
            self.reset_centroid()
        except Exception:
            pass

    # ============================================================
    #   RESET / WARMUP / TRIGGER (FIXED)
    # ============================================================

    def reset_centroid(self) -> None:
        """
        FIX CRÍTICO:
        - Limpia el centroide
        - Cancela task de recálculo en vuelo (evita que escriba un centroide "viejo" después del reset)
        - Libera el slot para poder re-agendar
        """
        self._centroid_embedding = None

        t = self._recalc_task
        if t and not t.done():
            try:
                t.cancel()
            except Exception:
                pass
        self._recalc_task = None

    async def trigger_centroid_update(self) -> bool:
        """
        Fuerza recálculo y espera a que termine (protegido por lock).
        """
        # Si ya hay task corriendo por schedule, esperamos esa (no lanzamos doble)
        if self._recalc_task and not self._recalc_task.done():
            try:
                return bool(await self._recalc_task)
            except Exception:
                return False
        return await self._recalculate_centroid_logic()

    async def warmup(self):
        """
        Arranque: intenta cache; si no existe, recalcula y ESPERA su finalización.
        """
        try:
            self._try_load_centroid_from_cache(spawn_if_missing=False)
            if not isinstance(self._centroid_embedding, np.ndarray) or self._centroid_embedding.size == 0:
                await self.trigger_centroid_update()
        except Exception as e:
            logger.warning(f"Warmup error: {e}")
