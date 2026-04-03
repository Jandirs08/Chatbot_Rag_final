import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import BackgroundTasks


API_MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "routes" / "rag" / "corpus_state.py"
API_SPEC = importlib.util.spec_from_file_location("tests_api_corpus_state_module", API_MODULE_PATH)
API_CORPUS_STATE_MODULE = importlib.util.module_from_spec(API_SPEC)
assert API_SPEC is not None and API_SPEC.loader is not None
API_SPEC.loader.exec_module(API_CORPUS_STATE_MODULE)
refresh_rag_corpus_state = API_CORPUS_STATE_MODULE.refresh_rag_corpus_state

RAG_MODULE_PATH = Path(__file__).resolve().parents[1] / "rag" / "corpus_state.py"
RAG_SPEC = importlib.util.spec_from_file_location("tests_rag_corpus_state_module", RAG_MODULE_PATH)
RAG_CORPUS_STATE_MODULE = importlib.util.module_from_spec(RAG_SPEC)
assert RAG_SPEC is not None and RAG_SPEC.loader is not None
RAG_SPEC.loader.exec_module(RAG_CORPUS_STATE_MODULE)


def test_refresh_rag_corpus_state_delega_en_hook_interno(monkeypatch):
    fake_refresh = MagicMock()
    fake_retriever = MagicMock()
    app_state = SimpleNamespace(rag_retriever=fake_retriever)
    background_tasks = BackgroundTasks()

    monkeypatch.setattr(API_CORPUS_STATE_MODULE, "_refresh_rag_corpus_state", fake_refresh)

    refresh_rag_corpus_state(app_state, background_tasks=background_tasks)

    fake_refresh.assert_called_once_with(
        rag_retriever=fake_retriever,
        background_tasks=background_tasks,
    )


def test_refresh_rag_corpus_state_tolera_falta_de_retriever(monkeypatch):
    fake_refresh = MagicMock()
    app_state = SimpleNamespace()

    monkeypatch.setattr(API_CORPUS_STATE_MODULE, "_refresh_rag_corpus_state", fake_refresh)

    refresh_rag_corpus_state(app_state)

    fake_refresh.assert_called_once_with(rag_retriever=None, background_tasks=None)


def test_internal_refresh_rag_corpus_state_incrementa_version_e_invalida_cache(monkeypatch):
    fake_cache = MagicMock()
    fake_cache.increment.return_value = 7
    fake_retriever = MagicMock()
    background_tasks = BackgroundTasks()

    monkeypatch.setattr(RAG_CORPUS_STATE_MODULE, "cache", fake_cache)

    version = RAG_CORPUS_STATE_MODULE.refresh_rag_corpus_state(
        rag_retriever=fake_retriever,
        background_tasks=background_tasks,
    )

    assert version == "7"
    fake_cache.increment.assert_called_once_with(
        RAG_CORPUS_STATE_MODULE.CORPUS_VERSION_CACHE_KEY,
        delta=1,
        initial=0,
    )
    fake_retriever.invalidate_rag_cache.assert_called_once()
    assert len(background_tasks.tasks) == 0


def test_get_corpus_cache_version_retorna_default_si_no_hay_valor(monkeypatch):
    fake_cache = MagicMock()
    fake_cache.get.return_value = None

    monkeypatch.setattr(RAG_CORPUS_STATE_MODULE, "cache", fake_cache)

    assert RAG_CORPUS_STATE_MODULE.get_corpus_cache_version() == RAG_CORPUS_STATE_MODULE.DEFAULT_CORPUS_VERSION
