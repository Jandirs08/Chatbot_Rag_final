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
    count: int


class RetrieveDebugRequest(BaseModel):
    """Request model for retrieve-debug endpoint."""
    query: str
    k: int = 4
    filter_criteria: dict | None = None
    include_context: bool = True


class RetrieveDebugChildHitItem(BaseModel):
    """Evidence child chunk returned by the advanced retriever."""
    child_id: str | None = None
    score: float
    dense_score: float = 0.0
    lexical_score: float = 0.0
    page_start: int | None = None
    page_end: int | None = None
    preview: str


class RetrieveDebugItem(BaseModel):
    """Item describing one hydrated parent document for audit."""
    parent_id: str
    doc_id: str
    score: float
    dense_score: float = 0.0
    lexical_score: float = 0.0
    fused_score: float = 0.0
    rerank_score: float = 0.0
    source: str | None = None
    file_path: str | None = None
    page_start: int | None = None
    page_end: int | None = None
    section_title: str | None = None
    contains_table: bool = False
    contains_numeric: bool = False
    contains_date_like: bool = False
    child_hits: List[RetrieveDebugChildHitItem]
    preview: str


class RetrieveDebugResponse(BaseModel):
    """Response model for retrieve-debug endpoint."""
    query: str
    k: int
    child_k: int
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
