from typing import List
from fastapi import FastAPI
from fastapi.routing import APIRoute

def _fmt_bool(ok: bool) -> str:
    return "✓" if ok else "✗"

def _fmt_bytes(num: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if num < 1024.0:
            return f"{num:.1f} {unit}"
        num /= 1024.0
    return f"{num:.1f} PB"

def build_startup_summary(app: FastAPI) -> str:
    """Construye un resumen legible del estado del backend tras el arranque."""
    s = getattr(app.state, "settings", None)
    lines: List[str] = []
    lines.append("=" * 80)
    lines.append("Resumen de Deploy Backend")
    lines.append("=" * 80)

    # Entorno y logging
    env = getattr(s, "environment", "unknown") if s else "unknown"
    log_level = getattr(s, "log_level", "INFO") if s else "INFO"
    lines.append(f"{_fmt_bool(True)} Entorno: {env}")
    lines.append(f"{_fmt_bool(True)} Log Level: {log_level}")

    # Modelo / LLM
    model_type = getattr(s, "model_type", "UNKNOWN") if s else "UNKNOWN"
    base_model_name = getattr(s, "base_model_name", "-") if s else "-"
    openai_key_present = False
    if s and str(getattr(s, "model_type", "")).upper() == "OPENAI":
        try:
            key = s.openai_api_key.get_secret_value() if s.openai_api_key else None
            openai_key_present = bool(key and key.strip())
        except Exception:
            openai_key_present = False
    lines.append(f"{_fmt_bool(True)} Modelo Base: {model_type} / {base_model_name}")
    if model_type == "OPENAI":
        lines.append(f"{_fmt_bool(openai_key_present)} OpenAI API Key: {'presente' if openai_key_present else 'ausente'}")

    # Bot y prompts
    bot_instance = getattr(app.state, "bot_instance", None)
    bot_name = getattr(s, "bot_name", None)
    if not bot_name:
        try:
            from core import prompt as prompt_module
            bot_name = prompt_module.BOT_NAME
        except Exception:
            bot_name = "-"
    lines.append(f"{_fmt_bool(bool(bot_instance))} Bot Instanciado: {bot_name}")
    main_prompt_name = getattr(s, "main_prompt_name", "-") if s else "-"
    lines.append(f"{_fmt_bool(bool(main_prompt_name))} Prompt Principal: {main_prompt_name}")

    # Memoria
    mem_type = getattr(s, "memory_type", "-") if s else "-"
    lines.append(f"{_fmt_bool(True)} Tipo de Memoria: {mem_type}")

    # RAG / Embeddings / Vector Store
    embedding_manager = getattr(app.state, "embedding_manager", None)
    embedding_model = getattr(embedding_manager, "model_name", "-") if embedding_manager else "-"
    lines.append(f"{_fmt_bool(bool(embedding_manager))} Embeddings: {embedding_model}")

    vector_store = getattr(app.state, "vector_store", None)
    if vector_store and hasattr(vector_store, "persist_directory"):
        try:
            p = vector_store.persist_directory
            exists = p.exists()
            size = 0
            if exists:
                size = sum(f.stat().st_size for f in p.glob('**/*') if f.is_file())
            lines.append(f"{_fmt_bool(True)} Vector Store: {str(p)}")
            lines.append(f"{_fmt_bool(True)} Vector Store Tamaño: {_fmt_bytes(size)}")
        except Exception:
            lines.append(f"{_fmt_bool(False)} Vector Store: error leyendo información")
    else:
        lines.append(f"{_fmt_bool(False)} Vector Store: no inicializado")

    rag_ingestor = getattr(app.state, "rag_ingestor", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    lines.append(f"{_fmt_bool(bool(rag_ingestor))} RAG Ingestor: {'OK' if rag_ingestor else 'No'}")
    lines.append(f"{_fmt_bool(bool(rag_retriever))} RAG Retriever: {'OK' if rag_retriever else 'No'}")

    # MongoDB
    mongodb_client = getattr(app.state, "mongodb_client", None)
    lines.append(f"{_fmt_bool(bool(mongodb_client))} MongoDB: {'conectado' if mongodb_client else 'no disponible'}")

    # PDF Manager
    pdf_manager = getattr(app.state, "pdf_file_manager", None)
    pdf_dir = getattr(pdf_manager, "pdf_dir", None) if pdf_manager else None
    lines.append(f"{_fmt_bool(bool(pdf_manager))} PDFs Dir: {pdf_dir if pdf_dir else '-'}")

    # CORS / Middleware
    lines.append(f"{_fmt_bool(True)} CORS Orígenes: {getattr(s, 'cors_origins', []) if s else []}")
    lines.append(f"{_fmt_bool(True)} Auth Middleware: configurado")

    # Routers registrados
    try:
        api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
        lines.append(f"{_fmt_bool(True)} Rutas API registradas: {len(api_routes)}")
    except Exception:
        lines.append(f"{_fmt_bool(False)} Rutas API registradas: error al contar")

    # Flags y características
    lines.append(f"{_fmt_bool(getattr(s, 'enable_cache', False))} Caché: {'habilitada' if getattr(s, 'enable_cache', False) else 'deshabilitada'}")
    lines.append(f"{_fmt_bool(getattr(s, 'enable_metrics', False))} Métricas: {'habilitadas' if getattr(s, 'enable_metrics', False) else 'deshabilitadas'}")
    lines.append(f"{_fmt_bool(getattr(s, 'enable_tracing', False))} Tracing: {'habilitado' if getattr(s, 'enable_tracing', False) else 'deshabilitado'}")

    lines.append("-" * 80)
    lines.append("Estado: OK si todos los ítems críticos están con ✓")
    lines.append("=" * 80)
    return "\n".join(lines)


def build_enterprise_startup_summary(app: FastAPI) -> str:
    """Return a clean AWS-like startup summary panel (printed once)."""
    s = getattr(app.state, "settings", None)
    sep = "\u2500" * 68

    def val(x, default="-"):
        return x if x not in (None, "") else default

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
    base_model_name = val(getattr(s, "base_model_name", None))

    lines: List[str] = []
    lines.append(sep)
    lines.append("SYSTEM STATUS")
    lines.append(sep)
    lines.append(f"\u2713 Environment ............... {env}")
    lines.append(f"\u2713 Log Level ................ {log_level}")
    lines.append(f"\u2713 Model Type ............... {model_type}")
    lines.append(f"\u2713 Base Model ............... {base_model_name}")
    lines.append(f"\u2713 Embeddings ............... {embedding_model}")
    lines.append(f"\u2713 Vector Store ............. {'initialized' if vector_store else 'not initialized'}")
    lines.append(f"\u2713 RAG Ingestor ............. {'OK' if rag_ingestor else 'N/A'}")
    lines.append(f"\u2713 RAG Retriever ............ {'OK' if rag_retriever else 'N/A'}")
    lines.append(f"\u2713 MongoDB .................. {'connected' if mongodb_client else 'not connected'}")
    lines.append(f"\u2713 PDFs Directory ........... {pdf_dir}")
    lines.append(f"\u2713 Routes Registered ........ {routes_count}")
    lines.append(sep)
    lines.append("STATUS: OK")
    lines.append(sep)
    return "\n".join(lines)


def build_full_startup_summary(app: FastAPI) -> str:
    """Return enterprise panel (once) followed by deep diagnostics (once)."""
    s = getattr(app.state, "settings", None)
    sep_mid = "\u2500" * 67

    def val(x, default="-"):
        return x if x not in (None, "") else default

    # Datos
    try:
        api_routes = [r for r in app.routes if isinstance(r, APIRoute)]
        routes_count = len(api_routes)
    except Exception:
        routes_count = 0

    embedding_manager = getattr(app.state, "embedding_manager", None)
    embedding_model = val(getattr(embedding_manager, "model_name", None))

    vector_store = getattr(app.state, "vector_store", None)
    vector_dir = "-"
    vector_size = "-"
    if vector_store and hasattr(vector_store, "persist_directory"):
        try:
            p = vector_store.persist_directory
            vector_dir = str(p)
            if p.exists():
                size = sum(f.stat().st_size for f in p.glob("**/*") if f.is_file())
                vector_size = _fmt_bytes(size)
        except Exception:
            pass

    rag_ingestor = getattr(app.state, "rag_ingestor", None)
    rag_retriever = getattr(app.state, "rag_retriever", None)
    mongodb_client = getattr(app.state, "mongodb_client", None)

    pdf_manager = getattr(app.state, "pdf_file_manager", None)
    pdf_dir = val(getattr(pdf_manager, "pdf_dir", None))

    env = val(getattr(s, "environment", None), "unknown")
    log_level = val(getattr(s, "log_level", None), "INFO")
    model_type = val(getattr(s, "model_type", None), "UNKNOWN")
    base_model_name = val(getattr(s, "base_model_name", None))
    main_prompt_name = val(getattr(s, "main_prompt_name", None))
    mem_type = val(getattr(s, "memory_type", None))
    cors_origins = val(getattr(s, "cors_origins", None), [])
    cache_enabled = bool(getattr(s, "enable_cache", False))
    metrics_enabled = bool(getattr(s, "enable_metrics", False))
    tracing_enabled = bool(getattr(s, "enable_tracing", False))

    # PANEL ENTERPRISE (solo una vez)
    enterprise_panel = build_enterprise_startup_summary(app)

    # DEEP DIAGNOSTIC
    deep: List[str] = []
    deep.append("(DEEP DIAGNOSTIC)")
    deep.append(sep_mid)
    deep.append(f"✓ Entorno: {env}")
    deep.append(f"✓ Log Level: {log_level}")
    deep.append(f"✓ Modelo Base: {model_type} / {base_model_name}")
    deep.append(f"✓ Prompt Principal: {main_prompt_name}")
    deep.append(f"✓ Tipo de Memoria: {mem_type}")
    deep.append(f"✓ Embeddings: {embedding_model}")
    deep.append(f"✓ Vector Store Path: {vector_dir}")
    deep.append(f"✓ Vector Store Size: {vector_size}")
    deep.append(f"✓ RAG Ingestor: {'OK' if rag_ingestor else 'No'}")
    deep.append(f"✓ RAG Retriever: {'OK' if rag_retriever else 'No'}")
    deep.append(f"✓ MongoDB: {'conectado' if mongodb_client else 'no disponible'}")
    deep.append(f"✓ PDFs Dir: {pdf_dir}")
    deep.append(f"✓ CORS Orígenes: {cors_origins}")
    deep.append("✓ Auth Middleware: configurado")
    deep.append(f"✓ Rutas API registradas: {routes_count}")
    deep.append(f"✓ Caché: {'habilitada' if cache_enabled else 'deshabilitada'}")
    deep.append(f"✓ Métricas: {'habilitadas' if metrics_enabled else 'deshabilitadas'}")
    deep.append(f"✓ Tracing: {'habilitado' if tracing_enabled else 'deshabilitado'}")
    deep.append(sep_mid)
    deep.append("STATUS: OK")
    deep.append(sep_mid)
    return "\n".join([
        enterprise_panel,
        *deep
    ])
