from typing import List, Optional
import numpy as np
from utils.logging_utils import get_logger
from config import settings
from cache.manager import cache
import hashlib

# Usar embeddings remotos de OpenAI para reducir uso de memoria
try:
    from langchain_openai import OpenAIEmbeddings
    _OPENAI_AVAILABLE = True
except Exception:
    _OPENAI_AVAILABLE = False


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

        # Parsear nombre de modelo de OpenAI
        if isinstance(model_name, str) and model_name.lower().startswith("openai:"):
            openai_model = model_name.split(":", 1)[1] or "text-embedding-3-small"
        else:
            self.logger.warning(
                f"Modelo de embeddings '{model_name}' no es OpenAI. Usando 'text-embedding-3-small' por defecto."
            )
            openai_model = "text-embedding-3-small"

        # Instanciar embeddings sin argumentos no soportados por la versión instalada
        self.logger.info(
            f"Usando OpenAIEmbeddings: {openai_model} (batch_size interno={getattr(settings, 'embedding_batch_size', 32)})"
        )
        self._openai = OpenAIEmbeddings(model=openai_model)
        # Guardar batch_size para batching explícito en embed_documents
        self._batch_size = getattr(settings, "embedding_batch_size", 32)

    @staticmethod
    def _hash_text(text: str) -> str:
        norm = (text or "").strip().lower()
        return hashlib.sha256(norm.encode("utf-8")).hexdigest()

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Genera embeddings para una lista de textos usando OpenAI."""
        if not texts:
            self.logger.debug("No hay textos para generar embeddings")
            return []

        # Normalizar textos (placeholder para textos muy cortos)
        filtered_texts = [t if (t and len(t.strip()) >= 3) else "placeholder_text" for t in texts]

        # Intento de cache por elemento
        results: List[Optional[List[float]]] = [None] * len(filtered_texts)
        miss_indices: List[int] = []
        for i, t in enumerate(filtered_texts):
            key = f"emb:doc:{self.model_name}:{self._hash_text(t)}"
            try:
                cached = cache.get(key)
                if cached is not None:
                    results[i] = cached
                else:
                    miss_indices.append(i)
            except Exception:
                miss_indices.append(i)
        hit_count = len(filtered_texts) - len(miss_indices)
        if hit_count:
            self.logger.debug(f"Cache HIT embeddings documentos: {hit_count}/{len(filtered_texts)}")
        if miss_indices:
            self.logger.debug(
                f"Cache MISS embeddings documentos: {len(miss_indices)}/{len(filtered_texts)} — generando para misses"
            )

        try:
            # Generar solo para elementos no cacheados (por lotes)
            # Construir lotes desde miss_indices para respetar batch_size
            index_to_embedding: dict[int, List[float]] = {}
            for start in range(0, len(miss_indices), self._batch_size):
                batch_indices = miss_indices[start:start + self._batch_size]
                batch_texts = [filtered_texts[i] for i in batch_indices]
                self.logger.debug(
                    f"Generando embeddings por lotes de misses: lote={len(batch_texts)}, batch_size={self._batch_size}"
                )
                batch_embs = self._openai.embed_documents(batch_texts)
                for idx, emb in zip(batch_indices, batch_embs):
                    if isinstance(emb, np.ndarray):
                        emb = emb.tolist()
                    index_to_embedding[idx] = emb
            # Ensamblar resultados y escribir en cache misses
            for i in miss_indices:
                emb = index_to_embedding.get(i)
                if emb is None:
                    # Fallback: vector de ceros si algo falló puntualmente
                    vector_dim = getattr(settings, "default_embedding_dimension", 1536)
                    emb = [0.0] * vector_dim
                results[i] = emb
                try:
                    key = f"emb:doc:{self.model_name}:{self._hash_text(filtered_texts[i])}"
                    cache.set(key, emb, cache.ttl)
                except Exception:
                    pass
            # Convertir todos a List[List[float]]
            final_embeddings: List[List[float]] = []
            for emb in results:
                if isinstance(emb, np.ndarray):
                    final_embeddings.append(emb.tolist())
                else:
                    final_embeddings.append([0.0] * vector_dim)
            self.logger.debug("Embeddings generados con soporte de caché")
            return final_embeddings
        except Exception as e:
            self.logger.warning(f"Error al generar embeddings: {e}")
            # Fallback: devolver vectores de ceros
            vector_dim = getattr(settings, "default_embedding_dimension", 1536)
            return [[0.0] * vector_dim for _ in range(len(texts))]

    def embed_query(self, query: str) -> List[float]:
        """Genera embedding para una consulta usando OpenAI."""
        # Intentar cache primero
        key = f"emb:query:{self.model_name}:{self._hash_text(query)}"
        try:
            cached = cache.get(key)
            if cached is not None:
                self.logger.debug("Cache HIT embedding consulta")
                return cached
        except Exception:
            pass
        self.logger.debug(f"Cache MISS embedding consulta — generando: {query}")
        try:
            embedding = self._openai.embed_query(query)
            # Asegurar que el resultado es una lista, no un ndarray
            if isinstance(embedding, np.ndarray):
                embedding = embedding.tolist()
            self.logger.debug("Embedding de consulta generado")
            try:
                cache.set(key, embedding, cache.ttl)
            except Exception:
                pass
            return embedding
        except Exception as e:
            self.logger.warning(f"Error al generar embedding para consulta: {e}")
            # Fallback: devolver un vector de ceros si hay algún error
            vector_dim = getattr(settings, "default_embedding_dimension", 1536)
            return [0.0] * vector_dim

    async def embed_text(self, text: str) -> List[float]:
        """Genera embedding para un texto individual de forma asíncrona."""
        # Optimizar para textos vacíos o muy cortos
        if not text or len(text) < 3:
            # Devolver un vector de ceros como fallback para textos muy cortos
            vector_dim = getattr(settings, "default_embedding_dimension", 1536)
            return [0.0] * vector_dim

        try:
            # Usar embed_query para aprovechar el logging y conversión a lista
            return self.embed_query(text)
        except Exception as e:
            self.logger.warning(f"Error al generar embedding para texto: {e}")
            # Fallback en caso de error
            vector_dim = getattr(settings, "default_embedding_dimension", 1536)
            return [0.0] * vector_dim

    # reserved for lazy-load model
    # (sin uso actual). Si en el futuro se requiere exposición directa
    # del modelo subyacente, implementar aquí la carga diferida.