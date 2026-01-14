"""Adaptador para operaciones de PDF en el contexto de RAG status."""
from config import settings


class PDFProcessorAdapter:
    """Adaptador ligero que expone operaciones de PDF y vector store para endpoints de status."""
    
    def __init__(self, pdf_manager, vector_store):
        self.pdf_manager = pdf_manager
        self.vector_store = vector_store

    async def list_pdfs(self):
        """Lista todos los PDFs disponibles."""
        return await self.pdf_manager.list_pdfs()

    def get_vector_store_info(self):
        """Obtiene información del vector store: URL, colección y count de puntos."""
        url = settings.qdrant_url
        collection = self.vector_store.collection_name
        count = 0
        try:
            c = self.vector_store.client.count(collection_name=collection)
            count = int(getattr(c, "count", 0))
        except Exception:
            count = 0
        return {"url": url, "collection": collection, "count": count}

    async def clear_pdfs(self):
        """Limpia todos los PDFs."""
        return await self.pdf_manager.clear_all_pdfs()
