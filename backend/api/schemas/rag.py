"""RAG-related schemas."""

from typing import List
from pydantic import BaseModel

from .base import BaseResponse
from .pdf import PDFListItem

class RAGStatusPDFDetail(PDFListItem):
    """Model for PDF details in RAG status."""
    pass

class RAGStatusVectorStoreDetail(BaseModel):
    """Model for vector store details in RAG status (Qdrant)."""
    url: str
    collection: str
    count: int

class RAGStatusResponse(BaseModel):
    """Response model for RAG status endpoint."""
    pdfs: List[RAGStatusPDFDetail]
    vector_store: RAGStatusVectorStoreDetail
    total_documents: int

class ClearRAGResponse(BaseResponse):
    """Response model for clear RAG endpoint."""
    remaining_pdfs: int
    vector_store_size: int 


class RetrieveDebugRequest(BaseModel):
    """Request model for retrieve-debug endpoint."""
    query: str
    k: int = 4
    filter_criteria: dict | None = None
    include_context: bool = True


class RetrieveDebugItem(BaseModel):
    """Item describing one retrieved chunk for audit."""
    score: float
    source: str | None = None
    file_path: str | None = None
    content_hash: str | None = None
    chunk_type: str | None = None
    word_count: int | None = None
    preview: str


class RetrieveDebugResponse(BaseModel):
    """Response model for retrieve-debug endpoint."""
    query: str
    k: int
    retrieved: List[RetrieveDebugItem]
    context: str | None = None
    timings: dict


class ReindexPDFRequest(BaseModel):
    """Request model for reindex-pdf endpoint."""
    filename: str
    force_update: bool = True


class ReindexPDFResponse(BaseModel):
    """Response model for reindex-pdf endpoint."""
    status: str
    message: str
    filename: str
    chunks_original: int
    chunks_unique: int
    chunks_added: int