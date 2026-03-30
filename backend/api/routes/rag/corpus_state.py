from __future__ import annotations

from fastapi import BackgroundTasks


def refresh_rag_corpus_state(app_state, background_tasks: BackgroundTasks | None = None) -> None:
    """Invalida caches dependientes del corpus y dispara recálculo del centroide."""
    rag_retriever = getattr(app_state, "rag_retriever", None)

    if rag_retriever is not None:
        if hasattr(rag_retriever, "invalidate_rag_cache"):
            rag_retriever.invalidate_rag_cache()
        elif hasattr(rag_retriever, "reset_centroid"):
            rag_retriever.reset_centroid()

        if background_tasks is not None and hasattr(rag_retriever, "trigger_centroid_update"):
            background_tasks.add_task(rag_retriever.trigger_centroid_update)

    try:
        from cache.manager import cache

        cache.invalidate_prefix("resp:")
        cache.invalidate_prefix("vs:")
    except Exception:
        pass
