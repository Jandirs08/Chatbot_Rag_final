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
                    max_tokens=1200,
                    temperature=0.2,
                    main_prompt_name="BASE_PROMPT_TEMPLATE",
                    bot_name="Atlas",
                    ui_prompt_extra="responde breve",
                    enable_rag_lcel=True,
                    retrieval_k=5,
                    retrieval_k_multiplier=3,
                    similarity_threshold=0.3,
                    rag_gating_similarity_threshold=0.2,
                    max_documents=5,
                    enable_hybrid_search=True,
                    hybrid_rrf_k=60,
                    hybrid_child_candidate_limit=12,
                    hybrid_parent_candidate_limit=6,
                    enable_llm_reranker=True,
                    rag_reranker_type="openai",
                    rag_reranker_model_name="gpt-4o-mini",
                    cross_encoder_model_name="cross-encoder/ms-marco-MiniLM-L-6-v2",
                    cohere_rerank_model="rerank-multilingual-v3.0",
                    rag_child_first_context_enabled=False,
                    rag_child_first_context_top_children=3,
                    rag_child_first_context_window_tokens=200,
                    llm_context_window=16000,
                    enable_hyde=False,
                    hyde_model_name=None,
                    hyde_max_tokens=150,
                    embedding_model="openai:text-embedding-3-small",
                    default_embedding_dimension=1536,
                )
            ),
            settings=types.SimpleNamespace(),
        )
        key = module.build_response_cache_key(bot, "conv-123", "Hola mundo")

        expected_config_payload = {
            "base_model_name": "gpt-4o-mini",
            "max_tokens": 1200,
            "temperature": 0.2,
            "main_prompt_name": "BASE_PROMPT_TEMPLATE",
            "bot_name": "Atlas",
            "ui_prompt_extra": "responde breve",
            "enable_rag_lcel": True,
            "retrieval_k": 5,
            "retrieval_k_multiplier": 3,
            "similarity_threshold": 0.3,
            "rag_gating_similarity_threshold": 0.2,
            "max_documents": 5,
            "enable_hybrid_search": True,
            "hybrid_rrf_k": 60,
            "hybrid_child_candidate_limit": 12,
            "hybrid_parent_candidate_limit": 6,
            "enable_llm_reranker": True,
            "rag_reranker_type": "openai",
            "rag_reranker_model_name": "gpt-4o-mini",
            "cross_encoder_model_name": "cross-encoder/ms-marco-MiniLM-L-6-v2",
            "cohere_rerank_model": "rerank-multilingual-v3.0",
            "rag_child_first_context_enabled": False,
            "rag_child_first_context_top_children": 3,
            "rag_child_first_context_window_tokens": 200,
            "llm_context_window": 16000,
            "enable_hyde": False,
            "hyde_model_name": None,
            "hyde_max_tokens": 150,
            "embedding_model": "openai:text-embedding-3-small",
            "default_embedding_dimension": 1536,
        }
        expected_config_hash = "hash-" + json.dumps(
            expected_config_payload,
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
        )
        assert key == f"resp:v=9:conv-123:{expected_config_hash}:hash-Hola mundo"

        bot.chain_manager.settings.similarity_threshold = 0.45
        changed_key = module.build_response_cache_key(bot, "conv-123", "Hola mundo")
        assert changed_key != key
    finally:
        for name, original in original_modules.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original
