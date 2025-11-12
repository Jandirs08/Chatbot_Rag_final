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
    RAGStatusVectorStoreDetail,  # Asegurar que PDFListItem se importa si RAGStatusPDFDetail no lo redefine todo
    RetrieveDebugRequest,
    RetrieveDebugResponse,
    RetrieveDebugItem,
    ReindexPDFRequest,
    ReindexPDFResponse,
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
        # 1) Limpiar PDFs primero (borrado físico)
        pdfs_before = await pdf_processor.list_pdfs()
        total_pdfs = len(pdfs_before)
        result = await pdf_processor.clear_pdfs()
        logger.info(f"Directorio de PDFs limpiado. Eliminados: {result.get('deleted_count', 0)} de {total_pdfs}.")

        # 2) Limpiar vector store completamente (sin residuos)
        await rag_retriever.vector_store.delete_collection()
        logger.info("Vector store limpiado y reinicializado")
        # Consultar estado después de limpiar
        pdfs_after_clear = await pdf_processor.list_pdfs()
        vector_store_info_after_clear = pdf_processor.get_vector_store_info()
        remaining_pdfs_count = len(pdfs_after_clear)
        vector_store_size_after_clear = vector_store_info_after_clear.get("size", 0)
        logger.info(
            f"Conteo tras limpieza — PDFs restantes: {remaining_pdfs_count}, tamaño del vector store: {vector_store_size_after_clear}"
        )
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


@router.post("/retrieve-debug", response_model=RetrieveDebugResponse)
async def retrieve_debug(request: Request, payload: RetrieveDebugRequest):
    """Endpoint para auditar la recuperación RAG con detalles por chunk.

    Protegido por autenticación (solo admin). No altera el estado del sistema.
    """
    rag_retriever = request.app.state.rag_retriever
    if rag_retriever is None:
        raise HTTPException(status_code=500, detail="RAGRetriever no está inicializado en la aplicación")
    try:
        trace = await rag_retriever.retrieve_with_trace(
            query=payload.query,
            k=payload.k,
            filter_criteria=payload.filter_criteria,
            include_context=payload.include_context,
        )
        items = [
            RetrieveDebugItem(**item) for item in trace.get("retrieved", [])
        ]
        return RetrieveDebugResponse(
            query=trace.get("query", payload.query),
            k=trace.get("k", payload.k),
            retrieved=items,
            context=trace.get("context"),
            timings=trace.get("timings", {}),
        )
    except Exception as e:
        logger.error(f"Error en retrieve-debug: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor en retrieve-debug: {str(e)}")

@router.post("/reindex-pdf", response_model=ReindexPDFResponse)
async def reindex_pdf(request: Request, payload: ReindexPDFRequest):
    """Endpoint para forzar la reindexación de un PDF específico.

    Protegido por autenticación (solo admin). Ejecuta la ingesta de forma síncrona
    y retorna el resumen con el conteo de chunks agregados.
    """
    try:
        pdf_manager = request.app.state.pdf_file_manager
        rag_ingestor = request.app.state.rag_ingestor

        # Resolver ruta del PDF dentro del directorio administrado
        from pathlib import Path
        pdf_path = pdf_manager.pdf_dir / Path(payload.filename).name
        if not pdf_path.exists() or not pdf_path.is_file():
            raise HTTPException(status_code=404, detail=f"PDF '{payload.filename}' no encontrado")

        result = await rag_ingestor.ingest_single_pdf(pdf_path, force_update=payload.force_update)

        status = result.get("status", "error")
        if status != "success":
            # Propagar detalle del error si está disponible
            detail = result.get("error", result)
            raise HTTPException(status_code=500, detail=f"Fallo en reindexación: {detail}")

        return ReindexPDFResponse(
            status="success",
            message=f"Reindexación completada para '{payload.filename}'",
            filename=result.get("filename", payload.filename),
            chunks_original=int(result.get("chunks_original", 0)),
            chunks_unique=int(result.get("chunks_unique", 0)),
            chunks_added=int(result.get("chunks_added", 0)),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en reindex-pdf: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor en reindex-pdf: {str(e)}")