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
import asyncio

from langchain_core.documents import Document
# from langchain_community.vectorstores import Chroma # VectorStore lo abstrae
from langchain_huggingface import HuggingFaceEmbeddings # Puede ser necesario para _initialize_embeddings si se mantiene
# from langchain.text_splitter import RecursiveCharacterTextSplitter # Movido a PDFContentLoader
# from langchain_community.document_loaders import PyPDFLoader # Movido a PDFContentLoader

# from ...utils.pdf_utils import PDFProcessor # Eliminado, ya no se usa aquí
# from ..embeddings.embedding_manager import EmbeddingManager # Necesario si se inicializa aquí explícitamente
from ..vector_store.vector_store import VectorStore
from config import settings

logger = logging.getLogger(__name__)

def measure_time(func):
    """Decorador para medir el tiempo de ejecución de funciones."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = await func(*args, **kwargs)
        end_time = time.perf_counter()
        execution_time = end_time - start_time
        
        # Registrar el tiempo de ejecución
        if not hasattr(wrapper, 'times'):
            wrapper.times = []
        wrapper.times.append(execution_time)
        
        # Calcular estadísticas cada 10 ejecuciones
        if len(wrapper.times) % 10 == 0:
            avg_time = statistics.mean(wrapper.times[-10:])
            logger.info(f"Tiempo promedio de {func.__name__} en las últimas 10 ejecuciones: {avg_time:.3f}s")
        
        return result
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
        self._query_cache = {}  # Cache simple {query: (timestamp, results)}
        self.performance_metrics = PerformanceMetrics()
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
        if self.cache_enabled:
            try:
                cached_results = self._get_from_cache(query, k)
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
                relevant_docs = await asyncio.wait_for(
                    self.vector_store.retrieve(
                        query,
                        k=initial_k,
                        filter=filter_criteria
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
            if self.cache_enabled and final_docs:
                try:
                    cache_update_start = time.perf_counter()
                    self._add_to_cache(query, final_docs)
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
            
            # Calcular scores para cada documento
            scored_docs = []
            for doc in docs:
                # 1. Score de similitud semántica
                doc_embedding = self.embedding_manager.embed_query(doc.page_content)
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
                    # Aumentar el factor si la fuente es un PDF. Ajustar el valor (ej: 1.2) según sea necesario.
                    pdf_priority_factor = 1.5 # Aumentado de 1.2 a 1.5 para dar más prioridad a PDFs

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
            doc_embeddings = [
                self.embedding_manager.embed_query(doc.page_content)
                for doc in docs
            ]

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

    def _get_from_cache(self, query: str, k: int) -> Optional[List[Document]]:
        """Obtiene resultados del caché con manejo de errores mejorado."""
        try:
            cache_key = f"{query}_{k}"
            if cache_key in self._query_cache:
                timestamp, results = self._query_cache[cache_key]
                # Verificar si el caché ha expirado (5 minutos)
                if time.time() - timestamp < 300:
                    # Si por error hay una coroutine, la eliminamos
                    import collections.abc
                    if isinstance(results, collections.abc.Awaitable):
                        del self._query_cache[cache_key]
                        return None
                    return results
                else:
                    del self._query_cache[cache_key]
            return None
        except Exception as e:
            logger.warning(f"Error al acceder al caché: {e}")
            return None

    def _add_to_cache(self, query: str, docs: List[Document]) -> None:
        """Agrega resultados al caché con manejo de errores mejorado."""
        try:
            cache_key = f"{query}_{len(docs)}"
            import collections.abc
            if isinstance(docs, collections.abc.Awaitable):
                logger.warning("Intento de almacenar una coroutine en caché, ignorado.")
                return
            self._query_cache[cache_key] = (time.time(), docs)
            # Limpiar caché antiguo si excede el límite
            if len(self._query_cache) > 1000:  # Límite de 1000 entradas
                oldest_key = min(self._query_cache.keys(), key=lambda k: self._query_cache[k][0])
                del self._query_cache[oldest_key]
        except Exception as e:
            logger.warning(f"Error al actualizar caché: {e}")

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

    # El método clear() original tenía lógica para el vector store y el directorio de pdfs.
    # La limpieza del vector store ahora debería ser manejada por RAGIngestor.
    # RAGRetriever en sí mismo podría no tener estado que limpiar si solo consulta.
    # def clear(self) -> None:
    #     """Limpia el RAGRetriever (principalmente su VectorStore si es necesario)."""
    #     logger.info("Limpiando RAGRetriever...")
    #     # Si la limpieza del VectorStore se hace a través de RAGIngestor o un script separado,
    #     # este método podría no ser necesario o tener un propósito diferente.
    #     # Por ejemplo, si RAGRetriever tuviera algún caché interno:
        logger.info("RAGRetriever no tiene estado interno que limpiar en esta versión.")