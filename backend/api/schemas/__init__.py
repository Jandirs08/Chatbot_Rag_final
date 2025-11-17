"""API Schemas module.

Este módulo contiene todos los esquemas Pydantic utilizados en la API.
Los esquemas están organizados por dominio funcional.
"""

from .base import BaseResponse
from .pdf import (
    PDFListItem,
    PDFListResponse,
    PDFUploadResponse,
    PDFDeleteResponse
)
from .chat import (
    ChatRequest,
    ChatResponse,
    StreamEventOp,
    StreamEventData
)
from .rag import (
    RAGStatusPDFDetail,
    RAGStatusVectorStoreDetail,
    RAGStatusResponse,
    ClearRAGResponse,
    RetrieveDebugRequest,
    RetrieveDebugItem,
    RetrieveDebugResponse,
    ReindexPDFRequest,
    ReindexPDFResponse,
)
from .health import HealthResponse

__all__ = [
    # Base
    "BaseResponse",
    
    # PDF
    "PDFListItem",
    "PDFListResponse",
    "PDFUploadResponse",
    "PDFDeleteResponse",
    
    # Chat
    "ChatRequest",
    "ChatResponse",
    "StreamEventOp",
    "StreamEventData",
    
    # RAG
    "RAGStatusPDFDetail",
    "RAGStatusVectorStoreDetail",
    "RAGStatusResponse",
    "ClearRAGResponse",
    "RetrieveDebugRequest",
    "RetrieveDebugItem",
    "RetrieveDebugResponse",
    "ReindexPDFRequest",
    "ReindexPDFResponse",
    
    # Health
    "HealthResponse"
]