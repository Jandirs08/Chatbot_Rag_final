"""API routes for PDF management."""
import logging
import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Request, BackgroundTasks
from typing import List
from pathlib import Path
from starlette.responses import FileResponse

# Importar modelos Pydantic desde el módulo centralizado
from api.schemas import (
    PDFListResponse, 
    PDFUploadResponse, 
    PDFDeleteResponse,
    PDFListItem
)


logger = logging.getLogger(__name__)
router = APIRouter(tags=["pdfs"])

# 🔒 NOTA: Todas las rutas de este módulo están protegidas por AuthenticationMiddleware
# Solo usuarios admin autenticados pueden acceder a estos endpoints

@router.post("/upload", response_model=PDFUploadResponse)
# @rate_limit(max_requests=10, window_seconds=60) # Comentado temporalmente
async def upload_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Endpoint para subir y procesar PDFs de forma asíncrona."""
    pdf_file_manager = request.app.state.pdf_file_manager
    rag_ingestor = request.app.state.rag_ingestor
    
    try:
        # Validar tamaño del archivo
        file_size = 0
        chunk_size = 1024 * 1024  # 1MB
        while chunk := await file.read(chunk_size):
            file_size += len(chunk)
            if file_size > request.app.state.settings.max_file_size_mb * 1024 * 1024:
                raise HTTPException(
                    status_code=413,
                    detail=f"Archivo excede el tamaño máximo permitido de {request.app.state.settings.max_file_size_mb}MB"
                )
        await file.seek(0)
        
        # Guardar archivo
        file_path = await pdf_file_manager.save_pdf(file)
        
        # Procesar PDF en segundo plano
        background_tasks.add_task(rag_ingestor.ingest_single_pdf, file_path)
        
        # Listar PDFs actualizados
        pdfs_in_dir = await pdf_file_manager.list_pdfs()
        
        return PDFUploadResponse(
            message="PDF subido exitosamente. El procesamiento continuará en segundo plano.",
            file_path=str(file_path),
            pdfs_in_directory=[p["filename"] for p in pdfs_in_dir]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al procesar PDF: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error interno del servidor al procesar PDF: {str(e)}"
        )

@router.get("/list", response_model=PDFListResponse)
# @cache_response(expire=60)  # Cache por 1 minuto # Comentado temporalmente
# @rate_limit(max_requests=30, window_seconds=60) # Comentado temporalmente
async def list_pdfs(request: Request):
    """Endpoint para listar los PDFs disponibles."""
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
            detail=f"Error interno del servidor al listar PDFs: {str(e)}"
        )

@router.delete("/{filename}", response_model=PDFDeleteResponse)
# @rate_limit(max_requests=10, window_seconds=60) # Comentado temporalmente
async def delete_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    filename: str
):
    """Endpoint para eliminar un PDF específico."""
    pdf_file_manager = request.app.state.pdf_file_manager
    rag_ingestor = request.app.state.rag_ingestor
    
    try:
        # Eliminar archivo del sistema de archivos
        await pdf_file_manager.delete_pdf(filename)
        
        # Eliminar documentos asociados del vector store en segundo plano
        # Asumiendo que los documentos tienen metadata {"source": filename}
        background_tasks.add_task(
            rag_ingestor.vector_store.delete_documents, 
            filter={"source": filename}
        )
        
        return PDFDeleteResponse(
            message=f"PDF '{filename}' eliminado exitosamente. La actualización del índice continuará en segundo plano."
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
    """Sirve un PDF directamente para visualización/descarga en el navegador."""
    pdf_file_manager = request.app.state.pdf_file_manager
    try:
        file_path = pdf_file_manager.pdf_dir / Path(filename).name
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail=f"PDF '{filename}' no encontrado.")
        # Forzar cabecera de attachment estableciendo filename (Starlette añade Content-Disposition)
        return FileResponse(path=str(file_path), filename=filename, media_type="application/pdf")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al servir PDF '{filename}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al servir el PDF")

@router.get("/view/{filename}")
async def view_pdf(request: Request, filename: str):
    """Sirve un PDF para visualización inline en el navegador (sin attachment)."""
    pdf_file_manager = request.app.state.pdf_file_manager
    try:
        file_path = pdf_file_manager.pdf_dir / Path(filename).name
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail=f"PDF '{filename}' no encontrado.")
        # No establecer filename para evitar Content-Disposition: attachment y permitir inline
        return FileResponse(path=str(file_path), media_type="application/pdf")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al visualizar PDF '{filename}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al visualizar el PDF")