"""Módulo para gestión optimizada del almacenamiento vectorial."""
import logging
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import time
from datetime import datetime
import asyncio
import uuid
import shutil

# Redis es opcional: importar de forma condicional
try:
    import redis  # type: ignore
    _REDIS_AVAILABLE = True
except Exception:
    redis = None  # type: ignore
    _REDIS_AVAILABLE = False

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
        persist_directory: Optional[str],
        embedding_function: Any,
        distance_strategy: str = "cosine",
        cache_enabled: bool = True,
        cache_ttl: int = 3600,
        batch_size: int = 100
    ):
        self.persist_directory = Path(persist_directory) if persist_directory else Path("./")
        self.embedding_function = embedding_function
        self.distance_strategy = distance_strategy
        self.cache_enabled = cache_enabled
        self.cache_ttl = cache_ttl
        self.batch_size = batch_size
        
        # Caché en memoria
        self._query_cache = {}
        self.redis_client = None

        # Inicializar Redis si existe
        if settings.redis_url and _REDIS_AVAILABLE:
            try:
                self.redis_client = redis.from_url(
                    settings.redis_url.get_secret_value(),
                    socket_timeout=1.0,
                    socket_connect_timeout=1.0
                )
                self.redis_client.ping()
                logger.info("Conexión a Redis establecida correctamente")
            except Exception as e:
                logger.warning(f"No se pudo conectar a Redis: {e}. Usando caché en memoria.")
                self.redis_client = None
        else:
            if settings.redis_url and not _REDIS_AVAILABLE:
                logger.warning("REDIS_URL definido pero librería redis no instalada.")

        self._initialize_store()

        logger.info(
            f"VectorStore inicializado en {persist_directory} "
            f"con strategy={distance_strategy}, cache={'enabled' if cache_enabled else 'disabled'}"
        )



    # =====================================================================
    #   INICIALIZACIÓN DE QDRANT
    # =====================================================================

    def _initialize_store(self) -> None:
        try:
            api_key = None
            try:
                api_key = settings.qdrant_api_key.get_secret_value() if settings.qdrant_api_key else None
            except Exception:
                api_key = None

            self.client = QdrantClient(url=settings.qdrant_url, api_key=api_key)

            try:
                dim = int(getattr(settings, "default_embedding_dimension", 1536))
            except Exception:
                dim = 1536

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
            logger.error(f"Error inicializando vector store: {str(e)}", exc_info=True)
            raise



    # =====================================================================
    #   INGESTA: ADD DOCUMENTS (CORREGIDO)
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
                        content_hash = doc.metadata.get("content_hash")
                        if content_hash:
                            try:
                                await self.delete_documents(filter={"content_hash": content_hash})
                            except Exception as e:
                                logger.error(f"Error deleting doc hash {content_hash}: {e}")
                        processed_batch.append(doc)
                    except Exception as e:
                        logger.error(f"Error procesando doc: {e}", exc_info=True)
                        continue

                if not processed_batch:
                    continue

                # =====================================================
                #   *** FIX 1: IDs siempre UUID VÁLIDOS ***
                # =====================================================
                ids = [str(uuid.uuid4()) for _ in processed_batch]

                points = []

                for idx, doc in enumerate(processed_batch):
                    if embeddings is not None:
                        vec = embeddings[idx]
                        if isinstance(vec, np.ndarray):
                            vec = vec.tolist()
                    else:
                        vec = await self._get_document_embedding(doc.page_content)
                        vec = vec.tolist() if isinstance(vec, np.ndarray) else vec

                    # Validar vector
                    try:
                        vec = [float(x) for x in vec]
                    except:
                        continue

                    try:
                        expected_dim = int(getattr(settings, "default_embedding_dimension", 1536))
                    except:
                        expected_dim = 1536

                    if not isinstance(vec, list) or len(vec) != expected_dim:
                        continue

                    payload = doc.metadata.copy()
                    payload["text"] = doc.page_content

                    points.append(PointStruct(id=ids[idx], vector=vec, payload=payload))

                # =====================================================
                #   *** FIX 2: detener flujo si falla Qdrant ***
                # =====================================================
                try:
                    self.client.upsert(
                        collection_name="rag_collection",
                        points=points,
                        wait=True
                    )
                except Exception as e:
                    logger.error(f"Error agregando documentos a Qdrant: {e}", exc_info=True)
                    raise RuntimeError("Fallo al insertar puntos en Qdrant") from e

            await self._invalidate_cache()

            logger.info(
                f"Ingestion completed. {len(documents)} documentos agregados al vector store."
            )

        except Exception as e:
            logger.error(f"Error general añadiendo documentos: {str(e)}", exc_info=True)
            raise



    # =====================================================================
    #   EMBEDDINGS
    # =====================================================================

    async def _get_document_embedding(self, content: str) -> np.ndarray:
        try:
            emb = None

            if hasattr(self.embedding_function, "embed_query"):
                if asyncio.iscoroutinefunction(self.embedding_function.embed_query):
                    emb = await self.embedding_function.embed_query(content)
                else:
                    emb = self.embedding_function.embed_query(content)

            elif hasattr(self.embedding_function, "encode"):
                if asyncio.iscoroutinefunction(self.embedding_function.encode):
                    emb = await self.embedding_function.encode([content])
                    if isinstance(emb, list) and len(emb) > 0:
                        emb = emb[0]
                else:
                    emb = self.embedding_function.encode([content])
                    if isinstance(emb, list) and len(emb) > 0:
                        emb = emb[0]

            else:
                raise ValueError("Embedding function inválida")

            if isinstance(emb, list):
                return np.array(emb)
            elif isinstance(emb, np.ndarray):
                return emb
            else:
                raise TypeError(f"Embedding tipo no soportado: {type(emb)}")

        except Exception:
            try:
                dim = int(getattr(settings, "default_embedding_dimension", 1536))
            except:
                dim = 1536
            logger.warning("Error obteniendo embedding → devolviendo vector cero")
            return np.zeros(dim, dtype=np.float32)



    # =====================================================================
    #   RETRIEVE / SEARCH
    # =====================================================================

    async def retrieve(
        self,
        query: str,
        k: int = 4,
        filter: Optional[Dict] = None,
        use_mmr: bool = True,
        fetch_k: Optional[int] = None,
        lambda_mult: float = 0.5,
        score_threshold: float = 0.5
    ) -> List[Document]:

        try:
            query_embedding = await self._get_document_embedding(query)

            try:
                count = self.client.count(collection_name="rag_collection")
                total_docs = int(getattr(count, "count", 0))
            except:
                total_docs = 0

            if total_docs == 0:
                return []

            k = min(k, total_docs)
            fetch_k = min(fetch_k or k * 3, total_docs)

            if use_mmr:
                docs = await self._mmr_search(
                    query_embedding,
                    k=k,
                    fetch_k=fetch_k,
                    lambda_mult=lambda_mult,
                    filter=filter
                )
            else:
                docs = await self._similarity_search(query_embedding, k=k, filter=filter)

            out = []
            for d, score in docs:
                if score >= score_threshold:
                    d.metadata["score"] = score
                    out.append(d)

            return out

        except Exception as e:
            logger.error(f"Error retrieve(): {e}", exc_info=True)
            return []



    # =====================================================================
    #   MMR (sin cambios)
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
                if emb is None:
                    emb = await self._get_document_embedding(doc.page_content)

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

            # Selección MMR
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
                        sel_emb = doc_embeds[selected]
                        diversity = 1 - np.max(
                            cosine_similarity(
                                doc_embeds[idx].reshape(1, -1),
                                sel_emb
                            )[0]
                        )
                    else:
                        diversity = 1.0

                    mmr = lambda_mult * relevance + (1 - lambda_mult) * diversity
                    mmr_scores.append((idx, mmr))

                if not mmr_scores:
                    break

                best = max(mmr_scores, key=lambda x: x[1])[0]
                selected.append(best)
                remaining.remove(best)

            return [(docs[i], scores[i]) for i in selected]

        except Exception as e:
            logger.error(f"Error MMR: {e}", exc_info=True)
            return await self._similarity_search(query_embedding, k, filter)



    # =====================================================================
    #   SIMILARITY SEARCH (CORREGIDO MATCHVALUE)
    # =====================================================================

    async def _similarity_search(
        self,
        query_embedding: np.ndarray,
        k: int,
        filter: Optional[Dict] = None
    ) -> List[Tuple[Document, float]]:
        try:
            if isinstance(query_embedding, np.ndarray):
                query_embedding = query_embedding.tolist()

            qfilter = None

            if filter:
                must = []
                for kf, vf in filter.items():

                    # =====================================================
                    #   *** FIX MATCHVALUE ***
                    # =====================================================
                    try:
                        must.append(
                            FieldCondition(
                                key=str(kf),
                                match=MatchValue(value=vf)
                            )
                        )
                    except Exception:
                        continue

                if must:
                    qfilter = QFilter(must=must)

            res = self.client.search(
                collection_name="rag_collection",
                query_vector=query_embedding,
                limit=max(1, k),
                filter=qfilter
            )

            out = []
            for r in res:
                meta = dict(r.payload or {})
                text = meta.get("text", "")
                doc = Document(page_content=text, metadata=meta)
                out.append((doc, float(getattr(r, "score", 0.0))))

            return out

        except Exception as e:
            logger.error(f"Error similarity search: {e}", exc_info=True)
            return []



    # =====================================================================
    #   DELETE DOCUMENTS (CORREGIDO MATCHVALUE)
    # =====================================================================

    async def delete_documents(self, filter: Optional[Dict[str, Any]] = None) -> None:
        try:
            if filter:
                must = []
                for kf, vf in filter.items():

                    # =====================================================
                    #   *** FIX MATCHVALUE ***
                    # =====================================================
                    try:
                        must.append(
                            FieldCondition(
                                key=str(kf),
                                match=MatchValue(value=vf)
                            )
                        )
                    except Exception:
                        continue

                qfilter = QFilter(must=must) if must else None

                if qfilter:
                    self.client.delete(collection_name="rag_collection", filter=qfilter)

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
            logger.error(f"Error eliminando colección: {e}", exc_info=True)
            raise



    # =====================================================================
    #   CACHÉ
    # =====================================================================

    async def _invalidate_cache(self) -> None:
        try:
            if self.redis_client:
                self.redis_client.flushdb()
            else:
                self._query_cache.clear()
        except Exception as e:
            logger.error(f"Error invalidando cache: {e}", exc_info=True)



    # =====================================================================
    #   SERIALIZACIÓN
    # =====================================================================

    def _serialize_documents(self, docs: List[Document]) -> bytes:
        import pickle
        serializable = []

        for doc in docs:
            metadata = doc.metadata.copy()

            if not getattr(settings, "cache_store_embeddings", True):
                metadata.pop("embedding", None)

            serializable.append({
                "page_content": doc.page_content,
                "metadata": metadata
            })

        return pickle.dumps(serializable)

    def _deserialize_documents(self, data: bytes) -> List[Document]:
        import pickle
        serialized = pickle.loads(data)

        return [
            Document(page_content=item["page_content"], metadata=item["metadata"])
            for item in serialized
        ]



    # =====================================================================
    #   CLEANUP
    # =====================================================================

    def __del__(self):
        try:
            if hasattr(self, "store"):
                pass
        except Exception as e:
            logger.error(f"Error en destructor VectorStore: {e}")
