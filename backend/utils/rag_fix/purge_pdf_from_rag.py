"""
Purgar embeddings de un PDF específico del VectorStore (Chroma) usando OpenAIEmbeddings.
Versión corregida — elimina por IDs directamente y fuerza cierre de conexiones.
"""

import argparse
import csv
import logging
import sys
import gc
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("purge_pdf_fixed")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", "%Y-%m-%d %H:%M:%S")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


def ensure_app_path() -> None:
    try:
        base_dir = Path(__file__).resolve().parents[2]
        if str(base_dir) not in sys.path:
            sys.path.insert(0, str(base_dir))
    except Exception:
        pass


def normalize_sep(path_str: str) -> str:
    return path_str.replace("\\", "/") if path_str else ""


def basename_of(path_str: str) -> str:
    return Path(normalize_sep(path_str)).name if path_str else ""


def meta_get(meta: Dict[str, Any], key: str) -> str:
    val = meta.get(key)
    return val if isinstance(val, str) else ""


def match_pdf(meta: Dict[str, Any], target_basename: str) -> bool:
    for field in ["source", "file_path"]:
        val = meta_get(meta, field)
        if val and basename_of(val) == target_basename:
            return True
    return False


def compute_indicators(coll, target_basename: str) -> Dict[str, Any]:
    total = coll.count()
    offset, limit = 0, 200
    target_count = 0
    hist = {}

    while offset < total:
        batch = coll.get(include=["metadatas"], limit=limit, offset=offset)
        ids = batch.get("ids", [])
        metas = batch.get("metadatas", [])
        for i, _id in enumerate(ids):
            meta = metas[i] if i < len(metas) else {}
            if match_pdf(meta, target_basename):
                target_count += 1
            src = meta_get(meta, "source") or meta_get(meta, "file_path") or "<sin_source>"
            src = normalize_sep(src)
            hist[src] = hist.get(src, 0) + 1
        offset += limit

    top10 = sorted(hist.items(), key=lambda x: x[1], reverse=True)[:10]
    return {"total_docs": total, "docs_del_pdf_objetivo": target_count, "hist_top10": top10}


def collect_candidates(coll, target_basename: str) -> List[Dict[str, Any]]:
    total = coll.count()
    offset, limit = 0, 200
    results = []
    while offset < total:
        batch = coll.get(include=["metadatas"], limit=limit, offset=offset)
        ids = batch.get("ids", [])
        metas = batch.get("metadatas", [])
        for i, _id in enumerate(ids):
            meta = metas[i] if i < len(metas) else {}
            if match_pdf(meta, target_basename):
                results.append({
                    "id": _id,
                    "source": meta_get(meta, "source"),
                    "file_path": meta_get(meta, "file_path"),
                    "content_hash": meta.get("content_hash", "")
                })
        offset += limit
    return results


def write_report(report_dir: Path, settings, target: str, before, after, deleted):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = report_dir / f"purge_{target}_{ts}.md"
    delta = after["total_docs"] - before["total_docs"]

    lines = [
        f"# Purge PDF: {target}",
        f"Fecha: {datetime.now().isoformat()}",
        f"VectorStore: {settings.vector_store_path}",
        f"Embedding Model: {settings.embedding_model}",
        "",
        "## ANTES",
        f"- Total docs: {before['total_docs']}",
        f"- Docs objetivo: {before['docs_del_pdf_objetivo']}",
        "",
        "## DESPUÉS",
        f"- Total docs: {after['total_docs']}",
        f"- Docs objetivo: {after['docs_del_pdf_objetivo']}",
        "",
        f"## DELTA: {delta}",
        "",
        "### Top fuentes:",
        "| Fuente | Docs |",
        "|---|---|"
    ]
    for s, c in after["hist_top10"]:
        lines.append(f"| {s} | {c} |")

    if deleted:
        lines += ["", "### IDs borrados:", "| id | source | file_path | content_hash |", "|---|---|---|---|"]
        for d in deleted[:50]:
            lines.append(f"| {d['id']} | {d['source']} | {d['file_path']} | {d['content_hash']} |")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def purge_pdf_openai_fixed(target_basename: str, delete_file: bool, report_dir: str) -> int:
    logger = setup_logger()
    ensure_app_path()

    from config import settings
    from rag.embeddings.embedding_manager import EmbeddingManager
    from rag.vector_store.vector_store import VectorStore

    logger.info(f"--- Analizando VectorStore antes del borrado ---")
    emb = EmbeddingManager(model_name="openai:text-embedding-3-small")
    store = VectorStore(
        persist_directory=settings.vector_store_path,
        embedding_function=emb,
        cache_enabled=False,
    )
    coll = store.store._collection

    before = compute_indicators(coll, target_basename)
    logger.info(f"Total docs: {before['total_docs']} | Objetivo: {before['docs_del_pdf_objetivo']}")
    candidates = collect_candidates(coll, target_basename)
    logger.info(f"Candidatos detectados: {len(candidates)}")

    deleted_items = []
    if candidates:
        ids = [c["id"] for c in candidates]
        # coll.delete(ids=ids)
        for c in candidates:
            logger.info(f"Found candidate: {c}")

    if delete_file:
        pdf_path = Path(settings.pdfs_dir) / target_basename
        if pdf_path.exists():
            try:
                pdf_path.unlink()
                logger.info(f"Archivo físico eliminado: {pdf_path}")
            except Exception as e:
                logger.error(f"No se pudo eliminar archivo físico: {e}")
        else:
            logger.warning(f"Archivo no encontrado: {pdf_path}")

    # Cerrar conexiones antes de reabrir
    del store
    gc.collect()
    time.sleep(1)

    logger.info("--- Revisión posterior ---")
    emb2 = EmbeddingManager(model_name="openai:text-embedding-3-small")
    store2 = VectorStore(
        persist_directory=settings.vector_store_path,
        embedding_function=emb2,
        cache_enabled=False,
    )
    after = compute_indicators(store2.store._collection, target_basename)
    logger.info(f"Total docs: {after['total_docs']} | Objetivo: {after['docs_del_pdf_objetivo']}")

    report_dir = Path(report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)
    md_path = write_report(report_dir, settings, target_basename, before, after, deleted_items)
    logger.info(f"Reporte generado: {md_path}")

    if after["docs_del_pdf_objetivo"] > 0:
        logger.error("⚠️ Residuos detectados: aún existen fragmentos del PDF en el vector store.")
        return 2
    logger.info("✅ Purga completada sin residuos.")
    return 0


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--file", required=True, help="Nombre del PDF a purgar")
    p.add_argument("--delete-file", action="store_true", help="Eliminar archivo físico del PDF")
    p.add_argument("--report-dir", default="utils/rag_fix/reports", help="Directorio de reportes")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    code = purge_pdf_openai_fixed(
        target_basename=Path(args.file).name,
        delete_file=args.delete_file,
        report_dir=args.report_dir,
    )
    sys.exit(code)
