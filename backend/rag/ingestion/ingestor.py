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

    # ----------------------
    # HASH GLOBAL DE CONTENIDO
    # ----------------------
    def _get_content_hash_global(self, chunks: List[Document]) -> str:
        """Genera hash MD5 del contenido concatenado de los chunks.
        Normalización mínima: lower, strip, colapsar espacios.
        """
        try:
            from utils.hashing import hash_content_for_dedup
            texts = [chunk.page_content or "" for chunk in chunks]
            concat = "\n".join(texts)
            return hash_content_for_dedup(concat)
        except Exception as e:
            logger.error(f"Error generando content_hash_global: {e}", exc_info=True)
            return ""

    async def _is_already_processed_content_hash_global(self, content_hash_global: str) -> bool:
        try:
            client = self.vector_store.client
            f = QFilter(
                must=[FieldCondition(key="content_hash_global", match=MatchValue(value=content_hash_global))]
            )
            count = client.count(self.vector_store.collection_name, count_filter=f)
            return int(getattr(count, "count", 0)) > 0
        except Exception as e:
            logger.error(f"Error verificando duplicado por content_hash_global: {e}")
            return False

    async def _is_already_processed_pdf_hash(self, pdf_hash: str) -> bool:
        try:
            client = self.vector_store.client
            f = QFilter(
                must=[FieldCondition(key="pdf_hash", match=MatchValue(value=pdf_hash))]
            )
            count = client.count(self.vector_store.collection_name, count_filter=f)
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

            # Procesar PDF → chunks reales usando el extractor estructurado del loader.
            chunks = await self.pdf_content_loader.load_and_split_pdf(pdf_path)
            if not chunks:
                return {"filename": filename, "status": "error", "error": "PDF sin contenido útil"}

            content_hash_global = self._get_content_hash_global(chunks)
            if not content_hash_global:
                return {"filename": filename, "status": "error", "error": "No se pudo generar content_hash_global"}

            # Deduplicación primero por content_hash_global
            if not force_update and await self._is_already_processed_content_hash_global(content_hash_global):
                logger.info(f"⏭️ {filename} omitido — contenido equivalente ya existe en Qdrant")
                return {"filename": filename, "status": "skipped"}

            # Compatibilidad: deduplicación por pdf_hash (bytes)
            pdf_hash = await self._get_pdf_file_hash(pdf_path)
            if not pdf_hash:
                return {"filename": filename, "status": "error", "error": "No se pudo generar hash"}
            if not force_update and await self._is_already_processed_pdf_hash(pdf_hash):
                logger.info(f"⏭️ {filename} omitido — ya existe en Qdrant (pdf_hash)")
                return {"filename": filename, "status": "skipped"}

            # FORCE UPDATE: limpiar vectores previos SOLO de este PDF
            if force_update:
                try:
                    # Limpieza segura: por ambos hashes para evitar duplicados persistentes
                    await self.vector_store.delete_by_content_hash_global(content_hash_global)
                    await self.vector_store.delete_by_pdf_hash(pdf_hash)
                except Exception as e:
                    return {"filename": filename, "status": "error", "error": f"No se pudo limpiar previo: {e}"}

            for c in chunks:
                c.metadata["pdf_hash"] = pdf_hash
                # Añadir content_hash_global a cada chunk para indexación y compatibilidad
                c.metadata["content_hash_global"] = content_hash_global

            texts = [c.page_content for c in chunks]
            # Usar método async para no bloquear workers durante ingesta
            embeddings = await self.embedding_manager.embed_documents_async(texts)

            # UPLOAD por lotes
            total_added = 0
            started_upsert = False
            try:
                for i in range(0, len(chunks), self.batch_size):
                    batch = chunks[i:i + self.batch_size]
                    batch_embeddings = embeddings[i:i + self.batch_size]

                    started_upsert = True
                    await self.vector_store.add_documents(batch, embeddings=batch_embeddings)
                    total_added += len(batch)
            except Exception:
                if started_upsert:
                    try:
                        await self.vector_store.delete_by_pdf_hash(pdf_hash)
                    except Exception as rollback_error:
                        logger.error(
                            "Rollback de Qdrant falló para pdf_hash=%s: %s",
                            pdf_hash,
                            rollback_error,
                            exc_info=True,
                        )
                raise

            logger.info(f"✨ Finalizado {filename}: {total_added} fragmentos agregados")

            return {
                "filename": filename,
                "status": "success",
                "chunks_added": total_added
            }

        except Exception as e:
            logger.error(f"Error en ingesta: {e}", exc_info=True)
            return {"filename": filename, "status": "error", "error": str(e)}
