"""Inspección del estado actual del VectorStore (Chroma) sin modificar nada.

Uso:
    python utils/rag_fix/check_vector_store.py

Requisitos:
- Usa componentes reales: backend.config.settings, EmbeddingManager, VectorStore.
- No borra ni altera la colección; solo lectura.
"""

import sys
import logging
from pathlib import Path
from typing import Dict, Tuple

# Asegurar import del paquete backend
BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.config import settings  # type: ignore
from backend.rag.embeddings.embedding_manager import EmbeddingManager  # type: ignore
from backend.rag.vector_store.vector_store import VectorStore  # type: ignore


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("check_vector_store")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


def is_zero_vector(vec) -> bool:
    try:
        if vec is None:
            return True
        return all((abs(float(x)) < 1e-12) for x in vec)
    except Exception:
        return True


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

        coll = vector_store.store._collection
        total = coll.count()

        # Comprobar dummy
        dummy_present = False
        try:
            docs_dummy = coll.get(where={"is_dummy": True}, include=["metadatas", "documents"])
            for i, meta in enumerate(docs_dummy.get("metadatas", [])):
                if meta and meta.get("is_dummy"):
                    dummy_present = True
                    break
        except Exception:
            # Si falla la consulta, mantener dummy_present en False
            pass

        # Recorrer por lotes para evaluar embeddings y duplicados por content_hash
        offset = 0
        limit = 200
        valid_emb_count = 0
        null_emb_count = 0
        duplicates: Dict[str, Tuple[int, list]] = {}

        while offset < total:
            batch = coll.get(
                include=["embeddings", "metadatas"],
                limit=limit,
                offset=offset,
            )
            ids = batch.get("ids", [])
            metas = batch.get("metadatas", [])
            embs = batch.get("embeddings", [])

            for i, doc_id in enumerate(ids):
                meta = metas[i] if i < len(metas) else {}
                emb = embs[i] if i < len(embs) else None
                status_valid = (emb is not None and not is_zero_vector(emb))
                if status_valid:
                    valid_emb_count += 1
                else:
                    null_emb_count += 1

                content_hash = meta.get("content_hash", "-")
                if content_hash and content_hash != "-":
                    if content_hash not in duplicates:
                        duplicates[content_hash] = (0, [])
                    count, id_list = duplicates[content_hash]
                    duplicates[content_hash] = (count + 1, id_list + [doc_id])

            offset += limit

        dup_items = {h: ids for h, (c, ids) in duplicates.items() if c > 1}

        # Imprimir resumen legible
        logger.info("Vector Store actual:")
        logger.info(f"  Ruta: {settings.vector_store_path}")
        logger.info(f"  Total docs: {total}")
        logger.info(f"  Con embedding válido: {valid_emb_count}")
        logger.info(f"  Duplicados por content_hash: {len(dup_items)}")
        logger.info(f"  Dummy detectado: {'Sí' if dummy_present else 'No'}")

    except Exception as e:
        logger.error(f"Error inspeccionando el VectorStore: {e}", exc_info=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()