"""API routes for PDF management."""
import logging
import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Request, BackgroundTasks
from pathlib import Path
from starlette.responses import FileResponse

from api.schemas import (
    PDFListResponse,
    PDFUploadResponse,
    PDFDeleteResponse,
    PDFListItem
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pdfs"])


@router.post("/upload", response_model=PDFUploadResponse)
async def upload_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Subida de PDF con detección de duplicados por hash.
    Si el PDF ya existe:
        → se borra el PDF recién guardado
        → se retorna 409
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

        if ingest_result.get("status") == "skipped":
            # ← ES DUPLICADO
            await pdf_file_manager.delete_pdf(file_path.name)
            logger.info(f"PDF duplicado eliminado: {file_path.name}")

            raise HTTPException(
                status_code=409,
                detail="Este PDF ya fue procesado anteriormente (contenido duplicado)."
            )

        # Éxito → devolver lista actualizada
        pdfs = await pdf_file_manager.list_pdfs()

        # Programar recálculo del centroide en segundo plano
        try:
            retriever = getattr(request.app.state, "rag_retriever", None)
            if retriever:
                background_tasks.add_task(retriever.trigger_centroid_update)
        except Exception:
            pass

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
async def list_pdfs(request: Request):
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
async def delete_pdf(request: Request, background_tasks: BackgroundTasks, filename: str):
    pdf_file_manager = request.app.state.pdf_file_manager
    rag_ingestor = request.app.state.rag_ingestor
    rag_retriever = request.app.state.rag_retriever
    from cache.manager import cache

    try:
        await pdf_file_manager.delete_pdf(filename)
        logger.info(f"PDF eliminado físicamente: {filename}")

        await rag_ingestor.vector_store.delete_documents(filter={"source": filename})
        logger.info(f"Embeddings asociados borrados para: {filename}")

        try:
            if rag_retriever and hasattr(rag_retriever, "invalidate_rag_cache"):
                rag_retriever.invalidate_rag_cache()
                logger.info("Caché RAG invalidado tras eliminar PDF")
        except Exception:
            pass

        try:
            if rag_retriever and hasattr(rag_retriever, "reset_centroid"):
                rag_retriever.reset_centroid()
                logger.info("Centroide del retriever reiniciado tras eliminar PDF")
                # Programar recálculo en segundo plano
                try:
                    background_tasks.add_task(rag_retriever.trigger_centroid_update)
                except Exception:
                    pass
        except Exception:
            pass

        try:
            cache.invalidate_prefix("resp:")
            cache.invalidate_prefix("vs:")
        except Exception:
            pass

        return PDFDeleteResponse(
            message=f"PDF '{filename}' y embeddings asociados eliminados exitosamente."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al eliminar PDF '{filename}': {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor al eliminar PDF: {str(e)}"
        )


@router.get("/download/{filename}")
async def download_pdf(request: Request, filename: str):
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
async def view_pdf(request: Request, filename: str):
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
