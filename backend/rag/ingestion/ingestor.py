"""Módulo optimizado para la ingesta de documentos en el sistema RAG."""
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Set
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from langchain_core.documents import Document

from storage.documents import PDFManager
from ..pdf_processor.pdf_loader import PDFContentLoader
from ..embeddings.embedding_manager import EmbeddingManager
from ..vector_store.vector_store import VectorStore
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
        logger.info(f"RAGIngestor inicializado con batch_size={batch_size}, max_workers={max_workers}")

    async def ingest_single_pdf(self, pdf_path: Path, force_update: bool = False) -> Dict:
        filename = pdf_path.name
        logger.info(f"🚀 Iniciando procesamiento del PDF: {filename}")
        try:
            if not pdf_path.exists() or not pdf_path.is_file():
                return self._error_result(filename, "❌ Archivo no encontrado")

            if not force_update and await self._is_already_processed(pdf_path):
                logger.info(f"⏭️ PDF {filename} ya procesado anteriormente. Omitiendo.")
                return {"filename": filename, "status": "skipped", "reason": "already_processed"}

            chunks = self.pdf_content_loader.load_and_split_pdf(pdf_path)
            if not chunks:
                return self._error_result(filename, "❌ No se pudo extraer contenido del PDF")

            logger.info(f"📄 PDF procesado: {len(chunks)} fragmentos de texto extraídos")

            unique_chunks, unique_embeddings = await self._deduplicate_chunks(chunks, return_embeddings=True)
            if not unique_chunks:
                return self._error_result(filename, "❌ No quedaron fragmentos después de eliminar duplicados")

            logger.info(f"🔄 Fragmentos únicos después de deduplicación: {len(unique_chunks)}")

            total_added = 0
            for i in range(0, len(unique_chunks), self.batch_size):
                batch = unique_chunks[i:i + self.batch_size]
                batch_embeddings = unique_embeddings[i:i + self.batch_size] if unique_embeddings else None
                try:
                    for doc in batch:
                        content_hash = doc.metadata.get('content_hash')
                        if content_hash:
                            await self.vector_store.delete_documents(filter={"content_hash": content_hash})

                    if not batch:
                        logger.warning(f"⚠️ Lote vacío. Omitiendo lote {i//self.batch_size + 1}.")
                        continue

                    await self._add_batch_to_vector_store(batch, i//self.batch_size + 1, embeddings=batch_embeddings)
                    total_added += len(batch)
                    logger.info(f"✅ Lote {i//self.batch_size + 1} procesado: {len(batch)} fragmentos agregados al vector store")

                except Exception as e:
                    logger.error(f"❌ Error en lote {i//self.batch_size + 1}: {e}", exc_info=True)

            self._update_processed_hashes(unique_chunks)
            logger.info(f"✨ Procesamiento completado para {filename}: {total_added} fragmentos agregados al vector store")

            return {
                "filename": filename,
                "status": "success",
                "chunks_original": len(chunks),
                "chunks_unique": len(unique_chunks),
                "chunks_added": total_added
            }

        except Exception as e:
            return self._error_result(filename, str(e))

    async def ingest_pdfs_from_directory(self, specific_directory: Optional[Path] = None,
                                         parallel: bool = True, force_update: bool = False) -> List[Dict]:
        source_dir = specific_directory or self.pdf_file_manager.pdf_dir
        logger.info(f"Procesando PDFs desde: {source_dir}")

        pdf_files = await self._get_pdf_files(source_dir)
        if not pdf_files:
            logger.warning(f"No se encontraron PDFs en {source_dir}")
            return []

        results = []
        if parallel and len(pdf_files) > 1:
            with ThreadPoolExecutor(max_workers=self.max_workers):
                tasks = [self._process_pdf_parallel(p, force_update) for p in pdf_files]
                results = await asyncio.gather(*tasks)
        else:
            for p in pdf_files:
                results.append(await self.ingest_single_pdf(Path(p["path"]), force_update=force_update))

        successful = sum(1 for r in results if r["status"] == "success")
        failed = sum(1 for r in results if r["status"] == "error")
        skipped = sum(1 for r in results if r["status"] == "skipped")

        logger.info(f"Ingesta completada. Éxitos: {successful}, Fallos: {failed}, Omitidos: {skipped} de {len(results)} PDFs.")
        return results

    async def _process_pdf_parallel(self, pdf_info: Dict, force_update: bool) -> Dict:
        try:
            return await self.ingest_single_pdf(Path(pdf_info["path"]), force_update=force_update)
        except Exception as e:
            return self._error_result(pdf_info["filename"], str(e))

    async def _get_pdf_files(self, directory: Path) -> List[Dict]:
        if directory != self.pdf_file_manager.pdf_dir:
            return [{"path": str(p), "filename": p.name} for p in directory.glob("*.pdf") if p.is_file()]
        return await self.pdf_file_manager.list_pdfs()

    async def _is_already_processed(self, pdf_path: Path) -> bool:
        try:
            existing_docs = self.vector_store.store._collection.get(where={"source": pdf_path.name})
            return bool(existing_docs.get("ids"))
        except Exception as e:
            logger.error(f"Error verificando PDF procesado: {e}")
            return False

    async def _deduplicate_chunks(self, chunks: List[Document], return_embeddings: bool = False):
        if not chunks:
            return ([], []) if return_embeddings else []
        unique_chunks, unique_embeddings = [], []
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
                sims = [cosine(np.array(embeddings[i]), np.array(embeddings[chunks.index(c)]))
                        for c in unique_chunks]
                if sims and max(sims) > settings.deduplication_threshold:
                    continue
            unique_chunks.append(chunk)
            unique_embeddings.append(embeddings[i])
            if h:
                content_hashes.add(h)

        return (unique_chunks, unique_embeddings) if return_embeddings else unique_chunks

    def _update_processed_hashes(self, chunks: List[Document]) -> None:
        for c in chunks:
            h = c.metadata.get("content_hash")
            if h:
                self._processed_hashes.add(h)

    def _error_result(self, filename: str, msg: str) -> Dict:
        logger.error(f"Error en {filename}: {msg}")
        return {"filename": filename, "status": "error", "error": msg}

    async def _add_batch_to_vector_store(self, batch: List[Document], batch_number: int, embeddings: list = None):
        """Agrega documentos al vector store limpiando metadatos inválidos."""
        if not batch:
            return
        try:
            # Limpieza de metadatos (evitar tipos no permitidos)
            for doc in batch:
                clean_meta = {}
                for k, v in doc.metadata.items():
                    if isinstance(v, (str, int, float, bool)):
                        clean_meta[k] = v
                    elif v is not None:
                        clean_meta[k] = str(v)
                doc.metadata = clean_meta

            await self.vector_store.add_documents(batch, embeddings=embeddings)
            logger.info(f"🧩 Lote {batch_number} agregado correctamente al vector store.")
        except Exception as e:
            logger.error(f"Error agregando lote {batch_number}: {e}", exc_info=True)
            raise
