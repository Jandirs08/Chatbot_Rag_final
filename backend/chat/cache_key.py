"""Helpers de caché y parsing JSON para ChatManager.

`build_response_cache_key` deriva una clave estable a partir de:
- versión del corpus indexado (invalidación al re-ingestar)
- conversation_id
- hash de los settings runtime que afectan al LLM
- hash del input del usuario

`parse_verification_json` extrae JSON robustamente de la salida del verificador.
"""
import json
import re
from typing import Any, Dict, Optional

from rag.corpus_state import get_corpus_cache_version
from utils.hashing import hash_for_cache_key


_RESPONSE_CACHE_SETTING_FIELDS = (
    "base_model_name",
    "max_tokens",
    "temperature",
    "main_prompt_name",
    "bot_name",
    "ui_prompt_extra",
    "enable_rag_lcel",
    "retrieval_k",
    "retrieval_k_multiplier",
    "similarity_threshold",
    "rag_gating_similarity_threshold",
    "max_documents",
    "enable_hybrid_search",
    "hybrid_rrf_k",
    "hybrid_child_candidate_limit",
    "hybrid_parent_candidate_limit",
    "enable_llm_reranker",
    "rag_reranker_type",
    "rag_reranker_model_name",
    "cross_encoder_model_name",
    "cohere_rerank_model",
    "rag_child_first_context_enabled",
    "rag_child_first_context_top_children",
    "rag_child_first_context_window_tokens",
    "llm_context_window",
    "enable_hyde",
    "hyde_model_name",
    "hyde_max_tokens",
    "embedding_model",
    "default_embedding_dimension",
)


def _build_response_cache_config_payload(settings_obj: object | None) -> dict[str, object]:
    return {
        field_name: getattr(settings_obj, field_name, None)
        for field_name in _RESPONSE_CACHE_SETTING_FIELDS
    }


def build_response_cache_key(bot, conversation_id: str, input_text: str) -> str:
    """Construye la clave de caché para una respuesta LLM.

    Usa el `chain_manager` del bot si disponible, con fallback a `bot.settings`,
    de modo que cambios de prompt/temperature invaliden la entrada.
    """
    corpus_version = get_corpus_cache_version()
    chain_settings = getattr(getattr(bot, "chain_manager", None), "settings", None)
    bot_settings = getattr(bot, "settings", None)
    effective = chain_settings or bot_settings

    config_payload = _build_response_cache_config_payload(effective)
    config_hash = hash_for_cache_key(
        json.dumps(config_payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    )
    input_hash = hash_for_cache_key(input_text)
    return f"resp:v={corpus_version}:{conversation_id}:{config_hash}:{input_hash}"


def parse_verification_json(text: str) -> Optional[Dict[str, Any]]:
    """Parsea el JSON de verificación tolerando markdown y comillas Python."""
    if not text:
        return None

    md_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text, re.IGNORECASE)
    if md_match:
        text = md_match.group(1).strip()

    json_match = re.search(r'\{[\s\S]*\}', text)
    candidate = json_match.group(0) if json_match else text.strip().strip('`')

    normalized = candidate.replace("'", '"')
    normalized = re.sub(r'\bTrue\b', 'true', normalized)
    normalized = re.sub(r'\bFalse\b', 'false', normalized)
    normalized = re.sub(r'\bNone\b', 'null', normalized)

    try:
        return json.loads(normalized)
    except json.JSONDecodeError:
        return None
