from typing import List
from fastapi import FastAPI
from fastapi.routing import APIRoute


def build_startup_summary(app: FastAPI) -> str:
    """
    Construye un resumen limpio y consolidado del estado del backend.
    Una sola tabla visual sin redundancia.
    """
    s = getattr(app.state, "settings", None)
    
    def val(x, default="-"):
        return x if x not in (None, "") else default
    
    def check(ok: bool) -> str:
        return "✓" if ok else "✗"
    
    # Recolectar datos
    try:
        api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
        routes_count = len(api_routes)
    except Exception:
        routes_count = 0

    embedding_manager = getattr(app.state, "embedding_manager", None)
    embedding_model = val(getattr(embedding_manager, "model_name", None))
    vector_store = getattr(app.state, "vector_store", None)
    rag_ingestor = getattr(app.state, "rag_ingestor", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    mongodb_client = getattr(app.state, "mongodb_client", None)
    pdf_manager = getattr(app.state, "pdf_file_manager", None)
    pdf_dir = val(getattr(pdf_manager, "pdf_dir", None))

    env = val(getattr(s, "environment", None), "unknown")
    log_level = val(getattr(s, "log_level", None), "INFO")
    model_type = val(getattr(s, "model_type", None), "UNKNOWN")
    base_model = val(getattr(s, "base_model_name", None))
    cache_on = bool(getattr(s, "enable_cache", False))
    rag_lcel = bool(getattr(s, "enable_rag_lcel", False))
    
    # Construir bloque único
    sep = "─" * 60
    
    lines: List[str] = []
    lines.append("")
    lines.append(sep)
    lines.append("  🚀 BACKEND READY")
    lines.append(sep)
    lines.append(f"  {check(True)} Env: {env} | Log: {log_level}")
    lines.append(f"  {check(True)} Model: {model_type} / {base_model}")
    lines.append(f"  {check(bool(embedding_manager))} Embeddings: {embedding_model}")
    lines.append(f"  {check(bool(vector_store))} VectorStore: {'OK' if vector_store else 'N/A'}")
    lines.append(f"  {check(bool(rag_retriever))} RAG: {'LCEL' if rag_lcel else 'disabled'} | Retriever: {'OK' if rag_retriever else 'N/A'}")
    lines.append(f"  {check(bool(mongodb_client))} MongoDB: {'connected' if mongodb_client else 'N/A'}")
    lines.append(f"  {check(cache_on)} Cache: {'ON' if cache_on else 'OFF'}")
    lines.append(f"  {check(True)} Routes: {routes_count} | PDFs: {pdf_dir}")
    lines.append(sep)
    lines.append("")
    
    return "\n".join(lines)


# Alias para compatibilidad
def build_enterprise_startup_summary(app: FastAPI) -> str:
    """Alias para build_startup_summary (compatibilidad)."""
    return build_startup_summary(app)


def build_full_startup_summary(app: FastAPI) -> str:
    """Alias para build_startup_summary (compatibilidad)."""
    return build_startup_summary(app)
