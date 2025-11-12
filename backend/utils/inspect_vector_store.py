"""
Inspector simple del vector store (Chroma) para ver los textos almacenados.

Cómo usar dentro del contenedor backend:
  python utils/inspect_vector_store.py [max_docs]

El script intenta leer la ruta del vector store desde config.settings
(cargado con backend/.env). Si no puede cargar la configuración,
usa el valor por defecto: ./storage/vector_store/chroma_db

No añade ni modifica documentos; solo lee y muestra contenido.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict

try:
    # LangChain Chroma wrapper
    from langchain_community.vectorstores import Chroma
except Exception as e:
    print("[ERROR] Falta paquete 'langchain_community'. Asegúrate de que el backend tenga las dependencias instaladas.")
    raise


def resolve_config() -> Dict[str, Any]:
    """Obtiene configuración necesaria con fallback seguro."""
    vector_store_path = Path("./storage/vector_store/chroma_db").resolve()
    default_dim = 1536
    distance_strategy = "cosine"
    cfg_source = "defaults"

    try:
        from config import settings  # en contenedor backend, import directo
        vector_store_path = Path(settings.vector_store_path).resolve()
        default_dim = int(getattr(settings, "default_embedding_dimension", 1536))
        distance_strategy = getattr(settings, "distance_strategy", "cosine")
        cfg_source = "config"
    except Exception as e:
        print(f"[AVISO] No se pudo cargar config.settings. Usando valores por defecto. ({e})")

    return {
        "vector_store_path": vector_store_path,
        "default_dim": default_dim,
        "distance_strategy": distance_strategy,
        "cfg_source": cfg_source,
    }


class DummyEmbeddings:
    """Implementación mínima para abrir Chroma sin depender de APIs externas."""

    def __init__(self, dim: int = 1536):
        self.dim = dim

    def embed_query(self, text: str):
        # vector de ceros del tamaño esperado
        return [0.0] * self.dim

    def encode(self, texts: list[str]):
        # lista de vectores de ceros
        return [[0.0] * self.dim for _ in texts]


def print_vector_store(max_docs: int | None = None) -> None:
    cfg = resolve_config()
    path: Path = cfg["vector_store_path"]
    dim: int = cfg["default_dim"]
    distance_strategy: str = cfg["distance_strategy"]

    print(f"\n-> Vector store path: {path}")
    if not path.exists():
        print("[ERROR] El directorio del vector store no existe.")
        print("       Asegúrate de haber ejecutado la ingesta de documentos.")
        return

    # Evitar dependencias externas de embeddings: solo lectura
    dummy = DummyEmbeddings(dim=dim)
    try:
        store = Chroma(
            persist_directory=str(path),
            embedding_function=dummy,
            collection_name="rag_collection",
            collection_metadata={"hnsw:space": distance_strategy},
        )
    except Exception as e:
        print(f"[ERROR] No se pudo abrir la colección Chroma: {e}")
        return

    # Acceso directo a la colección subyacente para obtener documentos
    try:
        collection = store._collection  # type: ignore[attr-defined]
        total = collection.count()
        print(f"Total de documentos en la colección: {total}")
        if total == 0:
            print("La colección está vacía.")
            return

        data = collection.get(include=["documents", "metadatas"])  # ids vienen por defecto
        docs = data.get("documents", []) or []
        metas = data.get("metadatas", []) or []
        ids = data.get("ids", []) or []

        shown = 0
        for idx, text in enumerate(docs):
            meta = metas[idx] if idx < len(metas) else {}
            doc_id = ids[idx] if idx < len(ids) else None
            # Saltar documento dummy si existe
            if isinstance(meta, dict) and meta.get("is_dummy"):
                continue

            shown += 1
            header = f"[#{shown}] id={doc_id} source={meta.get('source', 'N/A')}"
            print("\n" + header)
            print("-" * len(header))
            if isinstance(text, str):
                preview = text[:300]
            else:
                preview = str(text)[:300]
            print(preview)

            if max_docs is not None and shown >= max_docs:
                break

        print(f"\nMostrados {shown} documentos (máximo={'∞' if max_docs is None else max_docs}).")

    except Exception as e:
        print(f"[ERROR] No se pudieron listar documentos: {e}")


if __name__ == "__main__":
    # Permitir pasar un número máximo opcional por CLI
    max_docs = None
    if len(sys.argv) > 1:
        try:
            max_docs = int(sys.argv[1])
        except Exception:
            print("[AVISO] Argumento no numérico para límite, se ignorará.")
    print_vector_store(max_docs=max_docs)