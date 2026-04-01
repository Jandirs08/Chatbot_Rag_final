import importlib.util
import sys
import types
from pathlib import Path


def test_build_response_cache_key_incluye_corpus_version():
    module_path = Path(__file__).resolve().parents[1] / "chat" / "manager.py"
    spec = importlib.util.spec_from_file_location("tests_chat_manager_module", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None

    fake_logger = types.SimpleNamespace(debug=lambda *a, **k: None)

    stubs = {
        "api": types.ModuleType("api"),
        "api.schemas": types.SimpleNamespace(DebugInfo=object, RetrievedDocument=object),
        "cache.manager": types.SimpleNamespace(cache=object()),
        "common.constants": types.SimpleNamespace(USER_ROLE="user", ASSISTANT_ROLE="assistant"),
        "common.objects": types.SimpleNamespace(Message=object),
        "config": types.SimpleNamespace(settings=types.SimpleNamespace()),
        "core.bot": types.SimpleNamespace(Bot=object),
        "core.request_context": types.SimpleNamespace(
            new_request_context=lambda: types.SimpleNamespace(),
            get_request_context=lambda: types.SimpleNamespace(),
        ),
        "database.mongodb": types.SimpleNamespace(get_mongodb_client=lambda: object()),
        "models.model_types": types.SimpleNamespace(ModelTypes=object, MODEL_TO_CLASS={}),
        "rag.corpus_state": types.SimpleNamespace(get_corpus_cache_version=lambda: "9"),
        "rag.retrieval.retriever": types.SimpleNamespace(RetrievalBackendUnavailableError=RuntimeError),
        "utils.hashing": types.SimpleNamespace(hash_for_cache_key=lambda value: f"hash-{value}"),
        "utils.logging_utils": types.SimpleNamespace(get_logger=lambda *_args, **_kwargs: fake_logger),
    }

    original_modules = {}
    try:
        for name, stub in stubs.items():
            original_modules[name] = sys.modules.get(name)
            sys.modules[name] = stub

        spec.loader.exec_module(module)
        manager = module.ChatManager.__new__(module.ChatManager)
        key = manager._build_response_cache_key("conv-123", "Hola mundo")

        assert key == "resp:v=9:conv-123:hash-Hola mundo"
    finally:
        for name, original in original_modules.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original
