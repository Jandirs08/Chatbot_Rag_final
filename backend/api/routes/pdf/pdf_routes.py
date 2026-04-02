"""API routes for PDF management."""
import logging
import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Request, BackgroundTasks, Response, Depends
from pathlib import Path
from starlette.responses import FileResponse

from api.schemas import (
    PDFListResponse,
    PDFUploadResponse,
    PDFDeleteResponse,
    PDFListItem
)
from auth.dependencies import get_current_active_user
from models.user import User
from utils.rate_limiter import conditional_limit
from config import settings
from api.routes.rag.corpus_state import refresh_rag_corpus_state

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pdfs"])


@router.post("/upload", response_model=PDFUploadResponse)
@conditional_limit(settings.pdf_upload_rate_limit)
async def upload_pdf(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """
    Subida de PDF con detección de duplicados por hash.
    Si el PDF ya existe:
        → se borra el PDF recién guardado
        → se retorna 409
    Requiere: usuario autenticado y activo.
    Para restringir a admins en el futuro: cambiar a Depends(require_admin).
    """
    pdf_file_manager = request.app.state.pdf_file_manager
    rag_ingestor = request.app.state.rag_ingestor

    try:
        # Validar tamaño del archivo
        file_size = 0
        chunk_size = 1024 * 1024
        while chunk := await file.read(chunk_size):
            file_size += len(chunk)
            if file_size > request.app.state.settings.max_file_size_mb * 1024 * 1024:
                raise HTTPException(
                    status_code=413,
                    detail=f"Archivo excede el tamaño máximo permitido de {request.app.state.settings.max_file_size_mb}MB"
                )
        await file.seek(0)

        # Guardar el archivo físicamente
        file_path = await pdf_file_manager.save_pdf(file)

        # Ingestar y detectar duplicados por HASH
        ingest_result = await rag_ingestor.ingest_single_pdf(file_path)
        ingest_status = str(ingest_result.get("status", "error")).lower()

        if ingest_status == "skipped":
            await pdf_file_manager.delete_pdf(file_path.name)
            logger.info(f"PDF duplicado eliminado: {file_path.name}")

            raise HTTPException(
                status_code=409,
                detail="Este PDF ya fue procesado anteriormente (contenido duplicado)."
            )

        if ingest_status != "success":
            try:
                await pdf_file_manager.delete_pdf(file_path.name)
            except Exception:
                logger.warning("No se pudo eliminar el PDF tras fallo de ingesta: %s", file_path.name)

            detail = ingest_result.get("error") or "La ingesta del PDF falló"
            raise HTTPException(status_code=500, detail=f"Error durante la ingesta del PDF: {detail}")

        # Éxito → devolver lista actualizada
        pdfs = await pdf_file_manager.list_pdfs()

        refresh_rag_corpus_state(request.app.state, background_tasks=background_tasks)

        return PDFUploadResponse(
            message="PDF subido e ingerido exitosamente.",
            file_path=str(file_path),
            pdfs_in_directory=[p["filename"] for p in pdfs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al subir PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor: {str(e)}"
        )


@router.get("/list", response_model=PDFListResponse)
async def list_pdfs(
    request: Request,
    _: User = Depends(get_current_active_user),
):
    pdf_file_manager = request.app.state.pdf_file_manager
    try:
        pdfs_raw = await pdf_file_manager.list_pdfs()
        pdf_list_items = [
            PDFListItem(
                filename=p["filename"],
                path=str(p["path"]),
                size=p["size"],
                last_modified=datetime.datetime.fromtimestamp(p["last_modified"])
            ) for p in pdfs_raw
        ]
        return PDFListResponse(pdfs=pdf_list_items)
    except Exception as e:
        logger.error(f"Error al listar PDFs: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno al listar PDFs: {str(e)}"
        )


@router.delete("/{filename}", response_model=PDFDeleteResponse)
async def delete_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    filename: str,
    _: User = Depends(get_current_active_user),
):
    """
    Elimina un PDF y sus embeddings.
    Requiere: usuario autenticado y activo.
    Para restringir a admins: cambiar a Depends(require_admin).
    """
    pdf_file_manager = request.app.state.pdf_file_manager
    rag_ingestor = request.app.state.rag_ingestor
    try:
        await rag_ingestor.vector_store.delete_documents(filter={"source": filename})
        logger.info(f"Embeddings asociados borrados para: {filename}")

        await pdf_file_manager.delete_pdf(filename)
        logger.info(f"PDF eliminado físicamente: {filename}")

        refresh_rag_corpus_state(request.app.state, background_tasks=background_tasks)
        logger.info("Estado derivado del corpus invalidado tras eliminar PDF")

        return PDFDeleteResponse(
            message=f"PDF '{filename}' y embeddings asociados eliminados exitosamente."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al eliminar PDF '{filename}': {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error interno del servidor al eliminar PDF. Revise el estado del vector store."
        )


@router.get("/download/{filename}")
async def download_pdf(
    request: Request,
    filename: str,
    _: User = Depends(get_current_active_user),
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
        logger.error(f"Error en descarga PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al servir el PDF")


@router.get("/view/{filename}")
async def view_pdf(
    request: Request,
    filename: str,
    _: User = Depends(get_current_active_user),
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
        logger.error(f"Error al visualizar PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al visualizar el PDF")
