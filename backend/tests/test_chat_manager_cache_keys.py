import importlib.util
import json
import sys
import types
from pathlib import Path


def test_build_response_cache_key_incluye_corpus_version_y_config_runtime():
    module_path = Path(__file__).resolve().parents[1] / "chat" / "cache_key.py"
    spec = importlib.util.spec_from_file_location("tests_chat_cache_key_module", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None

    stubs = {
        "rag.corpus_state": types.SimpleNamespace(get_corpus_cache_version=lambda: "9"),
        "utils.hashing": types.SimpleNamespace(hash_for_cache_key=lambda value: f"hash-{value}"),
    }

    original_modules = {}
    try:
        for name, stub in stubs.items():
            original_modules[name] = sys.modules.get(name)
            sys.modules[name] = stub

        spec.loader.exec_module(module)

        bot = types.SimpleNamespace(
            chain_manager=types.SimpleNamespace(
                settings=types.SimpleNamespace(
                    base_model_name="gpt-4o-mini",
                    temperature=0.2,
                    main_prompt_name="BASE_PROMPT_TEMPLATE",
                    ui_prompt_extra="responde breve",
                    enable_rag_lcel=True,
                )
            ),
            settings=types.SimpleNamespace(),
        )
        key = module.build_response_cache_key(bot, "conv-123", "Hola mundo")

        expected_config_payload = {
            "base_model_name": "gpt-4o-mini",
            "temperature": 0.2,
            "main_prompt_name": "BASE_PROMPT_TEMPLATE",
            "ui_prompt_extra": "responde breve",
            "enable_rag_lcel": True,
        }
        expected_config_hash = "hash-" + json.dumps(
            expected_config_payload,
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
        )
        assert key == f"resp:v=9:conv-123:{expected_config_hash}:hash-Hola mundo"
    finally:
        for name, original in original_modules.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original
