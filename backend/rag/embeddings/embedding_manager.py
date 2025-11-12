from typing import List, Optional
import numpy as np
from utils.logging_utils import get_logger
from config import settings

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

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Genera embeddings para una lista de textos usando OpenAI."""
        if not texts:
            self.logger.debug("No hay textos para generar embeddings")
            return []

        filtered_texts = []
        for text in texts:
            if text and len(text.strip()) >= 3:
                filtered_texts.append(text)
            else:
                # Para textos muy cortos, usar un placeholder
                filtered_texts.append("placeholder_text")

        try:
            self.logger.debug(
                f"Generando embeddings por lotes: total={len(filtered_texts)}, batch_size={self._batch_size}"
            )
            result_embeddings: List[List[float]] = []
            # Batching explícito para evitar llamadas individuales
            for start in range(0, len(filtered_texts), self._batch_size):
                batch = filtered_texts[start:start + self._batch_size]
                batch_embs = self._openai.embed_documents(batch)
                # Normalizar salida de cada batch
                for emb in batch_embs:
                    if isinstance(emb, np.ndarray):
                        result_embeddings.append(emb.tolist())
                    else:
                        result_embeddings.append(emb)
            self.logger.debug("Embeddings generados exitosamente (batched)")
            return result_embeddings
        except Exception as e:
            self.logger.warning(f"Error al generar embeddings: {e}")
            # Fallback: devolver vectores de ceros
            vector_dim = getattr(settings, "default_embedding_dimension", 1536)
            return [[0.0] * vector_dim for _ in range(len(texts))]

    def embed_query(self, query: str) -> List[float]:
        """Genera embedding para una consulta usando OpenAI."""
        self.logger.debug(f"Generando embedding para consulta: {query}")
        try:
            embedding = self._openai.embed_query(query)
            # Asegurar que el resultado es una lista, no un ndarray
            if isinstance(embedding, np.ndarray):
                embedding = embedding.tolist()
            self.logger.debug("Embedding de consulta generado")
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