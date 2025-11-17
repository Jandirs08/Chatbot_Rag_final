"""Módulo para gestión optimizada del almacenamiento vectorial."""
import logging
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import asyncio
import uuid

from cache.manager import cache

from fastapi import HTTPException
from langchain_core.documents import Document

from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter as QFilter,
    FieldCondition,
    MatchValue,
    FilterSelector,
    HnswConfigDiff,
    OptimizersConfigDiff
)

from config import settings

logger = logging.getLogger(__name__)

# =====================================================================
#   VECTOR STORE
# =====================================================================

class VectorStore:
    """Gestor optimizado de almacenamiento vectorial con soporte para MMR y caché."""

    def __init__(
        self,
        embedding_function: Any,
        distance_strategy: str = "cosine",
        cache_enabled: bool = True,
        cache_ttl: int = 3600,
        batch_size: int = 100
    ):
        self.embedding_function = embedding_function
        self.distance_strategy = distance_strategy
        self.cache_enabled = cache_enabled
        self.cache_ttl = cache_ttl
        self.batch_size = batch_size
        
        # Cache local removido: usar CacheManager para invalidación por prefijo

        self._initialize_store()

        logger.info(
            f"VectorStore inicializado con strategy={distance_strategy}, cache={cache_enabled}, similarity_threshold={getattr(settings, 'similarity_threshold', 'N/A')}"
        )


    # =====================================================================
    #   INICIALIZACIÓN QDRANT
    # =====================================================================

    def _initialize_store(self) -> None:
        try:
            api_key = None
            if settings.qdrant_api_key:
                api_key = settings.qdrant_api_key.get_secret_value()

            self.client = QdrantClient(url=settings.qdrant_url, api_key=api_key)

            dim = int(getattr(settings, "default_embedding_dimension", 1536))

            existing = []
            try:
                existing = [c.name for c in self.client.get_collections().collections]
            except Exception:
                pass

            if "rag_collection" not in existing:
                self.client.create_collection(
                    collection_name="rag_collection",
                    vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
                    hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
                    optimizers_config=OptimizersConfigDiff(default_segment_number=1)
                )
        except Exception as e:
            logger.error(f"Error inicializando Qdrant: {str(e)}", exc_info=True)
            raise


    # =====================================================================
    #   INGESTA DOCUMENTOS
    # =====================================================================

    async def add_documents(self, documents: List[Document], embeddings: list = None) -> None:
        if not documents:
            return

        try:
            for i in range(0, len(documents), self.batch_size):
                batch = documents[i:i + self.batch_size]
                processed_batch = []

                for doc in batch:
                    try:
                        ch = doc.metadata.get("content_hash")
                        if ch:
                            try:
                                await self.delete_documents(filter={"content_hash": ch})
                            except Exception as e:
                                logger.error(f"Error eliminando hash previo: {e}")
                        processed_batch.append(doc)
                    except Exception:
                        continue

                if not processed_batch:
                    continue

                ids = [str(uuid.uuid4()) for _ in processed_batch]
                points = []

                for idx, doc in enumerate(processed_batch):
                    if embeddings is not None:
                        vec = embeddings[idx]
                        vec = vec.tolist() if isinstance(vec, np.ndarray) else vec
                    else:
                        vec = await self._get_document_embedding(doc.page_content)
                        vec = vec.tolist() if isinstance(vec, np.ndarray) else vec

                    try:
                        vec = [float(x) for x in vec]
                    except:
                        continue

                    dim = int(getattr(settings, "default_embedding_dimension", 1536))
                    if len(vec) != dim:
                        continue

                    payload = {
                        **doc.metadata,
                        "text": doc.page_content,
                        "embedding": vec
                    }

                    try:
                        pv = (payload.get("text") or "")[:100]
                        src = payload.get("source")
                        logger.info(f"upsert[{i//self.batch_size + 1}:{idx}] source={src} preview={pv}")
                    except Exception:
                        pass

                    points.append(PointStruct(id=ids[idx], vector=vec, payload=payload))

                try:
                    self.client.upsert(
                        collection_name="rag_collection",
                        points=points,
                        wait=True
                    )
                except Exception as e:
                    logger.error(f"Error agregando puntos a Qdrant: {e}", exc_info=True)
                    raise RuntimeError("Falló la inserción en Qdrant")

            await self._invalidate_cache()
            logger.info(f"Ingesta completada: {len(documents)} documentos agregados.")

        except Exception as e:
            logger.error(f"Error general ingesta: {str(e)}", exc_info=True)
            raise


    # =====================================================================
    #   EMBEDDINGS
    # =====================================================================

    async def _get_document_embedding(self, content: str) -> np.ndarray:
        try:
            emb = None

            if hasattr(self.embedding_function, "embed_query"):
                emb = (
                    await self.embedding_function.embed_query(content)
                    if asyncio.iscoroutinefunction(self.embedding_function.embed_query)
                    else self.embedding_function.embed_query(content)
                )

            elif hasattr(self.embedding_function, "encode"):
                e = (
                    await self.embedding_function.encode([content])
                    if asyncio.iscoroutinefunction(self.embedding_function.encode)
                    else self.embedding_function.encode([content])
                )
                emb = e[0] if isinstance(e, list) else e

            else:
                raise ValueError("Embedding function inválida")

            return np.array(emb)

        except Exception:
            dim = int(getattr(settings, "default_embedding_dimension", 1536))
            return np.zeros(dim, dtype=np.float32)


    # =====================================================================
    #   RETRIEVE
    # =====================================================================

    async def retrieve(
        self,
        query: str,
        k: int = 4,
        filter: Optional[Dict] = None,
        use_mmr: bool = True,
        fetch_k: Optional[int] = None,
        lambda_mult: float = 0.5,
        score_threshold: float = 0.0
    ) -> List[Document]:

        try:
            query_embedding = await self._get_document_embedding(query)

            count = self.client.count(collection_name="rag_collection")
            total_docs = int(getattr(count, "count", 0))

            if total_docs == 0:
                return []

            k = min(k, total_docs)
            fetch_k = min(fetch_k or k * 3, total_docs)

            if use_mmr:
                docs = await self._mmr_search(query_embedding, k, fetch_k, lambda_mult, filter)
            else:
                docs = await self._similarity_search(query_embedding, k, filter)

            threshold = float(getattr(settings, "similarity_threshold", 0.3))
            out = []
            for d, score in docs:
                d.metadata["score"] = score
                if score >= threshold:
                    out.append(d)

            return out

        except Exception as e:
            logger.error(f"Error retrieve(): {e}", exc_info=True)
            return []


    # =====================================================================
    #   MMR
    # =====================================================================

    async def _mmr_search(self, query_embedding, k, fetch_k, lambda_mult, filter):
        try:
            candidates = await self._similarity_search(query_embedding, fetch_k, filter)
            if not candidates:
                return []

            docs = []
            scores = []
            emb_list = []

            for doc, score in candidates:
                docs.append(doc)
                scores.append(score)

                emb = doc.metadata.get("embedding")
                if isinstance(emb, list):
                    emb = np.array(emb)

                if not isinstance(emb, np.ndarray):
                    continue

                emb_list.append(emb)

            if not emb_list:
                return []

            doc_embeds = np.vstack(emb_list)

            if query_embedding.ndim == 1:
                query_embedding = query_embedding.reshape(1, -1)

            selected = []
            remaining = list(range(len(docs)))

            for _ in range(min(k, len(docs))):
                mmr_scores = []
                for idx in remaining:
                    relevance = cosine_similarity(
                        query_embedding,
                        doc_embeds[idx].reshape(1, -1)
                    )[0][0]

                    if selected:
                        diversity = 1 - max(
                            cosine_similarity(
                                doc_embeds[idx].reshape(1, -1),
                                doc_embeds[selected]
                            )[0]
                        )
                    else:
                        diversity = 1.0

                    mmr_scores.append((idx, lambda_mult * relevance + (1 - lambda_mult) * diversity))

                best = max(mmr_scores, key=lambda x: x[1])[0]
                selected.append(best)
                remaining.remove(best)

            return [(docs[i], scores[i]) for i in selected]

        except Exception as e:
            logger.error(f"Error en MMR: {e}", exc_info=True)
            return await self._similarity_search(query_embedding, k, filter)


    # =====================================================================
    #   SIMILARITY SEARCH — **CORREGIDO**
    # =====================================================================

    async def _similarity_search(
        self,
        query_embedding: np.ndarray,
        k: int,
        filter: Optional[Dict] = None,
    ) -> List[Tuple[Document, float]]:

        try:
            query_embedding = query_embedding.tolist()

            qfilter = None
            if filter:
                must = []
                for kf, vf in filter.items():
                    must.append(FieldCondition(key=str(kf), match=MatchValue(value=vf)))
                qfilter = QFilter(must=must)

            # 👇 FIX IMPORTANTE: query_filter en lugar de filter
            res = self.client.search(
                collection_name="rag_collection",
                query_vector=query_embedding,
                limit=max(1, k),
                query_filter=qfilter
            )

            out = []
            for r in res:
                meta = dict(r.payload or {})

                # reconstruir embedding guardado
                emb = meta.get("embedding")
                if isinstance(emb, list):
                    emb = np.array(emb)
                meta["embedding"] = emb

                doc = Document(
                    page_content=meta.get("text", ""),
                    metadata=meta
                )

                out.append((doc, float(getattr(r, "score", 0.0))))

            return out

        except Exception as e:
            logger.error(f"Error similarity search: {e}", exc_info=True)
            return []


    # =====================================================================
    #   DELETE DOCUMENTS
    # =====================================================================

    async def delete_documents(self, filter: Optional[Dict[str, Any]] = None) -> None:
        try:
            if filter:
                must = []
                for kf, vf in filter.items():
                    must.append(FieldCondition(key=str(kf), match=MatchValue(value=vf)))

                qfilter = QFilter(must=must)
                selector = FilterSelector(filter=qfilter)
                self.client.delete(collection_name="rag_collection", points_selector=selector)
            else:
                await self.delete_collection()

            await self._invalidate_cache()

        except Exception as e:
            logger.error(f"Error eliminando documentos: {e}", exc_info=True)
            raise


    # =====================================================================
    #   DELETE COLLECTION
    # =====================================================================

    async def delete_collection(self) -> None:
        try:
            try:
                self.client.delete_collection("rag_collection")
            except:
                pass

            self._initialize_store()
            await self._invalidate_cache()

        except Exception as e:
            logger.error(f"Error eliminando colección completa: {e}", exc_info=True)
            raise


    # =====================================================================
    #   CACHÉ
    # =====================================================================

    async def _invalidate_cache(self) -> None:
        try:
            # Respetar configuración global de caché
            if not getattr(settings, "enable_cache", True):
                return
            # Invalidación unificada por prefijo
            cache.invalidate_prefix("vs:")
        except Exception as e:
            logger.error(f"Error invalidando caché: {e}", exc_info=True)
