"""API routes for RAG management."""
import logging
import datetime # Para convertir timestamp
from fastapi import APIRouter, HTTPException, Request

# from ..utils.pdf_utils import PDFProcessor # Se inyectará desde el estado de la app
# from ..rag.retrieval.retriever import RAGRetriever # Se inyectará desde el estado de la app

# Importar modelos Pydantic desde el módulo centralizado
from api.schemas import (
    RAGStatusResponse,
    ClearRAGResponse,
    RAGStatusPDFDetail,
    RAGStatusVectorStoreDetail # Asegurar que PDFListItem se importa si RAGStatusPDFDetail no lo redefine todo
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 🔒 NOTA: Todas las rutas de este módulo están protegidas por AuthenticationMiddleware
# Solo usuarios admin autenticados pueden acceder a estos endpoints

@router.get("/rag-status", response_model=RAGStatusResponse)
async def rag_status(request: Request):
    """Endpoint para obtener el estado actual del RAG."""
    pdf_processor = request.app.state.pdf_processor
    # rag_retriever = request.app.state.rag_retriever # No se usa directamente en este endpoint
    try:
        pdfs_raw = await pdf_processor.list_pdfs()
        vector_store_info_raw = pdf_processor.get_vector_store_info()
        
        pdf_details_list = [
            RAGStatusPDFDetail(
                filename=p["filename"],
                path=str(p["path"]),
                size=p["size"],
                last_modified=datetime.datetime.fromtimestamp(p["last_modified"])
            ) for p in pdfs_raw
        ]
        
        vector_store_detail = RAGStatusVectorStoreDetail(
            path=str(vector_store_info_raw.get("path", "N/A")),
            exists=vector_store_info_raw.get("exists", False),
            size=vector_store_info_raw.get("size", 0)
        )
        
        return RAGStatusResponse(
            pdfs=pdf_details_list,
            vector_store=vector_store_detail,
            total_documents=len(pdf_details_list)
        )
    except Exception as e:
        logger.error(f"Error al obtener estado RAG: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor al obtener estado RAG: {str(e)}")

@router.post("/clear-rag", response_model=ClearRAGResponse)
async def clear_rag(request: Request):
    """Endpoint para limpiar el RAG."""
    pdf_processor = request.app.state.pdf_processor
    rag_retriever = request.app.state.rag_retriever
    try:
        logger.info("Iniciando limpieza del RAG...")
        # Limpiar vector store
        await rag_retriever.vector_store.delete_collection()
        logger.info("Vector store limpiado")
        # Limpiar PDFs
        await pdf_processor.clear_pdfs()
        logger.info("Directorio de PDFs limpiado")
        # Consultar estado después de limpiar
        pdfs_after_clear = await pdf_processor.list_pdfs()
        vector_store_info_after_clear = pdf_processor.get_vector_store_info()
        remaining_pdfs_count = len(pdfs_after_clear)
        vector_store_size_after_clear = vector_store_info_after_clear.get("size", 0)
        status_val = "success"
        message_val = "RAG limpiado exitosamente"
        if remaining_pdfs_count > 0 or vector_store_size_after_clear > 0:
            logger.warning("Algunos archivos no se pudieron limpiar completamente del RAG.")
            status_val = "warning"
            message_val = "RAG limpiado parcialmente. Algunos archivos o datos del vector store no se pudieron eliminar."
        return ClearRAGResponse(
            status=status_val,
            message=message_val,
            remaining_pdfs=remaining_pdfs_count,
            vector_store_size=vector_store_size_after_clear
        )
    except Exception as e:
        logger.error(f"Error al limpiar RAG: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor al limpiar RAG: {str(e)}")