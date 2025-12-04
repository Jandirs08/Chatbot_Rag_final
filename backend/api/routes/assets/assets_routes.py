import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, HTTPException, Depends, status
from fastapi.responses import FileResponse, JSONResponse

from config import settings
from auth import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["assets"])


def _assets_dir() -> Path:
    base = Path(getattr(settings, "storage_dir", "./backend/storage"))
    d = base / "assets"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _current_logo_path() -> Optional[Path]:
    d = _assets_dir()
    for ext in ("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"):
        p = d / f"logo.{ext}"
        if p.exists():
            return p
    return None


def _content_type_for(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    mapping = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "bmp": "image/bmp",
        "svg": "image/svg+xml",
    }
    return mapping.get(ext, "application/octet-stream")


@router.get("/logo")
async def get_logo():
    try:
        p = _current_logo_path()
        if not p:
            return JSONResponse(status_code=404, content={"detail": "Logo no encontrado"})
        return FileResponse(path=str(p), media_type=_content_type_for(p))
    except Exception as e:
        logger.error(f"Error al servir logo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al obtener el logo")


@router.post("/logo", status_code=status.HTTP_201_CREATED)
async def upload_logo(file: UploadFile, _admin=Depends(require_admin)) -> JSONResponse:
    try:
        ct = (file.content_type or "").lower()
        if not ct.startswith("image/"):
            raise HTTPException(status_code=400, detail="Archivo no es una imagen válida")

        d = _assets_dir()
        for ext in ("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"):
            p = d / f"logo.{ext}"
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass

        ext_map = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/gif": "gif",
            "image/webp": "webp",
            "image/bmp": "bmp",
            "image/svg+xml": "svg",
        }
        ext = ext_map.get(ct, None)
        if not ext:
            name = (file.filename or "").lower()
            for cand in ("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"):
                if name.endswith("." + cand):
                    ext = cand
                    break
        if not ext:
            raise HTTPException(status_code=400, detail="Tipo de imagen no soportado")

        target = d / f"logo.{ext}"
        content = await file.read()
        target.write_bytes(content)

        url = "/api/v1/assets/logo"
        return JSONResponse(status_code=201, content={"message": "Logo subido", "url": url})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al subir logo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al subir el logo")


@router.delete("/logo", status_code=status.HTTP_200_OK)
async def delete_logo(_admin=Depends(require_admin)) -> JSONResponse:
    try:
        d = _assets_dir()
        removed = False
        for ext in ("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"):
            p = d / f"logo.{ext}"
            if p.exists():
                try:
                    p.unlink()
                    removed = True
                except Exception as e:
                    logger.error(f"No se pudo eliminar {p}: {e}", exc_info=True)
        if not removed:
            return JSONResponse(status_code=404, content={"detail": "Logo no encontrado"})
        return JSONResponse(status_code=200, content={"message": "Logo eliminado"})
    except Exception as e:
        logger.error(f"Error al eliminar logo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno al eliminar el logo")
