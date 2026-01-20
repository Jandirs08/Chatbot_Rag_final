from typing import List, Optional
import numpy as np
import time
from utils.logging_utils import get_logger
from config import settings
from cache.manager import cache
from utils.hashing import hash_for_cache_key

# Usar embeddings remotos de OpenAI para reducir uso de memoria
try:
    from langchain_openai import OpenAIEmbeddings
    _OPENAI_AVAILABLE = True
except Exception:
    _OPENAI_AVAILABLE = False

# Tenacity para retry robusto (ya instalado como dependencia de langchain-core)
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    RetryError,
)
import logging

_retry_logger = logging.getLogger("embedding_retry")


class EmbeddingManager:
    def __init__(self, model_name: str = "openai:text-embedding-3-small"):
        """Inicializa el gestor de embeddings.

        Siempre usa OpenAIEmbeddings. Si `model_name` no contiene el prefijo
        `openai:`, se usará el modelo por defecto `text-embedding-3-small`.
        """
        self.model_name = model_name
        self.logger = get_logger(self.__class__.__name__)
        self._openai: Optional[OpenAIEmbeddings] = None

        if not _OPENAI_AVAILABLE:
            raise RuntimeError("langchain-openai no está disponible para usar embeddings OpenAI")

        # Parsear modelo correcto
        if isinstance(model_name, str) and model_name.lower().startswith("openai:"):
            openai_model = model_name.split(":", 1)[1] or "text-embedding-3-small"
        else:
            self.logger.warning(
                f"Modelo de embeddings '{model_name}' no es OpenAI. Usando 'text-embedding-3-small' por defecto."
            )
            openai_model = "text-embedding-3-small"

        self.logger.info(
            f"Usando OpenAIEmbeddings: {openai_model} (batch_size interno={getattr(settings, 'embedding_batch_size', 32)})"
        )
        self._openai = OpenAIEmbeddings(model=openai_model)

        self._batch_size = getattr(settings, "embedding_batch_size", 32)

    @staticmethod
    def _hash_text(text: str) -> str:
        return hash_for_cache_key((text or "").strip().lower())

    def _embed_batch_with_retry(self, batch_texts: List[str]) -> List[List[float]]:
        """
        Llama a OpenAI con retry robusto usando tenacity.
        
        Categoría de errores:
        - Retriable: TimeoutError, ConnectionError, errores transitorios
        - No retriable: AuthenticationError, errores 4xx del API (los propaga)
        """
        @retry(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            retry=retry_if_exception_type((TimeoutError, ConnectionError, OSError)),
            reraise=True,
        )
        def _call():
            return self._openai.embed_documents(batch_texts)
        
        try:
            return _call()
        except RetryError as e:
            # Todos los reintentos fallaron
            _retry_logger.error(f"OpenAI embeddings falló después de reintentos: {e}")
            raise
        except Exception as e:
            # Error no retriable (ej: API key inválida)
            _retry_logger.warning(f"Error no retriable en OpenAI embeddings: {type(e).__name__}: {e}")
            raise

    # ----------------------------------------------------------------------
    #   EMBED DOCUMENTS — FIX 1 COMPLETO
    # ----------------------------------------------------------------------
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Genera embeddings para una lista de textos usando OpenAI."""

        if getattr(settings, "mock_mode", False):
            # Simula latencia y retorna embeddings vacíos
            vector_dim = getattr(settings, "default_embedding_dimension", 1536)
            time.sleep(0.01)
            self.logger.info("MOCK EMBEDDING GENERATED (Costo $0)")
            return [[0.0] * vector_dim for _ in texts]

        if not texts:
            self.logger.debug("No hay textos para generar embeddings")
            return []

        # FIX 1: Siempre fijar dimensión
        vector_dim = getattr(settings, "default_embedding_dimension", 1536)

        # Normalizar textos mínimos
        filtered_texts = [t if (t and len(t.strip()) >= 3) else "placeholder_text" for t in texts]

        # Intento de cache
        results: List[Optional[List[float]]] = [None] * len(filtered_texts)
        miss_indices: List[int] = []

        for i, t in enumerate(filtered_texts):
            key = f"emb:doc:{self.model_name}:{self._hash_text(t)}"
            try:
                cached = cache.get(key)
                if cached is not None:
                    # FIX 1: Validar que el embedding cacheado tenga dimensión correcta
                    if isinstance(cached, list) and len(cached) == vector_dim:
                        results[i] = cached
                    else:
                        miss_indices.append(i)
                else:
                    miss_indices.append(i)
            except Exception:
                miss_indices.append(i)

        hit_count = len(texts) - len(miss_indices)
        if hit_count:
            self.logger.debug(f"Cache HIT embeddings documentos: {hit_count}/{len(texts)}")
        if miss_indices:
            self.logger.debug(
                f"Cache MISS embeddings documentos: {len(miss_indices)}/{len(texts)} — generando para misses"
            )

        try:
            # Embeddings por lotes con retry usando tenacity
            index_to_embedding: dict[int, List[float]] = {}

            for start in range(0, len(miss_indices), self._batch_size):
                batch_indices = miss_indices[start:start + self._batch_size]
                batch_texts = [filtered_texts[i] for i in batch_indices]

                self.logger.debug(
                    f"Generando embeddings por lotes de misses: lote={len(batch_texts)}, batch_size={self._batch_size}"
                )

                # Usar método con retry robusto (tenacity)
                batch_embs = None
                try:
                    batch_embs = self._embed_batch_with_retry(batch_texts)
                except Exception as e:
                    self.logger.error(f"OpenAI embeddings falló para lote: {e}")
                
                # Si todos los reintentos fallaron, usar fallback
                if batch_embs is None:
                    self.logger.warning("Usando embeddings de fallback (zeros) para este lote")
                    batch_embs = [[0.0] * vector_dim for _ in batch_texts]

                for idx, emb in zip(batch_indices, batch_embs):
                    # FIX 1: Validación estricta de vectores
                    if isinstance(emb, np.ndarray):
                        emb = emb.tolist()

                    if not emb or not isinstance(emb, list) or len(emb) != vector_dim:
                        emb = [0.0] * vector_dim

                    index_to_embedding[idx] = emb

            # Ensamblar resultados
            for i in miss_indices:
                emb = index_to_embedding.get(i)

                # FIX 1: fallback garantizado
                if not emb or len(emb) != vector_dim:
                    emb = [0.0] * vector_dim

                results[i] = emb

                # Guardar cache
                try:
                    key = f"emb:doc:{self.model_name}:{self._hash_text(filtered_texts[i])}"
                    cache.set(key, emb, cache.ttl)
                except Exception:
                    pass

            # ------------------------------------------------------------------
            # FINAL: asegurar uniformidad
            # ------------------------------------------------------------------
            final_embeddings: List[List[float]] = []

            for emb in results:
                if isinstance(emb, np.ndarray):
                    final_embeddings.append(emb.tolist())
                elif isinstance(emb, list) and len(emb) == vector_dim:
                    final_embeddings.append(emb)
                else:
                    final_embeddings.append([0.0] * vector_dim)

            self.logger.debug("Embeddings generados con FIX #1 aplicado")
            return final_embeddings

        except Exception as e:
            self.logger.warning(f"Error al generar embeddings: {e}")
            return [[0.0] * vector_dim for _ in range(len(texts))]

    # ----------------------------------------------------------------------
    #   EMBED QUERY
    # ----------------------------------------------------------------------
    def embed_query(self, query: str) -> List[float]:
        """Genera embedding para una consulta usando OpenAI."""
        if getattr(settings, "mock_mode", False):
            # Simula latencia y retorna embedding vacío
            vector_dim = getattr(settings, "default_embedding_dimension", 1536)
            time.sleep(0.01)
            self.logger.info("MOCK EMBEDDING GENERATED (Costo $0)")
            return [0.0] * vector_dim

        key = f"emb:query:{self.model_name}:{self._hash_text(query)}"

        try:
            cached = cache.get(key)
            if cached is not None:
                self.logger.debug("Cache HIT embedding consulta")
                return cached
        except Exception:
            pass

        self.logger.debug(f"Cache MISS embedding consulta — generando: {query}")

        vector_dim = getattr(settings, "default_embedding_dimension", 1536)

        try:
            embedding = self._openai.embed_query(query)
            if isinstance(embedding, np.ndarray):
                embedding = embedding.tolist()

            # FIX 1 — validar dimensión
            if not embedding or len(embedding) != vector_dim:
                embedding = [0.0] * vector_dim

            try:
                cache.set(key, embedding, cache.ttl)
            except Exception:
                pass

            return embedding

        except Exception as e:
            self.logger.warning(f"Error al generar embedding para consulta: {e}")
            return [0.0] * vector_dim

    # ----------------------------------------------------------------------
    #   EMBED DOCUMENTS ASYNC — Para no bloquear workers en ingesta
    # ----------------------------------------------------------------------
    async def embed_documents_async(self, texts: List[str]) -> List[List[float]]:
        """Genera embeddings de forma asíncrona para no bloquear el event loop.
        
        Útil para ingesta de PDFs donde el proceso puede tardar varios segundos.
        """
        import asyncio
        return await asyncio.to_thread(self.embed_documents, texts)

    # ----------------------------------------------------------------------
    async def embed_text(self, text: str) -> List[float]:
        """Genera embedding para un texto individual de forma asíncrona."""
        vector_dim = getattr(settings, "default_embedding_dimension", 1536)

        if not text or len(text) < 3:
            return [0.0] * vector_dim

        try:
            return self.embed_query(text)
        except Exception as e:
            self.logger.warning(f"Error al generar embedding para texto: {e}")
            return [0.0] * vector_dim