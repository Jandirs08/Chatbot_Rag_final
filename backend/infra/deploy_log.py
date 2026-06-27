from typing import List
from fastapi import FastAPI
from fastapi.routing import APIRoute


def build_startup_summary(app: FastAPI) -> str:
    """Resumen único y consolidado del estado del backend al arranque.

    Esta tabla es la fuente de verdad visual del startup; los logs por
    componente individuales se emiten a nivel DEBUG para no duplicar info.
    """
    s = getattr(app.state, "settings", None)

    def val(x, default="-"):
        return x if x not in (None, "") else default

    def check(ok: bool) -> str:
        return "✓" if ok else "✗"

    # Routes
    try:
        api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
        routes_count = len(api_routes)
    except Exception:
        routes_count = 0

    # Componentes en app.state
    embedding_manager = getattr(app.state, "embedding_manager", None)
    embedding_model = val(getattr(embedding_manager, "model_name", None))
    vector_store = getattr(app.state, "vector_store", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    mongodb_client = getattr(app.state, "mongodb_client", None)
    pdf_manager = getattr(app.state, "pdf_file_manager", None)
    pdf_dir = val(getattr(pdf_manager, "pdf_dir", None))

    # Settings
    env = val(getattr(s, "environment", None), "unknown")
    log_level = val(getattr(s, "log_level", None), "INFO")
    model_type = val(getattr(s, "model_type", None), "UNKNOWN")
    base_model = val(getattr(s, "base_model_name", None))
    cache_on = bool(getattr(s, "enable_cache", False))
    agentic_rag = bool(getattr(s, "enable_agentic_rag", False))

    # Cache backend real (RedisCache vs InMemory degradado)
    try:
        from cache.manager import cache as _cache
        cache_health = _cache.get_health_status()
        cache_backend = cache_health.get("backend_type", "unknown")
        cache_degraded = bool(cache_health.get("is_degraded", False))
    except Exception:
        cache_backend = "unknown"
        cache_degraded = False

    # Tools bound al modelo (agentic flow)
    try:
        bot_instance = getattr(app.state, "bot_instance", None)
        chain_manager = getattr(bot_instance, "chain_manager", None) if bot_instance else None
        tools_list = getattr(chain_manager, "tools", None) or []
        tool_names = [t.name for t in tools_list]
    except Exception:
        tool_names = []

    # TokenBlacklist activo (revocación JWT vía Redis)
    token_blacklist_on = bool(getattr(app.state, "token_blacklist", None))

    # Reranker activo (heuristic vs llm/cohere/cross_encoder).
    # Fallback default coherente con config_fragments.py:134 (enable_llm_reranker=False)
    if not bool(getattr(s, "enable_llm_reranker", False)):
        reranker_mode = "heuristic"
    else:
        reranker_mode = val(getattr(s, "rag_reranker_type", None), "openai")

    # Render
    sep = "─" * 60
    cache_label = (
        f"{cache_backend} (degraded)" if cache_degraded
        else cache_backend if cache_on else "OFF"
    )
    rag_mode = "agentic" if agentic_rag else ("LCEL" if getattr(s, "enable_rag_lcel", False) else "disabled")
    tools_label = f"{len(tool_names)} ({', '.join(tool_names)})" if tool_names else "none"

    lines: List[str] = [
        "",
        sep,
        "  🚀 BACKEND READY",
        sep,
        f"  {check(True)} Env: {env} | Log: {log_level}",
        f"  {check(True)} Model: {model_type} / {base_model}",
        f"  {check(bool(embedding_manager))} Embeddings: {embedding_model}",
        f"  {check(bool(vector_store))} VectorStore: {'OK' if vector_store else 'N/A'}",
        f"  {check(bool(rag_retriever))} RAG: {rag_mode} | Reranker: {reranker_mode}",
        f"  {check(bool(tool_names))} Tools: {tools_label}",
        f"  {check(bool(mongodb_client))} MongoDB: {'connected' if mongodb_client else 'N/A'}",
        f"  {check(cache_on and not cache_degraded)} Cache: {cache_label}",
        f"  {check(token_blacklist_on)} Auth: JWT revocation {'ON' if token_blacklist_on else 'OFF'}",
        f"  {check(True)} Routes: {routes_count} | PDFs: {pdf_dir}",
        sep,
        "",
    ]

    return "\n".join(lines)


# Alias para compatibilidad
def build_enterprise_startup_summary(app: FastAPI) -> str:
    """Alias para build_startup_summary (compatibilidad)."""
    return build_startup_summary(app)


def build_full_startup_summary(app: FastAPI) -> str:
    """Alias para build_startup_summary (compatibilidad)."""
    return build_startup_summary(app)
