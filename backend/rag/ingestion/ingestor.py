import logging
import hashlib
import aiofiles
from pathlib import Path
from typing import Dict, List, Set

from langchain_core.documents import Document
from qdrant_client.http.models import Filter as QFilter, FieldCondition, MatchValue

logger = logging.getLogger(__name__)


class RAGIngestor:
    """Gestor de ingesta con detección de duplicados por HASH de PDF."""

    def __init__(
        self,
        pdf_file_manager,
        pdf_content_loader,
        embedding_manager,
        vector_store,
        batch_size=100,
        max_workers=4
    ):
        self.pdf_file_manager = pdf_file_manager
        self.pdf_content_loader = pdf_content_loader
        self.embedding_manager = embedding_manager
        self.vector_store = vector_store
        self.batch_size = batch_size
        self.max_workers = max_workers
        self._processed_hashes: Set[str] = set()

    # ----------------------
    # HASH COMPLETO DE PDF
    # ----------------------
    async def _get_pdf_file_hash(self, pdf_path: Path) -> str:
        md5 = hashlib.md5()
        try:
            async with aiofiles.open(pdf_path, "rb") as f:
                while chunk := await f.read(1024 * 1024):
                    md5.update(chunk)
        except Exception as e:
            logger.error(f"Error generando hash del PDF: {e}", exc_info=True)
            return ""
        return md5.hexdigest()

    async def _is_already_processed_pdf_hash(self, pdf_hash: str) -> bool:
        try:
            client = self.vector_store.client
            f = QFilter(
                must=[FieldCondition(key="pdf_hash", match=MatchValue(value=pdf_hash))]
            )
            count = client.count("rag_collection", count_filter=f)
            return int(count.count) > 0
        except Exception as e:
            logger.error(f"Error verificando duplicado por hash: {e}")
            return False

    # ----------------------
    # INGESTA PRINCIPAL
    # ----------------------
    async def ingest_single_pdf(self, pdf_path: Path, force_update=False) -> Dict:
        filename = pdf_path.name
        logger.info(f"🚀 Iniciando ingesta: {filename}")

        try:
            if not pdf_path.exists():
                return {"filename": filename, "status": "error", "error": "Archivo no encontrado"}

            pdf_hash = await self._get_pdf_file_hash(pdf_path)
            if not pdf_hash:
                return {"filename": filename, "status": "error", "error": "No se pudo generar hash"}

            # DUPLICADO
            if not force_update and await self._is_already_processed_pdf_hash(pdf_hash):
                logger.info(f"⏭️ {filename} omitido — ya existe en Qdrant")
                return {"filename": filename, "status": "skipped"}

            # FORCE UPDATE: limpiar vectores previos SOLO de este PDF
            if force_update:
                try:
                    await self.vector_store.delete_by_pdf_hash(pdf_hash)
                except Exception as e:
                    return {"filename": filename, "status": "error", "error": f"No se pudo limpiar previo: {e}"}

            # Procesar PDF → chunks
            chunks = self.pdf_content_loader.load_and_split_pdf(pdf_path)
            if not chunks:
                return {"filename": filename, "status": "error", "error": "PDF sin contenido útil"}

            for c in chunks:
                c.metadata["pdf_hash"] = pdf_hash

            texts = [c.page_content for c in chunks]
            embeddings = self.embedding_manager.embed_documents(texts)

            # UPLOAD por lotes
            total_added = 0
            for i in range(0, len(chunks), self.batch_size):
                batch = chunks[i:i + self.batch_size]
                batch_embeddings = embeddings[i:i + self.batch_size]

                await self.vector_store.add_documents(batch, embeddings=batch_embeddings)
                total_added += len(batch)

            logger.info(f"✨ Finalizado {filename}: {total_added} fragmentos agregados")

            return {
                "filename": filename,
                "status": "success",
                "chunks_added": total_added
            }

        except Exception as e:
            logger.error(f"Error en ingesta: {e}", exc_info=True)
            return {"filename": filename, "status": "error", "error": str(e)}
