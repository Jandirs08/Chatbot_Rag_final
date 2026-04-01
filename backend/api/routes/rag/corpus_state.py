from __future__ import annotations

from fastapi import BackgroundTasks

from rag.corpus_state import refresh_rag_corpus_state as _refresh_rag_corpus_state


def refresh_rag_corpus_state(app_state, background_tasks: BackgroundTasks | None = None) -> None:
    """Invalida caches dependientes del corpus del retriever."""
    rag_retriever = getattr(app_state, "rag_retriever", None)
    _refresh_rag_corpus_state(rag_retriever=rag_retriever, background_tasks=background_tasks)
