from __future__ import annotations

from typing import Optional

from fastapi import BackgroundTasks

from cache.manager import cache
from utils.logging_utils import get_logger

logger = get_logger(__name__)

CORPUS_VERSION_CACHE_KEY = "meta:rag:corpus_version"
DEFAULT_CORPUS_VERSION = "0"


def get_corpus_cache_version() -> str:
    """Retorna la versión vigente del corpus usada para namespacing de caché."""
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
    """Incrementa de forma centralizada la versión del corpus."""
    try:
        new_version = cache.increment(CORPUS_VERSION_CACHE_KEY, delta=1, initial=0)
        return str(int(new_version))
    except Exception as e:
        logger.warning(f"No se pudo incrementar corpus_version: {e}")
        return get_corpus_cache_version()


def refresh_rag_corpus_state(
    rag_retriever=None,
    background_tasks: Optional[BackgroundTasks] = None,
) -> str:
    """
    Marca una mutación del corpus.

    - Incrementa la versión global del corpus para invalidación lógica de caché.
    - Resetea el estado derivado del retriever.
    - Reagenda el recálculo del centroide si aplica.
    """
    new_version = bump_corpus_cache_version()

    if rag_retriever is not None:
        if hasattr(rag_retriever, "invalidate_rag_cache"):
            rag_retriever.invalidate_rag_cache()
        elif hasattr(rag_retriever, "reset_centroid"):
            rag_retriever.reset_centroid()

        if background_tasks is not None and hasattr(rag_retriever, "trigger_centroid_update"):
            background_tasks.add_task(rag_retriever.trigger_centroid_update)

    return new_version
