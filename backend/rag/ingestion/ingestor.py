"""Módulo optimizado para la ingesta de documentos en el sistema RAG."""
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Set
import logging
from concurrent.futures import ThreadPoolExecutor

from langchain_core.documents import Document

from storage.documents import PDFManager
from ..pdf_processor.pdf_loader import PDFContentLoader
from ..embeddings.embedding_manager import EmbeddingManager
from ..vector_store.vector_store import VectorStore

from qdrant_client.http.models import (
    Filter as QFilter,
    FieldCondition,
    MatchValue,
    FilterSelector
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

    async def ingest_single_pdf(self, pdf_path: Path, force_update: bool = False) -> Dict:
        filename = pdf_path.name
        logger.info(f"🚀 Iniciando procesamiento del PDF: {filename}")

        try:
            if not pdf_path.exists() or not pdf_path.is_file():
                return self._error_result(filename, "❌ Archivo no encontrado")

            # --- FIX #1: filtro corregido para evitar error MatchValue ---
            if not force_update and await self._is_already_processed(pdf_path):
                logger.info(f"⏭️ PDF {filename} ya existía en el vector store. Omitiendo.")
                return {"filename": filename, "status": "skipped", "reason": "already_processed"}

            # Procesar PDF
            chunks = self.pdf_content_loader.load_and_split_pdf(pdf_path)
            if not chunks:
                return self._error_result(filename, "❌ No se pudo extraer contenido")

            logger.info(f"📄 PDF procesado: {len(chunks)} fragmentos extraídos")

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
                    # --- FIX #2: delete_documents corregido ---
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

            self._update_processed_hashes(unique_chunks)

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
    # MULTI-PDF
    # ===================================================================

    async def ingest_pdfs_from_directory(self, specific_directory: Optional[Path] = None,
                                         parallel: bool = True,
                                         force_update: bool = False) -> List[Dict]:

        source_dir = specific_directory or self.pdf_file_manager.pdf_dir
        logger.info(f"Procesando PDFs desde: {source_dir}")

        pdf_files = await self._get_pdf_files(source_dir)
        if not pdf_files:
            logger.warning(f"No se encontraron PDFs en {source_dir}")
            return []

        if parallel and len(pdf_files) > 1:
            with ThreadPoolExecutor(max_workers=self.max_workers):
                tasks = [self._process_pdf_parallel(p, force_update) for p in pdf_files]
                return await asyncio.gather(*tasks)

        return [await self.ingest_single_pdf(Path(p["path"]), force_update=force_update)
                for p in pdf_files]

    async def _process_pdf_parallel(self, pdf_info: Dict, force_update: bool) -> Dict:
        try:
            return await self.ingest_single_pdf(Path(pdf_info["path"]), force_update)
        except Exception as e:
            return self._error_result(pdf_info["filename"], str(e))

    async def _get_pdf_files(self, directory: Path) -> List[Dict]:
        if directory != self.pdf_file_manager.pdf_dir:
            return [{"path": str(p), "filename": p.name}
                    for p in directory.glob("*.pdf") if p.is_file()]
        return await self.pdf_file_manager.list_pdfs()

    # ===================================================================
    # FIX CRÍTICO: METODO _is_already_processed
    # ===================================================================

    async def _is_already_processed(self, pdf_path: Path) -> bool:
        try:
            client = getattr(self.vector_store, "client", None)
            if client is None:
                return False

            # --- FIX: MatchValue(value=...) ---
            f = QFilter(
                must=[FieldCondition(
                    key="source",
                    match=MatchValue(value=pdf_path.name)
                )]
            )

            # Filtro Qdrant correcto
            c = client.count(collection_name="rag_collection", count_filter=f)
            return int(c.count) > 0

        except Exception as e:
            logger.error(f"Error verificando PDF procesado: {e}", exc_info=True)
            return False

    # ===================================================================
    # DEDUPLICACIÓN
    # ===================================================================

    async def _deduplicate_chunks(self, chunks: List[Document], return_embeddings: bool = False):
        if not chunks:
            return ([], []) if return_embeddings else []

        unique_chunks = []
        unique_embeddings = []
        content_hashes = set()

        texts = [c.page_content for c in chunks]
        embeddings = self.embedding_manager.embed_documents(texts)

        import numpy as np

        def cosine(a, b):
            denom = (np.linalg.norm(a) * np.linalg.norm(b))
            return float(np.dot(a, b) / denom) if denom else 0.0

        for i, chunk in enumerate(chunks):
            h = chunk.metadata.get("content_hash")
            if h in content_hashes:
                continue

            if unique_chunks:
                sims = [
                    cosine(embeddings[i], embeddings[chunks.index(c)])
                    for c in unique_chunks
                ]
                if sims and max(sims) > settings.deduplication_threshold:
                    continue

            unique_chunks.append(chunk)
            unique_embeddings.append(embeddings[i])
            if h:
                content_hashes.add(h)

        return (unique_chunks, unique_embeddings) if return_embeddings else unique_chunks

    # ===================================================================

    def _update_processed_hashes(self, chunks: List[Document]) -> None:
        for c in chunks:
            h = c.metadata.get("content_hash")
            if h:
                self._processed_hashes.add(h)

    def _error_result(self, filename: str, msg: str) -> Dict:
        logger.error(f"Error en {filename}: {msg}")
        return {"filename": filename, "status": "error", "error": msg}

    # ===================================================================

    async def _add_batch_to_vector_store(self, batch: List[Document], batch_number: int, embeddings: list = None):
        """Agrega documentos al vector store limpiando metadatos inválidos."""
        if not batch:
            return

        try:
            # Limpieza segura
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
