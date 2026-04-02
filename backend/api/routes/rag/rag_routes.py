"""API routes for RAG management."""
import logging
import datetime
from fastapi import APIRouter, HTTPException, Request, Depends

from auth.dependencies import get_current_active_user
from models.user import User

# Importar modelos Pydantic desde el módulo centralizado
from api.schemas import (
    RAGStatusResponse,
    ClearRAGResponse,
    RAGStatusPDFDetail,
    RAGStatusVectorStoreDetail,  # Asegurar que PDFListItem se importa si RAGStatusPDFDetail no lo redefine todo
    RetrieveDebugRequest,
    RetrieveDebugResponse,
    RetrieveDebugItem,
    HierarchicalRetrieveDebugRequest,
    HierarchicalRetrieveDebugResponse,
    HierarchicalRetrieveDebugItem,
    HierarchicalChildHitItem,
    ReindexPDFRequest,
    ReindexPDFResponse,
)
from api.routes.rag.corpus_state import refresh_rag_corpus_state

logger = logging.getLogger(__name__)
router = APIRouter()

# 🔒 NOTA: Todas las rutas de este módulo están protegidas por AuthenticationMiddleware
# Solo usuarios admin autenticados pueden acceder a estos endpoints

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
                filename=p["filename"],
                path=str(p["path"]),
                size=p["size"],
                last_modified=datetime.datetime.fromtimestamp(p["last_modified"])
            ) for p in pdfs_raw
        ]
        
        vector_store_detail = RAGStatusVectorStoreDetail(
            url=str(vector_store_info_raw.get("url", "N/A")),
            collection=str(vector_store_info_raw.get("collection", "rag_collection")),
            count=int(vector_store_info_raw.get("count", 0))
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
async def clear_rag(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para limpiar el RAG."""
    pdf_processor = request.app.state.pdf_processor
    rag_retriever = request.app.state.rag_retriever
    rag_child_vector_store = getattr(request.app.state, "rag_child_vector_store", None)
    rag_parent_repository = getattr(request.app.state, "rag_parent_repository", None)
    rag_child_lexical_repository = getattr(request.app.state, "rag_child_lexical_repository", None)
    try:
        logger.info("Iniciando limpieza del RAG...")
        pdfs_before = await pdf_processor.list_pdfs()
        total_pdfs = len(pdfs_before)

        # 1) Limpiar vector store primero. Si Qdrant falla, no tocar filesystem.
        await rag_retriever.vector_store.delete_collection()
        logger.info("Vector store limpiado y reinicializado")
        if rag_child_vector_store is not None:
            await rag_child_vector_store.delete_collection()
            logger.info("Child vector store limpiado y reinicializado")
        if rag_parent_repository is not None:
            await rag_parent_repository.clear()
            logger.info("Parent repository limpiado")
        if rag_child_lexical_repository is not None:
            await rag_child_lexical_repository.clear()
            logger.info("Lexical repository limpiado")

        # 2) Limpiar PDFs del filesystem después de Qdrant
        result = await pdf_processor.clear_pdfs()
        if int(result.get("errors_count", 0) or 0) > 0:
            logger.error(
                "Limpieza parcial del filesystem durante clear-rag después de vaciar Qdrant: %s",
                result,
            )
            raise HTTPException(
                status_code=500,
                detail="No se pudo limpiar completamente el directorio de PDFs después de vaciar el vector store."
            )
        logger.info(f"Directorio de PDFs limpiado. Eliminados: {result.get('deleted_count', 0)} de {total_pdfs}.")
        refresh_rag_corpus_state(request.app.state)
        logger.info("Estado derivado del corpus invalidado tras limpieza")
        # Consultar estado después de limpiar
        pdfs_after_clear = await pdf_processor.list_pdfs()
        vector_store_info_after_clear = pdf_processor.get_vector_store_info()
        remaining_pdfs_count = len(pdfs_after_clear)
        count_after_clear = int(vector_store_info_after_clear.get("count", 0))
        # Verificación del estado del vector store en Qdrant (fallback)
        try:
            vs = request.app.state.vector_store
            c = vs.client.count(collection_name=vs.collection_name)
            count_after_clear = int(getattr(c, "count", count_after_clear))
        except Exception as e:
            logger.warning(f"No se pudo verificar el conteo de la colección (Qdrant) tras limpieza: {e}")
        logger.info(
            f"Conteo tras limpieza — PDFs restantes: {remaining_pdfs_count}, documentos en colección: {count_after_clear}"
        )
        status_val = "success"
        message_val = "RAG limpiado exitosamente"
        # Éxito solo si no quedan PDFs y la colección vectorial está vacía
        if remaining_pdfs_count > 0 or count_after_clear > 0:
            logger.warning("La limpieza del RAG detecta elementos remanentes (PDFs o documentos en vector store).")
            status_val = "warning"
            message_val = (
                "RAG limpiado parcialmente. Permanecen PDFs o documentos en el vector store. "
                "Verifique directorio de PDFs y el estado del vector store."
            )
        return ClearRAGResponse(
            status=status_val,
            message=message_val,
            remaining_pdfs=remaining_pdfs_count,
            count=count_after_clear
        )
    except HTTPException as exc:
        if exc.status_code >= 500:
            logger.error(
                "clear-rag terminó con error y posible estado parcial entre filesystem y vector store.",
                exc_info=True,
            )
        raise
    except Exception as e:
        logger.error(f"Error al limpiar RAG: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor al limpiar RAG: {str(e)}")


@router.post("/retrieve-debug", response_model=RetrieveDebugResponse)
async def retrieve_debug(
    request: Request,
    payload: RetrieveDebugRequest,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para auditar la recuperación RAG con detalles por chunk.

    Protegido por autenticación (solo admin). No altera el estado del sistema.
    """
    rag_retriever = request.app.state.rag_retriever
    if rag_retriever is None:
        raise HTTPException(status_code=500, detail="RAGRetriever no está inicializado en la aplicación")
    try:
        s = request.app.state.settings
        requested_k = int(payload.k) if isinstance(payload.k, int) else 4
        max_k_allowed = max(1, min(20, int(getattr(s, "retrieval_k", 4)) * int(getattr(s, "retrieval_k_multiplier", 3))))
        safe_k = max(1, min(requested_k, max_k_allowed))
        trace = await rag_retriever.retrieve_with_trace(
            query=payload.query,
            k=safe_k,
            filter_criteria=payload.filter_criteria,
            include_context=payload.include_context,
        )
        items = [
            RetrieveDebugItem(**item) for item in trace.get("retrieved", [])
        ]
        return RetrieveDebugResponse(
            query=trace.get("query", payload.query),
            k=trace.get("k", safe_k),
            retrieved=items,
            context=trace.get("context"),
            timings=trace.get("timings", {}),
        )
    except Exception as e:
        logger.error(f"Error en retrieve-debug: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno del servidor en retrieve-debug: {str(e)}")


@router.post("/hierarchical-retrieve-debug", response_model=HierarchicalRetrieveDebugResponse)
async def hierarchical_retrieve_debug(
    request: Request,
    payload: HierarchicalRetrieveDebugRequest,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para auditar el retrieval jerárquico parent-child sin tocar /chat."""
    hierarchical_rag_retriever = getattr(request.app.state, "hierarchical_rag_retriever", None)
    if hierarchical_rag_retriever is None:
        raise HTTPException(status_code=500, detail="HierarchicalRetriever no está inicializado en la aplicación")

    try:
        requested_k = int(payload.k) if isinstance(payload.k, int) else 4
        safe_k = max(1, min(requested_k, 10))
        trace = await hierarchical_rag_retriever.retrieve_with_trace(
            query=payload.query,
            k=safe_k,
            filter_criteria=payload.filter_criteria,
            include_context=payload.include_context,
        )
        items = [
            HierarchicalRetrieveDebugItem(
                **{
                    **item,
                    "child_hits": [HierarchicalChildHitItem(**child) for child in item.get("child_hits", [])],
                }
            )
            for item in trace.get("retrieved", [])
        ]
        return HierarchicalRetrieveDebugResponse(
            query=trace.get("query", payload.query),
            k=trace.get("k", safe_k),
            child_k=trace.get("child_k", safe_k),
            retrieved=items,
            context=trace.get("context"),
            timings=trace.get("timings", {}),
        )
    except Exception as e:
        logger.error(f"Error en hierarchical-retrieve-debug: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor en hierarchical-retrieve-debug: {str(e)}",
        )

@router.post("/reindex-pdf", response_model=ReindexPDFResponse)
async def reindex_pdf(
    request: Request,
    payload: ReindexPDFRequest,
    _: User = Depends(get_current_active_user),
):
    """Endpoint para forzar la reindexación de un PDF específico.

    Protegido por autenticación (solo admin). Ejecuta la ingesta de forma síncrona
    y retorna el resumen con el conteo de chunks agregados.
    """
    try:
        pdf_manager = request.app.state.pdf_file_manager
        rag_ingestor = request.app.state.rag_ingestor
        hierarchical_ingestion_service = getattr(request.app.state, "hierarchical_ingestion_service", None)

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

        if (
            request.app.state.settings.enable_hierarchical_rag_ingestion
            and hierarchical_ingestion_service is not None
        ):
            await hierarchical_ingestion_service.ingest_pdf(pdf_path, replace_existing=True)

        refresh_rag_corpus_state(request.app.state)

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
