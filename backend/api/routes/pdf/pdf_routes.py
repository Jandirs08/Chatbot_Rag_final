"""API routes for PDF management."""
import datetime
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, Response, UploadFile
from starlette.responses import FileResponse

from api.routes.rag.corpus_state import refresh_rag_corpus_state
from api.schemas import (
    PDFDeleteResponse,
    PDFIngestionStatusResponse,
    PDFListItem,
    PDFListResponse,
    PDFUploadResponse,
)
from auth.permissions import require_manage_documents
from config import settings
from models.user import User
from utils.rate_limiter import conditional_limit
from utils.audit import audit

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pdfs"])


def _require_rag_ingestor(request: Request):
    rag_ingestor = getattr(request.app.state, "rag_ingestor", None)
    if rag_ingestor is None:
        raise HTTPException(
            status_code=503,
            detail="El pipeline RAG no esta disponible actualmente.",
        )
    return rag_ingestor


async def _run_pdf_ingestion(app_state, file_path: Path) -> None:
    filename = file_path.name
    ingestion_repo = getattr(app_state, "document_ingestion_status_repository", None)
    pdf_file_manager = getattr(app_state, "pdf_file_manager", None)

    try:
        if ingestion_repo is not None:
            await ingestion_repo.mark_processing(filename)

        rag_ingestor = getattr(app_state, "rag_ingestor", None)
        if rag_ingestor is None:
            raise RuntimeError("El pipeline RAG no esta disponible actualmente.")

        ingest_result = await rag_ingestor.ingest_single_pdf(file_path)
        ingest_status = str(ingest_result.get("status", "error")).lower()

        if ingest_status == "skipped":
            logger.info("PDF con contenido duplicado; ya existe en vector store: %s", filename)
            if ingestion_repo is not None:
                await ingestion_repo.mark_ready(
                    filename=filename,
                    doc_id=ingest_result.get("doc_id"),
                    parent_count=int(ingest_result.get("parent_count", 0) or 0),
                    child_count=int(ingest_result.get("child_count", 0) or 0),
                )
            return

        if ingest_status != "success":
            detail = ingest_result.get("error") or "La ingesta del PDF fallo"
            raise RuntimeError(str(detail))

        if ingestion_repo is not None:
            await ingestion_repo.mark_ready(
                filename=filename,
                doc_id=ingest_result.get("doc_id"),
                parent_count=int(ingest_result.get("parent_count", 0) or 0),
                child_count=int(ingest_result.get("child_count", 0) or 0),
            )
        refresh_rag_corpus_state(app_state)
    except Exception as exc:
        logger.error("Ingesta asincrona fallo para %s: %s", filename, exc, exc_info=True)
        if ingestion_repo is not None:
            await ingestion_repo.mark_failed(filename=filename, error=str(exc))


@router.post("/upload", response_model=PDFUploadResponse)
@conditional_limit(settings.pdf_upload_rate_limit)
async def upload_pdf(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(require_manage_documents),
):
    """Sube el PDF y agenda su ingesta asincronica."""
    _uploader_id = str(current_user.id)
    del response, current_user
    pdf_file_manager = request.app.state.pdf_file_manager
    _require_rag_ingestor(request)
    ingestion_repo = getattr(request.app.state, "document_ingestion_status_repository", None)

    try:
        file_size = 0
        chunk_size = 1024 * 1024
        while chunk := await file.read(chunk_size):
            file_size += len(chunk)
            if file_size > request.app.state.settings.max_file_size_mb * 1024 * 1024:
                raise HTTPException(
                    status_code=413,
                    detail=f"Archivo excede el tamaño maximo permitido de {request.app.state.settings.max_file_size_mb}MB",
                )
        await file.seek(0)

        file_path = await pdf_file_manager.save_pdf(file)
        audit("document_uploaded", _uploader_id, filename=file_path.name, ip=request.client.host if request.client else None)
        if ingestion_repo is not None:
            await ingestion_repo.mark_queued(
                filename=file_path.name,
                file_path=str(file_path),
                size=file_size,
            )

        background_tasks.add_task(_run_pdf_ingestion, request.app.state, file_path)
        pdfs = await pdf_file_manager.list_pdfs()

        return PDFUploadResponse(
            message="PDF subido. La ingesta quedo en cola.",
            file_path=str(file_path),
            filename=file_path.name,
            ingestion_status="queued",
            pdfs_in_directory=[p["filename"] for p in pdfs],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error al subir PDF: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}",
        )


@router.get("/list", response_model=PDFListResponse)
async def list_pdfs(
    request: Request,
    _: User = Depends(require_manage_documents),
):
    pdf_file_manager = request.app.state.pdf_file_manager
    try:
        pdfs_raw = await pdf_file_manager.list_pdfs()
        ingestion_repo = getattr(request.app.state, "document_ingestion_status_repository", None)
        ingestion_statuses = (
            await ingestion_repo.get_many([p["filename"] for p in pdfs_raw])
            if ingestion_repo is not None
            else {}
        )
        pdf_list_items = [
            PDFListItem(
                filename=p["filename"],
                path=str(p["path"]),
                size=p["size"],
                last_modified=datetime.datetime.fromtimestamp(p["last_modified"], tz=datetime.timezone.utc),
                ingestion_status=(ingestion_statuses.get(p["filename"]) or {}).get("status", "ready"),
                ingestion_error=(ingestion_statuses.get(p["filename"]) or {}).get("error"),
                ingestion_updated_at=(ingestion_statuses.get(p["filename"]) or {}).get("updated_at"),
            )
            for p in pdfs_raw
        ]
        return PDFListResponse(pdfs=pdf_list_items)
    except Exception as e:
        logger.error("Error al listar PDFs: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno al listar PDFs: {str(e)}",
        )


@router.get("/status/{filename}", response_model=PDFIngestionStatusResponse)
async def get_pdf_ingestion_status(
    request: Request,
    filename: str,
    _: User = Depends(require_manage_documents),
):
    ingestion_repo = getattr(request.app.state, "document_ingestion_status_repository", None)
    safe_filename = Path(filename).name
    if ingestion_repo is None:
        return PDFIngestionStatusResponse(filename=safe_filename, status="ready")

    doc = await ingestion_repo.get(safe_filename)
    if not doc:
        file_path = request.app.state.pdf_file_manager.pdf_dir / safe_filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="PDF no encontrado.")
        return PDFIngestionStatusResponse(filename=safe_filename, status="ready")

    return PDFIngestionStatusResponse(
        filename=safe_filename,
        status=doc.get("status", "ready"),
        error=doc.get("error"),
        doc_id=doc.get("doc_id"),
        parent_count=int(doc.get("parent_count", 0) or 0),
        child_count=int(doc.get("child_count", 0) or 0),
        updated_at=doc.get("updated_at"),
    )


@router.delete("/{filename}", response_model=PDFDeleteResponse)
async def delete_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    filename: str,
    current_user: User = Depends(require_manage_documents),
):
    """Elimina un PDF y sus indices RAG. Requiere manage_documents."""
    pdf_file_manager = request.app.state.pdf_file_manager
    rag_ingestor = _require_rag_ingestor(request)
    safe_filename = Path(filename).name
    try:
        await rag_ingestor.delete_by_source(safe_filename)
        logger.info("Indices RAG eliminados para: %s", safe_filename)

        await pdf_file_manager.delete_pdf(safe_filename)
        logger.info("PDF eliminado fisicamente: %s", safe_filename)
        audit("document_deleted", str(current_user.id), filename=safe_filename, ip=request.client.host if request.client else None)

        ingestion_repo = getattr(request.app.state, "document_ingestion_status_repository", None)
        if ingestion_repo is not None:
            await ingestion_repo.delete(safe_filename)

        refresh_rag_corpus_state(request.app.state, background_tasks=background_tasks)
        logger.info("Estado derivado del corpus invalidado tras eliminar PDF")

        return PDFDeleteResponse(
            message=f"PDF '{safe_filename}' y embeddings asociados eliminados exitosamente."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error al eliminar PDF '%s': %s", safe_filename, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor al eliminar PDF. Revise el estado del vector store.",
        )


@router.get("/download/{filename}")
async def download_pdf(
    request: Request,
    filename: str,
    _: User = Depends(require_manage_documents),
):
    pdf_file_manager = request.app.state.pdf_file_manager
    try:
        file_path = pdf_file_manager.pdf_dir / Path(filename).name
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="PDF no encontrado.")
        return FileResponse(path=str(file_path), filename=filename, media_type="application/pdf")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error en descarga PDF: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al servir el PDF")


@router.get("/view/{filename}")
async def view_pdf(
    request: Request,
    filename: str,
    _: User = Depends(require_manage_documents),
):
    pdf_file_manager = request.app.state.pdf_file_manager
    try:
        file_path = pdf_file_manager.pdf_dir / Path(filename).name
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="PDF no encontrado.")
        return FileResponse(path=str(file_path), media_type="application/pdf")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error al visualizar PDF: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al visualizar el PDF")
