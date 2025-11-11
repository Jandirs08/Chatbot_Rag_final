import asyncio
import sys
from pathlib import Path

# Add the application root to the Python path
sys.path.insert(0, '/app')

from rag.ingestion.ingestor import RAGIngestor
from storage.documents import PDFManager
from rag.pdf_processor.pdf_loader import PDFContentLoader
from rag.embeddings.embedding_manager import EmbeddingManager
from rag.vector_store.vector_store import VectorStore
from config import settings

def trigger_ingestion():
    """
    Triggers the document ingestion process.
    """
    print("--- Starting Document Ingestion ---")

    pdf_manager = PDFManager(pdf_dir=settings.pdfs_dir)
    pdf_loader = PDFContentLoader(chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap)
    embedding_manager = EmbeddingManager(model_name=settings.embedding_model)
    vector_store = VectorStore(persist_directory=settings.vector_store_path, embedding_function=embedding_manager)

    ingestor = RAGIngestor(
        pdf_file_manager=pdf_manager,
        pdf_content_loader=pdf_loader,
        embedding_manager=embedding_manager,
        vector_store=vector_store,
        batch_size=settings.batch_size,
        max_workers=settings.max_concurrent_tasks
    )

    asyncio.run(ingestor.ingest_pdfs_from_directory())

    print("--- Document Ingestion Finished ---")

if __name__ == "__main__":
    trigger_ingestion()