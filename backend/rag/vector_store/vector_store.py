"""Módulo para gestión optimizada del almacenamiento vectorial."""
import logging
from typing import List, Optional, Dict, Any, Tuple, Union
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import asyncio
import uuid
import hashlib

from cache.manager import cache
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
    OptimizersConfigDiff,
    NearestQuery,
)

from config import settings

logger = logging.getLogger(__name__)

# =====================================================================
#   VECTOR STORE (GOLDEN MASTER)
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
        self.collection_name = getattr(settings, "qdrant_collection_name", "rag_collection")

        # Inicialización de conexión
        self._initialize_store()

        logger.info(
            "VectorStore inicializado | strategy=%s | cache_enabled=%s | similarity_threshold=%s",
            distance_strategy,
            cache_enabled,
            getattr(settings, "similarity_threshold", "N/A"),
        )

    # =====================================================================
    #   INICIALIZACIÓN QDRANT
    # =====================================================================

    def _initialize_store(self) -> None:
        """Configura la conexión a Qdrant y asegura que la colección exista."""
        try:
            api_key = None
            if getattr(settings, "qdrant_api_key", None):
                api_key = settings.qdrant_api_key.get_secret_value()

            # Configurar límites de conexión para producción
            # Evita saturar Qdrant bajo carga alta
            from httpx import Limits
            
            http_limits = Limits(
                max_connections=100,      # Conexiones totales máximas
                max_keepalive_connections=20,  # Conexiones keep-alive
            )
            
            self.client = QdrantClient(
                url=settings.qdrant_url,
                api_key=api_key,
                limits=http_limits,
                timeout=30,  # Timeout en segundos (QdrantClient espera un número)
            )

            dim = int(getattr(settings, "default_embedding_dimension", 1536))

            # Verificar si la colección ya existe
            existing_collections = []
            try:
                existing_collections = [c.name for c in self.client.get_collections().collections]
            except Exception as e:
                logger.warning("No se pudieron listar colecciones (posible primer inicio): %s", e)

            if self.collection_name not in existing_collections:
                logger.info("Creando colección '%s' en Qdrant | dim=%s | distance=COSINE", self.collection_name, dim)
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
                    hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
                    optimizers_config=OptimizersConfigDiff(default_segment_number=1)
                )
                # Crear índices solo si es nueva
                self._ensure_payload_indexes()
            else:
                logger.info("Colección '%s' ya existe.", self.collection_name)
                # Asegurar índices de todas formas por si hubo cambios de esquema
                self._ensure_payload_indexes()

        except Exception as e:
            logger.error("Error inicializando Qdrant: %s", str(e), exc_info=True)
            raise

    # =====================================================================
    #   ASEGURAR ÍNDICES PAYLOAD
    # =====================================================================

    def _ensure_payload_indexes(self) -> None:
        """Garantiza que los índices necesarios existan en Qdrant para filtrado rápido."""
        try:
            required_indexes = {
                "source": "keyword",
                "pdf_hash": "keyword",
                "content_hash": "keyword",
                "content_hash_global": "keyword",
                "chunk_type": "keyword"
            }

            for field, idx_type in required_indexes.items():
                try:
                    self.client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name=field,
                        field_schema=idx_type,
                    )
                except Exception as e:
                    # Qdrant lanza error si el índice ya existe
                    if "already exists" in str(e).lower():
                        continue
                    logger.warning("No se pudo crear índice para '%s': %s", field, e)

        except Exception as e:
            logger.error("Error asegurando índices de payload: %s", e, exc_info=True)

    # =====================================================================
    #   INGESTA DOCUMENTOS (FIX CRÍTICO DE DATOS)
    # =====================================================================

    async def add_documents(self, documents: List[Document], embeddings: list = None) -> None:
        """
        Inserta documentos en Qdrant asegurando consistencia entre vector y texto.
        Usa IDs deterministas para evitar duplicados (Idempotencia).
        """
        if not documents:
            logger.info("add_documents: lista vacía, no se hace nada.")
            return

        dim = int(getattr(settings, "default_embedding_dimension", 1536))
        use_uuid5 = bool(getattr(settings, "use_uuid5_deterministic_ids", False))
        # Importante: cambiar a uuid5 cambia IDs históricos. Por defecto mantenemos legacy.
        if use_uuid5:
            logger.warning("IDs deterministas usando uuid5 ACTIVADO: esto cambiará IDs vs legacy si ya había datos.")

        total_inserted = 0
        total_skipped_bad_vec = 0

        try:
            logger.info(
                "Iniciando ingesta | docs=%s | batch_size=%s | dim=%s | precomputed_embeddings=%s",
                len(documents), self.batch_size, dim, embeddings is not None
            )

            # Procesar en lotes para no saturar memoria ni red
            for i in range(0, len(documents), self.batch_size):
                batch_docs = documents[i:i + self.batch_size]

                # 1) Embeddings para el lote actual
                if embeddings is not None:
                    batch_embeddings = embeddings[i:i + self.batch_size]
                else:
                    texts = [d.page_content for d in batch_docs]
                    batch_embeddings = await self._generate_embeddings_safe(texts)

                # FIX: no permitir ingesta silenciosa si embeddings vienen mal
                if batch_embeddings is None or len(batch_embeddings) != len(batch_docs):
                    msg = (
                        f"Embeddings inválidos en lote: docs={len(batch_docs)} "
                        f"embeddings={0 if batch_embeddings is None else len(batch_embeddings)} "
                        f"(i={i}). Aborting para evitar ingesta silenciosa."
                    )
                    logger.error(msg)
                    raise RuntimeError(msg)

                points: List[PointStruct] = []

                for doc, vec in zip(batch_docs, batch_embeddings):
                    # Normalizar vector a list[float]
                    if isinstance(vec, np.ndarray):
                        vec_list = vec.tolist()
                    else:
                        vec_list = vec

                    # Validación de integridad
                    if not vec_list or len(vec_list) != dim:
                        total_skipped_bad_vec += 1
                        logger.warning(
                            "Saltando doc por vector inválido | source=%s | page=%s | got_dim=%s | expected_dim=%s",
                            doc.metadata.get("source", "unknown"),
                            doc.metadata.get("page_number", "0"),
                            (len(vec_list) if isinstance(vec_list, list) else "N/A"),
                            dim
                        )
                        continue

                    # ID determinista (idempotente)
                    unique_seed = f"{doc.page_content}_{doc.metadata.get('source', 'unknown')}_{doc.metadata.get('page_number', '0')}"
                    if use_uuid5:
                        deterministic_id = str(uuid.uuid5(uuid.NAMESPACE_URL, unique_seed))
                    else:
                        # Legacy (no cambiar por defecto: mantiene IDs históricos)
                        content_hash = hashlib.md5(unique_seed.encode("utf-8")).hexdigest()
                        deterministic_id = str(uuid.UUID(bytes=hashlib.md5(content_hash.encode("utf-8")).digest()))

                    payload = {**doc.metadata, "text": doc.page_content}
                    points.append(PointStruct(id=deterministic_id, vector=vec_list, payload=payload))

                if not points:
                    logger.warning(
                        "Lote sin puntos válidos | batch_docs=%s | skipped_bad_vec_total=%s",
                        len(batch_docs), total_skipped_bad_vec
                    )
                    continue

                # 2) Upsert
                try:
                    await asyncio.to_thread(
                        self.client.upsert,
                        collection_name=self.collection_name,
                        points=points,
                        wait=True
                    )
                    total_inserted += len(points)
                    logger.info(
                        "Upsert OK | inserted_points=%s | batch_docs=%s | running_total=%s",
                        len(points), len(batch_docs), total_inserted
                    )
                except Exception as e:
                    logger.error("Error insertando lote en Qdrant: %s", e, exc_info=True)
                    raise RuntimeError("Fallo crítico en upsert Qdrant") from e

            # 3) Cache
            await self._invalidate_cache()

            if total_inserted == 0:
                logger.error(
                    "Ingesta terminó con 0 puntos insertados | docs=%s | skipped_bad_vec=%s | revisar embeddings/dimensiones",
                    len(documents), total_skipped_bad_vec
                )
            else:
                logger.info(
                    "Ingesta completada | docs=%s | inserted_points=%s | skipped_bad_vec=%s",
                    len(documents), total_inserted, total_skipped_bad_vec
                )

        except Exception as e:
            logger.error("Error general en add_documents: %s", str(e), exc_info=True)
            raise

    # =====================================================================
    #   HELPER: GENERAR EMBEDDINGS (SAFE)
    # =====================================================================

    async def _generate_embeddings_safe(self, texts: List[str]) -> List[List[float]]:
        """Wrapper seguro para generar embeddings on-the-fly."""
        if not texts:
            return []
        try:
            if hasattr(self.embedding_function, "embed_documents"):
                func = self.embedding_function.embed_documents
                if asyncio.iscoroutinefunction(func):
                    return await func(texts)
                return await asyncio.to_thread(func, texts)

            # Fallback uno a uno
            results = []
            for t in texts:
                emb = await self._get_document_embedding(t)
                results.append(emb.tolist())
            return results

        except Exception as e:
            # OJO: Esto antes devolvía [], lo cual causaba pérdida silenciosa. Mantengo el return[]
            # pero add_documents ahora detecta mismatch y aborta el lote.
            logger.error("Error generando embeddings on-the-fly: %s", e, exc_info=True)
            return []

    async def _get_document_embedding(self, content: str) -> np.ndarray:
        """Obtiene embedding de un solo texto de forma segura."""
        try:
            emb = None
            if hasattr(self.embedding_function, "embed_query"):
                func = self.embedding_function.embed_query
                if asyncio.iscoroutinefunction(func):
                    emb = await func(content)
                else:
                    emb = await asyncio.to_thread(func, content)

            elif hasattr(self.embedding_function, "encode"):
                func = self.embedding_function.encode
                if asyncio.iscoroutinefunction(func):
                    res = await func([content])
                else:
                    res = await asyncio.to_thread(func, [content])
                emb = res[0] if isinstance(res, list) else res
            else:
                raise ValueError("Embedding function no tiene métodos conocidos")

            return np.array(emb)

        except Exception as e:
            dim = int(getattr(settings, "default_embedding_dimension", 1536))
            logger.error("Fallo obteniendo embedding single; devolviendo vector cero | err=%s", e, exc_info=True)
            return np.zeros(dim, dtype=np.float32)

    # =====================================================================
    #   RETRIEVE (CORREGIDO: MMR VECTORS)
    # =====================================================================

    async def retrieve(
        self,
        query: str,
        k: int = 4,
        filter: Optional[Dict] = None,
        use_mmr: bool = True,
        fetch_k: Optional[int] = None,
        lambda_mult: float = 0.5,
        score_threshold: float = 0.0,
        with_vectors: bool = False,
    ) -> List[Document]:
        """
        Recupera documentos relevantes.
        FIX: Si usa MMR, fuerza la recuperación de vectores internamente.
        """
        try:
            query_embedding = await self._get_document_embedding(query)

            vectors_needed = with_vectors or use_mmr

            if use_mmr:
                actual_fetch_k = fetch_k or (k * 3)
                docs = await self._mmr_search(
                    query_embedding, k, actual_fetch_k, lambda_mult, filter, with_vectors=True
                )
            else:
                docs = await self._similarity_search(
                    query_embedding, k, filter, with_vectors=vectors_needed
                )

            final_docs = []
            kept = 0
            for d, score in docs:
                if score >= score_threshold:
                    kept += 1
                    d.metadata["score"] = score
                    if not with_vectors and "vector" in d.metadata:
                        del d.metadata["vector"]
                    final_docs.append(d)

            logger.debug(
                "retrieve() | use_mmr=%s | k=%s | fetched=%s | kept=%s | threshold=%s",
                use_mmr, k, len(docs), kept, score_threshold
            )
            return final_docs

        except Exception as e:
            logger.error("Error en retrieve(): %s", e, exc_info=True)
            return []

    # =====================================================================
    #   MMR (MAXIMAL MARGINAL RELEVANCE)
    # =====================================================================

    async def _mmr_search(self, query_embedding, k, fetch_k, lambda_mult, filter, with_vectors):
        try:
            candidates = await self._similarity_search(
                query_embedding, fetch_k, filter, with_vectors=True
            )
            if not candidates:
                return []

            docs: List[Tuple[Document, float]] = []
            emb_list: List[np.ndarray] = []

            for (doc, score) in candidates:
                vec = doc.metadata.get("vector")
                if vec is None:
                    continue

                # vec puede ser list o ya np.array; si fuera otra cosa, lo descartamos
                if isinstance(vec, list):
                    vec = np.array(vec)
                elif isinstance(vec, np.ndarray):
                    pass
                else:
                    # Si llegó dict u otro tipo aquí, es un problema de normalización upstream
                    continue

                docs.append((doc, score))
                emb_list.append(vec)

            if not emb_list:
                logger.warning("MMR sin vectores válidos; fallback a top-k simple.")
                return candidates[:k]

            doc_embeds = np.vstack(emb_list)

            query_vec = query_embedding.reshape(1, -1) if getattr(query_embedding, "ndim", 1) == 1 else query_embedding

            selected: List[int] = []
            remaining = list(range(len(emb_list)))

            for _ in range(min(k, len(emb_list))):
                mmr_scores = []
                for idx in remaining:
                    relevance = cosine_similarity(query_vec, doc_embeds[idx].reshape(1, -1))[0][0]
                    if selected:
                        sim_to_selected = cosine_similarity(
                            doc_embeds[idx].reshape(1, -1),
                            doc_embeds[selected]
                        )
                        diversity = 1 - np.max(sim_to_selected)
                    else:
                        diversity = 1.0

                    score = lambda_mult * relevance + (1 - lambda_mult) * diversity
                    mmr_scores.append((idx, score))

                if not mmr_scores:
                    break

                best_idx = max(mmr_scores, key=lambda x: x[1])[0]
                selected.append(best_idx)
                remaining.remove(best_idx)

            return [docs[local_idx] for local_idx in selected]

        except Exception as e:
            logger.error("Error en MMR: %s", e, exc_info=True)
            return await self._similarity_search(query_embedding, k, filter, with_vectors=False)

    # =====================================================================
    #   SIMILARITY SEARCH (CORE)
    # =====================================================================

    def _normalize_qdrant_vector(self, raw_vector: Any) -> Optional[List[float]]:
        """
        Normaliza la respuesta de Qdrant:
        - vector simple: list[float]
        - named vectors: dict[str, list[float]] -> toma 'default' si existe o el primero.
        """
        if raw_vector is None:
            return None

        if isinstance(raw_vector, list):
            return raw_vector

        if isinstance(raw_vector, dict):
            if "default" in raw_vector and isinstance(raw_vector["default"], list):
                return raw_vector["default"]
            # tomar la primera entrada válida
            for _, v in raw_vector.items():
                if isinstance(v, list):
                    return v
            return None

        # otros tipos: no soportados
        return None

    async def _similarity_search(
        self,
        query_embedding: np.ndarray,
        k: int,
        filter: Optional[Dict] = None,
        with_vectors: bool = False,
    ) -> List[Tuple[Document, float]]:
        """Ejecuta la búsqueda pura en Qdrant."""
        try:
            vector = query_embedding.tolist()

            qfilter = None
            if filter:
                must = [FieldCondition(key=str(kf), match=MatchValue(value=vf)) for kf, vf in filter.items()]
                qfilter = QFilter(must=must)

            results = await asyncio.to_thread(
                self.client.query_points,
                collection_name=self.collection_name,
                query=NearestQuery(nearest=vector),
                limit=max(1, k),
                query_filter=qfilter,
                with_payload=True,
                with_vectors=with_vectors,
            )

            if hasattr(results, "points"):
                points = results.points
            elif isinstance(results, (list, tuple)):
                points = results
            else:
                points = []

            output: List[Tuple[Document, float]] = []
            for r in points:
                payload = dict(getattr(r, "payload", {}) or {})
                score = float(getattr(r, "score", 0.0) or 0.0)
                rid = getattr(r, "id", None)

                payload["id"] = rid

                if with_vectors:
                    raw_vec = getattr(r, "vector", None)
                    norm_vec = self._normalize_qdrant_vector(raw_vec)
                    if norm_vec is not None:
                        payload["vector"] = norm_vec

                doc = Document(page_content=payload.get("text", ""), metadata=payload)
                output.append((doc, score))

            return output

        except Exception as e:
            logger.error("Error en _similarity_search: %s", e, exc_info=True)
            return []

    # =====================================================================
    #   DELETION METHODS (COMPATIBILIDAD RAGINGESTOR)
    # =====================================================================

    async def delete_documents(self, filter: Optional[Dict[str, Any]] = None) -> None:
        """Elimina documentos basados en un filtro de metadatos."""
        try:
            if filter:
                must = [FieldCondition(key=str(k), match=MatchValue(value=v)) for k, v in filter.items()]
                qfilter = QFilter(must=must)
                selector = FilterSelector(filter=qfilter)

                await asyncio.to_thread(
                    self.client.delete,
                    collection_name=self.collection_name,
                    points_selector=selector
                )
            else:
                await self.delete_collection()

            await self._invalidate_cache()

        except Exception as e:
            logger.error("Error eliminando documentos: %s", e, exc_info=True)
            raise

    async def delete_by_pdf_hash(self, pdf_hash: str) -> None:
        await self.delete_documents({"pdf_hash": pdf_hash})

    async def delete_by_content_hash_global(self, content_hash_global: str) -> None:
        await self.delete_documents({"content_hash_global": content_hash_global})

    async def delete_collection(self) -> None:
        """Elimina y recrea la colección completa."""
        try:
            try:
                await asyncio.to_thread(self.client.delete_collection, self.collection_name)
            except Exception:
                pass

            self._initialize_store()
            await self._invalidate_cache()

        except Exception as e:
            logger.error("Error resetando colección: %s", e, exc_info=True)
            raise

    # =====================================================================
    #   CACHE UTILS
    # =====================================================================

    async def _invalidate_cache(self) -> None:
        try:
            if not self.cache_enabled:
                return
            if hasattr(settings, "enable_cache") and not getattr(settings, "enable_cache", True):
                return
            cache.invalidate_prefix("vs:")
            logger.debug("Cache invalidada: prefix 'vs:'")
        except Exception as e:
            logger.error("Error invalidando caché: %s", e, exc_info=True)
