"""Módulo optimizado para la ingesta de documentos en el sistema RAG."""
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Set
import logging
from concurrent.futures import ThreadPoolExecutor
import hashlib
import aiofiles

from langchain_core.documents import Document

from storage.documents import PDFManager
from ..pdf_processor.pdf_loader import PDFContentLoader
from ..embeddings.embedding_manager import EmbeddingManager
from ..vector_store.vector_store import VectorStore

from qdrant_client.http.models import (
    Filter as QFilter,
    FieldCondition,
    MatchValue,
)

from config import settings

logger = logging.getLogger(__name__)


class RAGIngestor:
    """Gestor optimizado de ingesta de documentos para RAG."""

    def __init__(
        self,
        pdf_file_manager: PDFManager,
        pdf_content_loader: PDFContentLoader,
        embedding_manager: EmbeddingManager,
        vector_store: VectorStore,
        batch_size: int = 100,
        max_workers: int = 4
    ):
        self.pdf_file_manager = pdf_file_manager
        self.pdf_content_loader = pdf_content_loader
        self.embedding_manager = embedding_manager
        self.vector_store = vector_store
        self.batch_size = batch_size
        self.max_workers = max_workers
        self._processed_hashes: Set[str] = set()

        logger.info(
            f"RAGIngestor inicializado con batch_size={batch_size}, max_workers={max_workers}"
        )

    # ===================================================================
    # 🔥 OPTIMIZACIÓN 4 — HASH POR PDF COMPLETO
    # ===================================================================

    async def _get_pdf_file_hash(self, pdf_path: Path) -> str:
        """Genera hash MD5 del contenido completo del PDF (seguro y rápido)."""
        md5 = hashlib.md5()
        try:
            async with aiofiles.open(pdf_path, "rb") as f:
                while chunk := await f.read(1024 * 1024):
                    md5.update(chunk)
        except Exception as e:
            logger.error(f"Error leyendo PDF para hash: {e}", exc_info=True)
            return ""

        return md5.hexdigest()

    # ===================================================================
    async def ingest_single_pdf(self, pdf_path: Path, force_update: bool = False) -> Dict:
        filename = pdf_path.name
        logger.info(f"🚀 Iniciando procesamiento del PDF: {filename}")

        try:
            if not pdf_path.exists() or not pdf_path.is_file():
                return self._error_result(filename, "❌ Archivo no encontrado")

            # ==============================================================
            # FIX #4 — Verificar por HASH del PDF completo
            # ==============================================================

            pdf_hash = await self._get_pdf_file_hash(pdf_path)

            if not pdf_hash:
                return self._error_result(filename, "❌ No se pudo generar hash del PDF")

            # Verificar si este PDF ya fue procesado ANTES
            if not force_update and await self._is_already_processed_pdf_hash(pdf_hash):
                logger.info(f"⏭️ PDF {filename} ya estaba procesado por HASH. Omitiendo.")
                return {"filename": filename, "status": "skipped", "reason": "already_processed_hash"}

            # Procesar PDF → chunks
            chunks = self.pdf_content_loader.load_and_split_pdf(pdf_path)
            if not chunks:
                return self._error_result(filename, "❌ No se pudo extraer contenido")

            logger.info(f"📄 PDF procesado: {len(chunks)} fragmentos extraídos")

            # Añadir metadata hash del PDF a cada chunk
            for c in chunks:
                c.metadata["pdf_hash"] = pdf_hash

            # ===================================================================
            # 🔥 OPTIMIZACIÓN 2 — DEDUPE n² → O(n)
            # ===================================================================
            unique_chunks, unique_embeddings = await self._deduplicate_chunks(chunks, return_embeddings=True)

            if not unique_chunks:
                return self._error_result(filename, "❌ Dedupe eliminó todos los fragmentos")

            logger.info(f"🔄 Fragmentos únicos tras dedupe: {len(unique_chunks)}")

            total_added = 0

            # ===================================================================
            # PROCESO POR LOTES
            # ===================================================================
            for i in range(0, len(unique_chunks), self.batch_size):
                batch = unique_chunks[i:i + self.batch_size]
                batch_embeddings = unique_embeddings[i:i + self.batch_size]

                try:
                    # Borrar documentos previos con mismo content_hash
                    for doc in batch:
                        content_hash = doc.metadata.get("content_hash")
                        if content_hash:
                            await self.vector_store.delete_documents(filter={"content_hash": content_hash})

                    await self._add_batch_to_vector_store(
                        batch,
                        batch_number=(i // self.batch_size + 1),
                        embeddings=batch_embeddings
                    )

                    total_added += len(batch)

                except Exception as e:
                    logger.error(f"❌ Error en lote {i//self.batch_size + 1}: {e}", exc_info=True)

            logger.info(
                f"✨ Finalizado {filename}: {total_added} fragmentos agregados"
            )

            return {
                "filename": filename,
                "status": "success",
                "chunks_original": len(chunks),
                "chunks_unique": len(unique_chunks),
                "chunks_added": total_added,
            }

        except Exception as e:
            logger.error(f"❌ Error inesperado ingested {filename}: {e}", exc_info=True)
            return self._error_result(filename, str(e))

    # ===================================================================
    # FIX — Verificación rápida por HASH del PDF completo
    # ===================================================================
    async def _is_already_processed_pdf_hash(self, pdf_hash: str) -> bool:
        try:
            client = getattr(self.vector_store, "client", None)
            if client is None:
                return False

            f = QFilter(
                must=[FieldCondition(
                    key="pdf_hash",
                    match=MatchValue(value=pdf_hash)
                )]
            )

            c = client.count(collection_name="rag_collection", count_filter=f)
            return int(c.count) > 0

        except Exception as e:
            logger.error(f"Error verificando hash PDF: {e}", exc_info=True)
            return False

    # ===================================================================
    # OPTIMIZACIÓN 2 — DEDUPE O(n) REAL
    # ===================================================================

    async def _deduplicate_chunks(self, chunks: List[Document], return_embeddings: bool = False):
        if not chunks:
            return ([], []) if return_embeddings else []

        # Preparar hash set
        seen = set()
        unique_chunks = []
        unique_embeddings = []

        texts = [c.page_content for c in chunks]
        embeddings = self.embedding_manager.embed_documents(texts)

        for i, c in enumerate(chunks):
            h = c.metadata.get("content_hash")
            if not h:
                continue

            if h in seen:
                continue

            seen.add(h)
            unique_chunks.append(c)
            unique_embeddings.append(embeddings[i])

        return (unique_chunks, unique_embeddings) if return_embeddings else unique_chunks

    # ===================================================================

    async def _add_batch_to_vector_store(self, batch: List[Document], batch_number: int, embeddings: list = None):
        """Agrega documentos al vector store limpiando metadatos inválidos."""
        if not batch:
            return

        try:
            for doc in batch:
                clean_meta = {}
                for k, v in doc.metadata.items():
                    if isinstance(v, (str, int, float, bool)):
                        clean_meta[k] = v
                    elif v is not None:
                        clean_meta[k] = str(v)
                doc.metadata = clean_meta

            for idx, doc in enumerate(batch):
                txt = (doc.page_content or "").strip()
                src = doc.metadata.get("source")
                h = doc.metadata.get("content_hash")
                logger.info(f"pre-upsert[{batch_number}:{idx}] source={src} hash={h} size={len(txt)} preview={txt[:100]}")

            await self.vector_store.add_documents(batch, embeddings=embeddings)
            logger.info(f"🧩 Lote {batch_number} agregado correctamente.")

        except Exception as e:
            logger.error(f"Error agregando lote {batch_number}: {e}", exc_info=True)
            raise

    # ===================================================================

    def _error_result(self, filename: str, msg: str) -> Dict:
        logger.error(f"Error en {filename}: {msg}")
        return {"filename": filename, "status": "error", "error": msg}
