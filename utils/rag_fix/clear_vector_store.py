"""Limpieza completa del VectorStore (Chroma) con confirmación antes/después.

Uso:
    python utils/rag_fix/clear_vector_store.py

Requisitos:
- Usa componentes reales: backend.config.settings, EmbeddingManager, VectorStore.
- No borra PDFs ni regenera embeddings; solo elimina la colección vectorial.
"""

import sys
import logging
from pathlib import Path

# Asegurar import del paquete backend
BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.config import settings  # type: ignore
from backend.rag.embeddings.embedding_manager import EmbeddingManager  # type: ignore
from backend.rag.vector_store.vector_store import VectorStore  # type: ignore


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("clear_vector_store")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


def count_docs(vector_store) -> int:
    try:
        return int(vector_store.store._collection.count())
    except Exception:
        return 0


def has_dummy(vector_store) -> bool:
    try:
        docs = vector_store.store._collection.get(where={"is_dummy": True}, include=["metadatas"]) 
        for meta in docs.get("metadatas", []) or []:
            if meta and meta.get("is_dummy"):
                return True
        return False
    except Exception:
        return False


def delete_entire_collection(vector_store, logger: logging.Logger) -> None:
    """Intenta eliminar toda la colección Chroma.
    Primero prueba métodos de alto nivel; si no existen, elimina por ids.
    """
    store = vector_store.store
    # Fallback robusto: borrar por ids
    try:
        # Intentar método de la clase Chroma si existe
        if hasattr(store, "delete_collection") and callable(getattr(store, "delete_collection")):
            store.delete_collection()
            logger.info("delete_collection() ejecutado en Chroma.")
            return
    except Exception as e:
        logger.warning(f"Fallo delete_collection(): {e}. Procediendo a borrado por ids.")

    # Borrado por ids (seguro y explícito)
    try:
        ids = store._collection.get(include=[], limit=None).get("ids", [])
        if ids:
            store._collection.delete(ids=ids)
            logger.info(f"Eliminados {len(ids)} documentos por ids.")
        else:
            # Si la colección está vacía o no devuelve ids
            logger.info("Colección sin ids para eliminar; puede que ya esté vacía.")
    except Exception as e:
        logger.error(f"Error eliminando documentos por ids: {e}")
        raise


def main() -> None:
    logger = setup_logger()
    try:
        # Instanciar componentes reales con configuración actual
        emb_manager = EmbeddingManager(model_name=settings.embedding_model)
        vector_store = VectorStore(
            persist_directory=settings.vector_store_path,
            embedding_function=emb_manager,
            distance_strategy=settings.distance_strategy,
            cache_enabled=settings.enable_cache,
            cache_ttl=settings.cache_ttl,
            batch_size=settings.batch_size,
        )

        before_count = count_docs(vector_store)
        before_dummy = has_dummy(vector_store)

        # Ejecutar limpieza completa
        delete_entire_collection(vector_store, logger)

        # Reinstanciar para verificar estado post-limpieza
        emb_manager2 = EmbeddingManager(model_name=settings.embedding_model)
        vector_store2 = VectorStore(
            persist_directory=settings.vector_store_path,
            embedding_function=emb_manager2,
            distance_strategy=settings.distance_strategy,
            cache_enabled=settings.enable_cache,
            cache_ttl=settings.cache_ttl,
            batch_size=settings.batch_size,
        )

        after_count = count_docs(vector_store2)
        after_dummy = has_dummy(vector_store2)

        # Imprimir resumen
        logger.info("Limpieza del Vector Store:")
        logger.info(f"  Ruta: {settings.vector_store_path}")
        logger.info(f"  Documentos antes: {before_count}")
        logger.info(f"  Documentos después: {after_count}")
        logger.info(f"  Dummy eliminado: {'Sí' if (before_dummy and not after_dummy) else 'No'}")

    except Exception as e:
        logger.error(f"Error limpiando el VectorStore: {e}", exc_info=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()