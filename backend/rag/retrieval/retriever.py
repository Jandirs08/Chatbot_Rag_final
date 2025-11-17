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
        """Agrega una métrica de tiempo para una operación."""
        if operation in self.metrics:
            self.metrics[operation].append(time_taken)
    
    def get_statistics(self) -> Dict[str, Dict[str, float]]:
        """Obtiene estadísticas de todas las métricas."""
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
        """Registra las estadísticas en el log."""
        stats = self.get_statistics()
        logger.info("Estadísticas de rendimiento:")
        for operation, metrics in stats.items():
            logger.info(f"{operation}:")
            for metric, value in metrics.items():
                logger.info(f"  {metric}: {value:.3f}s" if metric != 'count' else f"  {metric}: {value}")

class RAGRetriever:
    """Retriever optimizado para RAG con reranking y filtrado avanzado."""

    def __init__(
        self,
        vector_store: VectorStore,
        embedding_manager: Optional[Any] = None,
        cache_enabled: bool = True
    ):
        """Inicializa el RAGRetriever.
        
        Args:
            vector_store: Instancia configurada de VectorStore.
            embedding_manager: Instancia opcional de EmbeddingManager.
            cache_enabled: Si se debe habilitar el caché de resultados.
        """
        self.vector_store = vector_store
        self.embedding_manager = embedding_manager
        self.cache_enabled = cache_enabled
        # Cache unificado: toda lectura/escritura pasa por CacheManager
        self.performance_metrics = PerformanceMetrics()
        # Centroide cacheado para gating de RAG (lazy-load)
        self._centroid_embedding: Optional[np.ndarray] = None
        # Umbral de similitud para gating (configurable vía settings, default 0.45)
        try:
            self._gating_threshold: float = float(getattr(settings, "rag_gating_similarity_threshold", 0.20))
        except Exception:
            self._gating_threshold = 0.45
        logger.info("RAGRetriever inicializado con optimizaciones y monitoreo de rendimiento.")

    @measure_time
    async def retrieve_documents(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        use_semantic_ranking: bool = True
    ) -> List[Document]:
        """Recupera y reordena documentos relevantes con monitoreo de rendimiento."""
        start_time = time.perf_counter()
        
        # Validación de entrada y optimización para consultas triviales
        query = query.strip() if query else ""
        
        # Lista de consultas triviales que no necesitan RAG
        trivial_queries = [
            "hola", "buenos días", "buenas tardes", "buenas noches", 
            "como estás", "qué tal", "gracias", "adios", "hasta luego",
            "ayuda", "quien eres", "como te llamas"
        ]
        
        # Verificar si la consulta es trivial o demasiado corta
        if query.lower() in trivial_queries or len(query) < 5:
            logger.info(f"Consulta trivial o corta: '{query}'. Omitiendo recuperación RAG.")
            return []
            
        logger.info(f"Buscando documentos para: '{query}' (k={k})")
        
        # Verificar caché con manejo mejorado de errores
        cache_start = time.perf_counter()
        if self.cache_enabled and bool(getattr(settings, "enable_cache", True)):
            try:
                cached_results = self._get_from_cache(query, k, filter_criteria)
                if cached_results:
                    cache_time = time.perf_counter() - cache_start
                    self.performance_metrics.add_metric('cache_operations', cache_time)
                    logger.info("Resultados recuperados desde caché")
                    return cached_results
            except Exception as e:
                logger.warning(f"Error al acceder al caché: {e}. Continuando sin caché.")
        
        try:
            # Recuperación de vectores con timeout
            vector_start = time.perf_counter()
            initial_k = min(k * settings.retrieval_k_multiplier, 20)  # Limitar para evitar sobrecarga
            
            # Añadir timeout para evitar bloqueos largos
            try:
                # Importante: desactivar MMR en el VectorStore para evitar
                # cálculos de embeddings por documento allí. Recuperamos por
                # similitud directa y aplicamos reranking/MMR aquí con batching.
                relevant_docs = await asyncio.wait_for(
                    self.vector_store.retrieve(
                        query,
                        k=initial_k,
                        filter=filter_criteria,
                        use_mmr=False
                    ),
                    timeout=5.0  # Timeout de 5 segundos máximo
                )
            except asyncio.TimeoutError:
                logger.warning("Timeout en recuperación de vectores, continuando con lo obtenido hasta ahora")
                relevant_docs = []
            except Exception as e:
                logger.error(f"Error en vector_store.retrieve: {str(e)}")
                relevant_docs = []
                
            vector_time = time.perf_counter() - vector_start
            self.performance_metrics.add_metric('vector_retrieval', vector_time)

            if not relevant_docs:
                logger.info("No se encontraron documentos relevantes")
                return []

            # Si tenemos menos o igual número de documentos que k, no es necesario reordenarlos
            if len(relevant_docs) <= k:
                logger.info(f"Se encontraron solo {len(relevant_docs)} documentos, omitiendo reranking")
                return relevant_docs

            # Reranking optimizado
            final_docs = []
            if use_semantic_ranking and len(relevant_docs) > k:
                rerank_start = time.perf_counter()
                reranked_docs = await self._semantic_reranking(query, relevant_docs)
                rerank_time = time.perf_counter() - rerank_start
                self.performance_metrics.add_metric('semantic_reranking', rerank_time)
                final_docs = reranked_docs[:k]
            else:
                # Si no usamos reranking semántico o hay pocos documentos, usar MMR
                mmr_start = time.perf_counter()
                final_docs = await self._apply_mmr(query, relevant_docs, k)
                mmr_time = time.perf_counter() - mmr_start
                self.performance_metrics.add_metric('mmr_application', mmr_time)

            # Actualizar caché con manejo de errores
            if self.cache_enabled and bool(getattr(settings, "enable_cache", True)) and final_docs:
                try:
                    cache_update_start = time.perf_counter()
                    self._add_to_cache(query, k, filter_criteria, final_docs)
                    cache_update_time = time.perf_counter() - cache_update_start
                    self.performance_metrics.add_metric('cache_operations', cache_update_time)
                except Exception as e:
                    logger.warning(f"Error al actualizar caché: {e}")

            total_time = time.perf_counter() - start_time
            self.performance_metrics.add_metric('total_time', total_time)
            
            # Registrar estadísticas cada 5 consultas en lugar de 10
            if len(self.performance_metrics.metrics['total_time']) % 5 == 0:
                self.performance_metrics.log_statistics()

            logger.info(f"Recuperados {len(final_docs)} documentos después de reranking")
            return final_docs

        except Exception as e:
            logger.error(f"Error en recuperación: {str(e)}", exc_info=True)
            return []

    async def retrieve_with_trace(
        self,
        query: str,
        k: int = 4,
        filter_criteria: Optional[Dict[str, Any]] = None,
        include_context: bool = True,
    ) -> Dict[str, Any]:
        """Recupera documentos y construye una traza auditable.

        Args:
            query: Consulta del usuario.
            k: Número de documentos objetivo.
            filter_criteria: Filtros opcionales para el vector store.
            include_context: Si debe incluirse el contexto formateado.

        Returns:
            Diccionario con `query`, `k`, `retrieved` (lista con metadatos clave),
            `context` (opcional) y `timings` con estadísticas de rendimiento.
        """
        try:
            docs = await self.retrieve_documents(
                query=query,
                k=k,
                filter_criteria=filter_criteria,
                use_semantic_ranking=True,
            )

            items: List[Dict[str, Any]] = []
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

            context_str: Optional[str] = None
            if include_context:
                context_str = self.format_context_from_documents(docs)

            timings = self.performance_metrics.get_statistics()

            return {
                "query": query,
                "k": k,
                "retrieved": items,
                "context": context_str,
                "timings": timings,
            }
        except Exception as e:
            logger.error(f"Error construyendo traza de recuperación: {str(e)}", exc_info=True)
            # Fallo seguro: devolver estructura vacía manteniendo contrato
            return {
                "query": query,
                "k": k,
                "retrieved": [],
                "context": None if include_context else None,
                "timings": {},
            }

    async def _semantic_reranking(self, query: str, docs: List[Document]) -> List[Document]:
        """Reordena documentos usando múltiples criterios semánticos.
        
        Args:
            query: Consulta original.
            docs: Documentos a reordenar.
            
        Returns:
            Documentos reordenados por relevancia.
        """
        if not self.embedding_manager:
            logger.warning("EmbeddingManager no disponible para reranking semántico")
            return docs

        try:
            # Generar embedding de la consulta
            query_embedding = self.embedding_manager.embed_query(query)

            # Preparar un único batch de textos sin embedding
            texts_to_embed = []
            missing_indices = []
            for idx, doc in enumerate(docs):
                if doc.metadata.get("embedding") is None:
                    texts_to_embed.append(doc.page_content)
                    missing_indices.append(idx)

            if texts_to_embed:
                logger.debug(f"Reranking: calculando embeddings por lote para {len(texts_to_embed)} documentos")
                batch_embeddings = self.embedding_manager.embed_documents(texts_to_embed)
                for pos, emb in enumerate(batch_embeddings):
                    # Guardar embedding en los metadatos para futuras consultas/caché
                    docs[missing_indices[pos]].metadata["embedding"] = emb

            # Calcular scores para cada documento
            scored_docs = []
            for doc in docs:
                # 1. Score de similitud semántica
                doc_embedding = doc.metadata.get("embedding")
                semantic_score = 0.0
                if doc_embedding is not None:
                    semantic_score = float(cosine_similarity([query_embedding], [doc_embedding])[0][0])

                # 2. Score de calidad del chunk
                quality_score = float(doc.metadata.get('quality_score', 0.5))

                # 3. Score por longitud relevante
                length_score = min(len(doc.page_content.split()) / 100, 1.0)

                # 4. Score por tipo de contenido
                content_type_score = self._get_content_type_score(doc.metadata.get('chunk_type', 'text'))

                # 5. Factor de prioridad para PDFs
                pdf_priority_factor = 1.0
                source_path = doc.metadata.get('source', '')
                if source_path and source_path.lower().endswith('.pdf'):
                    pdf_priority_factor = 1.5

                # Combinar scores con pesos
                final_score = (
                    semantic_score * 0.5 +
                    quality_score * 0.35 +
                    length_score * 0.1 +
                    content_type_score * 0.05
                ) * pdf_priority_factor

                scored_docs.append((doc, final_score))

            # Ordenar por score final
            reranked = [doc for doc, _ in sorted(scored_docs, key=lambda x: x[1], reverse=True)]
            return reranked

        except Exception as e:
            logger.error(f"Error en reranking semántico: {str(e)}", exc_info=True)
            return docs

    async def _apply_mmr(
        self,
        query: str,
        docs: List[Document],
        k: int,
        lambda_mult: float = 0.5
    ) -> List[Document]:
        """Aplica Maximum Marginal Relevance para diversidad.
        
        Args:
            query: Consulta original.
            docs: Documentos candidatos.
            k: Número de documentos a seleccionar.
            lambda_mult: Balance entre relevancia y diversidad.
            
        Returns:
            Documentos seleccionados con MMR.
        """
        if not self.embedding_manager:
            return docs[:k]

        try:
            # Obtener embeddings
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
                logger.debug(f"MMR: calculando embeddings por lote para {len(texts_to_embed)} documentos")
                batch_embeddings = self.embedding_manager.embed_documents(texts_to_embed)
                for pos, emb in enumerate(batch_embeddings):
                    doc_idx = missing_indices[pos]
                    docs[doc_idx].metadata["embedding"] = emb
                    doc_embeddings[doc_idx] = emb

            # Inicializar selección MMR
            selected_indices = []
            remaining_indices = list(range(len(docs)))

            for _ in range(min(k, len(docs))):
                if not remaining_indices:
                    break

                # Calcular scores MMR
                mmr_scores = []
                for idx in remaining_indices:
                    # Relevancia con la consulta
                    relevance = float(cosine_similarity([query_embedding], [doc_embeddings[idx]])[0][0])
                    
                    # Diversidad respecto a documentos seleccionados
                    if selected_indices:
                        selected_embeddings = [doc_embeddings[i] for i in selected_indices]
                        similarities = cosine_similarity([doc_embeddings[idx]], selected_embeddings)[0]
                        diversity = 1 - max(similarities)
                    else:
                        diversity = 1.0

                    # Combinar con lambda
                    mmr_score = lambda_mult * relevance + (1 - lambda_mult) * diversity
                    mmr_scores.append((idx, mmr_score))

                # Seleccionar documento con mayor score MMR
                selected_idx = max(mmr_scores, key=lambda x: x[1])[0]
                selected_indices.append(selected_idx)
                remaining_indices.remove(selected_idx)

            # Devolver documentos en orden MMR
            return [docs[i] for i in selected_indices]

        except Exception as e:
            logger.error(f"Error aplicando MMR: {str(e)}", exc_info=True)
            return docs[:k]

    def _get_content_type_score(self, content_type: str) -> float:
        """Asigna scores según el tipo de contenido."""
        type_scores = {
            "header": 1.0,
            "paragraph": 0.8,
            "numbered_list": 0.7,
            "bullet_list": 0.7,
            "text": 0.6
        }
        return type_scores.get(content_type, 0.5)

    def _get_from_cache(self, query: str, k: int, filter_criteria: Optional[Dict[str, Any]] = None) -> Optional[List[Document]]:
        """Obtiene resultados del caché usando CacheManager (TTL manejado globalmente)."""
        try:
            if not bool(getattr(settings, "enable_cache", True)) or not self.cache_enabled:
                return None
            try:
                filter_key = json.dumps(filter_criteria, sort_keys=True) if filter_criteria else ""
            except Exception:
                filter_key = str(filter_criteria) if filter_criteria is not None else ""
            cache_key = f"rag:{query}:{k}:{filter_key}"
            cached = cache.get(cache_key)
            return cached if cached else None
        except Exception as e:
            logger.warning(f"Error al acceder al caché: {e}")
            return None

    def _add_to_cache(self, query: str, k: int, filter_criteria: Optional[Dict[str, Any]], docs: List[Document]) -> None:
        """Agrega resultados al caché usando CacheManager (TTL/tamaño controlado globalmente)."""
        try:
            if not bool(getattr(settings, "enable_cache", True)) or not self.cache_enabled:
                return
            try:
                filter_key = json.dumps(filter_criteria, sort_keys=True) if filter_criteria else ""
            except Exception:
                filter_key = str(filter_criteria) if filter_criteria is not None else ""
            cache_key = f"rag:{query}:{k}:{filter_key}"
            import collections.abc
            if isinstance(docs, collections.abc.Awaitable):
                logger.warning("Intento de almacenar una coroutine en caché, ignorado.")
                return
            cache.set(cache_key, docs)
        except Exception as e:
            logger.warning(f"Error al actualizar caché: {e}")

    def invalidate_rag_cache(self) -> None:
        """Invalidación por prefijo para resultados RAG."""
        try:
            if bool(getattr(settings, "enable_cache", True)):
                cache.invalidate_prefix("rag:")
        except Exception as e:
            logger.warning(f"Error invalidando caché RAG: {e}")

    def format_context_from_documents(self, documents: List[Document]) -> str:
        """Formatea los documentos en un contexto coherente."""
        if not documents:
            return "No se encontró información relevante en los documentos consultados para esta pregunta."
            
        logger.info(f"Formateando {len(documents)} documentos como contexto")
        
        # Agrupar por tipo de contenido
        grouped_docs = self._group_documents_by_type(documents)
        
        # Construir contexto estructurado
        context_parts = ["Información relevante encontrada:"]
        
        # Primero los encabezados
        if "header" in grouped_docs:
            context_parts.extend([
                f"## {doc.page_content.strip()}"
                for doc in grouped_docs["header"]
            ])
            context_parts.append("")  # Separador
        
        # Luego párrafos principales
        if "paragraph" in grouped_docs:
            context_parts.extend([
                doc.page_content.strip()
                for doc in grouped_docs["paragraph"]
            ])
            context_parts.append("")  # Separador
        
        # Listas numeradas y con viñetas
        for list_type in ["numbered_list", "bullet_list"]:
            if list_type in grouped_docs:
                context_parts.extend([
                    doc.page_content.strip()
                    for doc in grouped_docs[list_type]
                ])
                context_parts.append("")  # Separador
        
        # Resto del contenido
        if "text" in grouped_docs:
            context_parts.extend([
                doc.page_content.strip()
                for doc in grouped_docs["text"]
            ])
        
        # Unir todo con formato apropiado
        context = "\n\n".join(filter(None, context_parts))
        
        logger.info(f"Contexto formateado ({len(context)} caracteres)")
        return context.strip()

    def _group_documents_by_type(self, documents: List[Document]) -> Dict[str, List[Document]]:
        """Agrupa documentos por su tipo de contenido."""
        grouped = {}
        for doc in documents:
            doc_type = doc.metadata.get('chunk_type', 'text')
            if doc_type not in grouped:
                grouped[doc_type] = []
            grouped[doc_type].append(doc)
        return grouped

    # =============================================================
    #   PREMIUM GATING: should_use_rag(query)
    # =============================================================
    def _ensure_centroid(self) -> bool:
        """Calcula y cachea el centroide de embeddings una sola vez.

        Retorna True si el centroide está disponible, False en caso contrario.
        """
        try:
            if isinstance(self._centroid_embedding, np.ndarray) and self._centroid_embedding.size > 0:
                return True

            client = getattr(self.vector_store, "client", None)
            if client is None:
                logger.warning("VectorStore client no disponible para calcular centroide")
                return False

            embeddings: List[np.ndarray] = []

            # Usar scroll para obtener embeddings en lotes
            limit = 1000
            next_offset = None
            while True:
                try:
                    # Qdrant puede devolver ScrollResponse o tupla según versión
                    res = client.scroll(
                        collection_name="rag_collection",
                        limit=limit,
                        offset=next_offset,
                        with_payload=True,
                        with_vectors=True
                    )
                    points = getattr(res, "points", None)
                    next_offset = getattr(res, "next_page_offset", None)
                    if points is None and isinstance(res, tuple) and len(res) == 2:
                        points, next_offset = res
                    if not points:
                        break

                    for p in points:
                        try:
                            payload = getattr(p, "payload", {}) or {}
                            emb = None

                            # Intentar varias claves en payload
                            for key in ("embedding", "vector", "text_vector"):
                                val = payload.get(key)
                                if val is not None:
                                    try:
                                        if isinstance(val, np.ndarray):
                                            emb = val.astype(np.float32)
                                        else:
                                            emb = np.array(val, dtype=np.float32)
                                        break
                                    except Exception:
                                        emb = None

                            # Si no está en payload, intentar campo nativo de Qdrant
                            if emb is None:
                                try:
                                    val = getattr(p, "vector", None)
                                    if val is not None:
                                        emb = np.array(val, dtype=np.float32)
                                except Exception:
                                    emb = None

                            # Último intento: estructura de vectores nombrados
                            if emb is None:
                                try:
                                    vs = getattr(p, "vectors", None)
                                    if isinstance(vs, dict) and vs:
                                        first = next(iter(vs.values()))
                                        emb = np.array(first, dtype=np.float32)
                                except Exception:
                                    emb = None

                            # Validar y agregar
                            if isinstance(emb, np.ndarray) and emb.size > 0:
                                # Opcional: validar dimensión
                                dim = int(getattr(settings, "default_embedding_dimension", 1536))
                                if emb.ndim != 1:
                                    try:
                                        emb = emb.reshape(-1)
                                    except Exception:
                                        continue
                                if emb.size == dim:
                                    embeddings.append(emb)
                        except Exception:
                            continue

                    if not next_offset:
                        break
                except Exception as e:
                    logger.warning(f"Error haciendo scroll en Qdrant para centroide: {e}")
                    break

            if not embeddings:
                logger.info("No hay embeddings disponibles en el vector store para calcular centroide")
                return False

            try:
                mat = np.vstack(embeddings)
                centroid = mat.mean(axis=0)
                self._centroid_embedding = centroid
                logger.info("Centroide de documentos calculado y cacheado para gating")
                return True
            except Exception as e:
                logger.warning(f"Error calculando centroide: {e}")
                return False
        except Exception as e:
            logger.warning(f"Fallo en _ensure_centroid: {e}")
            return False

    def should_use_rag(self, query: str) -> bool:
        """Decide si activar RAG comparando similitud(query, centroide).

        - Usa `embedding_manager.embed_query` para obtener el embedding de la query.
        - Calcula/usa el centroide de embeddings de documentos y cachea el resultado.
        - Retorna True si la similitud coseno >= umbral; en caso contrario False.
        - Diseño seguro: si faltan recursos (sin embeddings, sin centroide), retorna False para evitar RAG innecesario.
        """
        try:
            q = (query or "").strip()
            if len(q) < 1:
                return False

            if not self.embedding_manager:
                logger.warning("EmbeddingManager no disponible; gating retorna False")
                return False

            # Calcular centroide (lazy)
            if not self._ensure_centroid():
                # Si no hay centroide (p.ej., sin documentos), mejor no activar RAG
                return False

            # Embedding de la query (sincrónico y rápido)
            q_emb = self.embedding_manager.embed_query(q)
            q_vec = np.array(q_emb, dtype=np.float32)
            c_vec = self._centroid_embedding

            if not isinstance(c_vec, np.ndarray) or c_vec.size == 0:
                return False

            # Alinear dimensiones si hiciera falta
            if q_vec.ndim == 1:
                q_vec = q_vec.reshape(1, -1)
            if c_vec.ndim == 1:
                c_vec = c_vec.reshape(1, -1)

            try:
                sim = float(cosine_similarity(q_vec, c_vec)[0][0])
            except Exception:
                # Normalización manual como fallback
                qn = q_vec / (np.linalg.norm(q_vec) + 1e-8)
                cn = c_vec / (np.linalg.norm(c_vec) + 1e-8)
                sim = float(np.dot(qn.flatten(), cn.flatten()))

            logger.debug(f"Gating similitud centroide={sim:.4f} (umbral={self._gating_threshold})")
            return sim >= self._gating_threshold
        except Exception as e:
            logger.warning(f"Error en should_use_rag: {e}")
            return False

    # El método clear() original tenía lógica para el vector store y el directorio de PDFs.
    # La limpieza del vector store ahora debe ser manejada por RAGIngestor.
    # RAGRetriever en sí mismo no mantiene estado que requiera limpieza.