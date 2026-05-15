"""Unit tests for rag.corpus_centroid — out-of-scope detection."""
from __future__ import annotations

from unittest.mock import MagicMock

import numpy as np
import pytest

from rag.corpus_centroid import _l2_normalize, is_out_of_scope, compute_centroid


def _normalized(arr: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(arr))
    return arr / n if n > 0 else arr


# ─── _l2_normalize ───────────────────────────────────────────────────────────

def test_l2_normalize_returns_unit_vector():
    v = np.array([3.0, 4.0], dtype=np.float32)
    out = _l2_normalize(v)
    assert pytest.approx(float(np.linalg.norm(out)), abs=1e-6) == 1.0


def test_l2_normalize_handles_zero_vector():
    v = np.zeros(5, dtype=np.float32)
    out = _l2_normalize(v)
    assert np.array_equal(out, v)


# ─── is_out_of_scope ─────────────────────────────────────────────────────────

def test_is_out_of_scope_returns_false_when_centroid_is_none():
    """Fail-open: missing centroid never blocks retrieval."""
    q = np.array([0.1, 0.2, 0.3], dtype=np.float32)
    assert is_out_of_scope(q, None) is False


def test_is_out_of_scope_returns_false_on_shape_mismatch():
    """Defensive: shape mismatch doesn't crash, falls through."""
    q = np.array([0.1, 0.2], dtype=np.float32)
    c = np.array([0.1, 0.2, 0.3], dtype=np.float32)
    assert is_out_of_scope(q, c) is False


def test_is_out_of_scope_in_domain_query():
    """Query aligned with centroid (cos ~1.0) → in-scope → False."""
    centroid = _normalized(np.array([1.0, 1.0, 1.0], dtype=np.float32))
    query = _normalized(np.array([1.0, 0.95, 1.0], dtype=np.float32))
    assert is_out_of_scope(query, centroid) is False


def test_is_out_of_scope_orthogonal_query():
    """Query orthogonal to centroid (cos ~0.0) → out-of-scope → True."""
    centroid = _normalized(np.array([1.0, 0.0, 0.0], dtype=np.float32))
    query = _normalized(np.array([0.0, 1.0, 0.0], dtype=np.float32))
    assert is_out_of_scope(query, centroid) is True


def test_is_out_of_scope_respects_custom_threshold():
    """A higher threshold rejects more queries as out-of-scope."""
    centroid = _normalized(np.array([1.0, 1.0], dtype=np.float32))
    # cos ≈ 0.4
    query = _normalized(np.array([1.0, -0.43], dtype=np.float32))
    assert is_out_of_scope(query, centroid, threshold=0.30) is False
    assert is_out_of_scope(query, centroid, threshold=0.50) is True


# ─── compute_centroid ────────────────────────────────────────────────────────

class _FakeQdrantPoint:
    def __init__(self, vec):
        self.vector = vec


class _FakeQdrantClient:
    def __init__(self, vectors_per_page):
        # vectors_per_page: list of lists; each inner list is one page.
        self.pages = vectors_per_page
        self.calls = 0

    def scroll(self, *, collection_name, limit, offset, with_payload, with_vectors):
        if self.calls >= len(self.pages):
            return [], None
        page = self.pages[self.calls]
        self.calls += 1
        points = [_FakeQdrantPoint(v) for v in page]
        next_offset = self.calls if self.calls < len(self.pages) else None
        return points, next_offset


def _fake_vector_store(pages):
    vs = MagicMock()
    vs.client = _FakeQdrantClient(pages)
    vs.collection_name = "test_collection"
    return vs


@pytest.mark.asyncio
async def test_compute_centroid_returns_mean_of_vectors():
    vectors = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    vs = _fake_vector_store([vectors])
    centroid = await compute_centroid(vs)
    assert centroid is not None
    # Mean = (1/3, 1/3, 1/3), normalized → all components equal.
    assert pytest.approx(float(np.linalg.norm(centroid)), abs=1e-6) == 1.0
    assert pytest.approx(centroid[0], abs=1e-5) == centroid[1] == centroid[2]


@pytest.mark.asyncio
async def test_compute_centroid_paginates():
    """Multi-page scroll should aggregate all vectors, not just first page."""
    page1 = [[1.0, 0.0]] * 2
    page2 = [[0.0, 1.0]] * 2
    vs = _fake_vector_store([page1, page2])
    centroid = await compute_centroid(vs)
    assert centroid is not None
    # Equal weight from both pages → centroid ~ (0.707, 0.707).
    assert pytest.approx(centroid[0], abs=1e-4) == centroid[1]


@pytest.mark.asyncio
async def test_compute_centroid_empty_corpus_returns_none():
    vs = _fake_vector_store([])
    assert await compute_centroid(vs) is None


@pytest.mark.asyncio
async def test_compute_centroid_returns_none_on_dim_mismatch():
    """Defensive: corrupted state with mixed dims must not crash."""
    vs = _fake_vector_store([[[1.0, 0.0], [0.0, 1.0, 0.0]]])
    assert await compute_centroid(vs) is None


@pytest.mark.asyncio
async def test_compute_centroid_handles_missing_client():
    vs = MagicMock()
    vs.client = None
    vs.collection_name = "anything"
    assert await compute_centroid(vs) is None
