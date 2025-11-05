from typing import List, Optional
import numpy as np
from utils.logging_utils import get_logger

# Opcional: usar embeddings remotos de OpenAI para reducir uso de memoria
try:
    from langchain_openai import OpenAIEmbeddings
    _OPENAI_AVAILABLE = True
except Exception:
    _OPENAI_AVAILABLE = False

# Carga diferida de SentenceTransformer para evitar uso de memoria en arranque
_ST = None
def _load_st():
    global _ST
    if _ST is None:
        from sentence_transformers import SentenceTransformer
        _ST = SentenceTransformer
    return _ST

class EmbeddingManager:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """Inicializa el gestor de embeddings.

        Reglas:
        - Si `model_name` comienza por `openai:`, usa OpenAI Embeddings (memoria mínima).
        - En caso contrario, usa SentenceTransformer con carga perezosa.
        """
        self.model_name = model_name
        self.logger = get_logger(self.__class__.__name__)
        self._st_model: Optional[object] = None  # Carga perezosa
        self._openai: Optional[OpenAIEmbeddings] = None

        if isinstance(model_name, str) and model_name.lower().startswith("openai:"):
            if not _OPENAI_AVAILABLE:
                raise RuntimeError("langchain-openai no está disponible para usar embeddings OpenAI")
            openai_model = model_name.split(":", 1)[1] or "text-embedding-3-small"
            self.logger.info(f"Usando OpenAIEmbeddings: {openai_model}")
            self._openai = OpenAIEmbeddings(model=openai_model)
        else:
            self.logger.info(f"Configurando SentenceTransformer (carga perezosa): {model_name}")
            # No cargar aún; se cargará en el primer uso

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Genera embeddings para una lista de textos."""
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
            self.logger.debug(f"Generando embeddings para {len(filtered_texts)} textos")
            if self._openai is not None:
                embeddings = self._openai.embed_documents(filtered_texts)
            else:
                if self._st_model is None:
                    ST = _load_st()
                    self._st_model = ST(self.model_name)
                    self.logger.debug("Modelo SentenceTransformer cargado")
                embeddings = self._st_model.encode(filtered_texts, convert_to_tensor=False)

            # Asegurar que los resultados son listas, no ndarrays
            result_embeddings = []
            for emb in embeddings:
                if isinstance(emb, np.ndarray):
                    result_embeddings.append(emb.tolist())
                else:
                    result_embeddings.append(emb)
            self.logger.debug("Embeddings generados exitosamente")
            return result_embeddings
        except Exception as e:
            self.logger.warning(f"Error al generar embeddings: {e}")
            # Fallback: devolver vectores de ceros
            vector_dim = 384  # Dimensión típica de all-MiniLM-L6-v2
            return [[0.0] * vector_dim for _ in range(len(texts))]

    def embed_query(self, query: str) -> List[float]:
        """Genera embedding para una consulta."""
        self.logger.debug(f"Generando embedding para consulta: {query}")
        try:
            if self._openai is not None:
                embedding = self._openai.embed_query(query)
            else:
                if self._st_model is None:
                    ST = _load_st()
                    self._st_model = ST(self.model_name)
                    self.logger.debug("Modelo SentenceTransformer cargado")
                embedding = self._st_model.encode([query], convert_to_tensor=False)[0]
            # Asegurar que el resultado es una lista, no un ndarray
            if isinstance(embedding, np.ndarray):
                embedding = embedding.tolist()
            self.logger.debug("Embedding de consulta generado")
            return embedding
        except Exception as e:
            self.logger.warning(f"Error al generar embedding para consulta: {e}")
            # Fallback: devolver un vector de ceros si hay algún error
            vector_dim = 384  # Dimensión típica de all-MiniLM-L6-v2
            return [0.0] * vector_dim
        
    async def embed_text(self, text: str) -> List[float]:
        """Genera embedding para un texto individual de forma asíncrona."""
        # Optimizar para textos vacíos o muy cortos
        if not text or len(text) < 3:
            # Devolver un vector de ceros como fallback para textos muy cortos
            vector_dim = 384  # Dimensión típica de all-MiniLM-L6-v2
            return [0.0] * vector_dim
            
        try:
            # Usar embed_query para aprovechar el logging y conversión a lista
            return self.embed_query(text)
        except Exception as e:
            self.logger.warning(f"Error al generar embedding para texto: {e}")
            # Fallback en caso de error
            vector_dim = 384  # Dimensión típica de all-MiniLM-L6-v2
            return [0.0] * vector_dim

    def get_embedding_model(self):
        """Retorna el modelo de embeddings para uso directo."""
        if self._openai is not None:
            return self._openai
        if self._st_model is None:
            ST = _load_st()
            self._st_model = ST(self.model_name)
        return self._st_model