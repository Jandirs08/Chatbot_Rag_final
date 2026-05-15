"""Corpus centroid for out-of-scope query detection.

Computes the mean embedding vector of all corpus chunks (the "centroid").
At query time, compares the query embedding against the centroid via cosine
similarity. Queries far from the centroid (e.g. "precio iPhone 15" against
an agronomy corpus) get tagged as `out_of_scope` — distinguished from real
in-domain gaps in the knowledge-gaps dashboard.

Why:
  Today the system can't tell apart:
    - Off-topic noise (iPhone, recipes, weather) → not actionable
    - Real domain gaps (corpus is missing this info) → actionable for content team
  Both look the same in the gaps tab. Centroid distance is a cheap,
  deterministic, no-LLM heuristic to separate them.

Caching:
  The centroid is a function of the corpus state. We cache it in Redis
  keyed by the corpus version (bumped on every ingest/delete). Lazy-compute
  on first miss after a version bump; reused across all subsequent requests
  in that version window.

Cost:
  - First miss after corpus change: O(N) Qdrant scroll + mean computation,
    seconds-to-minutes depending on corpus size. Happens once per ingest.
  - Per-query cost: 1 dot product (1536 dims) — microseconds. Effectively free.
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import threading
from collections import OrderedDict
from typing import Optional

import numpy as np

from cache.manager import cache
from config import settings
from rag.corpus_state import get_corpus_cache_version

logger = logging.getLogger(__name__)

# Cosine similarity threshold below which a query is considered out-of-scope.
# 0.25 is conservative: text-embedding-3-small typically puts random off-topic
# queries at 0.0-0.20 vs a domain centroid, while in-domain queries land
# 0.30+. Tune per-deploy if false positives or negatives appear.
_OUT_OF_SCOPE_THRESHOLD: float = float(
    getattr(settings, "out_of_scope_threshold", 0.25)
)

# How many vectors to pull per Qdrant scroll page.
_SCROLL_BATCH_SIZE: int = 256

# Cache TTL upper-bound (also invalidated by corpus version bumps).
_CENTROID_CACHE_TTL_S: int = 24 * 3600

# In-process cache so concurrent first-callers don't all hit Qdrant.
# threading.Lock (not asyncio.Lock) — asyncio.Lock is bound to whichever
# event loop first touches it; a module-level instance would break under
# multi-worker setups or test runners that spin up their own loops. The
# critical section is short and CPU-only (dict get/set), so a plain
# threading.Lock is correct and cheap.
_centroid_cache_lock: threading.Lock = threading.Lock()
# Bounded LRU: keep last N corpus versions to avoid unbounded growth across
# many ingests on long-running workers. Each entry is ~6KB (1536 float32),
# so the cap is generous — primarily defends against accidental leaks.
_CENTROID_CACHE_MAX_ENTRIES: int = 4
_centroid_cache: "OrderedDict[str, Optional[np.ndarray]]" = OrderedDict()


def _cache_put(version: str, value: Optional[np.ndarray]) -> None:
    with _centroid_cache_lock:
        _centroid_cache[version] = value
        _centroid_cache.move_to_end(version)
        while len(_centroid_cache) > _CENTROID_CACHE_MAX_ENTRIES:
            _centroid_cache.popitem(last=False)


def _cache_get(version: str) -> tuple[bool, Optional[np.ndarray]]:
    """Return (hit, value). Hit means the version key exists (value may be None
    for previously-failed compute, which we still want to short-circuit on)."""
    with _centroid_cache_lock:
        if version in _centroid_cache:
            _centroid_cache.move_to_end(version)
            return True, _centroid_cache[version]
    return False, None


def clear_inprocess_cache() -> None:
    """Drop the worker-local centroid cache. Called after corpus refresh."""
    with _centroid_cache_lock:
        _centroid_cache.clear()


def _serialize_centroid(arr: np.ndarray) -> str:
    """Safe wire form: base64-encoded .npy bytes. NO pickle (RCE risk).

    Returned as a string so it survives the cache layer's JSON serializer.
    """
    buf = io.BytesIO()
    np.save(buf, arr, allow_pickle=False)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _deserialize_centroid(blob: object) -> Optional[np.ndarray]:
    """Inverse of _serialize_centroid. Rejects pickle payloads by construction."""
    try:
        if isinstance(blob, str):
            raw = base64.b64decode(blob.encode("ascii"))
        elif isinstance(blob, (bytes, bytearray)):
            raw = bytes(blob)
        else:
            return None
        return np.load(io.BytesIO(raw), allow_pickle=False)
    except Exception as exc:
        logger.warning("centroid cache blob malformed (ignored): %s", exc)
        return None


def _cache_key(corpus_version: str) -> str:
    return f"rag:corpus_centroid:v{corpus_version}"


def _l2_normalize(vec: np.ndarray) -> np.ndarray:
    """Normalize so cosine similarity == dot product."""
    norm = float(np.linalg.norm(vec))
    if norm == 0.0:
        return vec
    return vec / norm


async def compute_centroid(vector_store) -> Optional[np.ndarray]:
    """Pull every vector out of Qdrant and return its L2-normalized mean.

    Streaming accumulator (running sum + count) rather than materializing
    all vectors — at 1536 dims × float32, a 100k-doc corpus would otherwise
    pin ~600MB resident. Welford-style is overkill for plain mean; a
    float64 running sum + integer count is numerically stable enough and
    keeps memory at a fixed ~12KB.

    Returns None if:
      - The corpus is empty (nothing to compare against).
      - Qdrant is unreachable (caller should treat as fail-open — skip the
        out-of-scope check rather than block the user).
      - Vector dims are inconsistent across the corpus (corrupted state).
    """
    def _scroll_and_accumulate() -> Optional[np.ndarray]:
        client = getattr(vector_store, "client", None)
        collection = getattr(vector_store, "collection_name", None)
        if client is None or not collection:
            return None

        sum_vec: Optional[np.ndarray] = None
        count: int = 0
        expected_dim: Optional[int] = None
        next_offset = None

        while True:
            points, next_offset = client.scroll(
                collection_name=collection,
                limit=_SCROLL_BATCH_SIZE,
                offset=next_offset,
                with_payload=False,
                with_vectors=True,
            )
            for p in points:
                vec = getattr(p, "vector", None)
                if vec is None:
                    continue
                arr = np.asarray(vec, dtype=np.float64)
                if arr.size == 0:
                    continue
                if expected_dim is None:
                    expected_dim = arr.shape[0]
                    sum_vec = np.zeros(expected_dim, dtype=np.float64)
                elif arr.shape[0] != expected_dim:
                    logger.warning(
                        "centroid: inconsistent vector dims (expected=%d got=%d)",
                        expected_dim, arr.shape[0],
                    )
                    return None
                sum_vec += arr
                count += 1
            if next_offset is None or not points:
                break

        if count == 0 or sum_vec is None:
            return None
        mean = sum_vec / float(count)
        return _l2_normalize(mean.astype(np.float32))

    try:
        return await asyncio.to_thread(_scroll_and_accumulate)
    except Exception as exc:
        logger.warning("centroid scroll failed: %s", exc, exc_info=True)
        return None


async def get_centroid(vector_store) -> Optional[np.ndarray]:
    """Return cached or freshly-computed centroid for the current corpus version.

    Cache lookup order: in-process LRU → Redis → recompute. Concurrent
    callers within one process serialize via threading.Lock; across
    workers, Redis amortizes the cost so the second worker reads what the
    first computed.
    """
    version = get_corpus_cache_version()

    # Fast path: in-process LRU
    hit, value = _cache_get(version)
    if hit:
        return value

    # Try Redis (base64-encoded npy, JSON-safe; no pickle)
    key = _cache_key(version)
    try:
        cached_blob = cache.get(key)
        if cached_blob is not None:
            arr = _deserialize_centroid(cached_blob)
            if isinstance(arr, np.ndarray):
                _cache_put(version, arr)
                return arr
    except Exception as exc:
        logger.debug("centroid Redis read failed (non-fatal): %s", exc)

    # Compute fresh. Note: across multiple workers, several may race here
    # on first miss. We accept that — Redis write is idempotent (same
    # centroid for same version) and the scroll dominates the cost only
    # once per ingest in practice.
    centroid = await compute_centroid(vector_store)
    _cache_put(version, centroid)

    if centroid is not None:
        try:
            cache.set(key, _serialize_centroid(centroid), ttl=_CENTROID_CACHE_TTL_S)
        except Exception as exc:
            logger.debug("centroid Redis write failed (non-fatal): %s", exc)

    return centroid


def is_out_of_scope(
    query_embedding: np.ndarray,
    centroid: Optional[np.ndarray],
    threshold: float = _OUT_OF_SCOPE_THRESHOLD,
) -> bool:
    """Return True if cosine(query, centroid) < threshold.

    Fail-open: if centroid is None or shapes mismatch, returns False
    (assume in-scope, let the rest of the pipeline decide). The dashboard
    will still surface real gaps via other reasons.
    """
    if centroid is None or query_embedding is None:
        return False
    if query_embedding.shape != centroid.shape:
        logger.debug(
            "centroid shape mismatch query=%s centroid=%s — skipping check",
            query_embedding.shape, centroid.shape,
        )
        return False
    # Both vectors are already L2-normalized in their own pipelines, so
    # dot product == cosine similarity. Defensive re-normalize is cheap.
    q = _l2_normalize(query_embedding.astype(np.float32))
    similarity = float(np.dot(q, centroid))
    return similarity < threshold
