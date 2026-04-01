"""Shared test fixtures for backend unit tests."""

from __future__ import annotations

import importlib
import os
import sys
import types
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import numpy as np
import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _seed_required_env() -> None:
    os.environ.setdefault("ENVIRONMENT", "testing")
    os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
    os.environ.setdefault("JWT_SECRET", "test-jwt-secret")


def _install_qdrant_stubs() -> None:
    if "qdrant_client" in sys.modules:
        return

    class _ModelBase:
        def __init__(self, *args, **kwargs):
            self.args = args
            for key, value in kwargs.items():
                setattr(self, key, value)

    class QdrantClient:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

        def get_collections(self):
            return SimpleNamespace(collections=[])

        def create_collection(self, *args, **kwargs):
            return None

        def create_payload_index(self, *args, **kwargs):
            return None

    class Distance:
        COSINE = "cosine"

    qdrant_module = types.ModuleType("qdrant_client")
    qdrant_http_module = types.ModuleType("qdrant_client.http")
    qdrant_models_module = types.ModuleType("qdrant_client.http.models")

    qdrant_module.QdrantClient = QdrantClient

    qdrant_models_module.Distance = Distance
    qdrant_models_module.VectorParams = type("VectorParams", (_ModelBase,), {})
    qdrant_models_module.PointStruct = type("PointStruct", (_ModelBase,), {})
    qdrant_models_module.Filter = type("Filter", (_ModelBase,), {})
    qdrant_models_module.FieldCondition = type("FieldCondition", (_ModelBase,), {})
    qdrant_models_module.MatchValue = type("MatchValue", (_ModelBase,), {})
    qdrant_models_module.FilterSelector = type("FilterSelector", (_ModelBase,), {})
    qdrant_models_module.HnswConfigDiff = type("HnswConfigDiff", (_ModelBase,), {})
    qdrant_models_module.OptimizersConfigDiff = type("OptimizersConfigDiff", (_ModelBase,), {})
    qdrant_models_module.NearestQuery = type("NearestQuery", (_ModelBase,), {})

    sys.modules["qdrant_client"] = qdrant_module
    sys.modules["qdrant_client.http"] = qdrant_http_module
    sys.modules["qdrant_client.http.models"] = qdrant_models_module


def _bootstrap_imports() -> None:
    if "utils" not in sys.modules:
        utils_pkg = types.ModuleType("utils")
        utils_pkg.__path__ = [str(BACKEND_DIR / "utils")]
        utils_pkg.__package__ = "utils"
        sys.modules["utils"] = utils_pkg

    importlib.import_module("utils.logging_utils")
    importlib.import_module("cache.manager")
    importlib.reload(sys.modules["utils"])


_seed_required_env()
_install_qdrant_stubs()
_bootstrap_imports()


def _make_mock_settings(**overrides):
    defaults = {
        "default_embedding_dimension": 1536,
        "enable_cache": False,
        "similarity_threshold": 0.3,
        "rag_gating_similarity_threshold": 0.20,
        "retrieval_k": 4,
        "retrieval_k_multiplier": 3,
        "embedding_batch_size": 32,
        "mock_mode": False,
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
    return _make_mock_settings()


@pytest.fixture
def mock_vector_store():
    vs = MagicMock()
    vs.collection_name = "test_collection"
    vs.client = MagicMock()
    vs.client.count = MagicMock(return_value=SimpleNamespace(count=100))
    return vs


@pytest.fixture
def mock_embedding_manager():
    em = MagicMock()

    def fake_embed(text):
        vec = np.random.randn(1536).astype(np.float32)
        return (vec / np.linalg.norm(vec)).tolist()

    em.embed_query = fake_embed
    return em


@pytest.fixture
def retriever(mock_vector_store, mock_embedding_manager, mock_settings, monkeypatch):
    import rag.retrieval.retriever as retriever_mod

    mock_cache = MagicMock()
    mock_cache.get.return_value = None
    mock_cache.set = MagicMock()
    mock_cache.invalidate_prefix = MagicMock()

    monkeypatch.setattr(retriever_mod, "settings", mock_settings)
    monkeypatch.setattr(retriever_mod, "cache", mock_cache)

    instance = retriever_mod.RAGRetriever(
        vector_store=mock_vector_store,
        embedding_manager=mock_embedding_manager,
        cache_enabled=False,
    )
    return instance


@pytest.fixture
def anyio_backend():
    return "asyncio"


def make_doc(
    content="Texto de ejemplo",
    chunk_type="text",
    source="test.pdf",
    score=0.5,
    quality_score=0.5,
    vector=None,
    page_number=1,
):
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
