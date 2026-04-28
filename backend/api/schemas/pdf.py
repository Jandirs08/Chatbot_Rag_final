"""PDF-related schemas."""

from typing import List, Literal
from datetime import datetime
from pydantic import BaseModel

from .base import BaseResponse

DocumentIngestionStatus = Literal["queued", "processing", "ready", "failed"]

class PDFListItem(BaseModel):
    """Model for PDF file information."""
    filename: str
    path: str
    size: int
    last_modified: datetime
    ingestion_status: DocumentIngestionStatus = "ready"
    ingestion_error: str | None = None
    ingestion_updated_at: datetime | None = None

class PDFListResponse(BaseModel):
    """Response model for PDF list endpoint."""
    pdfs: List[PDFListItem]

class PDFUploadResponse(BaseResponse):
    """Response model for PDF upload endpoint."""
    file_path: str
    filename: str
    ingestion_status: DocumentIngestionStatus
    pdfs_in_directory: List[str]


class PDFIngestionStatusResponse(BaseModel):
    """Current ingestion status for one PDF."""
    filename: str
    status: DocumentIngestionStatus
    error: str | None = None
    doc_id: str | None = None
    parent_count: int = 0
    child_count: int = 0
    updated_at: datetime | None = None

class PDFDeleteResponse(BaseResponse):
    """Response model for PDF delete endpoint."""
    pass
