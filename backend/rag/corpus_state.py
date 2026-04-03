from __future__ import annotations

from typing import Optional

from fastapi import BackgroundTasks

from cache.manager import cache
from utils.logging_utils import get_logger

logger = get_logger(__name__)

CORPUS_VERSION_CACHE_KEY = "meta:rag:corpus_version"
DEFAULT_CORPUS_VERSION = "0"


def get_corpus_cache_version() -> str:
    try:
        current = cache.get(CORPUS_VERSION_CACHE_KEY)
        if current is None:
            return DEFAULT_CORPUS_VERSION
        if isinstance(current, bool):
            return str(int(current))
        if isinstance(current, (int, float)):
            return str(int(current))
        normalized = str(current).strip()
        return normalized or DEFAULT_CORPUS_VERSION
    except Exception:
        return DEFAULT_CORPUS_VERSION


def bump_corpus_cache_version() -> str:
    try:
        new_version = cache.increment(CORPUS_VERSION_CACHE_KEY, delta=1, initial=0)
        return str(int(new_version))
    except Exception as exc:
        logger.warning("Could not increment corpus version: %s", exc)
        return get_corpus_cache_version()


def refresh_rag_corpus_state(
    rag_retriever=None,
    background_tasks: Optional[BackgroundTasks] = None,
) -> str:
    del background_tasks

    new_version = bump_corpus_cache_version()

    if rag_retriever is not None and hasattr(rag_retriever, "invalidate_rag_cache"):
        rag_retriever.invalidate_rag_cache()

    return new_version
