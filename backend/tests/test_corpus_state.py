import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import BackgroundTasks


MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "routes" / "rag" / "corpus_state.py"
SPEC = importlib.util.spec_from_file_location("tests_corpus_state_module", MODULE_PATH)
CORPUS_STATE_MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(CORPUS_STATE_MODULE)
refresh_rag_corpus_state = CORPUS_STATE_MODULE.refresh_rag_corpus_state


def test_refresh_rag_corpus_state_invalida_y_programa_recalculo(monkeypatch):
    fake_cache = MagicMock()
    fake_retriever = MagicMock()
    app_state = SimpleNamespace(rag_retriever=fake_retriever)
    background_tasks = BackgroundTasks()

    monkeypatch.setitem(__import__("sys").modules, "cache.manager", SimpleNamespace(cache=fake_cache))

    refresh_rag_corpus_state(app_state, background_tasks=background_tasks)

    fake_retriever.invalidate_rag_cache.assert_called_once()
    assert len(background_tasks.tasks) == 1
    fake_cache.invalidate_prefix.assert_any_call("resp:")
    fake_cache.invalidate_prefix.assert_any_call("vs:")


def test_refresh_rag_corpus_state_tolera_falta_de_retriever(monkeypatch):
    fake_cache = MagicMock()
    app_state = SimpleNamespace()

    monkeypatch.setitem(__import__("sys").modules, "cache.manager", SimpleNamespace(cache=fake_cache))

    refresh_rag_corpus_state(app_state)

    fake_cache.invalidate_prefix.assert_any_call("resp:")
    fake_cache.invalidate_prefix.assert_any_call("vs:")
