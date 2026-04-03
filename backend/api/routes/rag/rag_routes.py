"""API routes for RAG management."""
import datetime
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from api.routes.rag.corpus_state import refresh_rag_corpus_state
from api.schemas import (
    ClearRAGResponse,
    RAGStatusPDFDetail,
    RAGStatusResponse,
    RAGStatusVectorStoreDetail,
    ReindexPDFRequest,
    ReindexPDFResponse,
    RetrieveDebugChildHitItem,
    RetrieveDebugItem,
    RetrieveDebugRequest,
    RetrieveDebugResponse,
)
from auth.dependencies import get_current_active_user
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_rag_pipeline(request: Request):
    rag_retriever = getattr(request.app.state, "rag_retriever", None)
    rag_ingestor = getattr(request.app.state, "rag_ingestor", None)
    if rag_retriever is None or rag_ingestor is None:
        raise HTTPException(
            status_code=503,
            detail="El pipeline RAG no esta disponible actualmente.",
        )
    return rag_retriever, rag_ingestor


@router.get("/rag-status", response_model=RAGStatusResponse)
async def rag_status(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para obtener el estado actual del RAG."""
    pdf_processor = request.app.state.pdf_processor
    try:
        pdfs_raw = await pdf_processor.list_pdfs()
        vector_store_info_raw = pdf_processor.get_vector_store_info()

        pdf_details_list = [
            RAGStatusPDFDetail(
                filename=pdf["filename"],
                path=str(pdf["path"]),
                size=pdf["size"],
                last_modified=datetime.datetime.fromtimestamp(pdf["last_modified"]),
            )
            for pdf in pdfs_raw
        ]

        vector_store_detail = RAGStatusVectorStoreDetail(
            url=str(vector_store_info_raw.get("url", "N/A")),
            collection=str(vector_store_info_raw.get("collection", "rag_child_chunks")),
            count=int(vector_store_info_raw.get("count", 0)),
        )

        return RAGStatusResponse(
            pdfs=pdf_details_list,
            vector_store=vector_store_detail,
            total_documents=len(pdf_details_list),
        )
    except Exception as exc:
        logger.error("Error al obtener estado RAG: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor al obtener estado RAG: {exc}")


@router.post("/clear-rag", response_model=ClearRAGResponse)
async def clear_rag(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para limpiar completamente el RAG."""
    pdf_processor = request.app.state.pdf_processor
    rag_retriever, _ = _require_rag_pipeline(request)
    rag_parent_repository = getattr(request.app.state, "rag_parent_repository", None)
    rag_child_lexical_repository = getattr(request.app.state, "rag_child_lexical_repository", None)
    try:
        logger.info("Iniciando limpieza del RAG...")
        total_pdfs = len(await pdf_processor.list_pdfs())

        await rag_retriever.vector_store.delete_collection()
        logger.info("Vector store limpiado y reinicializado")
        if rag_parent_repository is not None:
            await rag_parent_repository.clear()
            logger.info("Parent repository limpiado")
        if rag_child_lexical_repository is not None:
            await rag_child_lexical_repository.clear()
            logger.info("Lexical repository limpiado")

        result = await pdf_processor.clear_pdfs()
        if int(result.get("errors_count", 0) or 0) > 0:
            logger.error(
                "Limpieza parcial del filesystem durante clear-rag despues de vaciar Qdrant: %s",
                result,
            )
            raise HTTPException(
                status_code=500,
                detail="No se pudo limpiar completamente el directorio de PDFs despues de vaciar el vector store.",
            )

        logger.info("Directorio de PDFs limpiado. Eliminados: %s de %s.", result.get("deleted_count", 0), total_pdfs)
        refresh_rag_corpus_state(request.app.state)
        logger.info("Estado derivado del corpus invalidado tras limpieza")

        pdfs_after_clear = await pdf_processor.list_pdfs()
        vector_store_info_after_clear = pdf_processor.get_vector_store_info()
        remaining_pdfs_count = len(pdfs_after_clear)
        count_after_clear = int(vector_store_info_after_clear.get("count", 0))
        try:
            vs = request.app.state.vector_store
            count_result = vs.client.count(collection_name=vs.collection_name)
            count_after_clear = int(getattr(count_result, "count", count_after_clear))
        except Exception as exc:
            logger.warning("No se pudo verificar el conteo de la coleccion en Qdrant tras limpieza: %s", exc)

        logger.info(
            "Conteo tras limpieza - PDFs restantes: %s, documentos en coleccion: %s",
            remaining_pdfs_count,
            count_after_clear,
        )
        if remaining_pdfs_count == 0 and count_after_clear == 0:
            return ClearRAGResponse(
                status="success",
                message="RAG limpiado exitosamente",
                remaining_pdfs=remaining_pdfs_count,
                count=count_after_clear,
            )

        logger.warning("La limpieza del RAG detecta elementos remanentes.")
        return ClearRAGResponse(
            status="warning",
            message=(
                "RAG limpiado parcialmente. Permanecen PDFs o documentos en el vector store. "
                "Verifique directorio de PDFs y el estado del vector store."
            ),
            remaining_pdfs=remaining_pdfs_count,
            count=count_after_clear,
        )
    except HTTPException as exc:
        if exc.status_code >= 500:
            logger.error(
                "clear-rag termino con error y posible estado parcial entre filesystem y vector store.",
                exc_info=True,
            )
        raise
    except Exception as exc:
        logger.error("Error al limpiar RAG: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor al limpiar RAG: {exc}")


@router.post("/retrieve-debug", response_model=RetrieveDebugResponse)
async def retrieve_debug(
    request: Request,
    payload: RetrieveDebugRequest,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para auditar el retrieval parent-child activo."""
    rag_retriever, _ = _require_rag_pipeline(request)

    try:
        requested_k = int(payload.k) if isinstance(payload.k, int) else 4
        safe_k = max(1, min(requested_k, 10))
        trace = await rag_retriever.retrieve_with_trace(
            query=payload.query,
            k=safe_k,
            filter_criteria=payload.filter_criteria,
            include_context=payload.include_context,
        )
        items = [
            RetrieveDebugItem(
                **{
                    **item,
                    "child_hits": [RetrieveDebugChildHitItem(**child) for child in item.get("child_hits", [])],
                }
            )
            for item in trace.get("retrieved", [])
        ]
        return RetrieveDebugResponse(
            query=trace.get("query", payload.query),
            k=trace.get("k", safe_k),
            child_k=trace.get("child_k", safe_k),
            retrieved=items,
            context=trace.get("context"),
            timings=trace.get("timings", {}),
        )
    except Exception as exc:
        logger.error("Error en retrieve-debug: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor en retrieve-debug: {exc}")


@router.post("/reindex-pdf", response_model=ReindexPDFResponse)
async def reindex_pdf(
    request: Request,
    payload: ReindexPDFRequest,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para forzar la reindexacion de un PDF especifico."""
    try:
        pdf_manager = request.app.state.pdf_file_manager
        _, rag_ingestor = _require_rag_pipeline(request)

        pdf_path = pdf_manager.pdf_dir / Path(payload.filename).name
        if not pdf_path.exists() or not pdf_path.is_file():
            raise HTTPException(status_code=404, detail=f"PDF '{payload.filename}' no encontrado")

        result = await rag_ingestor.ingest_single_pdf(pdf_path, force_update=payload.force_update)
        if result.get("status") != "success":
            detail = result.get("error", result)
            raise HTTPException(status_code=500, detail=f"Fallo en reindexacion: {detail}")

        refresh_rag_corpus_state(request.app.state)
        return ReindexPDFResponse(
            status="success",
            message=f"Reindexacion completada para '{payload.filename}'",
            filename=result.get("filename", payload.filename),
            chunks_original=int(result.get("chunks_original", 0)),
            chunks_unique=int(result.get("chunks_unique", 0)),
            chunks_added=int(result.get("chunks_added", 0)),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error en reindex-pdf: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor en reindex-pdf: {exc}")
