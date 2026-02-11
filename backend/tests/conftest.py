"""
Fixtures compartidas para tests unitarios del backend.

Ejecutar dentro del contenedor Docker:
  docker exec chatbot-backend python -m pytest tests/ -v

Ningún fixture conecta a servicios reales (Redis, MongoDB, Qdrant, OpenAI).
Todos los componentes que hacen I/O se mockean.
"""
import pytest
import numpy as np
from unittest.mock import MagicMock
from types import SimpleNamespace


# ============================================================
#   PRE-IMPORT: Romper dependencia circular del codebase.
#   Cadena: cache.manager → utils.logging_utils → utils/__init__
#           → chain_cache → cache.manager (circular!)
#
#   Solución: Registrar 'utils' como paquete con el path correcto
#   pero SIN ejecutar __init__.py. Luego cargar cache.manager
#   completo. Finalmente recargar utils para que __init__ pueda
#   importar chain_cache sin ciclo.
# ============================================================

import importlib
import sys
import os

# 1. Registrar 'utils' como paquete stub (sin ejecutar __init__)
if "utils" not in sys.modules:
    import types as _types
    _utils_pkg = _types.ModuleType("utils")
    # __path__ debe apuntar al directorio real de utils
    _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _utils_pkg.__path__ = [os.path.join(_backend_dir, "utils")]
    _utils_pkg.__package__ = "utils"
    sys.modules["utils"] = _utils_pkg

# 2. Cargar logging_utils directamente (sin pasar por __init__)
importlib.import_module("utils.logging_utils")

# 3. Ahora cache.manager carga completo (ya no hay ciclo)
importlib.import_module("cache.manager")

# 4. Recargar utils/__init__ real para que chain_cache funcione
importlib.reload(sys.modules["utils"])


# ============================================================
#   MOCK SETTINGS (evitar dependencia de .env real)
# ============================================================

def _make_mock_settings(**overrides):
    """Crea un objeto settings mockeado con defaults razonables."""
    defaults = {
        "default_embedding_dimension": 1536,
        "enable_cache": False,
        "similarity_threshold": 0.3,
        "rag_gating_similarity_threshold": 0.20,
        "retrieval_k": 4,
        "retrieval_k_multiplier": 3,
        "log_level": "WARNING",
        "environment": "testing",
        "qdrant_collection_name": "test_collection",
        "qdrant_url": "http://localhost:6333",
        "qdrant_api_key": None,
        "embedding_model": "openai:text-embedding-3-small",
        "cache_ttl": 300,
        "max_cache_size": 100,
        "batch_size": 100,
        "distance_strategy": "cosine",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.fixture
def mock_settings():
    """Settings mockeadas sin dependencia de .env."""
    return _make_mock_settings()


# ============================================================
#   MOCK VECTOR STORE
# ============================================================

@pytest.fixture
def mock_vector_store():
    """VectorStore stub — no conecta a Qdrant."""
    vs = MagicMock()
    vs.collection_name = "test_collection"
    vs.client = MagicMock()
    vs.client.count = MagicMock(return_value=SimpleNamespace(count=100))
    return vs


# ============================================================
#   MOCK EMBEDDING MANAGER
# ============================================================

@pytest.fixture
def mock_embedding_manager():
    """EmbeddingManager stub — no conecta a OpenAI."""
    em = MagicMock()
    def fake_embed(text):
        vec = np.random.randn(1536).astype(np.float32)
        return (vec / np.linalg.norm(vec)).tolist()
    em.embed_query = fake_embed
    return em


# ============================================================
#   RAG RETRIEVER (con mocks inyectados)
# ============================================================

@pytest.fixture
def retriever(mock_vector_store, mock_embedding_manager, mock_settings):
    """
    RAGRetriever construido con mocks.
    Parchea settings y cache para evitar I/O real.
    """
    import rag.retrieval.retriever as retriever_mod

    mock_cache = MagicMock()
    mock_cache.get.return_value = None
    mock_cache.set = MagicMock()

    original_settings = retriever_mod.settings
    original_cache = retriever_mod.cache
    retriever_mod.settings = mock_settings
    retriever_mod.cache = mock_cache

    try:
        r = retriever_mod.RAGRetriever(
            vector_store=mock_vector_store,
            embedding_manager=mock_embedding_manager,
            cache_enabled=False,
        )
        centroid = np.random.randn(1536).astype(np.float32)
        r._centroid_embedding = centroid / np.linalg.norm(centroid)
        yield r
    finally:
        retriever_mod.settings = original_settings
        retriever_mod.cache = original_cache


# ============================================================
#   HELPER: GENERAR DOCUMENTS MOCK
# ============================================================

def make_doc(content="Texto de ejemplo", chunk_type="text", source="test.pdf",
             score=0.5, quality_score=0.5, vector=None, page_number=1):
    """Crea un langchain Document con metadata configurable."""
    from langchain_core.documents import Document

    metadata = {
        "chunk_type": chunk_type,
        "source": source,
        "score": score,
        "quality_score": quality_score,
        "page_number": page_number,
    }
    if vector is not None:
        metadata["vector"] = vector

    return Document(page_content=content, metadata=metadata)
